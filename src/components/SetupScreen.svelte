<script lang="ts">
  import { SP_DEFINITIONS, type SPType } from '../simulation/types';
  import { SCENARIOS } from '../simulation/scenarios';
  import { launchScenario, DEFAULT_SETUP_CONFIG } from '../stores/ui-state';

  const spList = Object.values(SP_DEFINITIONS);

  const SP_COLORS: Record<SPType, string> = {
    'log-height-sync': '#06b6d4',
    'kdf-envelope-sync': '#84cc16',
  };

  let scenarioId = $state(DEFAULT_SETUP_CONFIG.scenarioId);
  let peerSPs = $state<SPType[]>([...DEFAULT_SETUP_CONFIG.peerSPs]);
  let serverSPs = $state<SPType[]>([...DEFAULT_SETUP_CONFIG.serverSPs]);
  let topicPerGroup = $state(DEFAULT_SETUP_CONFIG.topicPerGroup);

  let selectedScenario = $derived(SCENARIOS.find(s => s.id === scenarioId) ?? SCENARIOS[0]);

  function toggleSP(list: SPType[], sp: SPType): SPType[] {
    return list.includes(sp) ? list.filter(s => s !== sp) : [...list, sp];
  }

  function handleLaunch() {
    launchScenario({ scenarioId, peerSPs, serverSPs, topicPerGroup });
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-primary)]">
  <div class="w-full max-w-xl mx-4">
    <!-- Header -->
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold text-[var(--text-primary)] mb-1">Network Visualizer</h1>
      <p class="text-sm text-[var(--text-muted)]">Configure your P2P messaging simulation</p>
    </div>

    <div class="flex flex-col gap-4">
      <!-- Scenario Template -->
      <div class="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <h3 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-3">Scenario Template</h3>
        <select
          class="w-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm rounded px-3 py-2 border border-[var(--border)] outline-none mb-2"
          bind:value={scenarioId}
        >
          {#each SCENARIOS as scenario}
            <option value={scenario.id}>{scenario.name}</option>
          {/each}
        </select>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed">{selectedScenario.description}</p>
      </div>

      <!-- Sync Protocols per Device Type -->
      <div class="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <h3 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-3">Sync Protocols</h3>

        <div class="grid grid-cols-2 gap-4">
          <!-- Peer Devices -->
          <div>
            <div class="flex items-center gap-1.5 mb-2">
              <span class="text-sm">📱</span>
              <span class="text-xs font-semibold text-[var(--text-primary)]">Peer Devices</span>
            </div>
            <div class="flex flex-col gap-1.5">
              {#each spList as sp}
                <button
                  class="text-xs px-3 py-1.5 rounded border transition-colors text-left {peerSPs.includes(sp.type)
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-primary)]'
                    : 'border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'}"
                  onclick={() => peerSPs = toggleSP(peerSPs, sp.type)}
                >
                  <span class="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style="background: {SP_COLORS[sp.type]}"></span>
                  {sp.name}
                </button>
              {/each}
            </div>
          </div>

          <!-- Message Servers -->
          <div>
            <div class="flex items-center gap-1.5 mb-2">
              <span class="text-sm">🖥️</span>
              <span class="text-xs font-semibold text-[var(--text-primary)]">Message Servers</span>
            </div>
            <div class="flex flex-col gap-1.5">
              {#each spList as sp}
                <button
                  class="text-xs px-3 py-1.5 rounded border transition-colors text-left {serverSPs.includes(sp.type)
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-primary)]'
                    : 'border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'}"
                  onclick={() => serverSPs = toggleSP(serverSPs, sp.type)}
                >
                  <span class="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style="background: {SP_COLORS[sp.type]}"></span>
                  {sp.name}
                </button>
              {/each}
            </div>
          </div>
        </div>

        <!-- SP descriptions -->
        <div class="mt-3 pt-3 border-t border-[var(--border)]">
          {#each spList as sp}
            <div class="flex items-start gap-2 mb-1.5 last:mb-0">
              <span class="inline-block w-2 h-2 rounded-full mt-1 shrink-0" style="background: {SP_COLORS[sp.type]}"></span>
              <p class="text-[10px] text-[var(--text-muted)] leading-tight">
                <span class="font-semibold text-[var(--text-secondary)]">{sp.name}:</span> {sp.description}
              </p>
            </div>
          {/each}
        </div>
      </div>

      <!-- Log Model -->
      <div class="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <h3 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-3">Log Model</h3>
        <label class="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={topicPerGroup}
            class="accent-[var(--accent)] mt-0.5"
          />
          <div>
            <span class="text-sm text-[var(--text-primary)]">Topic per group</span>
            <p class="text-[10px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
              {#if topicPerGroup}
                Each conversation (DM or group) has its own topic ID. Sync protocols can selectively sync only topics both peers care about.
              {:else}
                Each peer maintains a single log. All operations share one topic (the sender's peer ID). Simpler but less granular sync.
              {/if}
            </p>
          </div>
        </label>
      </div>

      <!-- Launch -->
      <button
        class="w-full py-2.5 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
        onclick={handleLaunch}
      >
        Launch Simulation
      </button>
    </div>
  </div>
</div>
