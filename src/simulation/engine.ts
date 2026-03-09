import type {
  SimulationState, Peer, Connection, Operation, InTransitOperation, SPType, LogModelType,
} from './types';
import { OPERATION_COLORS } from './types';
import { getTopicId } from './log-models';
import * as topicSync from './protocols/topic-sync';
import * as encryptedGroup from './protocols/encrypted-group';
import * as encryptedOnly from './protocols/encrypted-only';

const SP_SYNC_FNS: Record<SPType, (state: SimulationState, from: Peer, to: Peer) => Operation[]> = {
  'topic-sync': topicSync.getTransferableOps,
  'encrypted-group': encryptedGroup.getTransferableOps,
  'encrypted-only': encryptedOnly.getTransferableOps,
};

export function createInitialState(): SimulationState {
  return {
    peers: new Map(),
    connections: [],
    inTransit: [],
    tick: 0,
    running: false,
    speed: 1,
    intranetShutdown: false,
    logModel: 'topic-per-group',
    splitByGroup: false,
  };
}

let nextId = 1;
export function genId(prefix: string = 'id'): string {
  return `${prefix}-${nextId++}`;
}

export function resetIdCounter(): void {
  nextId = 1;
}

export function getCommonSPs(a: Peer, b: Peer): SPType[] {
  return a.supportedSPs.filter(sp => b.supportedSPs.includes(sp));
}

function canConnect(state: SimulationState, conn: Connection): boolean {
  const from = state.peers.get(conn.from);
  const to = state.peers.get(conn.to);
  if (!from || !to || !from.online || !to.online) return false;

  if (state.intranetShutdown) {
    // During intranet shutdown, internet transport only works within same zone
    if (conn.transport === 'internet') {
      // Global peers can reach each other, intranet peers can reach each other
      // But global cannot reach intranet and vice versa
      if (from.zone !== to.zone) return false;
      // Local peers can't use internet at all
      if (from.zone === 'local' || to.zone === 'local') return false;
    }
  }

  return true;
}

export function tick(state: SimulationState): SimulationState {
  const newState = { ...state, tick: state.tick + 1 };

  // Advance in-transit operations
  const stillInTransit: InTransitOperation[] = [];
  for (const transit of newState.inTransit) {
    const newProgress = transit.progress + 0.5; // half a tick to traverse
    if (newProgress >= 1) {
      // Deliver to destination peer
      const toPeer = newState.peers.get(transit.toPeer);
      if (toPeer) {
        const hasOp = toPeer.store.operations.some(op => op.id === transit.operationId);
        if (!hasOp) {
          toPeer.store.operations.push({ ...transit.operation });
          // Update receivedBy on the operation across all peers
          for (const peer of newState.peers.values()) {
            for (const op of peer.store.operations) {
              if (op.id === transit.operationId && !op.receivedBy.includes(transit.toPeer)) {
                op.receivedBy.push(transit.toPeer);
              }
            }
          }
        }
      }
    } else {
      stillInTransit.push({ ...transit, progress: newProgress });
    }
  }
  newState.inTransit = stillInTransit;

  // For each active connection, find ops to transfer
  for (const conn of newState.connections) {
    if (!canConnect(newState, conn)) continue;

    const fromPeer = newState.peers.get(conn.from);
    const toPeer = newState.peers.get(conn.to);
    if (!fromPeer || !toPeer) continue;

    const commonSPs = getCommonSPs(fromPeer, toPeer);
    if (commonSPs.length === 0) continue;

    // For each common SP, find transferable ops (both directions)
    for (const sp of commonSPs) {
      const syncFn = SP_SYNC_FNS[sp];

      // From -> To
      const opsToSend = syncFn(newState, fromPeer, toPeer);
      for (const op of opsToSend) {
        // Check if already in transit
        const alreadyInTransit = newState.inTransit.some(
          t => t.operationId === op.id && t.toPeer === toPeer.id
        );
        if (!alreadyInTransit) {
          newState.inTransit.push({
            operationId: op.id,
            fromPeer: fromPeer.id,
            toPeer: toPeer.id,
            connectionId: conn.id,
            sp,
            progress: 0,
            operation: { ...op },
          });
        }
      }

      // To -> From
      const opsToReceive = syncFn(newState, toPeer, fromPeer);
      for (const op of opsToReceive) {
        const alreadyInTransit = newState.inTransit.some(
          t => t.operationId === op.id && t.toPeer === fromPeer.id
        );
        if (!alreadyInTransit) {
          newState.inTransit.push({
            operationId: op.id,
            fromPeer: toPeer.id,
            toPeer: fromPeer.id,
            connectionId: conn.id,
            sp,
            progress: 0,
            operation: { ...op },
          });
        }
      }
    }
  }

  // Check delivery status
  for (const peer of newState.peers.values()) {
    for (const op of peer.store.operations) {
      if (!op.delivered) {
        const allReceived = op.recipients.every(r => op.receivedBy.includes(r));
        if (allReceived && op.recipients.length > 0) {
          op.delivered = true;
          // Mark as delivered across all peers
          for (const p of newState.peers.values()) {
            for (const o of p.store.operations) {
              if (o.id === op.id) o.delivered = true;
            }
          }
        }
      }
    }
  }

  return newState;
}

// --- User actions ---

export function createPeer(
  state: SimulationState,
  opts: {
    label: string;
    type: 'peer' | 'message-server';
    position: { x: number; y: number };
    transports?: ('internet' | 'lan' | 'bluetooth' | 'lora')[];
    sps?: SPType[];
    zone?: 'global' | 'intranet' | 'local';
  }
): { state: SimulationState; peerId: string } {
  const id = genId(opts.type === 'message-server' ? 'server' : 'peer');
  const peer: Peer = {
    id,
    label: opts.label,
    type: opts.type,
    position: opts.position,
    transports: opts.transports || ['internet'],
    supportedSPs: opts.sps || (opts.type === 'message-server' ? ['encrypted-group'] : ['topic-sync', 'encrypted-group']),
    online: true,
    store: { operations: [] },
    contacts: [],
    groups: [],
    zone: opts.zone || 'global',
  };
  const newPeers = new Map(state.peers);
  newPeers.set(id, peer);
  return { state: { ...state, peers: newPeers }, peerId: id };
}

export function removePeer(state: SimulationState, peerId: string): SimulationState {
  const newPeers = new Map(state.peers);
  newPeers.delete(peerId);
  const newConnections = state.connections.filter(c => c.from !== peerId && c.to !== peerId);
  const newInTransit = state.inTransit.filter(t => t.fromPeer !== peerId && t.toPeer !== peerId);
  return { ...state, peers: newPeers, connections: newConnections, inTransit: newInTransit };
}

export function addConnection(
  state: SimulationState,
  from: string,
  to: string,
  transport: 'internet' | 'lan' | 'bluetooth' | 'lora' = 'internet'
): SimulationState {
  // Don't add duplicate connections
  const exists = state.connections.some(
    c => (c.from === from && c.to === to) || (c.from === to && c.to === from)
  );
  if (exists) return state;

  const conn: Connection = {
    id: genId('conn'),
    from,
    to,
    transport,
    active: true,
  };
  return { ...state, connections: [...state.connections, conn] };
}

export function removeConnection(state: SimulationState, connId: string): SimulationState {
  return {
    ...state,
    connections: state.connections.filter(c => c.id !== connId),
    inTransit: state.inTransit.filter(t => t.connectionId !== connId),
  };
}

export function sendMessage(
  state: SimulationState,
  senderId: string,
  recipientIds: string[],
  content: string,
  groupId?: string
): SimulationState {
  const sender = state.peers.get(senderId);
  if (!sender) return state;

  const group = groupId ? sender.groups.find(g => g.id === groupId) : undefined;
  const rawTopicId = groupId || `dm-${[senderId, ...recipientIds].sort().join('-')}`;
  const topicId = getTopicId(state, senderId, rawTopicId);

  const op: Operation = {
    id: genId('op'),
    type: 'message',
    sender: senderId,
    topicId,
    groupId: group?.id,
    obfuscatedGroupId: group?.obfuscatedId,
    color: OPERATION_COLORS.message,
    encrypted: true,
    content,
    recipients: recipientIds,
    receivedBy: [senderId],
    delivered: false,
  };

  const newPeers = new Map(state.peers);
  const newSender = { ...sender, store: { operations: [...sender.store.operations, op] } };
  newPeers.set(senderId, newSender);

  return { ...state, peers: newPeers };
}

export function addContact(
  state: SimulationState,
  peerId: string,
  contactId: string
): SimulationState {
  const peer = state.peers.get(peerId);
  const contact = state.peers.get(contactId);
  if (!peer || !contact) return state;

  const newPeers = new Map(state.peers);

  // Add contact to both peers
  if (!peer.contacts.includes(contactId)) {
    const newPeer = { ...peer, contacts: [...peer.contacts, contactId] };
    newPeers.set(peerId, newPeer);
  }
  if (!contact.contacts.includes(peerId)) {
    const newContact = { ...contact, contacts: [...contact.contacts, peerId] };
    newPeers.set(contactId, newContact);
  }

  // Create contact-request operations
  const rawTopicId = `contact-${[peerId, contactId].sort().join('-')}`;

  const op1: Operation = {
    id: genId('op'),
    type: 'contact-request',
    sender: peerId,
    topicId: getTopicId(state, peerId, rawTopicId),
    color: OPERATION_COLORS['contact-request'],
    encrypted: true,
    content: `Contact request from ${peer.label} to ${contact.label}`,
    recipients: [contactId],
    receivedBy: [peerId],
    delivered: false,
  };

  const op2: Operation = {
    id: genId('op'),
    type: 'contact-request',
    sender: contactId,
    topicId: getTopicId(state, contactId, rawTopicId),
    color: OPERATION_COLORS['contact-request'],
    encrypted: true,
    content: `Contact request from ${contact.label} to ${peer.label}`,
    recipients: [peerId],
    receivedBy: [contactId],
    delivered: false,
  };

  const p = newPeers.get(peerId)!;
  newPeers.set(peerId, { ...p, store: { operations: [...p.store.operations, op1] } });
  const c = newPeers.get(contactId)!;
  newPeers.set(contactId, { ...c, store: { operations: [...c.store.operations, op2] } });

  return { ...state, peers: newPeers };
}

export function createGroup(
  state: SimulationState,
  creatorId: string,
  name: string,
  memberIds: string[]
): SimulationState {
  const creator = state.peers.get(creatorId);
  if (!creator) return state;

  const groupId = genId('group');
  const obfuscatedId = genId('obf');
  const allMembers = [creatorId, ...memberIds];

  const group: import('./types').Group = {
    id: groupId,
    name,
    members: allMembers,
    obfuscatedId,
  };

  const newPeers = new Map(state.peers);

  // Add group to creator
  const newCreator = { ...creator, groups: [...creator.groups, group] };
  newPeers.set(creatorId, newCreator);

  // Create group-invite operations for each member
  for (const memberId of memberIds) {
    const member = newPeers.get(memberId);
    if (!member) continue;
    const newMember = { ...member, groups: [...member.groups, group] };
    newPeers.set(memberId, newMember);

    const op: Operation = {
      id: genId('op'),
      type: 'group-invite',
      sender: creatorId,
      topicId: getTopicId(state, creatorId, groupId),
      groupId,
      obfuscatedGroupId: obfuscatedId,
      color: OPERATION_COLORS['group-invite'],
      encrypted: true,
      content: `Group invite: ${name}`,
      recipients: [memberId],
      receivedBy: [creatorId],
      delivered: false,
    };

    const c = newPeers.get(creatorId)!;
    newPeers.set(creatorId, { ...c, store: { operations: [...c.store.operations, op] } });
  }

  return { ...state, peers: newPeers };
}

export function toggleOnline(state: SimulationState, peerId: string): SimulationState {
  const peer = state.peers.get(peerId);
  if (!peer) return state;
  const newPeers = new Map(state.peers);
  newPeers.set(peerId, { ...peer, online: !peer.online });
  return { ...state, peers: newPeers };
}

export function updatePeerSPs(state: SimulationState, peerId: string, msps: SPType[]): SimulationState {
  const peer = state.peers.get(peerId);
  if (!peer) return state;
  const newPeers = new Map(state.peers);
  newPeers.set(peerId, { ...peer, supportedSPs: msps });
  return { ...state, peers: newPeers };
}

export function updatePeerTransports(state: SimulationState, peerId: string, transports: import('./types').Transport[]): SimulationState {
  const peer = state.peers.get(peerId);
  if (!peer) return state;
  const newPeers = new Map(state.peers);
  newPeers.set(peerId, { ...peer, transports });
  return { ...state, peers: newPeers };
}

export function updatePeerZone(state: SimulationState, peerId: string, zone: import('./types').NetworkZone): SimulationState {
  const peer = state.peers.get(peerId);
  if (!peer) return state;
  const newPeers = new Map(state.peers);
  newPeers.set(peerId, { ...peer, zone });
  return { ...state, peers: newPeers };
}

export function toggleIntranetShutdown(state: SimulationState): SimulationState {
  return { ...state, intranetShutdown: !state.intranetShutdown };
}

export function setLogModel(state: SimulationState, logModel: LogModelType): SimulationState {
  return { ...state, logModel, splitByGroup: logModel === 'topic-per-group' ? false : state.splitByGroup };
}

export function toggleSplitByGroup(state: SimulationState): SimulationState {
  return { ...state, splitByGroup: !state.splitByGroup };
}
