<script lang="ts">
  import { simulationState, selectedPeerId, selectedPeer } from '../stores/ui-state';
  import { sendMessage, addContact, createGroup, toggleOnline } from '../simulation/engine';

  let messageContent = $state('Hello!');
  let messageRecipient = $state('');
  let groupName = $state('New Group');
  let selectedMembers = $state<string[]>([]);
  let contactTarget = $state('');
  let messageGroupId = $state('');

  function handleSendMessage() {
    const peerId = $selectedPeerId;
    if (!peerId || !messageRecipient) return;
    const recipients = messageGroupId
      ? ($selectedPeer?.groups.find(g => g.id === messageGroupId)?.members.filter(m => m !== peerId) ?? [])
      : [messageRecipient];
    simulationState.update(s =>
      sendMessage(s, peerId, recipients, messageContent, messageGroupId || undefined)
    );
  }

  function handleAddContact() {
    const peerId = $selectedPeerId;
    if (!peerId || !contactTarget) return;
    simulationState.update(s => addContact(s, peerId, contactTarget));
    contactTarget = '';
  }

  function handleCreateGroup() {
    const peerId = $selectedPeerId;
    if (!peerId || !groupName.trim() || selectedMembers.length === 0) return;
    simulationState.update(s => createGroup(s, peerId, groupName, selectedMembers));
    selectedMembers = [];
  }

  function handleToggleOnline() {
    const peerId = $selectedPeerId;
    if (!peerId) return;
    simulationState.update(s => toggleOnline(s, peerId));
  }

  function toggleMember(id: string) {
    if (selectedMembers.includes(id)) {
      selectedMembers = selectedMembers.filter(m => m !== id);
    } else {
      selectedMembers = [...selectedMembers, id];
    }
  }

  // Get other peers for selection
  let otherPeers = $derived(
    [...$simulationState.peers.values()].filter(p => p.id !== $selectedPeerId && p.type === 'peer')
  );
</script>

{#if $selectedPeer}
  <div class="border-t border-[var(--border)] p-3">
    <div class="flex items-center gap-2 mb-2">
      <h4 class="text-xs font-bold uppercase text-[var(--text-muted)]">Actions</h4>
      <button
        class="ml-auto text-[9px] px-1.5 py-0.5 rounded transition-colors {$selectedPeer.online ? 'bg-[var(--error)]/20 text-[var(--error)]' : 'bg-[var(--success)]/20 text-[var(--success)]'}"
        onclick={handleToggleOnline}
      >
        {$selectedPeer.online ? 'Turn Off' : 'Turn On'}
      </button>
    </div>

    <div class="flex flex-col gap-2 text-xs {$selectedPeer.online ? '' : 'opacity-40 pointer-events-none'}">
      <!-- Send Message -->
      <div>
        <span class="text-[var(--text-muted)] font-semibold text-[10px]">Send Message</span>
        <div class="flex flex-col gap-1 mt-1">
          <select
            bind:value={messageRecipient}
            class="w-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-1.5 py-1 border border-[var(--border)] outline-none text-xs"
          >
            <option value="">Select recipient</option>
            {#each otherPeers as peer}
              <option value={peer.id}>{peer.label}</option>
            {/each}
          </select>
          {#if $selectedPeer.groups.length > 0}
            <select
              bind:value={messageGroupId}
              class="w-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-1.5 py-1 border border-[var(--border)] outline-none text-xs"
            >
              <option value="">DM</option>
              {#each $selectedPeer.groups as group}
                <option value={group.id}>{group.name}</option>
              {/each}
            </select>
          {/if}
          <div class="flex gap-1">
            <input
              type="text"
              bind:value={messageContent}
              class="flex-1 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-1.5 py-1 border border-[var(--border)] outline-none text-xs"
              placeholder="Message..."
              onkeydown={(e) => e.key === 'Enter' && handleSendMessage()}
            />
            <button
              class="px-2 py-1 rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              onclick={handleSendMessage}
              disabled={!messageRecipient && !messageGroupId}
            >Send</button>
          </div>
        </div>
      </div>

      <!-- Add Contact -->
      <div>
        <span class="text-[var(--text-muted)] font-semibold text-[10px]">Add Contact</span>
        <div class="flex gap-1 mt-1">
          <select
            bind:value={contactTarget}
            class="flex-1 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-1.5 py-1 border border-[var(--border)] outline-none text-xs"
          >
            <option value="">Select peer</option>
            {#each otherPeers.filter(p => !$selectedPeer?.contacts.includes(p.id)) as peer}
              <option value={peer.id}>{peer.label}</option>
            {/each}
          </select>
          <button
            class="px-2 py-1 rounded bg-[var(--success)] text-white disabled:opacity-50"
            onclick={handleAddContact}
            disabled={!contactTarget}
          >Add</button>
        </div>
      </div>

      <!-- Create Group -->
      <div>
        <span class="text-[var(--text-muted)] font-semibold text-[10px]">Create Group</span>
        <div class="flex flex-col gap-1 mt-1">
          <input
            type="text"
            bind:value={groupName}
            class="w-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-1.5 py-1 border border-[var(--border)] outline-none text-xs"
            placeholder="Group name"
          />
          <div class="flex gap-1 flex-wrap">
            {#each otherPeers.filter(p => $selectedPeer?.contacts.includes(p.id)) as peer}
              <button
                class="text-[9px] px-1 rounded {selectedMembers.includes(peer.id) ? 'bg-[var(--accent)]/30 text-[var(--accent)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}"
                onclick={() => toggleMember(peer.id)}
              >{peer.label}</button>
            {/each}
          </div>
          <button
            class="w-full px-2 py-1 rounded bg-[var(--warning)] text-black text-xs font-medium disabled:opacity-50"
            onclick={handleCreateGroup}
            disabled={selectedMembers.length === 0}
          >Create</button>
        </div>
      </div>
    </div>
  </div>
{/if}
