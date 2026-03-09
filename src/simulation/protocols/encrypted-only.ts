import type { Peer, Operation, SimulationState } from '../types';

/**
 * Encrypted Only SP:
 * Peers exchange opaque encrypted blobs with zero metadata.
 * No selective relay possible — just opaque bytes. Maximum privacy, highest bandwidth cost.
 *
 * Behavior is unchanged by the log model.
 */
export function getTransferableOps(_state: SimulationState, from: Peer, to: Peer): Operation[] {
  const toOpIds = new Set(to.store.operations.map(op => op.id));

  // With encrypted-only, no metadata is visible, so ALL operations are transferred
  // This is the "firehose" approach — every peer gets everything
  return from.store.operations.filter(op => !toOpIds.has(op.id));
}
