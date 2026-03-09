import type { Peer, Operation, SimulationState } from '../types';

/**
 * Encrypted + Obfuscated Group ID SP:
 * Peers exchange encrypted operations tagged with an obfuscated group identifier.
 * Intermediaries can see the obfuscated group ID but not content, sender, or type.
 *
 * Behavior is unchanged by the log model — the obfuscated group ID is used for routing.
 */
export function getTransferableOps(_state: SimulationState, from: Peer, to: Peer): Operation[] {
  const toOpIds = new Set(to.store.operations.map(op => op.id));

  return from.store.operations.filter(op => {
    if (toOpIds.has(op.id)) return false;
    // Message servers store and forward everything (they use obfuscated group ID for organization)
    if (from.type === 'message-server' || to.type === 'message-server') return true;
    // Peers relay all operations they have — they can see the obfuscated group ID
    // but use it only for storage organization, not selective filtering
    if (op.recipients.includes(to.id)) return true;
    // Relay: forward ops even if not for 'to', as long as they have the obfuscated group ID
    if (op.obfuscatedGroupId) return true;
    return false;
  });
}
