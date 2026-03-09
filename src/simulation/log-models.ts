import type { SimulationState } from './types';

/**
 * Get the follow set for a peer in the shared-peer-logs model.
 * A peer "follows" (knows about) topics from:
 * 1. Itself
 * 2. Direct contacts
 * 3. Contacts of contacts (2-hop)
 * 4. All group members
 *
 * For message servers: they follow all topics of peers they're connected to,
 * plus all topics those peers follow (i.e. the server inherits the follow set
 * of every peer connected to it).
 */
export function getFollowSet(state: SimulationState, peerId: string): Set<string> {
  const peer = state.peers.get(peerId);
  if (!peer) return new Set();

  const follows = new Set<string>();

  if (peer.type === 'message-server') {
    // Server follows all topics of connected peers
    for (const conn of state.connections) {
      let connectedPeerId: string | null = null;
      if (conn.from === peerId) connectedPeerId = conn.to;
      else if (conn.to === peerId) connectedPeerId = conn.from;
      if (!connectedPeerId) continue;

      const connectedPeer = state.peers.get(connectedPeerId);
      if (!connectedPeer || connectedPeer.type === 'message-server') continue;

      // Get that peer's full follow set and add all of it
      const peerFollows = getPeerFollowSet(state, connectedPeerId);
      for (const f of peerFollows) {
        follows.add(f);
      }
    }
    return follows;
  }

  return getPeerFollowSet(state, peerId);
}

/**
 * Get follow set for a regular (non-server) peer.
 */
function getPeerFollowSet(state: SimulationState, peerId: string): Set<string> {
  const peer = state.peers.get(peerId);
  if (!peer) return new Set();

  const follows = new Set<string>();

  // 1. Self
  follows.add(peerId);

  // 2. Direct contacts
  for (const contactId of peer.contacts) {
    follows.add(contactId);
  }

  // 3. Contacts of contacts (2-hop)
  for (const contactId of peer.contacts) {
    const contact = state.peers.get(contactId);
    if (!contact) continue;
    for (const contactOfContactId of contact.contacts) {
      follows.add(contactOfContactId);
    }
  }

  // 4. All group members
  for (const group of peer.groups) {
    for (const memberId of group.members) {
      follows.add(memberId);
    }
  }

  return follows;
}

/**
 * Get the topic ID for an operation based on the active log model.
 *
 * - topic-per-group: topicId = groupId or DM conversation ID (current behavior)
 * - shared-peer-logs: topicId = sender's peer ID
 * - shared-peer-logs + splitByGroup: topicId = senderId:groupOrDmId
 */
export function getTopicId(
  state: SimulationState,
  senderId: string,
  groupOrDmId: string,
): string {
  switch (state.logModel) {
    case 'topic-per-group':
      return groupOrDmId;
    case 'shared-peer-logs':
      return state.splitByGroup ? `${senderId}:${groupOrDmId}` : senderId;
  }
}
