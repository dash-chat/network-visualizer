import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialState, createPeer, addContact, addConnection,
  tick, resetIdCounter,
} from '../src/simulation/engine';
import type { SimulationState } from '../src/simulation/types';

describe('KDF envelope sync via relay store', () => {
  let state: SimulationState;
  let aliceId: string;
  let bobId: string;
  let carolId: string;

  beforeEach(() => {
    resetIdCounter();
    state = createInitialState();

    // Create three peers with kdf-envelope-sync, using bluetooth for proximity
    const a = createPeer(state, {
      label: 'Alice', type: 'peer', position: { x: 100, y: 300 },
      transports: ['bluetooth'], sps: ['kdf-envelope-sync'],
    });
    state = a.state;
    aliceId = a.peerId;

    const b = createPeer(state, {
      label: 'Bob', type: 'peer', position: { x: 200, y: 300 },
      transports: ['bluetooth'], sps: ['kdf-envelope-sync'],
    });
    state = b.state;
    bobId = b.peerId;

    const c = createPeer(state, {
      label: 'Carol', type: 'peer', position: { x: 400, y: 300 },
      transports: ['bluetooth'], sps: ['kdf-envelope-sync'],
    });
    state = c.state;
    carolId = c.peerId;
  });

  it('Alice adds Carol as contact — ops appear in both their relay stores', () => {
    state = addContact(state, aliceId, carolId);

    const alice = state.peers.get(aliceId)!;
    const carol = state.peers.get(carolId)!;

    // Alice has her contact-request in relay store
    expect(alice.relayStore.entries.length).toBe(1);
    expect(alice.relayStore.entries[0].operation.type).toBe('contact-request');
    expect(alice.relayStore.entries[0].operation.sender).toBe(aliceId);

    // Carol has her contact-request in relay store
    expect(carol.relayStore.entries.length).toBe(1);
    expect(carol.relayStore.entries[0].operation.type).toBe('contact-request');
    expect(carol.relayStore.entries[0].operation.sender).toBe(carolId);

    // Bob has nothing
    const bob = state.peers.get(bobId)!;
    expect(bob.relayStore.entries.length).toBe(0);
  });

  it('Alice↔Bob proximity sync: Bob gets Alice\'s relay entry', () => {
    state = addContact(state, aliceId, carolId);

    // Connect Alice and Bob via bluetooth (within range: 130px, they're 100px apart)
    state = addConnection(state, aliceId, bobId, 'bluetooth');

    // Run several ticks to let sync + transit complete
    for (let i = 0; i < 10; i++) {
      state = tick(state);
    }

    const bob = state.peers.get(bobId)!;

    // Bob should have Alice's contact-request in his relay store
    const aliceOps = bob.relayStore.entries.filter(
      e => e.operation.sender === aliceId
    );
    expect(aliceOps.length).toBeGreaterThanOrEqual(1);
    expect(aliceOps[0].operation.type).toBe('contact-request');

    // The envelope should have a valid kdfPub and selfHash
    expect(aliceOps[0].envelope.kdfPub.length).toBe(64); // 32 bytes hex
    expect(aliceOps[0].envelope.selfHash.length).toBe(64);
  });

  it('Bob↔Carol proximity sync: Carol gets Alice\'s op relayed through Bob', () => {
    state = addContact(state, aliceId, carolId);

    // Alice ↔ Bob (bluetooth, within range)
    state = addConnection(state, aliceId, bobId, 'bluetooth');

    // Bob ↔ Carol: move Carol closer to Bob first
    const carol = state.peers.get(carolId)!;
    carol.position = { x: 300, y: 300 }; // 100px from Bob
    state = addConnection(state, bobId, carolId, 'bluetooth');

    // Run enough ticks for:
    // 1. Alice→Bob sync + transit
    // 2. Bob→Carol sync + transit
    for (let i = 0; i < 20; i++) {
      state = tick(state);
    }

    const carolAfter = state.peers.get(carolId)!;

    // Carol should have Alice's contact-request relayed through Bob
    const aliceOps = carolAfter.relayStore.entries.filter(
      e => e.operation.sender === aliceId
    );
    expect(aliceOps.length).toBeGreaterThanOrEqual(1);
    expect(aliceOps[0].operation.type).toBe('contact-request');

    // Carol should also have her own contact-request (created in addContact)
    const carolOps = carolAfter.relayStore.entries.filter(
      e => e.operation.sender === carolId
    );
    expect(carolOps.length).toBeGreaterThanOrEqual(1);
  });

  it('relay entries preserve envelope chain structure', () => {
    state = addContact(state, aliceId, carolId);
    state = addConnection(state, aliceId, bobId, 'bluetooth');

    for (let i = 0; i < 10; i++) {
      state = tick(state);
    }

    const bob = state.peers.get(bobId)!;
    const relayed = bob.relayStore.entries.find(e => e.operation.sender === aliceId);

    expect(relayed).toBeDefined();
    // Envelope fields should be present
    expect(relayed!.envelope.kdfPub).toBeTruthy();
    expect(relayed!.envelope.selfHash).toBeTruthy();
    expect(relayed!.envelope.signature).toBeTruthy();
    // First entry in chain: previousHash should be all zeros
    expect(relayed!.envelope.previousHash).toBe('0'.repeat(64));
  });
});
