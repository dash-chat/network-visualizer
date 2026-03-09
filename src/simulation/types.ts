export type PeerType = 'peer' | 'message-server';
export type Transport = 'internet' | 'lan' | 'bluetooth' | 'lora';
export type SPType = 'topic-sync' | 'encrypted-group' | 'encrypted-only';
export type OperationType = 'message' | 'profile' | 'contact-request' | 'group-invite' | 'key-rotation';
export type NetworkZone = 'global' | 'intranet' | 'local';
export type LogModelType = 'topic-per-group' | 'shared-peer-logs';

export interface LogModelDefinition {
  type: LogModelType;
  name: string;
  description: string;
}

export interface SyncProtocol {
  type: SPType;
  name: string;
  description: string;
  metadataVisible: {
    topicId: boolean;
    sender: boolean;
    operationType: boolean;
    groupId: boolean;
    content: boolean;
  };
}

export interface Peer {
  id: string;
  label: string;
  type: PeerType;
  position: { x: number; y: number };
  transports: Transport[];
  supportedSPs: SPType[];
  online: boolean;
  store: PeerStore;
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

export interface PeerStore {
  operations: Operation[];
}

export interface Operation {
  id: string;
  type: OperationType;
  sender: string;
  topicId?: string;
  groupId?: string;
  obfuscatedGroupId?: string;
  color: string;
  encrypted: boolean;
  content: string;
  recipients: string[];
  receivedBy: string[];
  delivered: boolean;
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
  logModel: LogModelType;
  splitByGroup: boolean;
}

export const OPERATION_COLORS: Record<OperationType, string> = {
  'message': '#3b82f6',
  'profile': '#a855f7',
  'contact-request': '#22c55e',
  'group-invite': '#f59e0b',
  'key-rotation': '#ef4444',
};

export const SP_DEFINITIONS: Record<SPType, SyncProtocol> = {
  'topic-sync': {
    type: 'topic-sync',
    name: 'Topic Sync',
    description: 'Peers discover common topics and sync full operation logs. All metadata is visible to both sides.',
    metadataVisible: {
      topicId: true,
      sender: true,
      operationType: true,
      groupId: true,
      content: false,
    },
  },
  'encrypted-group': {
    type: 'encrypted-group',
    name: 'Encrypted + Obfuscated Group ID',
    description: 'Encrypted operations tagged with an obfuscated group identifier. Intermediaries see the group tag but not content, sender, or type.',
    metadataVisible: {
      topicId: false,
      sender: false,
      operationType: false,
      groupId: true,
      content: false,
    },
  },
  'encrypted-only': {
    type: 'encrypted-only',
    name: 'Encrypted Only',
    description: 'Opaque encrypted blobs with zero metadata. Maximum privacy, highest bandwidth cost. No selective relay possible.',
    metadataVisible: {
      topicId: false,
      sender: false,
      operationType: false,
      groupId: false,
      content: false,
    },
  },
};

export const TRANSPORT_STYLES: Record<Transport, { label: string; dash: number[] }> = {
  'internet': { label: 'Internet', dash: [] },
  'lan': { label: 'LAN', dash: [10, 5] },
  'bluetooth': { label: 'Bluetooth', dash: [3, 3] },
  'lora': { label: 'LoRa', dash: [15, 5, 3, 5] },
};

export const LOG_MODEL_DEFINITIONS: Record<LogModelType, LogModelDefinition> = {
  'topic-per-group': {
    type: 'topic-per-group',
    name: 'Topic per Group',
    description: 'Each conversation is its own topic. Topic ID = group/DM ID. Peers discover common topics by comparing what they have.',
  },
  'shared-peer-logs': {
    type: 'shared-peer-logs',
    name: 'Shared Peer Logs',
    description: 'Each peer maintains a single log. Topic ID = sender\'s peer ID. Discoverability via follow set (contacts, contacts-of-contacts, group members). Toggle "Split by group" to use compound topic IDs (peerId:groupId).',
  },
};
