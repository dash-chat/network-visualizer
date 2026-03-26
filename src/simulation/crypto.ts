/**
 * Crypto primitives for the network visualizer.
 *
 * - SHA-256 hashing (for p2panda backlinking, payload hashing, relay selfHash)
 * - Ed25519 signing/verification (for p2panda author signatures, KDF envelope signatures)
 * - HKDF key derivation (for topic KDF: group secret → Ed25519 keypair)
 * - Topic color derivation (deterministic hash-to-HSL color)
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { ed25519 } from '@noble/curves/ed25519.js';

// --- Hex encoding ---

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// --- Hashing ---

/** SHA-256 hash, returns hex string */
export function sha256Hex(data: Uint8Array): string {
  return toHex(sha256(data));
}

/** SHA-256 hash of a UTF-8 string, returns hex string */
export function hashString(s: string): string {
  return sha256Hex(new TextEncoder().encode(s));
}

// --- Ed25519 keypairs ---

/** Generate a random Ed25519 keypair. Returns hex-encoded keys. */
export function generateKeypair(): { publicKey: string; privateKey: string } {
  const priv = ed25519.utils.randomSecretKey();
  const pub = ed25519.getPublicKey(priv);
  return { publicKey: toHex(pub), privateKey: toHex(priv) };
}

/** Derive Ed25519 public key from a hex-encoded private key */
export function publicKeyFromPrivate(privHex: string): string {
  return toHex(ed25519.getPublicKey(fromHex(privHex)));
}

// --- Ed25519 signing ---

/** Sign a message with an Ed25519 private key. All values hex-encoded. */
export function sign(privateKeyHex: string, messageHex: string): string {
  const sig = ed25519.sign(fromHex(messageHex), fromHex(privateKeyHex));
  return toHex(sig);
}

/** Verify an Ed25519 signature. All values hex-encoded. */
export function verify(publicKeyHex: string, messageHex: string, signatureHex: string): boolean {
  try {
    return ed25519.verify(fromHex(signatureHex), fromHex(messageHex), fromHex(publicKeyHex));
  } catch {
    return false;
  }
}

// --- Byte concatenation ---

export function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

/** Concatenate hex strings into a single hex string */
export function concatHex(...hexes: string[]): string {
  return hexes.join('');
}

// --- KDF derivation ---

/**
 * Derive a topic's group secret deterministically from a topic ID.
 * In the real system this comes from DCGKA / key exchange.
 * Returns hex-encoded 32-byte secret.
 */
export function deriveTopicSecret(topicId: string): string {
  return hashString('dash-chat-topic-secret:' + topicId);
}

/**
 * Derive an Ed25519 keypair from a topic/group secret using HKDF.
 * All group members sharing the same secret derive the same KDF_pub/KDF_priv.
 *
 * KDF_priv = HKDF-SHA256(secret, salt="", info="dash-chat-kdf-envelope", len=32)
 * KDF_pub  = Ed25519.getPublicKey(KDF_priv)
 */
export function deriveKdfKeypair(secretHex: string): { kdfPub: string; kdfPriv: string } {
  const secret = fromHex(secretHex);
  const kdfPrivBytes = hkdf(sha256, secret, new Uint8Array(0), new TextEncoder().encode('dash-chat-kdf-envelope'), 32);
  const kdfPubBytes = ed25519.getPublicKey(kdfPrivBytes);
  return { kdfPub: toHex(kdfPubBytes), kdfPriv: toHex(kdfPrivBytes) };
}

/**
 * Full topic KDF derivation: topicId → secret → (kdfPub, kdfPriv)
 */
export function deriveTopicKdf(topicId: string): {
  topicId: string;
  secret: string;
  kdfPub: string;
  kdfPriv: string;
} {
  const secret = deriveTopicSecret(topicId);
  const { kdfPub, kdfPriv } = deriveKdfKeypair(secret);
  return { topicId, secret, kdfPub, kdfPriv };
}

// --- p2panda entry signing ---

/**
 * Serialize a p2panda entry's signable fields for signing.
 * Format: SHA-256(logId || seqNum || backlink || payloadHash || payloadSize)
 */
function serializeEntryForSigning(
  logId: number,
  seqNum: number,
  backlink: string | undefined,
  payloadHash: string,
  payloadSize: number,
): string {
  const encoder = new TextEncoder();
  const parts = concat(
    encoder.encode(`${logId}:`),
    encoder.encode(`${seqNum}:`),
    fromHex(backlink ?? '0'.repeat(64)),
    fromHex(payloadHash),
    encoder.encode(`:${payloadSize}`),
  );
  return toHex(parts);
}

/** Sign a p2panda log entry with the author's private key */
export function signP2PandaEntry(
  authorPrivHex: string,
  logId: number,
  seqNum: number,
  backlink: string | undefined,
  payloadHash: string,
  payloadSize: number,
): string {
  const msg = serializeEntryForSigning(logId, seqNum, backlink, payloadHash, payloadSize);
  return sign(authorPrivHex, msg);
}

/** Compute the backlink hash for the next entry (hash of the serialized previous entry) */
export function computeBacklink(
  logId: number,
  seqNum: number,
  backlink: string | undefined,
  payloadHash: string,
  payloadSize: number,
  signature: string,
): string {
  const parts = serializeEntryForSigning(logId, seqNum, backlink, payloadHash, payloadSize);
  return hashString(parts + signature);
}

// --- Relay envelope ---

/** 32 zero bytes as hex (used as previousHash for first operation in a chain) */
export const ZERO_HASH = '0'.repeat(64);

/**
 * "Encrypt" an operation for the relay store.
 * In the simulator, we serialize to JSON and treat it as the encrypted blob.
 * Returns: hex-encoded encrypted bytes and SHA-256 selfHash.
 */
export function encryptOperation(op: object): { encryptedHex: string; selfHash: string } {
  const json = JSON.stringify(op);
  const bytes = new TextEncoder().encode(json);
  return { encryptedHex: toHex(bytes), selfHash: sha256Hex(bytes) };
}

/**
 * Sign a relay envelope: Sign(KDF_priv, KDF_pub || previousHash || selfHash)
 * All values hex-encoded.
 */
export function signEnvelope(kdfPrivHex: string, kdfPubHex: string, previousHashHex: string, selfHashHex: string): string {
  const msg = concatHex(kdfPubHex, previousHashHex, selfHashHex);
  return sign(kdfPrivHex, msg);
}

/**
 * Verify a relay envelope signature.
 * Returns true if the signature is valid against KDF_pub.
 */
export function verifyEnvelope(kdfPubHex: string, previousHashHex: string, selfHashHex: string, signatureHex: string): boolean {
  const msg = concatHex(kdfPubHex, previousHashHex, selfHashHex);
  return verify(kdfPubHex, msg, signatureHex);
}

// --- Visualization helpers ---

/**
 * Derive a deterministic HSL color from any string (topic ID, kdfPub, etc.)
 * Used for topic-colored operation dots on nodes.
 */
export function topicColor(id: string): string {
  const h = sha256(new TextEncoder().encode(id));
  const hue = ((h[0] << 8) | h[1]) % 360;
  const sat = 60 + (h[2] % 25); // 60-85%
  const light = 55 + (h[3] % 15); // 55-70%
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/**
 * Convert a topic color HSL string to a numeric hex color (for Pixi.js).
 */
export function topicColorHex(id: string): number {
  const h = sha256(new TextEncoder().encode(id));
  const hue = ((h[0] << 8) | h[1]) % 360;
  const sat = (60 + (h[2] % 25)) / 100;
  const light = (55 + (h[3] % 15)) / 100;
  // HSL to RGB conversion
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = light - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const ri = Math.round((r + m) * 255);
  const gi = Math.round((g + m) * 255);
  const bi = Math.round((b + m) * 255);
  return (ri << 16) | (gi << 8) | bi;
}
