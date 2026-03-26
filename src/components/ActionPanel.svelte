<script lang="ts">
  import { simulationState, selectedPeerId, selectedPeer } from '../stores/ui-state';
  import { sendMessage, addContact, createGroup, addMember, toggleOnline, toggleISPShutdown } from '../simulation/engine';

  let dmContent = $state('Hello!');
  let dmRecipient = $state('');
  let groupMsgContent = $state('Hello group!');
  let groupMsgTarget = $state('');
  let contactTarget = $state('');
  let newGroupName = $state('New Group');
  let addMemberGroup = $state('');
  let addMemberTarget = $state('');

  function handleSendDM() {
    const peerId = $selectedPeerId;
    if (!peerId || !dmRecipient) return;
    simulationState.update(s => sendMessage(s, peerId, [dmRecipient], dmContent));
    dmContent = 'Hello!';
  }

  function handleSendGroupMessage() {
    const peerId = $selectedPeerId;
    const peer = $selectedPeer;
    if (!peerId || !peer || !groupMsgTarget) return;
    const group = peer.groups.find(g => g.id === groupMsgTarget);
    if (!group) return;
    const recipients = group.members.filter(m => m !== peerId);
    simulationState.update(s => sendMessage(s, peerId, recipients, groupMsgContent, groupMsgTarget));
    groupMsgContent = 'Hello group!';
  }

  function handleAddContact() {
    const peerId = $selectedPeerId;
    if (!peerId || !contactTarget) return;
    simulationState.update(s => addContact(s, peerId, contactTarget));
    contactTarget = '';
  }

  function handleCreateGroup() {
    const peerId = $selectedPeerId;
    if (!peerId || !newGroupName.trim()) return;
    simulationState.update(s => createGroup(s, peerId, newGroupName, []));
    newGroupName = 'New Group';
  }

  function handleAddMember() {
    const peerId = $selectedPeerId;
    if (!peerId || !addMemberGroup || !addMemberTarget) return;
    simulationState.update(s => addMember(s, peerId, addMemberGroup, addMemberTarget));
    addMemberTarget = '';
  }

  function handleToggleOnline() {
    const peerId = $selectedPeerId;
    if (!peerId) return;
    simulationState.update(s => toggleOnline(s, peerId));
  }

  // Other device-type peers (not infrastructure)
  let otherPeers = $derived(
    [...$simulationState.peers.values()].filter(p => p.id !== $selectedPeerId && p.type === 'peer')
  );

  // Contacts not yet added
  let nonContacts = $derived(
    otherPeers.filter(p => !$selectedPeer?.contacts.includes(p.id))
  );

  // Peers not in a given group
  function nonMembers(groupId: string) {
    const group = $selectedPeer?.groups.find(g => g.id === groupId);
    if (!group) return [];
    return otherPeers.filter(p => !group.members.includes(p.id));
  }
</script>

{#if $selectedPeer && $selectedPeer.type === 'peer'}
  {@const peer = $selectedPeer}
  <div class="border-t border-[var(--border)] p-3">
    <div class="flex items-center gap-2 mb-3">
      <h4 class="text-xs font-bold uppercase text-[var(--text-muted)]">Actions</h4>
      <button
        class="ml-auto text-[9px] px-1.5 py-0.5 rounded transition-colors {peer.online ? 'bg-[var(--error)]/20 text-[var(--error)]' : 'bg-[var(--success)]/20 text-[var(--success)]'}"
        onclick={handleToggleOnline}
      >
        {peer.online ? 'Turn Off' : 'Turn On'}
      </button>
    </div>

    <div class="flex flex-col gap-3 text-xs {peer.online ? '' : 'opacity-40 pointer-events-none'}">

      <!-- Add Contact -->
      <div>
        <span class="text-[10px] font-semibold text-[var(--text-muted)]">Add Contact</span>
        <div class="flex gap-1 mt-1">
          <select
            bind:value={contactTarget}
            class="flex-1 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-1.5 py-1 border border-[var(--border)] outline-none text-xs"
          >
            <option value="">Select peer...</option>
            {#each nonContacts as p}
              <option value={p.id}>{p.label}</option>
            {/each}
          </select>
          <button
            class="px-2 py-1 rounded bg-[var(--success)] text-white disabled:opacity-50"
            onclick={handleAddContact}
            disabled={!contactTarget}
          >Add</button>
        </div>
      </div>

      <!-- Send Direct Message -->
      {#if peer.contacts.length > 0}
        <div>
          <span class="text-[10px] font-semibold text-[var(--text-muted)]">Send Direct Message</span>
          <div class="flex flex-col gap-1 mt-1">
            <select
              bind:value={dmRecipient}
              class="w-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-1.5 py-1 border border-[var(--border)] outline-none text-xs"
            >
              <option value="">Select contact...</option>
              {#each peer.contacts as cid}
                {@const c = $simulationState.peers.get(cid)}
                {#if c}
                  <option value={cid}>{c.label}</option>
                {/if}
              {/each}
            </select>
            <div class="flex gap-1">
              <input
                type="text"
                bind:value={dmContent}
                class="flex-1 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-1.5 py-1 border border-[var(--border)] outline-none text-xs"
                placeholder="Message..."
                onkeydown={(e) => e.key === 'Enter' && handleSendDM()}
              />
              <button
                class="px-2 py-1 rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                onclick={handleSendDM}
                disabled={!dmRecipient}
              >Send</button>
            </div>
          </div>
        </div>
      {/if}

      <!-- Create Group -->
      <div>
        <span class="text-[10px] font-semibold text-[var(--text-muted)]">Create Group</span>
        <div class="flex gap-1 mt-1">
          <input
            type="text"
            bind:value={newGroupName}
            class="flex-1 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-1.5 py-1 border border-[var(--border)] outline-none text-xs"
            placeholder="Group name"
            onkeydown={(e) => e.key === 'Enter' && handleCreateGroup()}
          />
          <button
            class="px-2 py-1 rounded bg-[var(--warning)] text-black font-medium disabled:opacity-50"
            onclick={handleCreateGroup}
            disabled={!newGroupName.trim()}
          >Create</button>
        </div>
      </div>

      <!-- Add Member to Group -->
      {#if peer.groups.length > 0}
        <div>
          <span class="text-[10px] font-semibold text-[var(--text-muted)]">Add Member to Group</span>
          <div class="flex flex-col gap-1 mt-1">
            <select
              bind:value={addMemberGroup}
              class="w-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-1.5 py-1 border border-[var(--border)] outline-none text-xs"
            >
              <option value="">Select group...</option>
              {#each peer.groups as g}
                <option value={g.id}>{g.name}</option>
              {/each}
            </select>
            {#if addMemberGroup}
              <div class="flex gap-1">
                <select
                  bind:value={addMemberTarget}
                  class="flex-1 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-1.5 py-1 border border-[var(--border)] outline-none text-xs"
                >
                  <option value="">Select peer...</option>
                  {#each nonMembers(addMemberGroup) as p}
                    <option value={p.id}>{p.label}</option>
                  {/each}
                </select>
                <button
                  class="px-2 py-1 rounded bg-[var(--warning)] text-black font-medium disabled:opacity-50"
                  onclick={handleAddMember}
                  disabled={!addMemberTarget}
                >Add</button>
              </div>
            {/if}
          </div>
        </div>

        <!-- Send Group Message -->
        <div>
          <span class="text-[10px] font-semibold text-[var(--text-muted)]">Send Group Message</span>
          <div class="flex flex-col gap-1 mt-1">
            <select
              bind:value={groupMsgTarget}
              class="w-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-1.5 py-1 border border-[var(--border)] outline-none text-xs"
            >
              <option value="">Select group...</option>
              {#each peer.groups as g}
                <option value={g.id}>{g.name} ({g.members.length} members)</option>
              {/each}
            </select>
            <div class="flex gap-1">
              <input
                type="text"
                bind:value={groupMsgContent}
                class="flex-1 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded px-1.5 py-1 border border-[var(--border)] outline-none text-xs"
                placeholder="Message..."
                onkeydown={(e) => e.key === 'Enter' && handleSendGroupMessage()}
              />
              <button
                class="px-2 py-1 rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                onclick={handleSendGroupMessage}
                disabled={!groupMsgTarget}
              >Send</button>
            </div>
          </div>
        </div>
      {/if}

    </div>
  </div>
{:else if $selectedPeer && $selectedPeer.type === 'isp'}
  <div class="border-t border-[var(--border)] p-3">
    <h4 class="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">ISP Actions</h4>
    <button
      class="w-full px-3 py-1.5 rounded text-xs font-medium transition-colors {$selectedPeer.shutdown ? 'bg-[var(--success)]/20 text-[var(--success)]' : 'bg-[var(--error)]/20 text-[var(--error)]'}"
      onclick={() => $selectedPeerId && simulationState.update(s => toggleISPShutdown(s, $selectedPeerId!))}
    >
      {$selectedPeer.shutdown ? 'Restore Internet Connection' : 'Shut Down Internet (disconnect from Dash Server)'}
    </button>
    {#if $selectedPeer.shutdown}
      <p class="text-[9px] text-[var(--error)] mt-1">This ISP is disconnected from the cloud. Local devices can still reach each other through this ISP.</p>
    {/if}
  </div>
{/if}
