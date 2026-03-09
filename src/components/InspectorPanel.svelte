<script lang="ts">
  import { simulationState, selectedPeerId, selectedPeer, showInspector } from '../stores/ui-state';
  import { SP_DEFINITIONS, OPERATION_COLORS } from '../simulation/types';
  import { getFollowSet } from '../simulation/log-models';
  import ActionPanel from './ActionPanel.svelte';

  function close() {
    selectedPeerId.set(null);
  }
</script>

{#if $selectedPeer}
  {@const peer = $selectedPeer}
  {@const isSharedPeerLogs = $simulationState.logModel === 'shared-peer-logs'}
  {@const followSet = isSharedPeerLogs ? getFollowSet($simulationState, peer.id) : null}
  <div class="w-80 shrink-0 bg-[var(--bg-secondary)] border-l border-[var(--border)] overflow-y-auto">
    <!-- Header -->
    <div class="p-3 border-b border-[var(--border)] flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-sm">{peer.type === 'message-server' ? '\u{1F5A5}' : '\u{1F4F1}'}</span>
        <h3 class="text-sm font-bold text-[var(--text-primary)]">{peer.label}</h3>
        <span class="w-2 h-2 rounded-full {peer.online ? 'bg-[var(--success)]' : 'bg-[var(--error)]'}"></span>
      </div>
      <button
        class="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none"
        onclick={close}
      >x</button>
    </div>

    <!-- Peer Info -->
    <div class="p-3 border-b border-[var(--border)]">
      <h4 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Info</h4>
      <div class="grid grid-cols-2 gap-1 text-xs">
        <span class="text-[var(--text-muted)]">Type:</span>
        <span class="text-[var(--text-primary)]">{peer.type}</span>
        <span class="text-[var(--text-muted)]">Status:</span>
        <span class="{peer.online ? 'text-[var(--success)]' : 'text-[var(--error)]'}">{peer.online ? 'Online' : 'Offline'}</span>
        <span class="text-[var(--text-muted)]">Zone:</span>
        <span class="text-[var(--text-primary)]">{peer.zone}</span>
        <span class="text-[var(--text-muted)]">Transports:</span>
        <span class="text-[var(--text-primary)]">{peer.transports.join(', ')}</span>
        <span class="text-[var(--text-muted)]">SPs:</span>
        <div class="flex gap-1 flex-wrap">
          {#each peer.supportedSPs as msp}
            <span class="text-[9px] px-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
              {SP_DEFINITIONS[msp].name.split(' ')[0]}
            </span>
          {/each}
        </div>
      </div>
    </div>

    <!-- Follow Set (shared-peer-logs only) -->
    {#if isSharedPeerLogs && followSet}
      <div class="p-3 border-b border-[var(--border)]">
        <h4 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">
          Follow Set ({followSet.size} {peer.type === 'message-server' ? 'via connected peers' : 'topics'})
        </h4>
        {#if followSet.size === 0}
          <p class="text-[10px] text-[var(--text-muted)]">Empty follow set</p>
        {:else}
          <div class="flex gap-1 flex-wrap">
            {#each [...followSet] as followedId}
              {@const followedPeer = $simulationState.peers.get(followedId)}
              <span class="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)]">
                {followedPeer?.label ?? followedId}
              </span>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Contacts -->
    <div class="p-3 border-b border-[var(--border)]">
      <h4 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Contacts ({peer.contacts.length})</h4>
      {#if peer.contacts.length === 0}
        <p class="text-[10px] text-[var(--text-muted)]">No contacts</p>
      {:else}
        {#each peer.contacts as contactId}
          {@const contact = $simulationState.peers.get(contactId)}
          {#if contact}
            <div class="flex items-center gap-1.5 text-xs mb-1">
              <span class="w-1.5 h-1.5 rounded-full {contact.online ? 'bg-[var(--success)]' : 'bg-[var(--error)]'}"></span>
              <span class="text-[var(--text-secondary)]">{contact.label}</span>
            </div>
          {/if}
        {/each}
      {/if}
    </div>

    <!-- Groups -->
    <div class="p-3 border-b border-[var(--border)]">
      <h4 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Groups ({peer.groups.length})</h4>
      {#each peer.groups as group}
        <div class="mb-2 p-1.5 rounded bg-[var(--bg-primary)]">
          <div class="text-xs font-semibold text-[var(--text-primary)]">{group.name}</div>
          <div class="text-[10px] text-[var(--text-muted)]">
            {group.members.length} members | obf: {group.obfuscatedId.slice(0, 8)}...
          </div>
        </div>
      {/each}
      {#if peer.groups.length === 0}
        <p class="text-[10px] text-[var(--text-muted)]">No groups</p>
      {/if}
    </div>

    <!-- Store Contents -->
    <div class="p-3">
      <h4 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">
        Store ({peer.store.operations.length} operations)
      </h4>
      {#each peer.store.operations as op}
        <div class="mb-1.5 p-1.5 rounded bg-[var(--bg-primary)] border-l-2" style="border-color: {op.color}">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1">
              <span class="text-[9px] px-1 rounded" style="background: {op.color}20; color: {op.color}">{op.type}</span>
              {#if op.encrypted}
                <span class="text-[9px]" title="Encrypted">🔒</span>
              {/if}
            </div>
            <span class="text-[9px] {op.delivered ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}">
              {op.delivered ? 'Delivered' : `${op.receivedBy.length}/${op.recipients.length + 1}`}
            </span>
          </div>
          <div class="text-[10px] text-[var(--text-secondary)] mt-0.5 truncate">{op.content}</div>
          <div class="text-[9px] text-[var(--text-muted)] mt-0.5">
            From: {$simulationState.peers.get(op.sender)?.label ?? op.sender}
            {#if op.topicId}
              | Topic: {op.topicId.slice(0, 12)}{op.topicId.length > 12 ? '...' : ''}
            {/if}
          </div>
        </div>
      {/each}
      {#if peer.store.operations.length === 0}
        <p class="text-[10px] text-[var(--text-muted)]">Store is empty</p>
      {/if}
    </div>

    <!-- Actions -->
    <ActionPanel />
  </div>
{/if}
