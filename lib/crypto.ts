/**
 * Symmetric encryption for LinkedIn OAuth tokens stored at rest.
 *
 * Uses AES-256-GCM (authenticated encryption) with a key derived from
 * APP_ENCRYPTION_KEY. Encrypted values are serialized as a single string:
 *
 *   v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>
 *
 * The "v1" prefix leaves room to rotate the scheme later without ambiguity.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getEncryptionKey } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM.
const SCHEME = "v1";

let cachedKey: Buffer | undefined;

/**
 * Resolve the raw 32-byte key from APP_ENCRYPTION_KEY.
 *
 * Accepts a 32-byte base64 or hex value directly; otherwise derives a stable
 * 32-byte key via SHA-256 so any sufficiently random secret works.
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = getEncryptionKey();

  const fromBase64 = tryDecode(raw, "base64");
  if (fromBase64?.length === 32) {
    cachedKey = fromBase64;
    return cachedKey;
  }

  const fromHex = tryDecode(raw, "hex");
  if (fromHex?.length === 32) {
    cachedKey = fromHex;
    return cachedKey;
  }

  cachedKey = createHash("sha256").update(raw, "utf8").digest();
  return cachedKey;
}

function tryDecode(value: string, encoding: "base64" | "hex"): Buffer | null {
  try {
    const buf = Buffer.from(value, encoding);
    // Buffer.from is lenient; re-encode to confirm the input round-trips.
    if (buf.toString(encoding).replace(/=+$/, "") === value.replace(/=+$/, "")) {
      return buf;
    }
    return null;
  } catch {
    return null;
  }
}

/** Encrypt a UTF-8 string, returning the serialized ciphertext envelope. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    SCHEME,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Decrypt a value produced by {@link encrypt}. Throws if tampered/invalid. */
export function decrypt(serialized: string): string {
  const parts = serialized.split(":");
  if (parts.length !== 4 || parts[0] !== SCHEME) {
    throw new Error("Invalid encrypted value format");
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Encrypt only when a value is present; passes through null/undefined. */
export function encryptNullable(
  plaintext: string | null | undefined,
): string | null {
  return plaintext ? encrypt(plaintext) : null;
}
