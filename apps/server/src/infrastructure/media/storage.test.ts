import assert from "node:assert/strict";
import test from "node:test";
import { detectImageType } from "./storage.js";

test("image uploads are accepted by signature, not the claimed MIME type", () => {
  assert.equal(
    detectImageType(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    "image/png",
  );
  assert.equal(
    detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
    "image/jpeg",
  );
  assert.equal(
    detectImageType(Buffer.from("RIFF0000WEBP", "ascii")),
    "image/webp",
  );
  assert.equal(detectImageType(Buffer.from("not-an-image")), null);
});
