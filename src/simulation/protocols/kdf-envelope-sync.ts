import type { Peer, Operation, SimulationState, RelayEntry } from '../types';

/**
 * Topic KDF Envelope Sync SP: KDF-derived topic envelopes with chain-linked operations.
 *
 * Sync protocol (initiator-driven):
 * 1. Initiator announces ALL its kdfPub values to the receiver
 * 2. Receiver adopts announced topics (for future relay)
 * 3. Receiver sends its tips for the announced topics; initiator responds with its tips
 * 4. Chain walk-back from unknown tips to common ancestor, transfer missing entries
 *
 * The receiver catches the initiator up on anything it's missing.
 * Topics propagate outward from the initiator — this is how topics spread through the mesh.
 */

/** Phase 1: Initiator announces ALL its relay topics to the receiver */
function announceTopics(initiator: Peer, receiver: Peer): void {
  for (const kdfPub of initiator.relayStore.knownTopics) {
    if (!receiver.relayStore.knownTopics.includes(kdfPub)) {
      receiver.relayStore.knownTopics.push(kdfPub);
    }
  }
}

/** Get chain tips: entries whose selfHash is not referenced as any other entry's previousHash */
function getTips(entries: RelayEntry[], kdfPub: string): RelayEntry[] {
  const topicEntries = entries.filter(e => e.envelope.kdfPub === kdfPub);
  const referenced = new Set<string>();
  for (const e of topicEntries) {
    if (e.envelope.previousHash) referenced.add(e.envelope.previousHash);
  }
  return topicEntries.filter(e => !referenced.has(e.envelope.selfHash));
}

/** Walk back from a tip through the chain, collecting entries the receiver is missing */
function walkBackMissing(
  entries: RelayEntry[],
  toEntryHashes: Set<string>,
  tipHash: string
): RelayEntry[] {
  const missing: RelayEntry[] = [];
  const byHash = new Map(entries.map(e => [e.envelope.selfHash, e]));

  let currentHash: string | undefined = tipHash;
  while (currentHash) {
    if (toEntryHashes.has(currentHash)) break; // found common ancestor
    const entry = byHash.get(currentHash);
    if (!entry) break;
    if (!entry.envelopeOnly) {
      missing.push(entry);
    }
    currentHash = entry.envelope.previousHash;
  }

  return missing;
}

/** Phase 2+3: Compare tips and walk chains to find operations `to` is missing */
function findMissingOps(from: Peer, to: Peer): Operation[] {
  const toEntryHashes = new Set(to.relayStore.entries.map(e => e.envelope.selfHash));
  const toTopics = new Set(to.relayStore.knownTopics);
  const fromTopics = new Set(from.relayStore.knownTopics);

  const commonTopics = [...fromTopics].filter(t => toTopics.has(t));

  const result: Operation[] = [];
  const added = new Set<string>();

  for (const kdfPub of commonTopics) {
    const fromTips = getTips(from.relayStore.entries, kdfPub);

    for (const tip of fromTips) {
      const missing = walkBackMissing(from.relayStore.entries, toEntryHashes, tip.envelope.selfHash);
      for (const entry of missing) {
        if (!added.has(entry.operation.id)) {
          added.add(entry.operation.id);
          result.push(entry.operation);
        }
      }
    }
  }

  return result;
}

/**
 * Sync between two peers. `a` is the initiator.
 *
 * The initiator announces all its topics to the receiver.
 * Both sides then exchange tips and transfer missing operations.
 * The receiver does NOT announce its topics back — topics propagate
 * outward from the initiator through the mesh.
 */
export function sync(_state: SimulationState, a: Peer, b: Peer): { aToB: Operation[]; bToA: Operation[] } {
  // Phase 1: Initiator (a) announces all its kdfPubs to receiver (b)
  announceTopics(a, b);

  // Phase 2+3: Tips exchange + chain walk-back (bidirectional data transfer)
  return {
    aToB: findMissingOps(a, b),
    bToA: findMissingOps(b, a),
  };
}
