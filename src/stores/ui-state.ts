import { writable, derived } from 'svelte/store';
import type { SimulationState, SetupConfig, SPType } from '../simulation/types';
import { tick, applySetupConfig } from '../simulation/engine';
import { SCENARIOS } from '../simulation/scenarios';

export const DEFAULT_SETUP_CONFIG: SetupConfig = {
  scenarioId: 'two-peers',
  peerSPs: ['log-height-sync', 'kdf-envelope-sync'] as SPType[],
  serverSPs: ['kdf-envelope-sync'] as SPType[],
  topicPerGroup: true,
};

// Whether to show the setup screen
export const showSetup = writable(true);

// Core simulation state
export const simulationState = writable<SimulationState>(
  applySetupConfig(SCENARIOS[0].build(), DEFAULT_SETUP_CONFIG)
);

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

export function launchScenario(config: SetupConfig) {
  stopSimulation();
  const scenario = SCENARIOS.find(s => s.id === config.scenarioId);
  if (scenario) {
    const state = applySetupConfig(scenario.build(), config);
    simulationState.set(state);
    selectedPeerId.set(null);
    showInspector.set(false);
    showSetup.set(false);
  }
}

export function resetSimulation() {
  stopSimulation();
  simulationState.update(s => {
    // Keep peers and connections but clear operations and in-transit
    const newPeers = new Map(s.peers);
    for (const [peerId, peer] of newPeers) {
      newPeers.set(peerId, {
        ...peer,
        appStore: { topics: {}, knownTopics: [] },
        relayStore: { entries: [], knownTopics: [] },
      });
    }
    return { ...s, peers: newPeers, inTransit: [], tick: 0 };
  });
}

export function openSetup() {
  stopSimulation();
  showSetup.set(true);
}
