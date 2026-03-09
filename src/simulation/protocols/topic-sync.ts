import type { Peer, Operation, SimulationState } from '../types';
import { getFollowSet } from '../log-models';

/**
 * Topic Sync SP: Peers discover common topics and sync all operations for those topics.
 * Full metadata is visible: topic ID, sender, operation type.
 *
 * Behavior depends on the log model:
 * - topic-per-group: peers share ops for topics they both care about (current behavior)
 * - shared-peer-logs: known topics derived from follow set
 */
export function getTransferableOps(state: SimulationState, from: Peer, to: Peer): Operation[] {
  // Find operations the 'from' peer has that 'to' peer doesn't
  const toOpIds = new Set(to.store.operations.map(op => op.id));

  if (state.logModel === 'shared-peer-logs') {
    // In shared-peer-logs model, topic discovery is based on the follow set.
    // A peer knows about topics for peer IDs in its follow set.
    const toFollows = getFollowSet(state, to.id);

    return from.store.operations.filter(op => {
      if (toOpIds.has(op.id)) return false;
      // Message servers relay everything they have
      if (from.type === 'message-server' || to.type === 'message-server') return true;
      // Transfer if the op's topic matches the follow set
      if (op.topicId) {
        // For shared-peer-logs, topicId is either senderId or senderId:groupId
        // Extract the peer part (before any colon)
        const topicPeer = op.topicId.split(':')[0];
        if (toFollows.has(topicPeer)) return true;
      }
      if (op.recipients.includes(to.id)) return true;
      return false;
    });
  }

  // topic-per-group model: original behavior
  // A peer cares about a topic if they have any operations for it or are a recipient
  const toTopics = new Set<string>();
  for (const op of to.store.operations) {
    if (op.topicId) toTopics.add(op.topicId);
  }
  // Also add topics where 'to' is a recipient
  for (const op of from.store.operations) {
    if (op.topicId && op.recipients.includes(to.id)) {
      toTopics.add(op.topicId);
    }
  }

  return from.store.operations.filter(op => {
    if (toOpIds.has(op.id)) return false;
    // Message servers relay everything they have
    if (from.type === 'message-server' || to.type === 'message-server') return true;
    // For topic sync, only sync ops for common topics or ops destined for 'to'
    if (op.topicId && toTopics.has(op.topicId)) return true;
    if (op.recipients.includes(to.id)) return true;
    return false;
  });
}
