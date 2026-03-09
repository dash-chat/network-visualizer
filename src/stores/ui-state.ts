import { writable, derived } from 'svelte/store';
import type { SimulationState, LogModelType } from '../simulation/types';
import { tick, setLogModel as engineSetLogModel, toggleSplitByGroup as engineToggleSplitByGroup } from '../simulation/engine';
import { SCENARIOS } from '../simulation/scenarios';

// Core simulation state
export const simulationState = writable<SimulationState>(SCENARIOS[0].build());

// UI state
export const selectedPeerId = writable<string | null>(null);
export const showInspector = writable(false);
export const connectingFrom = writable<string | null>(null);

// Selected peer derived
export const selectedPeer = derived(
  [simulationState, selectedPeerId],
  ([$state, $id]) => $id ? $state.peers.get($id) ?? null : null
);

// Simulation loop
let intervalId: ReturnType<typeof setInterval> | null = null;

export function startSimulation() {
  simulationState.update(s => ({ ...s, running: true }));
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => {
    simulationState.update(s => {
      if (!s.running) return s;
      return tick(s);
    });
  }, 500);
}

export function stopSimulation() {
  simulationState.update(s => ({ ...s, running: false }));
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function stepSimulation() {
  simulationState.update(s => tick(s));
}

export function setSpeed(speed: number) {
  simulationState.update(s => ({ ...s, speed }));
  // Restart interval with new speed
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = setInterval(() => {
      simulationState.update(s => {
        if (!s.running) return s;
        return tick(s);
      });
    }, 500 / speed);
  }
}

export function loadScenario(scenarioId: string) {
  stopSimulation();
  const scenario = SCENARIOS.find(s => s.id === scenarioId);
  if (scenario) {
    let state = scenario.build();
    // Apply the scenario's log model setting
    state = { ...state, logModel: scenario.logModel, splitByGroup: scenario.splitByGroup ?? false };
    simulationState.set(state);
    selectedPeerId.set(null);
    showInspector.set(false);
  }
}

export function resetSimulation() {
  stopSimulation();
  simulationState.update(s => {
    // Keep peers and connections but clear operations and in-transit
    const newPeers = new Map(s.peers);
    for (const [peerId, peer] of newPeers) {
      newPeers.set(peerId, { ...peer, store: { operations: [] } });
    }
    return { ...s, peers: newPeers, inTransit: [], tick: 0 };
  });
}

export function setLogModel(logModel: LogModelType) {
  simulationState.update(s => engineSetLogModel(s, logModel));
}

export function toggleSplitByGroup() {
  simulationState.update(s => engineToggleSplitByGroup(s));
}
