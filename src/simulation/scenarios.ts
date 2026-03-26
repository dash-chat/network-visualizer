import type { SimulationState } from './types';
import { getCloudTop, getCloudBottom, getISPTop, getISPBottom } from './types';
import {
  createInitialState, createPeer, addContact, createGroup,
  resetIdCounter,
} from './engine';

/** Center Y of the cloud band */
function cloudY() { return (getCloudTop() + getCloudBottom()) / 2; }
/** Center Y of the ISP band */
function ispY() { return (getISPTop() + getISPBottom()) / 2; }

export interface Scenario {
  id: string;
  name: string;
  description: string;
  build: () => SimulationState;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'two-peers',
    name: '2 Peers Direct',
    description: 'Two peers connected via internet through an ISP.',
    build() {
      resetIdCounter();
      let state = createInitialState();
      state = createPeer(state, { label: 'ISP', type: 'isp', position: { x: 0, y: ispY() } }).state;
      state = createPeer(state, { label: 'Dash Server', type: 'dash-server', position: { x: 0, y: cloudY() } }).state;
      let r = createPeer(state, { label: 'Alice', type: 'peer', position: { x: -200, y: 50 } });
      state = r.state;
      const alice = r.peerId;
      r = createPeer(state, { label: 'Bob', type: 'peer', position: { x: 200, y: 50 } });
      state = r.state;
      const bob = r.peerId;
      state = addContact(state, alice, bob);
      return state;
    },
  },
  {
    id: 'group-of-5',
    name: 'Group of 5',
    description: 'Five peers forming a group chat, connected through an ISP and Dash Server.',
    build() {
      resetIdCounter();
      let state = createInitialState();
      state = createPeer(state, { label: 'ISP', type: 'isp', position: { x: 0, y: ispY() } }).state;
      state = createPeer(state, { label: 'Dash Server', type: 'dash-server', position: { x: 0, y: cloudY() } }).state;
      const ids: string[] = [];
      const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'];
      const radius = 180;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const r = createPeer(state, {
          label: names[i], type: 'peer',
          position: { x: Math.cos(angle) * radius, y: 80 + Math.sin(angle) * radius },
        });
        state = r.state;
        ids.push(r.peerId);
      }
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          state = addContact(state, ids[i], ids[j]);
        }
      }
      state = createGroup(state, ids[0], 'Team Chat', ids.slice(1));
      return state;
    },
  },
  {
    id: 'dash-server',
    name: 'Internet + Dash Server',
    description: 'Three peers connected through an ISP to a Dash Chat cloud server.',
    build() {
      resetIdCounter();
      let state = createInitialState();
      state = createPeer(state, { label: 'ISP', type: 'isp', position: { x: 0, y: ispY() } }).state;
      state = createPeer(state, { label: 'Dash Server', type: 'dash-server', position: { x: 0, y: cloudY() } }).state;
      const r1 = createPeer(state, { label: 'Alice', type: 'peer', position: { x: -250, y: 0 } });
      state = r1.state;
      const r2 = createPeer(state, { label: 'Bob', type: 'peer', position: { x: -250, y: 200 } });
      state = r2.state;
      const r3 = createPeer(state, { label: 'Carol', type: 'peer', position: { x: 250, y: 100 } });
      state = r3.state;
      state = addContact(state, r1.peerId, r2.peerId);
      state = addContact(state, r1.peerId, r3.peerId);
      return state;
    },
  },
  {
    id: 'lan-mesh',
    name: 'LAN Mesh Relay',
    description: 'Four LAN-only peers and two routers. No ISP — messages relay hop by hop through routers.',
    build() {
      resetIdCounter();
      let state = createInitialState();
      const rt1 = createPeer(state, { label: 'Router A', type: 'router', position: { x: -200, y: 50 } });
      state = rt1.state;
      const rt2 = createPeer(state, { label: 'Router B', type: 'router', position: { x: 200, y: 50 } });
      state = rt2.state;
      const r1 = createPeer(state, { label: 'Alice', type: 'peer', position: { x: -300, y: 0 }, transports: ['lan'] });
      state = r1.state;
      const r2 = createPeer(state, { label: 'Bob', type: 'peer', position: { x: -100, y: -50 }, transports: ['lan'] });
      state = r2.state;
      const r3 = createPeer(state, { label: 'Carol', type: 'peer', position: { x: 100, y: 100 }, transports: ['lan'] });
      state = r3.state;
      const r4 = createPeer(state, { label: 'Dave', type: 'peer', position: { x: 300, y: 0 }, transports: ['lan'] });
      state = r4.state;
      state = addContact(state, r1.peerId, r4.peerId);
      state = addContact(state, r2.peerId, r3.peerId);
      return state;
    },
  },
  {
    id: 'mixed',
    name: 'Mixed Topology',
    description: 'Peers with different transports and SPs. Internet devices connect through ISP; LAN/Bluetooth peers connect by proximity.',
    build() {
      resetIdCounter();
      let state = createInitialState();
      state = createPeer(state, { label: 'ISP', type: 'isp', position: { x: 0, y: ispY() } }).state;
      state = createPeer(state, { label: 'Dash Server', type: 'dash-server', position: { x: 0, y: cloudY() } }).state;
      const r1 = createPeer(state, {
        label: 'Alice', type: 'peer', position: { x: -350, y: 50 },
        transports: ['internet', 'lan'], sps: ['log-height-sync', 'kdf-envelope-sync'],
      });
      state = r1.state;
      const r2 = createPeer(state, {
        label: 'Bob', type: 'peer', position: { x: 0, y: -100 },
        transports: ['internet'], sps: ['kdf-envelope-sync'],
      });
      state = r2.state;
      const r3 = createPeer(state, {
        label: 'Carol', type: 'peer', position: { x: 0, y: 200 },
        transports: ['lan', 'bluetooth'], sps: ['log-height-sync'],
      });
      state = r3.state;
      const r4 = createPeer(state, {
        label: 'Dave', type: 'peer', position: { x: 350, y: 50 },
        transports: ['internet', 'bluetooth'], sps: ['kdf-envelope-sync'],
      });
      state = r4.state;
      state = addContact(state, r1.peerId, r2.peerId);
      state = addContact(state, r1.peerId, r3.peerId);
      state = addContact(state, r3.peerId, r4.peerId);
      return state;
    },
  },
  {
    id: 'intranet-shutdown',
    name: 'National Intranet Shutdown',
    description: 'Two countries with their own ISPs. Select an ISP and toggle shutdown to disconnect it from the cloud. Starlink bypasses the shutdown.',
    build() {
      resetIdCounter();
      let state = createInitialState();
      state = createPeer(state, {
        label: 'Dash Server', type: 'dash-server', position: { x: 0, y: cloudY() },
      }).state;
      state = createPeer(state, {
        label: 'Global ISP', type: 'isp', position: { x: -250, y: ispY() }, zone: 'global',
      }).state;
      state = createPeer(state, {
        label: 'Intranet ISP', type: 'isp', position: { x: 250, y: ispY() }, zone: 'intranet',
      }).state;
      const g1 = createPeer(state, {
        label: 'Alice (Global)', type: 'peer', position: { x: -350, y: -50 },
        transports: ['internet', 'lan'], zone: 'global',
      });
      state = g1.state;
      const g2 = createPeer(state, {
        label: 'Bob (Global)', type: 'peer', position: { x: -350, y: 250 },
        transports: ['internet', 'lan'], zone: 'global',
      });
      state = g2.state;
      const i1 = createPeer(state, {
        label: 'Carol (Intranet)', type: 'peer', position: { x: 150, y: -50 },
        transports: ['internet', 'lan'], zone: 'intranet',
      });
      state = i1.state;
      const i2 = createPeer(state, {
        label: 'Dave (Intranet)', type: 'peer', position: { x: 150, y: 250 },
        transports: ['internet', 'lan'], zone: 'intranet',
      });
      state = i2.state;
      const sl = createPeer(state, {
        label: 'Eve (Starlink)', type: 'starlink', position: { x: 0, y: 100 },
        transports: ['internet', 'bluetooth'], zone: 'intranet',
      });
      state = sl.state;

      state = addContact(state, g1.peerId, i1.peerId);
      state = addContact(state, g1.peerId, g2.peerId);
      state = addContact(state, i1.peerId, i2.peerId);
      state = addContact(state, i1.peerId, sl.peerId);

      return state;
    },
  },
  {
    id: 'envelope-relay',
    name: 'KDF Envelope Relay',
    description: 'Three peers using KDF envelope sync through ISP and Dash Server.',
    build() {
      resetIdCounter();
      let state = createInitialState();
      state = createPeer(state, { label: 'ISP', type: 'isp', position: { x: 0, y: ispY() } }).state;
      state = createPeer(state, { label: 'Dash Server', type: 'dash-server', position: { x: 0, y: cloudY() } }).state;
      const r1 = createPeer(state, {
        label: 'Alice', type: 'peer', position: { x: -300, y: -50 },
        sps: ['kdf-envelope-sync'],
      });
      state = r1.state;
      const r2 = createPeer(state, {
        label: 'Bob', type: 'peer', position: { x: -300, y: 250 },
        sps: ['kdf-envelope-sync'],
      });
      state = r2.state;
      const r3 = createPeer(state, {
        label: 'Carol', type: 'peer', position: { x: 300, y: 100 },
        sps: ['kdf-envelope-sync'],
      });
      state = r3.state;
      state = addContact(state, r1.peerId, r2.peerId);
      state = addContact(state, r1.peerId, r3.peerId);
      state = createGroup(state, r1.peerId, 'Private Group', [r2.peerId, r3.peerId]);
      return state;
    },
  },
];
