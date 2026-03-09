<script lang="ts">
  import { simulationState, selectedPeerId } from '../stores/ui-state';
  import { SP_DEFINITIONS, LOG_MODEL_DEFINITIONS, type SPType, type Transport } from '../simulation/types';
  import { updatePeerSPs, updatePeerTransports, updatePeerZone, removePeer, addConnection, removeConnection } from '../simulation/engine';

  const spList = Object.values(SP_DEFINITIONS);

  function toggleSP(peerId: string, sp: SPType) {
    simulationState.update(s => {
      const peer = s.peers.get(peerId);
      if (!peer) return s;
      const sps = peer.supportedSPs.includes(sp)
        ? peer.supportedSPs.filter(m => m !== sp)
        : [...peer.supportedSPs, sp];
      return updatePeerSPs(s, peerId, sps);
    });
  }

  function toggleTransport(peerId: string, transport: Transport) {
    simulationState.update(s => {
      const peer = s.peers.get(peerId);
      if (!peer) return s;
      const transports = peer.transports.includes(transport)
        ? peer.transports.filter(t => t !== transport)
        : [...peer.transports, transport];
      return updatePeerTransports(s, peerId, transports);
    });
  }

  function setZone(peerId: string, zone: 'global' | 'intranet' | 'local') {
    simulationState.update(s => updatePeerZone(s, peerId, zone));
  }

  function handleRemovePeer(peerId: string) {
    simulationState.update(s => removePeer(s, peerId));
    selectedPeerId.set(null);
  }

  function handleAddConnection(from: string, to: string) {
    simulationState.update(s => addConnection(s, from, to));
  }

  function handleRemoveConnection(connId: string) {
    simulationState.update(s => removeConnection(s, connId));
  }

  const allTransports: Transport[] = ['internet', 'lan', 'bluetooth', 'lora'];
  const allZones = [
    { value: 'global' as const, label: 'Global' },
    { value: 'intranet' as const, label: 'Intranet' },
    { value: 'local' as const, label: 'Local' },
  ];
</script>

<div class="w-72 shrink-0 bg-[var(--bg-secondary)] border-r border-[var(--border)] overflow-y-auto h-full flex flex-col">
  <!-- Log Model -->
  <div class="p-3 border-b border-[var(--border)]">
    <h3 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Log Model</h3>
    <div class="p-2 rounded bg-[var(--bg-primary)]">
      <div class="flex items-center gap-2 mb-1">
        <span class="w-2 h-2 rounded-full bg-[var(--accent)]"></span>
        <span class="text-xs font-semibold text-[var(--text-primary)]">{LOG_MODEL_DEFINITIONS[$simulationState.logModel].name}</span>
      </div>
      <p class="text-[10px] text-[var(--text-muted)] leading-tight">{LOG_MODEL_DEFINITIONS[$simulationState.logModel].description}</p>
      {#if $simulationState.logModel === 'shared-peer-logs'}
        <div class="mt-1.5 flex items-center gap-1.5">
          <span class="text-[9px] px-1 rounded {$simulationState.splitByGroup ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}">
            Split by group: {$simulationState.splitByGroup ? 'ON' : 'OFF'}
          </span>
        </div>
      {/if}
    </div>
  </div>

  <!-- SP Descriptions -->
  <div class="p-3 border-b border-[var(--border)]">
    <h3 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Sync Protocols</h3>
    {#each spList as sp}
      <div class="mb-2 p-2 rounded bg-[var(--bg-primary)]">
        <div class="flex items-center gap-2 mb-1">
          <span class="w-2 h-2 rounded-full" style="background: {sp.type === 'topic-sync' ? '#06b6d4' : sp.type === 'encrypted-group' ? '#ec4899' : '#84cc16'}"></span>
          <span class="text-xs font-semibold text-[var(--text-primary)]">{sp.name}</span>
        </div>
        <p class="text-[10px] text-[var(--text-muted)] leading-tight">{sp.description}</p>
        <div class="flex gap-1 mt-1 flex-wrap">
          {#each Object.entries(sp.metadataVisible) as [key, visible]}
            <span class="text-[9px] px-1 rounded {visible ? 'bg-[var(--warning)]/20 text-[var(--warning)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}">
              {key}
            </span>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <!-- Peer List & Config -->
  <div class="p-3 flex-1 overflow-y-auto">
    <h3 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Peers</h3>
    {#each [...$simulationState.peers.values()] as peer}
      <div
        class="mb-2 p-2 rounded cursor-pointer transition-colors {$selectedPeerId === peer.id ? 'bg-[var(--accent)]/20 border border-[var(--accent)]' : 'bg-[var(--bg-primary)] border border-transparent hover:border-[var(--border)]'}"
        onclick={() => selectedPeerId.set(peer.id)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && selectedPeerId.set(peer.id)}
      >
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-1.5">
            <span class="text-xs">{peer.type === 'message-server' ? '\u{1F5A5}' : '\u{1F4F1}'}</span>
            <span class="text-xs font-semibold text-[var(--text-primary)]">{peer.label}</span>
            <span class="w-1.5 h-1.5 rounded-full {peer.online ? 'bg-[var(--success)]' : 'bg-[var(--error)]'}"></span>
          </div>
          <button
            class="text-[10px] text-[var(--text-muted)] hover:text-[var(--error)]"
            onclick={(e) => { e.stopPropagation(); handleRemovePeer(peer.id); }}
          >x</button>
        </div>

        <!-- SPs -->
        <div class="flex gap-1 mb-1">
          {#each spList as sp}
            <button
              class="text-[9px] px-1 rounded transition-colors {peer.supportedSPs.includes(sp.type) ? 'bg-[var(--accent)]/30 text-[var(--accent)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}"
              onclick={(e) => { e.stopPropagation(); toggleSP(peer.id, sp.type); }}
            >{sp.name.split(' ')[0]}</button>
          {/each}
        </div>

        <!-- Transports -->
        <div class="flex gap-1 mb-1">
          {#each allTransports as transport}
            <button
              class="text-[9px] px-1 rounded transition-colors {peer.transports.includes(transport) ? 'bg-[var(--success)]/30 text-[var(--success)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}"
              onclick={(e) => { e.stopPropagation(); toggleTransport(peer.id, transport); }}
            >{transport}</button>
          {/each}
        </div>

        <!-- Zone -->
        <div class="flex gap-1">
          {#each allZones as zone}
            <button
              class="text-[9px] px-1 rounded transition-colors {peer.zone === zone.value ? 'bg-purple-500/30 text-purple-400' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}"
              onclick={(e) => { e.stopPropagation(); setZone(peer.id, zone.value); }}
            >{zone.label}</button>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <!-- Connections -->
  <div class="p-3 border-t border-[var(--border)]">
    <h3 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Connections</h3>
    {#each $simulationState.connections as conn}
      {@const from = $simulationState.peers.get(conn.from)}
      {@const to = $simulationState.peers.get(conn.to)}
      {#if from && to}
        <div class="flex items-center justify-between text-[10px] mb-1 px-1">
          <span class="text-[var(--text-secondary)]">{from.label} — {to.label}</span>
          <div class="flex items-center gap-1">
            <span class="text-[var(--text-muted)]">{conn.transport}</span>
            <button
              class="text-[var(--text-muted)] hover:text-[var(--error)]"
              onclick={() => handleRemoveConnection(conn.id)}
            >x</button>
          </div>
        </div>
      {/if}
    {/each}

    <!-- Quick connect -->
    {#if $selectedPeerId}
      {@const otherPeers = [...$simulationState.peers.values()].filter(p => p.id !== $selectedPeerId && !$simulationState.connections.some(c => (c.from === $selectedPeerId && c.to === p.id) || (c.to === $selectedPeerId && c.from === p.id)))}
      {#if otherPeers.length > 0}
        <div class="mt-2">
          <span class="text-[10px] text-[var(--text-muted)]">Connect {$simulationState.peers.get($selectedPeerId)?.label} to:</span>
          <div class="flex gap-1 flex-wrap mt-1">
            {#each otherPeers as peer}
              <button
                class="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                onclick={() => $selectedPeerId && handleAddConnection($selectedPeerId, peer.id)}
              >{peer.label}</button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
