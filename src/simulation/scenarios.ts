import type { SimulationState, LogModelType } from './types';
import {
  createInitialState, createPeer, addConnection, addContact, createGroup,
  resetIdCounter,
} from './engine';

export interface Scenario {
  id: string;
  name: string;
  description: string;
  logModel: LogModelType;
  splitByGroup?: boolean;
  build: () => SimulationState;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'two-peers',
    name: '2 Peers Direct',
    description: 'Two peers connected directly via internet. Basic direct messaging setup.',
    logModel: 'topic-per-group',
    build() {
      resetIdCounter();
      let state = createInitialState();
      let r = createPeer(state, { label: 'Alice', type: 'peer', position: { x: 300, y: 350 } });
      state = r.state;
      const alice = r.peerId;
      r = createPeer(state, { label: 'Bob', type: 'peer', position: { x: 700, y: 350 } });
      state = r.state;
      const bob = r.peerId;
      state = addConnection(state, alice, bob, 'internet');
      state = addContact(state, alice, bob);
      return state;
    },
  },
  {
    id: 'group-of-5',
    name: 'Group of 5',
    description: 'Five peers in a mesh, forming a group chat.',
    logModel: 'topic-per-group',
    build() {
      resetIdCounter();
      let state = createInitialState();
      const ids: string[] = [];
      const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'];
      const cx = 500, cy = 350, radius = 200;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const r = createPeer(state, {
          label: names[i],
          type: 'peer',
          position: { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius },
        });
        state = r.state;
        ids.push(r.peerId);
      }
      // Mesh connections
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          state = addConnection(state, ids[i], ids[j], 'internet');
        }
      }
      // Add contacts
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          state = addContact(state, ids[i], ids[j]);
        }
      }
      // Create group
      state = createGroup(state, ids[0], 'Team Chat', ids.slice(1));
      return state;
    },
  },
  {
    id: 'message-server',
    name: 'Internet + Message Server',
    description: 'Three peers connected through a central message server for offline message delivery.',
    logModel: 'topic-per-group',
    build() {
      resetIdCounter();
      let state = createInitialState();
      const r1 = createPeer(state, { label: 'Alice', type: 'peer', position: { x: 200, y: 250 } });
      state = r1.state;
      const r2 = createPeer(state, { label: 'Bob', type: 'peer', position: { x: 200, y: 450 } });
      state = r2.state;
      const r3 = createPeer(state, { label: 'Carol', type: 'peer', position: { x: 800, y: 350 } });
      state = r3.state;
      const rs = createPeer(state, {
        label: 'Mail Server',
        type: 'message-server',
        position: { x: 500, y: 350 },
        sps: ['encrypted-group'],
      });
      state = rs.state;
      state = addConnection(state, r1.peerId, rs.peerId, 'internet');
      state = addConnection(state, r2.peerId, rs.peerId, 'internet');
      state = addConnection(state, r3.peerId, rs.peerId, 'internet');
      state = addContact(state, r1.peerId, r2.peerId);
      state = addContact(state, r1.peerId, r3.peerId);
      return state;
    },
  },
  {
    id: 'lan-mesh',
    name: 'LAN Mesh Relay',
    description: 'Four peers connected via LAN in a chain, demonstrating multi-hop relay.',
    logModel: 'topic-per-group',
    build() {
      resetIdCounter();
      let state = createInitialState();
      const r1 = createPeer(state, { label: 'Alice', type: 'peer', position: { x: 150, y: 350 }, transports: ['lan'] });
      state = r1.state;
      const r2 = createPeer(state, { label: 'Bob', type: 'peer', position: { x: 400, y: 250 }, transports: ['lan'] });
      state = r2.state;
      const r3 = createPeer(state, { label: 'Carol', type: 'peer', position: { x: 650, y: 450 }, transports: ['lan'] });
      state = r3.state;
      const r4 = createPeer(state, { label: 'Dave', type: 'peer', position: { x: 900, y: 350 }, transports: ['lan'] });
      state = r4.state;
      state = addConnection(state, r1.peerId, r2.peerId, 'lan');
      state = addConnection(state, r2.peerId, r3.peerId, 'lan');
      state = addConnection(state, r3.peerId, r4.peerId, 'lan');
      state = addContact(state, r1.peerId, r4.peerId);
      state = addContact(state, r2.peerId, r3.peerId);
      return state;
    },
  },
  {
    id: 'mixed',
    name: 'Mixed Topology',
    description: 'Peers with different transports and SPs. Shows how protocols interact across varied connections.',
    logModel: 'topic-per-group',
    build() {
      resetIdCounter();
      let state = createInitialState();
      const r1 = createPeer(state, {
        label: 'Alice', type: 'peer', position: { x: 150, y: 300 },
        transports: ['internet', 'lan'], sps: ['topic-sync', 'encrypted-group'],
      });
      state = r1.state;
      const r2 = createPeer(state, {
        label: 'Bob', type: 'peer', position: { x: 500, y: 150 },
        transports: ['internet'], sps: ['encrypted-group', 'encrypted-only'],
      });
      state = r2.state;
      const r3 = createPeer(state, {
        label: 'Carol', type: 'peer', position: { x: 500, y: 450 },
        transports: ['lan', 'bluetooth'], sps: ['topic-sync'],
      });
      state = r3.state;
      const r4 = createPeer(state, {
        label: 'Dave', type: 'peer', position: { x: 850, y: 300 },
        transports: ['internet', 'bluetooth'], sps: ['encrypted-only'],
      });
      state = r4.state;
      const rs = createPeer(state, {
        label: 'Server', type: 'message-server', position: { x: 500, y: 300 },
        sps: ['encrypted-group'],
      });
      state = rs.state;
      state = addConnection(state, r1.peerId, rs.peerId, 'internet');
      state = addConnection(state, r2.peerId, rs.peerId, 'internet');
      state = addConnection(state, r1.peerId, r3.peerId, 'lan');
      state = addConnection(state, r3.peerId, r4.peerId, 'bluetooth');
      state = addConnection(state, r2.peerId, r4.peerId, 'internet');
      state = addContact(state, r1.peerId, r2.peerId);
      state = addContact(state, r1.peerId, r3.peerId);
      state = addContact(state, r3.peerId, r4.peerId);
      return state;
    },
  },
  {
    id: 'intranet-shutdown',
    name: 'National Intranet Shutdown',
    description: 'Simulates an internet shutdown. Some peers are in the intranet zone with a local message server, others are global. Toggle the shutdown to see how communication degrades.',
    logModel: 'topic-per-group',
    build() {
      resetIdCounter();
      let state = createInitialState();
      // Global peers
      const g1 = createPeer(state, {
        label: 'Alice (Global)', type: 'peer', position: { x: 150, y: 200 },
        zone: 'global',
      });
      state = g1.state;
      const g2 = createPeer(state, {
        label: 'Bob (Global)', type: 'peer', position: { x: 150, y: 500 },
        zone: 'global',
      });
      state = g2.state;
      // Global message server
      const gs = createPeer(state, {
        label: 'Global Server', type: 'message-server', position: { x: 350, y: 350 },
        zone: 'global', sps: ['encrypted-group'],
      });
      state = gs.state;
      // Intranet peers
      const i1 = createPeer(state, {
        label: 'Carol (Intranet)', type: 'peer', position: { x: 650, y: 200 },
        zone: 'intranet',
      });
      state = i1.state;
      const i2 = createPeer(state, {
        label: 'Dave (Intranet)', type: 'peer', position: { x: 650, y: 500 },
        zone: 'intranet',
      });
      state = i2.state;
      // Intranet message server
      const is = createPeer(state, {
        label: 'Local Server', type: 'message-server', position: { x: 850, y: 350 },
        zone: 'intranet', sps: ['encrypted-group'],
      });
      state = is.state;

      // Connections
      state = addConnection(state, g1.peerId, gs.peerId, 'internet');
      state = addConnection(state, g2.peerId, gs.peerId, 'internet');
      state = addConnection(state, i1.peerId, gs.peerId, 'internet'); // crosses zones
      state = addConnection(state, i1.peerId, is.peerId, 'internet');
      state = addConnection(state, i2.peerId, is.peerId, 'internet');
      state = addConnection(state, i1.peerId, i2.peerId, 'lan');

      state = addContact(state, g1.peerId, i1.peerId);
      state = addContact(state, g1.peerId, g2.peerId);
      state = addContact(state, i1.peerId, i2.peerId);

      return state;
    },
  },
  // --- Shared Peer Logs scenarios ---
  {
    id: 'contact-chain',
    name: 'Contact Chain (Peer Logs)',
    description: 'Four peers in a chain using shared peer logs. Operations propagate via the follow graph — contacts-of-contacts enable 2-hop discovery.',
    logModel: 'shared-peer-logs',
    build() {
      resetIdCounter();
      let state = createInitialState();
      state = { ...state, logModel: 'shared-peer-logs' };
      // A — B — C — D chain
      const r1 = createPeer(state, { label: 'Alice', type: 'peer', position: { x: 150, y: 350 } });
      state = r1.state;
      const r2 = createPeer(state, { label: 'Bob', type: 'peer', position: { x: 400, y: 250 } });
      state = r2.state;
      const r3 = createPeer(state, { label: 'Carol', type: 'peer', position: { x: 650, y: 450 } });
      state = r3.state;
      const r4 = createPeer(state, { label: 'Dave', type: 'peer', position: { x: 900, y: 350 } });
      state = r4.state;
      // Chain connections
      state = addConnection(state, r1.peerId, r2.peerId, 'internet');
      state = addConnection(state, r2.peerId, r3.peerId, 'internet');
      state = addConnection(state, r3.peerId, r4.peerId, 'internet');
      // Contacts: each adjacent pair
      state = addContact(state, r1.peerId, r2.peerId);
      state = addContact(state, r2.peerId, r3.peerId);
      state = addContact(state, r3.peerId, r4.peerId);
      return state;
    },
  },
  {
    id: 'gossip-relay',
    name: 'Gossip Relay (Peer Logs)',
    description: 'Hub-and-spoke with shared peer logs. A central hub peer relays operations. Contacts-of-contacts through the hub enable discovery across spokes.',
    logModel: 'shared-peer-logs',
    build() {
      resetIdCounter();
      let state = createInitialState();
      state = { ...state, logModel: 'shared-peer-logs' };
      // Hub in center, 4 spokes
      const hub = createPeer(state, { label: 'Hub', type: 'peer', position: { x: 500, y: 350 } });
      state = hub.state;
      const names = ['Alice', 'Bob', 'Carol', 'Dave'];
      const positions = [
        { x: 200, y: 200 }, { x: 800, y: 200 },
        { x: 200, y: 500 }, { x: 800, y: 500 },
      ];
      const spokeIds: string[] = [];
      for (let i = 0; i < 4; i++) {
        const r = createPeer(state, { label: names[i], type: 'peer', position: positions[i] });
        state = r.state;
        spokeIds.push(r.peerId);
        state = addConnection(state, r.peerId, hub.peerId, 'internet');
        state = addContact(state, r.peerId, hub.peerId);
      }
      // Alice and Bob are also direct contacts
      state = addContact(state, spokeIds[0], spokeIds[1]);
      return state;
    },
  },
  {
    id: 'peer-logs-server',
    name: 'Peer Logs + Server',
    description: 'Shared peer logs with a message server. The server follows all topics of connected peers, enabling offline delivery across the follow graph.',
    logModel: 'shared-peer-logs',
    build() {
      resetIdCounter();
      let state = createInitialState();
      state = { ...state, logModel: 'shared-peer-logs' };
      const r1 = createPeer(state, { label: 'Alice', type: 'peer', position: { x: 200, y: 250 } });
      state = r1.state;
      const r2 = createPeer(state, { label: 'Bob', type: 'peer', position: { x: 200, y: 450 } });
      state = r2.state;
      const r3 = createPeer(state, { label: 'Carol', type: 'peer', position: { x: 800, y: 350 } });
      state = r3.state;
      const rs = createPeer(state, {
        label: 'Mail Server',
        type: 'message-server',
        position: { x: 500, y: 350 },
        sps: ['topic-sync'],
      });
      state = rs.state;
      state = addConnection(state, r1.peerId, rs.peerId, 'internet');
      state = addConnection(state, r2.peerId, rs.peerId, 'internet');
      state = addConnection(state, r3.peerId, rs.peerId, 'internet');
      state = addContact(state, r1.peerId, r2.peerId);
      state = addContact(state, r1.peerId, r3.peerId);
      return state;
    },
  },
];
