import type {
  SimulationState, Peer, Connection, Operation, InTransitOperation, SPType, SetupConfig, Transport,
  P2PandaEntry, RelayEntry, RelayEnvelope, TopicKdf,
} from './types';
import {
  createEmptyAppStore, createEmptyRelayStore,
  forEachOperation, hasOperation, TRANSPORT_RANGE,
} from './types';
import {
  generateKeypair, deriveTopicKdf, sha256Hex,
  signP2PandaEntry, computeBacklink, encryptOperation,
  signEnvelope, ZERO_HASH,
} from './crypto';
import * as logHeightSync from './protocols/log-height-sync';
import * as kdfEnvelopeSync from './protocols/kdf-envelope-sync';

/** True for any server/relay type (message-server, dash-server) — no appStore, relay only */
function isServer(peer: Peer): boolean {
  return peer.type === 'message-server' || peer.type === 'dash-server';
}

/** True for dash-server specifically (cloud relay) */
function isDashServer(peer: Peer): boolean {
  return peer.type === 'dash-server';
}

/** True for infrastructure nodes that don't sync or store (routers, ISPs) */
function isInfrastructure(peer: Peer): boolean {
  return peer.type === 'router' || peer.type === 'isp';
}

/** True for router (LAN infrastructure) */
function isRouter(peer: Peer): boolean {
  return peer.type === 'router';
}

/** True for ISP (internet infrastructure — provides connectivity, no sync) */
function isISP(peer: Peer): boolean {
  return peer.type === 'isp';
}

type SyncFn = (state: SimulationState, a: Peer, b: Peer) => { aToB: Operation[]; bToA: Operation[] };

const SP_SYNC_FNS: Record<SPType, SyncFn> = {
  'log-height-sync': logHeightSync.sync,
  'kdf-envelope-sync': kdfEnvelopeSync.sync,
};

export function createInitialState(): SimulationState {
  return {
    peers: new Map(),
    connections: [],
    inTransit: [],
    tick: 0,
    running: false,
    speed: 1,
    topicPerGroup: true,
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

  return true;
}

// --- Topic KDF management ---

/** Ensure a peer has the KDF info for a topic. Derives it if missing. */
function ensureTopicKdf(peer: Peer, topicId: string): TopicKdf {
  if (!peer.topicKdfs[topicId]) {
    peer.topicKdfs[topicId] = deriveTopicKdf(topicId);
  }
  return peer.topicKdfs[topicId];
}

/** Share topic KDF info between two peers (both get the same KDF for a topic) */
function shareTopicKdf(peer1: Peer, peer2: Peer, topicId: string): void {
  const kdf = ensureTopicKdf(peer1, topicId);
  if (!peer2.topicKdfs[topicId]) {
    peer2.topicKdfs[topicId] = { ...kdf };
  }
}

// --- p2panda App Store operations ---

/** Compute a deterministic log ID from a topic ID */
function logIdForTopic(topicId: string): number {
  // Simple hash to a number
  let hash = 0;
  for (let i = 0; i < topicId.length; i++) {
    hash = ((hash << 5) - hash + topicId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Add an operation to the p2panda app store with proper entry signing */
function addToAppStore(peer: Peer, op: Operation): void {
  const topicId = op.topicId || '_default';
  const authorPubKey = peer.publicKey;

  if (!peer.appStore.topics[topicId]) peer.appStore.topics[topicId] = {};
  if (!peer.appStore.topics[topicId][authorPubKey]) {
    peer.appStore.topics[topicId][authorPubKey] = {
      publicKey: authorPubKey,
      logId: logIdForTopic(topicId),
      entries: [],
    };
  }

  const log = peer.appStore.topics[topicId][authorPubKey];
  const seqNum = log.entries.length + 1;
  const prevEntry = log.entries.length > 0 ? log.entries[log.entries.length - 1] : undefined;

  // Compute backlink: hash of the previous entry
  let backlink: string | undefined;
  if (prevEntry) {
    backlink = computeBacklink(
      prevEntry.logId, prevEntry.seqNum, prevEntry.backlink,
      prevEntry.payloadHash, prevEntry.payloadSize, prevEntry.signature,
    );
  }

  // Hash the payload
  const payloadJson = JSON.stringify({ type: op.type, sender: op.sender, content: op.content, topicId: op.topicId });
  const payloadBytes = new TextEncoder().encode(payloadJson);
  const payloadHash = sha256Hex(payloadBytes);
  const payloadSize = payloadBytes.length;

  // Sign the entry
  const signature = signP2PandaEntry(peer.privateKey, log.logId, seqNum, backlink, payloadHash, payloadSize);

  const entry: P2PandaEntry = {
    logId: log.logId,
    seqNum,
    backlink,
    payloadHash,
    payloadSize,
    signature,
    operation: op,
  };

  log.entries.push(entry);

  if (!peer.appStore.knownTopics.includes(topicId)) {
    peer.appStore.knownTopics.push(topicId);
  }
}

/** Add an operation to app store when received from another peer (different author) */
function addToAppStoreFromOther(peer: Peer, op: Operation, sourceEntry?: P2PandaEntry): void {
  const topicId = op.topicId || '_default';
  // Look up the author's public key from the source peer
  // In the simulator, we find the original author's public key
  const authorPeer = findPeerByIdInState(currentTickState, op.sender);
  const authorPubKey = authorPeer?.publicKey || op.sender;

  if (!peer.appStore.topics[topicId]) peer.appStore.topics[topicId] = {};
  if (!peer.appStore.topics[topicId][authorPubKey]) {
    peer.appStore.topics[topicId][authorPubKey] = {
      publicKey: authorPubKey,
      logId: logIdForTopic(topicId),
      entries: [],
    };
  }

  const log = peer.appStore.topics[topicId][authorPubKey];
  // Don't add duplicate entries
  if (log.entries.some(e => e.operation.id === op.id)) return;

  if (sourceEntry) {
    // Copy the entry from the source (preserves original signature, backlink, etc.)
    log.entries.push({ ...sourceEntry, operation: op });
  } else {
    // Fallback: create a minimal entry
    const seqNum = log.entries.length + 1;
    const payloadJson = JSON.stringify({ type: op.type, sender: op.sender, content: op.content, topicId: op.topicId });
    const payloadBytes = new TextEncoder().encode(payloadJson);
    log.entries.push({
      logId: log.logId,
      seqNum,
      payloadHash: sha256Hex(payloadBytes),
      payloadSize: payloadBytes.length,
      signature: '(received)',
      operation: op,
    });
  }

  if (!peer.appStore.knownTopics.includes(topicId)) {
    peer.appStore.knownTopics.push(topicId);
  }
}

// --- Relay Store operations ---

/** Find the previous relay entry in the same chain (same kdfPub + same sender) */
function findRelayPreviousHash(store: { entries: RelayEntry[] }, kdfPub: string, senderId: string): string {
  const entries = store.entries.filter(
    e => e.envelope.kdfPub === kdfPub && e.operation.sender === senderId
  );
  return entries.length > 0 ? entries[entries.length - 1].envelope.selfHash : ZERO_HASH;
}

/** Add an operation to the relay store with proper envelope signing */
function addToRelayStore(peer: Peer, op: Operation): void {
  const topicId = op.topicId || '_default';
  const kdf = ensureTopicKdf(peer, topicId);

  // "Encrypt" the operation (simulate: serialize to JSON and hash)
  const { encryptedHex, selfHash } = encryptOperation({
    id: op.id, type: op.type, sender: op.sender, content: op.content,
  });

  // Find previous hash in this sender's chain for this topic
  const previousHash = findRelayPreviousHash(peer.relayStore, kdf.kdfPub, op.sender);

  // Sign the envelope
  const signature = signEnvelope(kdf.kdfPriv, kdf.kdfPub, previousHash, selfHash);

  const envelope: RelayEnvelope = {
    kdfPub: kdf.kdfPub,
    previousHash,
    selfHash,
    signature,
  };

  peer.relayStore.entries.push({
    envelope,
    encryptedOperation: encryptedHex,
    envelopeOnly: false,
    operation: op,
  });

  if (!peer.relayStore.knownTopics.includes(kdf.kdfPub)) {
    peer.relayStore.knownTopics.push(kdf.kdfPub);
  }
}

/** Add a relay entry received from another peer (preserves original envelope) */
function addRelayEntryFromOther(peer: Peer, entry: RelayEntry): void {
  // Don't add duplicates
  if (peer.relayStore.entries.some(e => e.envelope.selfHash === entry.envelope.selfHash)) return;

  peer.relayStore.entries.push({ ...entry, operation: { ...entry.operation } });

  const kdfPub = entry.envelope.kdfPub;
  if (!peer.relayStore.knownTopics.includes(kdfPub)) {
    peer.relayStore.knownTopics.push(kdfPub);
  }
}

/** Add an operation to both stores of a peer (or relay store only for servers) */
function addOpToStores(peer: Peer, op: Operation): void {
  addToRelayStore(peer, op);
  if (!isServer(peer)) {
    addToAppStore(peer, op);
  }
}

// --- State lookup (used during tick) ---
let currentTickState: SimulationState | null = null;

function findPeerByIdInState(state: SimulationState | null, peerId: string): Peer | undefined {
  return state?.peers.get(peerId);
}

// --- Garbage collection ---

function runGC(state: SimulationState): void {
  for (const [serverId, server] of state.peers) {
    if (!isServer(server)) continue;
    if (!server.supportedSPs.includes('kdf-envelope-sync')) continue;

    const subscribers: string[] = [];
    for (const conn of state.connections) {
      const otherId = conn.from === serverId ? conn.to : conn.to === serverId ? conn.from : null;
      if (!otherId) continue;
      const other = state.peers.get(otherId);
      if (!other || isServer(other)) continue;
      if (other.supportedSPs.includes('kdf-envelope-sync')) {
        subscribers.push(otherId);
      }
    }

    for (const entry of server.relayStore.entries) {
      if (entry.envelopeOnly) continue;

      const topicSubscribers = subscribers.filter(subId => {
        const sub = state.peers.get(subId);
        return sub && sub.relayStore.knownTopics.includes(entry.envelope.kdfPub);
      });

      if (topicSubscribers.length > 0 && topicSubscribers.every(subId => entry.operation.receivedBy.includes(subId))) {
        entry.envelopeOnly = true;
      }
    }
  }
}

// --- Movement & dynamic connections ---

/** Height of the internet zone band at the top — must match renderer */
import {
  SERVER_BOUNDS, ISP_BOUNDS, DEVICE_BOUNDS,
} from './types';

const CANVAS_BOUNDS = DEVICE_BOUNDS;
const PEER_SPEED = 8;       // max pixels per tick
const VELOCITY_DAMPING = 0.85;
const ACCEL_JITTER = 3;     // random acceleration per tick
const RANGE_HYSTERESIS = 1.15; // disconnect at 115% of range (avoids flicker)

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Move all non-server/non-infrastructure peers with a random walk. */
function movePeers(state: SimulationState): void {
  for (const peer of state.peers.values()) {
    if (isServer(peer) || isInfrastructure(peer)) continue;

    // Random acceleration
    const ax = (Math.random() - 0.5) * 2 * ACCEL_JITTER;
    const ay = (Math.random() - 0.5) * 2 * ACCEL_JITTER;

    let vx = peer.velocity.vx * VELOCITY_DAMPING + ax;
    let vy = peer.velocity.vy * VELOCITY_DAMPING + ay;

    // Clamp speed
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > PEER_SPEED) {
      vx = (vx / speed) * PEER_SPEED;
      vy = (vy / speed) * PEER_SPEED;
    }

    let nx = peer.position.x + vx;
    let ny = peer.position.y + vy;

    // Bounce off bounds (peers stay below the internet zone)
    const bounds = CANVAS_BOUNDS;
    if (nx < bounds.minX) { nx = bounds.minX; vx = Math.abs(vx); }
    if (nx > bounds.maxX) { nx = bounds.maxX; vx = -Math.abs(vx); }
    if (ny < bounds.minY) { ny = bounds.minY; vy = Math.abs(vy); }
    if (ny > bounds.maxY) { ny = bounds.maxY; vy = -Math.abs(vy); }

    peer.position = { x: nx, y: ny };
    peer.velocity = { vx, vy };
  }
}

/**
 * Check if two peers can connect via LAN through a shared router.
 * Both peers must have 'lan' transport and be within the LAN range of the same router.
 */
/** Check if a node provides LAN coverage (routers and starlink devices) */
function providesLAN(peer: Peer): boolean {
  return (peer.type === 'router' || peer.type === 'starlink') && peer.online;
}

function canConnectViaLan(state: SimulationState, a: Peer, b: Peer): boolean {
  if (!a.transports.includes('lan') || !b.transports.includes('lan')) return false;
  const lanRange = TRANSPORT_RANGE['lan'];
  for (const provider of state.peers.values()) {
    if (!providesLAN(provider)) continue;
    // A starlink/router providing LAN can also be one of the endpoints
    if (provider.id === a.id || provider.id === b.id) continue;
    const distA = distanceBetween(a.position, provider.position);
    const distB = distanceBetween(b.position, provider.position);
    if (distA <= lanRange && distB <= lanRange) return true;
  }
  // Also: if one endpoint IS a starlink/router, it provides LAN to the other
  if (providesLAN(a) && b.transports.includes('lan')) {
    if (distanceBetween(a.position, b.position) <= lanRange) return true;
  }
  if (providesLAN(b) && a.transports.includes('lan')) {
    if (distanceBetween(a.position, b.position) <= lanRange) return true;
  }
  return false;
}

/** Find the best shared proximity transport between two peers, if any. */
function bestProximityTransport(state: SimulationState, a: Peer, b: Peer): Transport | null {
  const dist = distanceBetween(a.position, b.position);

  // LAN: requires a shared router, not direct range
  if (canConnectViaLan(state, a, b)) return 'lan';

  // Bluetooth and LoRa: direct proximity
  const directTransports: Transport[] = ['bluetooth', 'lora'];
  let best: Transport | null = null;
  let bestRange = Infinity;
  for (const t of directTransports) {
    if (a.transports.includes(t) && b.transports.includes(t)) {
      if (dist <= TRANSPORT_RANGE[t] && TRANSPORT_RANGE[t] < bestRange) {
        best = t;
        bestRange = TRANSPORT_RANGE[t];
      }
    }
  }
  return best;
}


/** Find the ISP for a given peer based on zone matching. Starlink → global ISP. */
function findISPForPeer(state: SimulationState, peer: Peer): Peer | undefined {
  const peerZone = peer.type === 'starlink' ? 'global' : peer.zone;
  for (const p of state.peers.values()) {
    if (p.type === 'isp' && p.online && p.zone === peerZone) return p;
  }
  // Fallback: any online ISP
  for (const p of state.peers.values()) {
    if (p.type === 'isp' && p.online) return p;
  }
  return undefined;
}

/** Check if an ISP can reach a dash-server (blocked when ISP has shutdown enabled) */
function canISPReachDashServer(_state: SimulationState, isp: Peer): boolean {
  return !isp.shutdown;
}

/**
 * Rebuild connections dynamically each tick:
 * - Proximity (LAN/BT/LoRa): connect if within range
 * - Internet: device → ISP → dash-server (no direct device → dash-server)
 */
function updateConnections(state: SimulationState): void {
  const allPeers = Array.from(state.peers.values()).filter(p => p.online);
  const syncPeers = allPeers.filter(p => !isInfrastructure(p));
  const toRemove = new Set<string>();
  const existing = new Map<string, Connection>();

  for (const conn of state.connections) {
    existing.set([conn.from, conn.to].sort().join('-'), conn);
  }

  // Validate existing connections
  for (const conn of state.connections) {
    const from = state.peers.get(conn.from);
    const to = state.peers.get(conn.to);
    if (!from || !to || !from.online || !to.online) {
      toRemove.add(conn.id);
      continue;
    }

    if (conn.transport === 'internet') {
      const hasISP = isISP(from) || isISP(to);
      const hasDS = isDashServer(from) || isDashServer(to);
      const hasStarlink = from.type === 'starlink' || to.type === 'starlink';
      if (hasStarlink && hasDS) {
        // Starlink ↔ dash-server: always valid (satellite bypass)
      } else if (hasISP && hasDS) {
        const isp = isISP(from) ? from : to;
        if (!canISPReachDashServer(state, isp)) toRemove.add(conn.id);
      } else if (hasISP) {
        const device = isISP(from) ? to : from;
        const isp = isISP(from) ? from : to;
        // Starlink doesn't connect through ISP
        if (device.type === 'starlink') { toRemove.add(conn.id); continue; }
        if (device.zone !== isp.zone) toRemove.add(conn.id);
        if (!device.transports.includes('internet')) toRemove.add(conn.id);
      } else {
        // Direct device↔dash-server only allowed for starlink
        toRemove.add(conn.id);
      }
    } else if (conn.transport === 'lan') {
      if (!canConnectViaLan(state, from, to)) toRemove.add(conn.id);
    } else {
      const dist = distanceBetween(from.position, to.position);
      const range = TRANSPORT_RANGE[conn.transport] * RANGE_HYSTERESIS;
      if (dist > range) toRemove.add(conn.id);
    }
  }

  // Remove stale
  if (toRemove.size > 0) {
    state.connections = state.connections.filter(c => !toRemove.has(c.id));
    state.inTransit = state.inTransit.filter(t => !toRemove.has(t.connectionId));
    existing.clear();
    for (const conn of state.connections) {
      existing.set([conn.from, conn.to].sort().join('-'), conn);
    }
  }

  // Add proximity connections between sync-capable peers
  for (let i = 0; i < syncPeers.length; i++) {
    for (let j = i + 1; j < syncPeers.length; j++) {
      const a = syncPeers[i];
      const b = syncPeers[j];
      const key = [a.id, b.id].sort().join('-');
      if (existing.has(key)) continue;
      const transport = bestProximityTransport(state, a, b);
      if (transport) {
        const conn: Connection = { id: genId('conn'), from: a.id, to: b.id, transport, active: true };
        state.connections.push(conn);
        existing.set(key, conn);
      }
    }
  }

  // Add internet connections: device → ISP (starlink connects directly to dash-server instead)
  for (const peer of allPeers) {
    if (isISP(peer) || isDashServer(peer)) continue;
    if (!peer.transports.includes('internet')) continue;
    if (peer.type === 'starlink') continue; // starlink bypasses ISP
    const isp = findISPForPeer(state, peer);
    if (!isp) continue;
    const key = [peer.id, isp.id].sort().join('-');
    if (existing.has(key)) continue;
    const conn: Connection = { id: genId('conn'), from: peer.id, to: isp.id, transport: 'internet', active: true };
    state.connections.push(conn);
    existing.set(key, conn);
  }

  // Add internet connections: starlink → dash-server (direct satellite link)
  const starlinks = allPeers.filter(p => p.type === 'starlink');
  for (const sl of starlinks) {
    for (const ds of allPeers.filter(p => isDashServer(p))) {
      const key = [sl.id, ds.id].sort().join('-');
      if (existing.has(key)) continue;
      const conn: Connection = { id: genId('conn'), from: sl.id, to: ds.id, transport: 'internet', active: true };
      state.connections.push(conn);
      existing.set(key, conn);
    }
  }

  // Add internet connections: ISP → dash-server
  const isps = allPeers.filter(p => isISP(p));
  const dashServers = allPeers.filter(p => isDashServer(p));
  for (const isp of isps) {
    if (!canISPReachDashServer(state, isp)) continue;
    for (const ds of dashServers) {
      const key = [isp.id, ds.id].sort().join('-');
      if (existing.has(key)) continue;
      const conn: Connection = { id: genId('conn'), from: isp.id, to: ds.id, transport: 'internet', active: true };
      state.connections.push(conn);
      existing.set(key, conn);
    }
  }
}

/**
 * Implicit internet peer-to-peer sync (no visible connection needed).
 * All internet-connected peers can sync directly as if connected.
 */
/** When a group-invite is delivered, add the group to the recipient */
/** When a group-invite is delivered, add the group and topic KDF to the recipient */
function handleGroupInviteDelivery(state: SimulationState, op: Operation, toPeer: Peer): void {
  if (op.type !== 'group-invite' || !op.groupId) return;
  if (toPeer.groups.some(g => g.id === op.groupId)) return;
  const sender = state.peers.get(op.sender);
  const group = sender?.groups.find(g => g.id === op.groupId);
  if (group) {
    toPeer.groups.push({ ...group });
    // Share the topic KDF so the recipient can participate in envelope sync
    if (op.topicId && sender) {
      shareTopicKdf(sender, toPeer, op.topicId);
    }
  }
}

/** Find an internet connection (device↔ISP or starlink↔dash-server) for a given node */
function findInternetConn(state: SimulationState, nodeId: string): Connection | undefined {
  return state.connections.find(c =>
    c.transport === 'internet' && (c.from === nodeId || c.to === nodeId)
  );
}

/** Put an operation in transit on a connection (with dedup) */
function enqueueTransit(
  state: SimulationState, op: Operation,
  fromId: string, toId: string, connId: string, sp: SPType
): void {
  if (state.inTransit.some(t => t.operationId === op.id && t.toPeer === toId)) return;
  state.inTransit.push({
    operationId: op.id, fromPeer: fromId, toPeer: toId,
    connectionId: connId, sp, progress: 0, operation: { ...op },
  });
}

/**
 * Internet sync via ISP-mediated paths. ISPs are transparent — they don't store or sync.
 * Finds reachable sync pairs through the ISP graph and creates visible in-transit
 * operations on the device↔ISP (or starlink↔dash-server) connections.
 */
function syncViaISPs(state: SimulationState): void {
  // Build ISP connectivity graph
  const nodeToISP = new Map<string, string>();
  const ispNodes = new Map<string, Set<string>>();
  const directCloudNodes = new Set<string>();

  for (const conn of state.connections) {
    if (conn.transport !== 'internet') continue;
    const from = state.peers.get(conn.from);
    const to = state.peers.get(conn.to);
    if (!from || !to) continue;

    if ((from.type === 'starlink' && isDashServer(to)) || (to.type === 'starlink' && isDashServer(from))) {
      directCloudNodes.add(from.type === 'starlink' ? from.id : to.id);
      continue;
    }

    const isp = isISP(from) ? from : isISP(to) ? to : null;
    const other = isISP(from) ? to : isISP(to) ? from : null;
    if (!isp || !other) continue;

    if (!ispNodes.has(isp.id)) ispNodes.set(isp.id, new Set());
    ispNodes.get(isp.id)!.add(other.id);
    if (!isDashServer(other)) nodeToISP.set(other.id, isp.id);
  }

  const ispCanReachCloud = new Set<string>();
  for (const [ispId, connected] of ispNodes) {
    for (const nodeId of connected) {
      const node = state.peers.get(nodeId);
      if (node && isDashServer(node)) { ispCanReachCloud.add(ispId); break; }
    }
  }

  function canReachCloud(nodeId: string): boolean {
    if (directCloudNodes.has(nodeId)) return true;
    const ispId = nodeToISP.get(nodeId);
    return !!ispId && ispCanReachCloud.has(ispId);
  }

  // Collect sync-capable internet nodes
  const syncNodes: Peer[] = [];
  for (const [nodeId] of nodeToISP) {
    const node = state.peers.get(nodeId);
    if (node && !isInfrastructure(node)) syncNodes.push(node);
  }
  for (const nodeId of directCloudNodes) {
    const node = state.peers.get(nodeId);
    if (node && !syncNodes.includes(node)) syncNodes.push(node);
  }

  const dashServers = [...state.peers.values()].filter(p => isDashServer(p) && p.online);

  // Helper: sync a pair and enqueue transit ops on their internet connections
  function syncPair(a: Peer, b: Peer): void {
    const commonSPs = getCommonSPs(a, b);
    for (const sp of commonSPs) {
      let init = a, recv = b;
      if (sp === 'kdf-envelope-sync' && isServer(a) && !isServer(b)) { init = b; recv = a; }

      const { aToB, bToA } = SP_SYNC_FNS[sp](state, init, recv);

      // Find internet connections to use for transit animation
      const initConn = findInternetConn(state, init.id);
      const recvConn = findInternetConn(state, recv.id);

      for (const op of aToB) {
        // Show transit on initiator's internet link (outgoing)
        if (initConn) enqueueTransit(state, op, init.id, recv.id, initConn.id, sp);
      }
      for (const op of bToA) {
        if (recvConn) enqueueTransit(state, op, recv.id, init.id, recvConn.id, sp);
      }
    }
  }

  // Sync: device ↔ dash-server
  for (const device of syncNodes) {
    if (!canReachCloud(device.id)) continue;
    for (const ds of dashServers) {
      syncPair(device, ds);
    }
  }

  // Sync: device ↔ device (same ISP or both cloud-reachable)
  for (let i = 0; i < syncNodes.length; i++) {
    for (let j = i + 1; j < syncNodes.length; j++) {
      const a = syncNodes[i];
      const b = syncNodes[j];
      const ispA = nodeToISP.get(a.id);
      const ispB = nodeToISP.get(b.id);
      const sameISP = ispA && ispB && ispA === ispB;
      const bothCloud = canReachCloud(a.id) && canReachCloud(b.id);
      if (!sameISP && !bothCloud) continue;
      syncPair(a, b);
    }
  }
}

// --- Tick ---

export function tick(state: SimulationState): SimulationState {
  const newState = { ...state, tick: state.tick + 1 };
  currentTickState = newState;

  // Move peers and update proximity/server connections
  movePeers(newState);
  updateConnections(newState);

  // Advance in-transit operations
  const stillInTransit: InTransitOperation[] = [];
  for (const transit of newState.inTransit) {
    const newProgress = transit.progress + 0.5;
    if (newProgress >= 1) {
      const toPeer = newState.peers.get(transit.toPeer);
      if (toPeer) {
        if (!hasOperation(toPeer, transit.operationId)) {
          const opCopy = { ...transit.operation };

          // Find the source relay entry (to preserve envelope)
          const fromPeer = newState.peers.get(transit.fromPeer);
          const sourceRelayEntry = fromPeer?.relayStore.entries.find(
            e => e.operation.id === opCopy.id
          );

          // Find source p2panda entry (to preserve signature/backlink)
          let sourceAppEntry: P2PandaEntry | undefined;
          if (fromPeer && opCopy.topicId) {
            const authorPeer = findPeerByIdInState(newState, opCopy.sender);
            const authorPubKey = authorPeer?.publicKey || opCopy.sender;
            sourceAppEntry = fromPeer.appStore.topics[opCopy.topicId]?.[authorPubKey]?.entries.find(
              e => e.operation.id === opCopy.id
            );
          }

          // Add to relay store (preserving envelope)
          if (sourceRelayEntry) {
            addRelayEntryFromOther(toPeer, { ...sourceRelayEntry, operation: opCopy });
          } else {
            // Fallback: create new relay entry
            addToRelayStore(toPeer, opCopy);
          }

          // Add to app store if peer device
          if (!isServer(toPeer) && opCopy.topicId) {
            addToAppStoreFromOther(toPeer, opCopy, sourceAppEntry);
          }

          // If this is a group-invite, add the group to the recipient
          handleGroupInviteDelivery(newState, opCopy, toPeer);

          // Update receivedBy
          for (const peer of newState.peers.values()) {
            forEachOperation(peer, op => {
              if (op.id === transit.operationId && !op.receivedBy.includes(transit.toPeer)) {
                op.receivedBy.push(transit.toPeer);
              }
            });
          }
        }
      }
    } else {
      stillInTransit.push({ ...transit, progress: newProgress });
    }
  }
  newState.inTransit = stillInTransit;

  // Sync via direct connections (proximity: LAN, BT, LoRa)
  for (const conn of newState.connections) {
    if (!canConnect(newState, conn)) continue;
    if (conn.transport === 'internet') continue; // internet sync handled separately via ISP paths

    const connFrom = newState.peers.get(conn.from);
    const connTo = newState.peers.get(conn.to);
    if (!connFrom || !connTo) continue;

    const commonSPs = getCommonSPs(connFrom, connTo);
    for (const sp of commonSPs) {
      let initiator = connFrom;
      let receiver = connTo;
      if (sp === 'kdf-envelope-sync' && isServer(connFrom) && !isServer(connTo)) {
        initiator = connTo;
        receiver = connFrom;
      }

      const { aToB, bToA } = SP_SYNC_FNS[sp](newState, initiator, receiver);

      for (const op of aToB) {
        if (!newState.inTransit.some(t => t.operationId === op.id && t.toPeer === receiver.id)) {
          newState.inTransit.push({
            operationId: op.id, fromPeer: initiator.id, toPeer: receiver.id,
            connectionId: conn.id, sp, progress: 0, operation: { ...op },
          });
        }
      }

      for (const op of bToA) {
        if (!newState.inTransit.some(t => t.operationId === op.id && t.toPeer === initiator.id)) {
          newState.inTransit.push({
            operationId: op.id, fromPeer: receiver.id, toPeer: initiator.id,
            connectionId: conn.id, sp, progress: 0, operation: { ...op },
          });
        }
      }
    }
  }

  // Internet sync via ISP-mediated paths (ISPs are transparent hops)
  syncViaISPs(newState);

  // Check delivery status
  for (const peer of newState.peers.values()) {
    forEachOperation(peer, op => {
      if (!op.delivered) {
        const allReceived = op.recipients.every(r => op.receivedBy.includes(r));
        if (allReceived && op.recipients.length > 0) {
          op.delivered = true;
          for (const p of newState.peers.values()) {
            forEachOperation(p, o => {
              if (o.id === op.id) o.delivered = true;
            });
          }
        }
      }
    });
  }

  runGC(newState);
  currentTickState = null;

  return newState;
}

// --- User actions ---

export function createPeer(
  state: SimulationState,
  opts: {
    label: string;
    type: 'peer' | 'message-server' | 'dash-server' | 'router' | 'starlink' | 'isp';
    position: { x: number; y: number };
    transports?: ('internet' | 'lan' | 'bluetooth' | 'lora')[];
    sps?: SPType[];
    zone?: 'global' | 'intranet' | 'local';
  }
): { state: SimulationState; peerId: string } {
  const idPrefix = opts.type === 'peer' || opts.type === 'starlink' ? 'peer'
    : opts.type === 'router' ? 'router'
    : opts.type === 'isp' ? 'isp'
    : 'server';
  const id = genId(idPrefix);
  const keyPair = generateKeypair();
  // Clamp to appropriate vertical band
  let pos = opts.position;
  if (opts.type === 'dash-server') {
    pos = { x: pos.x, y: Math.min(Math.max(pos.y, SERVER_BOUNDS.minY), SERVER_BOUNDS.maxY) };
  } else if (opts.type === 'isp') {
    pos = { x: pos.x, y: Math.min(Math.max(pos.y, ISP_BOUNDS.minY), ISP_BOUNDS.maxY) };
  } else {
    pos = { x: pos.x, y: Math.max(pos.y, CANVAS_BOUNDS.minY) };
  }
  const peer: Peer = {
    id,
    label: opts.label,
    type: opts.type,
    position: pos,
    velocity: {
      vx: (Math.random() - 0.5) * PEER_SPEED,
      vy: (Math.random() - 0.5) * PEER_SPEED,
    },
    transports: opts.transports || (opts.type === 'router' ? ['lan'] : opts.type === 'isp' ? ['internet'] : opts.type === 'dash-server' ? ['internet'] : opts.type === 'starlink' ? ['internet', 'lan'] : opts.type === 'message-server' ? ['lan'] : ['internet']),
    supportedSPs: opts.sps || (isInfrastructure({ type: opts.type } as Peer) ? [] : (opts.type === 'peer' || opts.type === 'starlink') ? ['log-height-sync', 'kdf-envelope-sync'] : ['kdf-envelope-sync']),
    online: true,
    shutdown: false,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    appStore: createEmptyAppStore(),
    relayStore: createEmptyRelayStore(),
    topicKdfs: {},
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
  return {
    ...state,
    peers: newPeers,
    connections: state.connections.filter(c => c.from !== peerId && c.to !== peerId),
    inTransit: state.inTransit.filter(t => t.fromPeer !== peerId && t.toPeer !== peerId),
  };
}

export function addConnection(
  state: SimulationState,
  from: string,
  to: string,
  transport: 'internet' | 'lan' | 'bluetooth' | 'lora' = 'internet'
): SimulationState {
  const exists = state.connections.some(
    c => (c.from === from && c.to === to) || (c.from === to && c.to === from)
  );
  if (exists) return state;

  const conn: Connection = { id: genId('conn'), from, to, transport, active: true };
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
  const topicId = state.topicPerGroup
    ? (groupId || `dm-${[senderId, ...recipientIds].sort().join('-')}`)
    : senderId;

  const op: Operation = {
    id: genId('op'),
    type: 'message',
    sender: senderId,
    topicId,
    groupId: group?.id,
    obfuscatedGroupId: group?.obfuscatedId,
    encrypted: true,
    content,
    recipients: recipientIds,
    receivedBy: [senderId],
    delivered: false,
  };

  const newPeers = new Map(state.peers);
  const newSender = { ...sender };
  addOpToStores(newSender, op);
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

  if (!peer.contacts.includes(contactId)) {
    newPeers.set(peerId, { ...peer, contacts: [...peer.contacts, contactId] });
  }
  if (!contact.contacts.includes(peerId)) {
    newPeers.set(contactId, { ...contact, contacts: [...contact.contacts, peerId] });
  }

  const rawTopicId = `contact-${[peerId, contactId].sort().join('-')}`;
  const topicId1 = state.topicPerGroup ? rawTopicId : peerId;
  const topicId2 = state.topicPerGroup ? rawTopicId : contactId;

  const p = { ...newPeers.get(peerId)! };
  const c = { ...newPeers.get(contactId)! };

  // Share topic KDF between both peers
  shareTopicKdf(p, c, topicId1);
  if (topicId1 !== topicId2) shareTopicKdf(c, p, topicId2);

  const op1: Operation = {
    id: genId('op'),
    type: 'contact-request',
    sender: peerId,
    topicId: topicId1,
    encrypted: true,
    content: `Contact request from ${p.label} to ${c.label}`,
    recipients: [contactId],
    receivedBy: [peerId],
    delivered: false,
  };

  const op2: Operation = {
    id: genId('op'),
    type: 'contact-request',
    sender: contactId,
    topicId: topicId2,
    encrypted: true,
    content: `Contact request from ${c.label} to ${p.label}`,
    recipients: [peerId],
    receivedBy: [contactId],
    delivered: false,
  };

  addOpToStores(p, op1);
  addOpToStores(c, op2);
  newPeers.set(peerId, p);
  newPeers.set(contactId, c);

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

  const group: import('./types').Group = { id: groupId, name, members: allMembers, obfuscatedId };

  const newPeers = new Map(state.peers);
  let currentCreator = { ...creator, groups: [...creator.groups, group] };
  newPeers.set(creatorId, currentCreator);

  const topicId = state.topicPerGroup ? groupId : creatorId;

  // Ensure creator has the topic KDF
  ensureTopicKdf(currentCreator, topicId);

  for (const memberId of memberIds) {
    const member = newPeers.get(memberId);
    if (!member) continue;
    // Don't add group or topic KDF to member yet — they'll learn about it when the invite is delivered
    newPeers.set(memberId, { ...member });

    const op: Operation = {
      id: genId('op'),
      type: 'group-invite',
      sender: creatorId,
      topicId,
      groupId,
      obfuscatedGroupId: obfuscatedId,
      encrypted: true,
      content: `Group invite: ${name}`,
      recipients: [memberId],
      receivedBy: [creatorId],
      delivered: false,
    };

    currentCreator = { ...newPeers.get(creatorId)! };
    addOpToStores(currentCreator, op);
    newPeers.set(creatorId, currentCreator);
  }

  return { ...state, peers: newPeers };
}

export function addMember(
  state: SimulationState,
  adderId: string,
  groupId: string,
  newMemberId: string
): SimulationState {
  const adder = state.peers.get(adderId);
  const newMember = state.peers.get(newMemberId);
  if (!adder || !newMember) return state;

  const group = adder.groups.find(g => g.id === groupId);
  if (!group) return state;
  if (group.members.includes(newMemberId)) return state;

  // Update group membership on all existing members
  const updatedGroup: import('./types').Group = {
    ...group,
    members: [...group.members, newMemberId],
  };

  const newPeers = new Map(state.peers);
  for (const memberId of group.members) {
    const member = newPeers.get(memberId);
    if (!member) continue;
    newPeers.set(memberId, {
      ...member,
      groups: member.groups.map(g => g.id === groupId ? updatedGroup : g),
    });
  }

  // New member doesn't get the group yet — they'll learn via the invite op

  const topicId = state.topicPerGroup ? groupId : adderId;
  const op: Operation = {
    id: genId('op'),
    type: 'group-invite',
    sender: adderId,
    topicId,
    groupId,
    obfuscatedGroupId: group.obfuscatedId,
    encrypted: true,
    content: `${adder.label} added ${newMember.label} to ${group.name}`,
    recipients: [newMemberId],
    receivedBy: [adderId],
    delivered: false,
  };

  let currentAdder = { ...newPeers.get(adderId)! };
  ensureTopicKdf(currentAdder, topicId);
  addOpToStores(currentAdder, op);
  newPeers.set(adderId, currentAdder);

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

export function toggleISPShutdown(state: SimulationState, ispId: string): SimulationState {
  const isp = state.peers.get(ispId);
  if (!isp || isp.type !== 'isp') return state;
  const newPeers = new Map(state.peers);
  newPeers.set(ispId, { ...isp, shutdown: !isp.shutdown });
  return { ...state, peers: newPeers };
}

export function applySetupConfig(state: SimulationState, config: SetupConfig): SimulationState {
  const newPeers = new Map(state.peers);
  for (const [id, peer] of newPeers) {
    if (isInfrastructure(peer)) continue; // routers and ISPs have no SPs
    const sps = isServer(peer) ? config.serverSPs : config.peerSPs;
    newPeers.set(id, { ...peer, supportedSPs: [...sps] });
  }
  return { ...state, peers: newPeers, topicPerGroup: config.topicPerGroup };
}
