import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  newSessionToken,
  readEncryptionKey,
  verifyPassword,
} from "./crypto.js";

test("passwords verify without storing the original value", async () => {
  const encoded = await hashPassword("correct horse battery staple");

  assert.equal(
    await verifyPassword("correct horse battery staple", encoded),
    true,
  );
  assert.equal(await verifyPassword("wrong", encoded), false);
  assert.doesNotMatch(encoded, /correct horse/);
});

test("stored secrets are authenticated and encrypted", () => {
  const key = Buffer.alloc(32, 7);
  const encrypted = encryptSecret("telegram-token", key);

  assert.notEqual(encrypted, "telegram-token");
  assert.equal(decryptSecret(encrypted, key), "telegram-token");
  assert.throws(() => decryptSecret(`${encrypted}x`, key));
});

test("session tokens expose a token once and store only its digest", () => {
  const session = newSessionToken();

  assert.equal(session.token.length > 32, true);
  assert.equal(session.hash.length, 64);
  assert.notEqual(session.token, session.hash);
});

test("production encryption requires an explicit 32-byte key", () => {
  assert.throws(() => readEncryptionKey(undefined, false));
  assert.equal(readEncryptionKey("ab".repeat(32), false).length, 32);
  assert.equal(readEncryptionKey(undefined, true).length, 32);
});
