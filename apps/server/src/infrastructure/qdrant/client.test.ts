import assert from "node:assert/strict";
import test from "node:test";
import { indexChunks } from "./client.js";

test("PostgreSQL bigint chunk IDs are sent to Qdrant as numbers", async () => {
  let upsertBody: { points: Array<{ id: unknown }> } | undefined;
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "PUT") {
      upsertBody = JSON.parse(String(init.body));
    }
    return new Response(JSON.stringify({ result: {} }), { status: 200 });
  }) as typeof fetch;

  await indexChunks(
    [
      {
        id: "42" as unknown as number,
        documentId: "doc",
        knowledgeBaseId: "kb",
        content: "answer",
      },
    ],
    "http://qdrant",
    { mock: true, baseUrl: "http://ai", embeddingModel: "mock" },
    fetcher,
  );

  assert.equal(upsertBody?.points[0]?.id, 42);
});
