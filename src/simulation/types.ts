export type PeerType = 'peer' | 'message-server' | 'dash-server' | 'router' | 'starlink' | 'isp';
export type Transport = 'internet' | 'lan' | 'bluetooth' | 'lora';
export type SPType = 'log-height-sync' | 'kdf-envelope-sync';
export type OperationType = 'message' | 'profile' | 'contact-request' | 'group-invite' | 'key-rotation';
export type NetworkZone = 'global' | 'intranet' | 'local';

export interface SyncProtocol {
  type: SPType;
  name: string;
  description: string;
}

// --- Core Operation (application-layer payload) ---

export interface Operation {
  id: string;
  type: OperationType;
  sender: string;        // peer ID of the author
  topicId?: string;       // human-readable topic ID (only known by group members)
  groupId?: string;
  obfuscatedGroupId?: string;
  encrypted: boolean;
  content: string;
  recipients: string[];
  receivedBy: string[];
  delivered: boolean;
}

// --- p2panda App Store ---

/** A single entry in an author's append-only log (p2panda bamboo-style) */
export interface P2PandaEntry {
  logId: number;            // log identifier (one per topic per author)
  seqNum: number;           // sequence number within this log (starts at 1)
  backlink?: string;        // hex: SHA-256 hash of the previous entry (undefined for seqNum=1)
  payloadHash: string;      // hex: SHA-256 hash of the operation payload
  payloadSize: number;      // byte size of the serialized payload
  signature: string;        // hex: Ed25519 signature by the author over entry fields
  operation: Operation;     // the decrypted operation payload
}

/** An author's log within a topic */
export interface AuthorLog {
  publicKey: string;        // hex: Ed25519 public key (author identity)
  logId: number;
  entries: P2PandaEntry[];
}

/** p2panda-structured store — topics → author logs → sequenced, signed entries */
export interface AppStore {
  topics: Record<string, Record<string, AuthorLog>>; // topicId → authorPubKeyHex → AuthorLog
  knownTopics: string[];   // human-readable topic IDs
}

// --- Relay Envelope Store ---

/** The metadata envelope — readable by relays without decryption */
export interface RelayEnvelope {
  kdfPub: string;           // hex: Ed25519 public key derived from group secret via KDF
  previousHash: string;     // hex: SHA-256 hash of previous encrypted op (64 zero hex chars for first)
  selfHash: string;         // hex: SHA-256 hash of this encrypted operation
  signature: string;        // hex: Ed25519 signature over (kdfPub || previousHash || selfHash)
}

/** A single entry in the relay store */
export interface RelayEntry {
  envelope: RelayEnvelope;
  encryptedOperation: string; // hex: the encrypted operation blob
  envelopeOnly: boolean;      // encrypted content GC'd, envelope persists for chain continuity
  operation: Operation;       // original operation (for simulator display — relay can't read this)
}

/** Relay store — envelope chain organized by KDF_pub topic identifiers */
export interface RelayStore {
  entries: RelayEntry[];
  knownTopics: string[];     // hex: KDF_pub values (opaque topic identifiers for relays)
}

// --- Topic KDF info (only on peer devices) ---

export interface TopicKdf {
  topicId: string;          // human-readable topic ID
  secret: string;           // hex: group/topic secret (32 bytes)
  kdfPub: string;           // hex: Ed25519 public key (relay-visible topic ID)
  kdfPriv: string;          // hex: Ed25519 private key (for signing envelopes)
}

// --- Peer ---

export interface Peer {
  id: string;
  label: string;
  type: PeerType;
  position: { x: number; y: number };
  velocity: { vx: number; vy: number };
  transports: Transport[];
  supportedSPs: SPType[];
  online: boolean;
  publicKey: string;        // hex: Ed25519 public key (p2panda author identity)
  privateKey: string;       // hex: Ed25519 private key (for signing p2panda entries)
  appStore: AppStore;
  relayStore: RelayStore;
  topicKdfs: Record<string, TopicKdf>; // topicId → KDF info (peer devices only)
  contacts: string[];
  groups: Group[];
  zone: NetworkZone;
}

export interface Group {
  id: string;
  name: string;
  members: string[];
  obfuscatedId: string;
}

export interface Connection {
  id: string;
  from: string;
  to: string;
  transport: Transport;
  active: boolean;
}

export interface InTransitOperation {
  operationId: string;
  fromPeer: string;
  toPeer: string;
  connectionId: string;
  sp: SPType;
  progress: number; // 0-1
  operation: Operation;
}

export interface SimulationState {
  peers: Map<string, Peer>;
  connections: Connection[];
  inTransit: InTransitOperation[];
  tick: number;
  running: boolean;
  speed: number;
  intranetShutdown: boolean;
  topicPerGroup: boolean;
}

export interface SetupConfig {
  scenarioId: string;
  peerSPs: SPType[];
  serverSPs: SPType[];
  topicPerGroup: boolean;
}

// --- Store helpers ---

export function createEmptyAppStore(): AppStore {
  return { topics: {}, knownTopics: [] };
}

export function createEmptyRelayStore(): RelayStore {
  return { entries: [], knownTopics: [] };
}

/** Get all unique operations across both stores (for renderer / delivery tracking) */
export function getAllOperations(peer: Peer): Operation[] {
  const seen = new Set<string>();
  const result: Operation[] = [];

  for (const entry of peer.relayStore.entries) {
    if (!seen.has(entry.operation.id)) {
      seen.add(entry.operation.id);
      result.push(entry.operation);
    }
  }

  for (const authorLogs of Object.values(peer.appStore.topics)) {
    for (const log of Object.values(authorLogs)) {
      for (const entry of log.entries) {
        if (!seen.has(entry.operation.id)) {
          seen.add(entry.operation.id);
          result.push(entry.operation);
        }
      }
    }
  }

  return result;
}


/** Check if an operation is envelope-only in this peer's relay store */
export function isEnvelopeOnly(peer: Peer, opId: string): boolean {
  const entry = peer.relayStore.entries.find(e => e.operation.id === opId);
  return entry?.envelopeOnly ?? false;
}

/** Get the kdfPub for an operation in this peer's relay store, if present */
export function getRelayKdfPub(peer: Peer, opId: string): string | undefined {
  const entry = peer.relayStore.entries.find(e => e.operation.id === opId);
  return entry?.envelope.kdfPub;
}

/** Check if peer has an operation in either store */
export function hasOperation(peer: Peer, opId: string): boolean {
  if (peer.relayStore.entries.some(e => e.operation.id === opId)) return true;
  for (const authorLogs of Object.values(peer.appStore.topics)) {
    for (const log of Object.values(authorLogs)) {
      if (log.entries.some(e => e.operation.id === opId)) return true;
    }
  }
  return false;
}

/** Iterate all operations across both stores (may visit same op twice if in both) */
export function forEachOperation(peer: Peer, fn: (op: Operation) => void): void {
  for (const authorLogs of Object.values(peer.appStore.topics)) {
    for (const log of Object.values(authorLogs)) {
      for (const entry of log.entries) {
        fn(entry.operation);
      }
    }
  }
  for (const entry of peer.relayStore.entries) {
    fn(entry.operation);
  }
}

/** Look up the kdfPub hex for a topicId using a peer's topicKdfs mapping */
export function getKdfPubForTopic(peer: Peer, topicId: string): string | undefined {
  return peer.topicKdfs[topicId]?.kdfPub;
}

/** Sync stats for a peer: how many ops it should have vs how many it has */
export interface PeerSyncStats {
  /** Ops where this peer is a recipient and has received them */
  received: number;
  /** Total ops where this peer is a recipient */
  expected: number;
  /** Ops this peer authored that haven't reached all recipients yet */
  pendingOutbound: number;
  /** Number of ops stored (relay + app, deduplicated) */
  stored: number;
}

/** Compute sync stats for a peer given the full simulation state */
export function getPeerSyncStats(state: { peers: Map<string, Peer> }, peerId: string): PeerSyncStats {
  let received = 0;
  let expected = 0;
  let pendingOutbound = 0;
  const seen = new Set<string>();

  // Scan all operations across all peers to find ones targeting this peer
  for (const peer of state.peers.values()) {
    forEachOperation(peer, op => {
      if (seen.has(op.id)) return;
      seen.add(op.id);
      if (op.recipients.includes(peerId)) {
        expected++;
        if (op.receivedBy.includes(peerId)) received++;
      }
      if (op.sender === peerId && !op.delivered) {
        pendingOutbound++;
      }
    });
  }

  const thisPeer = state.peers.get(peerId);
  const stored = thisPeer ? getAllOperations(thisPeer).length : 0;

  return { received, expected, pendingOutbound, stored };
}

// --- Constants ---

export const OPERATION_COLORS: Record<OperationType, string> = {
  'message': '#3b82f6',
  'profile': '#a855f7',
  'contact-request': '#22c55e',
  'group-invite': '#f59e0b',
  'key-rotation': '#ef4444',
};

export const SP_DEFINITIONS: Record<SPType, SyncProtocol> = {
  'log-height-sync': {
    type: 'log-height-sync',
    name: 'Log Height Sync',
    description: 'p2panda-style structured logs. Peers discover common topics via explicit announcement and compare log heights (sequence numbers per author per topic) to sync efficiently. Entries are signed by the author.',
  },
  'kdf-envelope-sync': {
    type: 'kdf-envelope-sync',
    name: 'Topic KDF Envelope Sync',
    description: 'KDF-derived topic envelopes with chain-linked operations. Relays verify group membership via KDF_pub Ed25519 signatures, sync via chain walk-back from tips, and GC encrypted ops while retaining envelope chains.',
  },
};

/** Maximum distance (in canvas pixels) for proximity-based transports to connect.
 *  Internet has no range — connectivity is determined by zone/shutdown state. */
export const TRANSPORT_RANGE: Record<Transport, number> = {
  'internet': Infinity,
  'lan': 200,
  'bluetooth': 130,
  'lora': 350,
};

export const TRANSPORT_STYLES: Record<Transport, { label: string; dash: number[] }> = {
  'internet': { label: 'Internet', dash: [] },
  'lan': { label: 'LAN', dash: [10, 5] },
  'bluetooth': { label: 'Bluetooth', dash: [3, 3] },
  'lora': { label: 'LoRa', dash: [15, 5, 3, 5] },
};

// --- Layout constants (shared by engine and renderer) ---

export const CLOUD_ZONE_HEIGHT = 70;   // top band: dash-servers
export const ISP_BAND_TOP = CLOUD_ZONE_HEIGHT;
export const ISP_BAND_HEIGHT = 70;
export const ISP_BAND_BOTTOM = ISP_BAND_TOP + ISP_BAND_HEIGHT; // 140
export const DEVICE_AREA_TOP = ISP_BAND_BOTTOM + 20;           // 160

export const SERVER_BOUNDS = { minX: 60, maxX: 940, minY: 15, maxY: CLOUD_ZONE_HEIGHT - 15 };
export const ISP_BOUNDS = { minX: 60, maxX: 940, minY: ISP_BAND_TOP + 10, maxY: ISP_BAND_BOTTOM - 10 };
export const DEVICE_BOUNDS = { minX: 60, maxX: 940, minY: DEVICE_AREA_TOP, maxY: 660 };
