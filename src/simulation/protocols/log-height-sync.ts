import type { Peer, Operation, SimulationState } from '../types';

/**
 * Log Height Sync SP: p2panda-style structured log sync.
 *
 * Sync protocol (bidirectional):
 * 1. Topic announcement: each peer announces topics where the other is a recipient
 * 2. Log height comparison: for each common topic, compare seqNum per author
 * 3. Transfer: send entries the other peer is behind on
 */

/** Phase 1: Announce topics from `from` to `to` where `to` is a direct recipient */
function announceTopics(from: Peer, to: Peer): void {
  for (const [topicId, authorLogs] of Object.entries(from.appStore.topics)) {
    if (to.appStore.knownTopics.includes(topicId)) continue;
    for (const log of Object.values(authorLogs)) {
      if (log.entries.some(e => e.operation.recipients.includes(to.id))) {
        to.appStore.knownTopics.push(topicId);
        break;
      }
    }
  }
}

/** Phase 2+3: Compare log heights and return operations `to` is missing */
function findMissingOps(from: Peer, to: Peer): Operation[] {
  const toTopics = new Set(to.appStore.knownTopics);
  const result: Operation[] = [];

  for (const [topicId, authorLogs] of Object.entries(from.appStore.topics)) {
    if (!toTopics.has(topicId)) continue;

    for (const [authorPubKey, log] of Object.entries(authorLogs)) {
      const toLog = to.appStore.topics[topicId]?.[authorPubKey];
      const toHeight = toLog ? toLog.entries.length : 0;

      for (const entry of log.entries) {
        if (entry.seqNum > toHeight) {
          result.push(entry.operation);
        }
      }
    }
  }

  return result;
}

/**
 * Full bidirectional sync between two peers.
 * Returns operations to transfer in each direction.
 */
export function sync(_state: SimulationState, a: Peer, b: Peer): { aToB: Operation[]; bToA: Operation[] } {
  // Phase 1: Bidirectional topic announcement
  announceTopics(a, b);
  announceTopics(b, a);

  // Phase 2+3: Find missing operations in each direction
  return {
    aToB: findMissingOps(a, b),
    bToA: findMissingOps(b, a),
  };
}
