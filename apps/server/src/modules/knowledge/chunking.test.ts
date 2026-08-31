import assert from "node:assert/strict";
import test from "node:test";
import { chunkText, rankChunks } from "./chunking.js";

test("uploaded text becomes clean, overlapping knowledge chunks", () => {
  const chunks = chunkText("  Alpha   beta\n\nGamma delta epsilon  ", 18, 5);

  assert.deepEqual(chunks, [
    "Alpha beta Gamma",
    "Gamma delta",
    "delta epsilon",
  ]);
});

test("a question retrieves the most relevant Chinese or English knowledge", () => {
  const chunks = [
    {
      documentName: "deploy.md",
      content: "使用 Docker Compose 启动 API、PostgreSQL 和 Redis。",
    },
    {
      documentName: "ui.md",
      content: "React uses fetch to read the streamed answer.",
    },
  ];

  assert.equal(
    rankChunks("Docker 怎么启动？", chunks, 1)[0]?.documentName,
    "deploy.md",
  );
  assert.equal(
    rankChunks("How does React read the answer?", chunks, 1)[0]?.documentName,
    "ui.md",
  );
});

test("Chinese text without spaces still respects the chunk size", () => {
  const chunks = chunkText("退货政策".repeat(300), 100, 20);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 100));
});
