import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialState, createPeer, addContact,
  tick, resetIdCounter,
} from '../src/simulation/engine';
import type { SimulationState } from '../src/simulation/types';

describe('KDF envelope relay over LAN — Bob carries message between two networks', () => {
  let state: SimulationState;
  let aliceId: string;
  let bobId: string;
  let carolId: string;

  // Two routers far apart (>200px so their ranges don't overlap)
  // Router A at x=-300, Router B at x=300 — 600px apart, well beyond LAN range (200px)
  //
  // Phase 1: Alice and Bob are near Router A. They sync.
  // Phase 2: Bob moves to Router B where Carol is. They sync.
  // Result: Carol gets Alice's contact-request relayed through Bob.

  beforeEach(() => {
    resetIdCounter();
    state = createInitialState();

    // Two separate LANs
    state = createPeer(state, {
      label: 'Router A', type: 'router', position: { x: -300, y: 0 },
    }).state;
    state = createPeer(state, {
      label: 'Router B', type: 'router', position: { x: 300, y: 0 },
    }).state;

    // Alice stays near Router A
    const a = createPeer(state, {
      label: 'Alice', type: 'peer', position: { x: -350, y: 0 },
      transports: ['lan'], sps: ['kdf-envelope-sync'],
    });
    state = a.state;
    aliceId = a.peerId;

    // Bob starts near Router A (will move to Router B later)
    const b = createPeer(state, {
      label: 'Bob', type: 'peer', position: { x: -250, y: 0 },
      transports: ['lan'], sps: ['kdf-envelope-sync'],
    });
    state = b.state;
    bobId = b.peerId;

    // Carol is near Router B
    const c = createPeer(state, {
      label: 'Carol', type: 'peer', position: { x: 350, y: 0 },
      transports: ['lan'], sps: ['kdf-envelope-sync'],
    });
    state = c.state;
    carolId = c.peerId;
  });

  it('initial state: Alice and Bob share Router A, Carol is on Router B alone', () => {
    state = tick(state);

    const lanConns = state.connections.filter(c => c.transport === 'lan');
    // Alice-Bob should be connected (both near Router A)
    const aliceBob = lanConns.some(c =>
      (c.from === aliceId && c.to === bobId) || (c.from === bobId && c.to === aliceId)
    );
    expect(aliceBob).toBe(true);

    // Carol should NOT be connected to Alice or Bob (different router, too far)
    const carolAlice = lanConns.some(c =>
      (c.from === carolId && c.to === aliceId) || (c.from === aliceId && c.to === carolId)
    );
    const carolBob = lanConns.some(c =>
      (c.from === carolId && c.to === bobId) || (c.from === bobId && c.to === carolId)
    );
    expect(carolAlice).toBe(false);
    expect(carolBob).toBe(false);
  });

  it('Phase 1: Alice↔Bob sync on Router A LAN', () => {
    state = addContact(state, aliceId, carolId);

    // Run ticks — Alice and Bob sync via Router A LAN
    for (let i = 0; i < 10; i++) state = tick(state);

    const bob = state.peers.get(bobId)!;
    const aliceOpsOnBob = bob.relayStore.entries.filter(e => e.operation.sender === aliceId);
    expect(aliceOpsOnBob.length).toBeGreaterThanOrEqual(1);
    expect(aliceOpsOnBob[0].operation.type).toBe('contact-request');

    // Carol should NOT have Alice's op yet (she's on a different LAN)
    const carol = state.peers.get(carolId)!;
    const aliceOpsOnCarol = carol.relayStore.entries.filter(e => e.operation.sender === aliceId);
    expect(aliceOpsOnCarol.length).toBe(0);
  });

  it('Phase 2: Bob moves to Router B, syncs with Carol — Carol gets Alice\'s op', () => {
    state = addContact(state, aliceId, carolId);

    // Phase 1: sync on Router A
    for (let i = 0; i < 10; i++) state = tick(state);

    // Verify Bob has Alice's op
    expect(
      state.peers.get(bobId)!.relayStore.entries.some(e => e.operation.sender === aliceId)
    ).toBe(true);

    // Phase 2: move Bob to Router B (near Carol)
    const bob = state.peers.get(bobId)!;
    bob.position = { x: 250, y: 0 };
    bob.velocity = { vx: 0, vy: 0 };

    // Run ticks — Bob connects to Router B, syncs with Carol
    for (let i = 0; i < 10; i++) state = tick(state);

    // Bob should now be connected to Carol via Router B
    const bobCarolConn = state.connections.some(c =>
      c.transport === 'lan' &&
      ((c.from === bobId && c.to === carolId) || (c.from === carolId && c.to === bobId))
    );
    expect(bobCarolConn).toBe(true);

    // Carol should now have Alice's contact-request, relayed through Bob
    const carol = state.peers.get(carolId)!;
    const aliceOpsOnCarol = carol.relayStore.entries.filter(e => e.operation.sender === aliceId);
    expect(aliceOpsOnCarol.length).toBeGreaterThanOrEqual(1);
    expect(aliceOpsOnCarol[0].operation.type).toBe('contact-request');
    expect(aliceOpsOnCarol[0].envelope.kdfPub.length).toBe(64);
    expect(aliceOpsOnCarol[0].envelope.selfHash.length).toBe(64);
    expect(aliceOpsOnCarol[0].envelope.signature.length).toBe(128); // Ed25519 sig
  });

  it('envelope chain structure is preserved through relay', () => {
    state = addContact(state, aliceId, carolId);

    // Phase 1
    for (let i = 0; i < 10; i++) state = tick(state);

    // Phase 2: Bob moves to Router B
    state.peers.get(bobId)!.position = { x: 250, y: 0 };
    state.peers.get(bobId)!.velocity = { vx: 0, vy: 0 };
    for (let i = 0; i < 10; i++) state = tick(state);

    // The envelope on Carol should match the original on Alice
    const alice = state.peers.get(aliceId)!;
    const carol = state.peers.get(carolId)!;

    const aliceEntry = alice.relayStore.entries.find(e => e.operation.sender === aliceId)!;
    const carolEntry = carol.relayStore.entries.find(e => e.operation.sender === aliceId)!;

    expect(carolEntry.envelope.kdfPub).toBe(aliceEntry.envelope.kdfPub);
    expect(carolEntry.envelope.selfHash).toBe(aliceEntry.envelope.selfHash);
    expect(carolEntry.envelope.previousHash).toBe(aliceEntry.envelope.previousHash);
    expect(carolEntry.envelope.signature).toBe(aliceEntry.envelope.signature);
  });

  it('LAN peers without a router: NO auto-connect happens', () => {
    resetIdCounter();
    let s = createInitialState();
    const a = createPeer(s, {
      label: 'Alice', type: 'peer', position: { x: 100, y: 0 },
      transports: ['lan'], sps: ['kdf-envelope-sync'],
    });
    s = a.state;
    const b = createPeer(s, {
      label: 'Bob', type: 'peer', position: { x: 200, y: 0 },
      transports: ['lan'], sps: ['kdf-envelope-sync'],
    });
    s = b.state;

    s = addContact(s, a.peerId, b.peerId);
    for (let i = 0; i < 10; i++) s = tick(s);

    expect(s.connections.filter(c => c.transport === 'lan').length).toBe(0);
    expect(s.peers.get(b.peerId)!.relayStore.entries.filter(e => e.operation.sender === a.peerId).length).toBe(0);
  });
});
