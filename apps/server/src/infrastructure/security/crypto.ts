import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [algorithm, saltText, hashText] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = (await scrypt(
    password,
    Buffer.from(saltText, "base64url"),
    expected.length,
  )) as Buffer;
  return crypto.timingSafeEqual(actual, expected);
}

export function newSessionToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: digestToken(token) };
}

export function digestToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function encryptSecret(value: string, key: Buffer): string {
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(value: string, key: Buffer): string {
  const [version, ivText, tagText, encryptedText] = value.split(".");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    throw new Error("Invalid encrypted secret");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function readEncryptionKey(
  value: string | undefined,
  allowDevelopmentKey: boolean,
) {
  if (!value) {
    if (allowDevelopmentKey)
      return crypto
        .createHash("sha256")
        .update("development-only-support-key")
        .digest();
    throw new Error("APP_ENCRYPTION_KEY is required");
  }
  const hex = /^[a-f\d]{64}$/i.test(value) ? Buffer.from(value, "hex") : null;
  const base64 = Buffer.from(value, "base64url");
  const key = hex?.length === 32 ? hex : base64;
  if (key.length !== 32)
    throw new Error(
      "APP_ENCRYPTION_KEY must be 32 bytes (base64url or 64 hex characters)",
    );
  return key;
}
