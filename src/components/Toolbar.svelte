<script lang="ts">
  import {
    simulationState,
    startSimulation,
    stopSimulation,
    stepSimulation,
    setSpeed,
    resetSimulation,
    openSetup,
  } from '../stores/ui-state';
  import { createPeer, toggleIntranetShutdown } from '../simulation/engine';

  let speed = $state(1);
  let showAddPeer = $state(false);
  let newPeerLabel = $state('');
  let newPeerType = $state<'peer' | 'message-server' | 'dash-server' | 'router' | 'starlink' | 'isp'>('peer');

  function handleSpeedChange(e: Event) {
    speed = parseFloat((e.target as HTMLInputElement).value);
    setSpeed(speed);
  }

  function handleAddPeer() {
    if (!newPeerLabel.trim()) return;
    simulationState.update(s => {
      const x = 200 + Math.random() * 600;
      const y = 200 + Math.random() * 400;
      return createPeer(s, {
        label: newPeerLabel.trim(),
        type: newPeerType,
        position: { x, y },
      }).state;
    });
    newPeerLabel = '';
    showAddPeer = false;
  }

  function handleToggleIntranet() {
    simulationState.update(s => toggleIntranetShutdown(s));
  }
</script>

<div class="flex items-center gap-3 px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
  <!-- Setup button -->
  <button
    class="px-3 py-1 rounded text-sm bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
    onclick={openSetup}
  >
    Setup
  </button>

  <div class="w-px h-6 bg-[var(--border)]"></div>

  <!-- Simulation controls -->
  <button
    class="px-3 py-1 rounded text-sm font-medium transition-colors {$simulationState.running ? 'bg-[var(--error)] text-white' : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'}"
    onclick={() => $simulationState.running ? stopSimulation() : startSimulation()}
  >
    {$simulationState.running ? 'Pause' : 'Play'}
  </button>

  <button
    class="px-3 py-1 rounded text-sm bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
    onclick={stepSimulation}
    disabled={$simulationState.running}
  >
    Step
  </button>

  <button
    class="px-3 py-1 rounded text-sm bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
    onclick={resetSimulation}
  >
    Reset
  </button>

  <!-- Speed -->
  <div class="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
    <span>Speed:</span>
    <input
      type="range"
      min="0.5"
      max="5"
      step="0.5"
      value={speed}
      oninput={handleSpeedChange}
      class="w-20 accent-[var(--accent)]"
    />
    <span class="w-8 text-center">{speed}x</span>
  </div>

  <div class="w-px h-6 bg-[var(--border)]"></div>

  <!-- Tick counter -->
  <span class="text-sm text-[var(--text-muted)]">Tick: {$simulationState.tick}</span>

  <!-- Topic per group indicator -->
  {#if !$simulationState.topicPerGroup}
    <span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--warning)]/20 text-[var(--warning)]">Shared logs</span>
  {/if}

  <div class="flex-1"></div>

  <!-- Intranet shutdown toggle -->
  <button
    class="px-3 py-1 rounded text-sm font-medium transition-colors {$simulationState.intranetShutdown ? 'bg-[var(--error)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'}"
    onclick={handleToggleIntranet}
  >
    {$simulationState.intranetShutdown ? 'Internet Shutdown ON' : 'Internet Shutdown'}
  </button>

  <!-- Add peer -->
  {#if showAddPeer}
    <div class="flex items-center gap-2">
      <input
        type="text"
        bind:value={newPeerLabel}
        placeholder="Name"
        class="bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm rounded px-2 py-1 border border-[var(--border)] outline-none w-24"
        onkeydown={(e) => e.key === 'Enter' && handleAddPeer()}
      />
      <select
        bind:value={newPeerType}
        class="bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm rounded px-2 py-1 border border-[var(--border)] outline-none"
      >
        <option value="peer">Peer</option>
        <option value="starlink">Starlink</option>
        <option value="router">Router</option>
        <option value="isp">ISP</option>
        <option value="message-server">Relay Server</option>
        <option value="dash-server">Dash Server</option>
      </select>
      <button
        class="px-2 py-1 rounded text-sm bg-[var(--success)] text-white"
        onclick={handleAddPeer}
      >Add</button>
      <button
        class="px-2 py-1 rounded text-sm bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
        onclick={() => showAddPeer = false}
      >Cancel</button>
    </div>
  {:else}
    <button
      class="px-3 py-1 rounded text-sm bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
      onclick={() => showAddPeer = true}
    >
      + Add Peer
    </button>
  {/if}
</div>
