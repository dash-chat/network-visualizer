<script lang="ts">
  import { simulationState, selectedPeerId, selectedPeer, showInspector } from '../stores/ui-state';
  import { SP_DEFINITIONS, OPERATION_COLORS, getAllOperations } from '../simulation/types';
  import { topicColor } from '../simulation/crypto';
  import ActionPanel from './ActionPanel.svelte';

  let activeTab = $state<'info' | 'app-store' | 'relay-store'>('info');

  function close() {
    selectedPeerId.set(null);
  }

  const iconFor = (type: string) =>
    type === 'isp' ? '\u{1F3E2}' :
    type === 'router' ? '\u{1F310}' :
    type === 'starlink' ? '\u{1F4E1}' :
    type === 'dash-server' ? '\u{2601}' :
    type === 'message-server' ? '\u{1F5A5}' : '\u{1F4F1}';

  const isPeerDevice = (type: string) => type === 'peer' || type === 'starlink';
</script>

{#if $selectedPeer}
  {@const peer = $selectedPeer}
  <div class="w-96 shrink-0 bg-[var(--bg-secondary)] border-l border-[var(--border)] flex flex-col h-full">
    <!-- Header -->
    <div class="p-3 border-b border-[var(--border)] flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-sm">{iconFor(peer.type)}</span>
        <h3 class="text-sm font-bold text-[var(--text-primary)]">{peer.label}</h3>
        <span class="w-2 h-2 rounded-full {peer.online ? 'bg-[var(--success)]' : 'bg-[var(--error)]'}"></span>
      </div>
      <button
        class="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none"
        onclick={close}
      >x</button>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-[var(--border)] shrink-0">
      <button
        class="flex-1 py-1.5 text-[10px] font-semibold uppercase transition-colors {activeTab === 'info' ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}"
        onclick={() => activeTab = 'info'}
      >Info</button>
      {#if isPeerDevice(peer.type)}
        <button
          class="flex-1 py-1.5 text-[10px] font-semibold uppercase transition-colors {activeTab === 'app-store' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}"
          onclick={() => activeTab = 'app-store'}
        >Operations</button>
      {/if}
      <button
        class="flex-1 py-1.5 text-[10px] font-semibold uppercase transition-colors {activeTab === 'relay-store' ? 'text-lime-400 border-b-2 border-lime-400' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}"
        onclick={() => activeTab = 'relay-store'}
      >Relay Store</button>
    </div>

    <!-- Tab content (scrollable) -->
    <div class="flex-1 overflow-y-auto">

      {#if activeTab === 'info'}
        <!-- Peer Info -->
        <div class="p-3 border-b border-[var(--border)]">
          <div class="grid grid-cols-2 gap-1 text-xs">
            <span class="text-[var(--text-muted)]">Type:</span>
            <span class="text-[var(--text-primary)]">{peer.type}</span>
            <span class="text-[var(--text-muted)]">Status:</span>
            <span class="{peer.online ? 'text-[var(--success)]' : 'text-[var(--error)]'}">{peer.online ? 'Online' : 'Offline'}</span>
            <span class="text-[var(--text-muted)]">Zone:</span>
            <span class="text-[var(--text-primary)]">{peer.zone}</span>
            <span class="text-[var(--text-muted)]">Transports:</span>
            <span class="text-[var(--text-primary)]">{peer.transports.join(', ')}</span>
            {#if peer.supportedSPs.length > 0}
              <span class="text-[var(--text-muted)]">SPs:</span>
              <div class="flex gap-1 flex-wrap">
                {#each peer.supportedSPs as msp}
                  <span class="text-[9px] px-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                    {SP_DEFINITIONS[msp].name.split(' ')[0]}
                  </span>
                {/each}
              </div>
            {/if}
            {#if isPeerDevice(peer.type)}
              <span class="text-[var(--text-muted)]">Public Key:</span>
              <span class="text-[9px] font-mono text-[var(--text-secondary)] truncate">{peer.publicKey.slice(0, 16)}...</span>
            {/if}
          </div>
        </div>

        <!-- Contacts -->
        {#if peer.contacts.length > 0}
          <div class="p-3 border-b border-[var(--border)]">
            <h4 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Contacts ({peer.contacts.length})</h4>
            {#each peer.contacts as contactId}
              {@const contact = $simulationState.peers.get(contactId)}
              {#if contact}
                <div class="flex items-center gap-1.5 text-xs mb-1">
                  <span class="w-1.5 h-1.5 rounded-full {contact.online ? 'bg-[var(--success)]' : 'bg-[var(--error)]'}"></span>
                  <span class="text-[var(--text-secondary)]">{contact.label}</span>
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        <!-- Groups -->
        {#if peer.groups.length > 0}
          <div class="p-3 border-b border-[var(--border)]">
            <h4 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Groups ({peer.groups.length})</h4>
            {#each peer.groups as group}
              <div class="mb-2 p-1.5 rounded bg-[var(--bg-primary)]">
                <div class="text-xs font-semibold text-[var(--text-primary)]">{group.name}</div>
                <div class="text-[10px] text-[var(--text-muted)]">
                  {group.members.length} members
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Known Topics summary -->
        {#if isPeerDevice(peer.type)}
          <div class="p-3 border-b border-[var(--border)]">
            <h4 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Known Topics</h4>
            <div class="text-[9px] text-[var(--text-muted)] mb-1">
              App: {peer.appStore.knownTopics.length} | Relay: {peer.relayStore.knownTopics.length}
            </div>
            {#each peer.appStore.knownTopics as topic}
              <div class="text-[9px] text-[var(--text-secondary)] mb-0.5 font-mono truncate">{topic}</div>
            {/each}
          </div>
        {:else if peer.relayStore.knownTopics.length > 0}
          <div class="p-3 border-b border-[var(--border)]">
            <h4 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Known Topics ({peer.relayStore.knownTopics.length})</h4>
            {#each peer.relayStore.knownTopics as topic}
              <div class="flex items-center gap-1 text-[9px] mb-0.5 font-mono">
                <span class="inline-block w-1.5 h-1.5 rounded-full" style="background: {topicColor(topic)}"></span>
                <span class="text-[var(--text-secondary)] truncate">{topic.slice(0, 16)}...</span>
              </div>
            {/each}
          </div>
        {/if}

      {:else if activeTab === 'app-store'}
        <!-- p2panda Operation Store -->
        <div class="p-3">
          {#each Object.entries(peer.appStore.topics) as [topicId, authorLogs]}
            <div class="mb-3">
              <div class="flex items-center gap-1.5 mb-1.5">
                <span class="inline-block w-2 h-2 rounded-full" style="background: {topicColor(topicId)}"></span>
                <span class="text-[10px] font-mono text-[var(--text-secondary)] truncate">{topicId}</span>
              </div>
              {#each Object.entries(authorLogs) as [authorId, authorLog]}
                {@const authorLabel = $simulationState.peers.get(authorId)?.label ?? authorId.slice(0, 8)}
                <div class="mb-2 ml-1">
                  <div class="flex items-center justify-between text-[9px] mb-1 px-1">
                    <span class="text-[var(--text-muted)]">Author: <span class="text-[var(--text-secondary)]">{authorLabel}</span></span>
                    <span class="text-cyan-400 font-mono">log height: {authorLog.entries.length}</span>
                  </div>
                  {#each authorLog.entries as entry}
                    {@const op = entry.operation}
                    <div class="mb-1.5 p-2 rounded bg-[var(--bg-primary)] border-l-2" style="border-color: {OPERATION_COLORS[op.type]}">
                      <!-- Header: seqNum, type, delivery status -->
                      <div class="flex items-center justify-between mb-1">
                        <div class="flex items-center gap-1.5">
                          <span class="text-[9px] font-mono text-[var(--text-muted)]">#{entry.seqNum}</span>
                          <span class="text-[9px] px-1 py-0.5 rounded" style="background: {OPERATION_COLORS[op.type]}20; color: {OPERATION_COLORS[op.type]}">{op.type}</span>
                        </div>
                        <span class="text-[9px] {op.delivered ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}">
                          {op.delivered ? '✓ delivered' : `${op.receivedBy.length}/${op.recipients.length + 1} received`}
                        </span>
                      </div>
                      <!-- Content -->
                      <div class="text-[10px] text-[var(--text-primary)] mb-1">{op.content}</div>
                      <!-- Sender & recipients -->
                      <div class="text-[9px] text-[var(--text-muted)]">
                        From: {$simulationState.peers.get(op.sender)?.label ?? op.sender}
                        {#if op.recipients.length > 0}
                          → {op.recipients.map(r => $simulationState.peers.get(r)?.label ?? r).join(', ')}
                        {/if}
                      </div>
                      <!-- p2panda entry metadata -->
                      <div class="text-[8px] text-[var(--text-muted)] font-mono mt-1 pt-1 border-t border-[var(--border)]">
                        <div>payload_hash: {entry.payloadHash.slice(0, 24)}...</div>
                        <div>payload_size: {entry.payloadSize} bytes</div>
                        {#if entry.backlink}
                          <div>backlink: {entry.backlink.slice(0, 24)}...</div>
                        {:else}
                          <div>backlink: <span class="text-cyan-400">none (first entry)</span></div>
                        {/if}
                        <div>signature: {entry.signature.slice(0, 24)}...</div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          {/each}
          {#if Object.keys(peer.appStore.topics).length === 0}
            <p class="text-[10px] text-[var(--text-muted)]">No operations yet</p>
          {/if}
        </div>

      {:else if activeTab === 'relay-store'}
        <!-- Relay Store (envelope chain) -->
        <div class="p-3">
          <div class="text-[9px] text-[var(--text-muted)] mb-2">
            Entries: {peer.relayStore.entries.length}
            {#if peer.relayStore.entries.filter(e => e.envelopeOnly).length > 0}
              <span class="text-[var(--warning)]">({peer.relayStore.entries.filter(e => e.envelopeOnly).length} GC'd)</span>
            {/if}
            | Topics: {peer.relayStore.knownTopics.length}
          </div>
          {#if peer.relayStore.entries.length > 0}
            <div class="overflow-x-auto">
              <table class="w-full text-[9px] font-mono border-collapse">
                <thead>
                  <tr class="text-[var(--text-muted)] text-left">
                    <th class="pb-1 pr-1 font-semibold">KDF_pub</th>
                    <th class="pb-1 pr-1 font-semibold">prev_hash</th>
                    <th class="pb-1 font-semibold">self_hash</th>
                  </tr>
                </thead>
                <tbody>
                  {#each peer.relayStore.entries as entry}
                    <tr class="{entry.envelopeOnly ? 'opacity-50' : ''}">
                      <td class="py-0.5 pr-1">
                        <span class="inline-block w-1.5 h-1.5 rounded-full mr-0.5 align-middle" style="background: {topicColor(entry.envelope.kdfPub)}"></span>
                        <span class="text-[var(--text-secondary)]">{entry.envelope.kdfPub.slice(0, 8)}..</span>
                      </td>
                      <td class="py-0.5 pr-1">
                        {#if entry.envelope.previousHash === '0'.repeat(64)}
                          <span class="text-lime-400">∅ start</span>
                        {:else}
                          <span class="text-[var(--text-muted)]">{entry.envelope.previousHash.slice(0, 8)}..</span>
                        {/if}
                      </td>
                      <td class="py-0.5">
                        <span class="text-[var(--text-secondary)]">{entry.envelope.selfHash.slice(0, 8)}..</span>
                        {#if entry.envelopeOnly}
                          <span class="text-[var(--warning)] ml-0.5">GC</span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <p class="text-[10px] text-[var(--text-muted)]">Empty</p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Actions (pinned at bottom) -->
    <div class="shrink-0">
      <ActionPanel />
    </div>
  </div>
{/if}
