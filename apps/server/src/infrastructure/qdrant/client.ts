import type { AiConnection } from "../../modules/ai/service.js";
import { createEmbeddings } from "../../modules/ai/service.js";

const collection = "knowledge_chunks";

export type IndexedChunk = {
  id: number;
  documentId: string;
  knowledgeBaseId: string;
  content: string;
};

export async function indexChunks(
  chunks: IndexedChunk[],
  qdrantUrl: string,
  ai: AiConnection,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!chunks.length) return;
  const vectors = await createEmbeddings(
    chunks.map(({ content }) => content),
    ai,
    fetcher,
  );
  await ensureCollection(qdrantUrl, vectors[0].length, fetcher);
  await qdrantFetch(
    qdrantUrl,
    `/collections/${collection}/points?wait=true`,
    {
      method: "PUT",
      body: JSON.stringify({
        points: chunks.map((chunk, index) => ({
          id: Number(chunk.id),
          vector: vectors[index],
          payload: {
            documentId: chunk.documentId,
            knowledgeBaseId: chunk.knowledgeBaseId,
          },
        })),
      }),
    },
    fetcher,
  );
}

export async function searchChunks(
  query: string,
  knowledgeBaseIds: string[],
  qdrantUrl: string,
  ai: AiConnection,
  fetcher: typeof fetch = fetch,
): Promise<Array<{ id: number; score: number }>> {
  if (!knowledgeBaseIds.length) return [];
  const [vector] = await createEmbeddings([query], ai, fetcher);
  const response = await qdrantFetch(
    qdrantUrl,
    `/collections/${collection}/points/query`,
    {
      method: "POST",
      body: JSON.stringify({
        query: vector,
        filter: {
          must: [
            {
              key: "knowledgeBaseId",
              match: { any: knowledgeBaseIds },
            },
          ],
        },
        limit: 6,
        score_threshold: ai.mock ? -1 : 0.55,
        with_payload: false,
      }),
    },
    fetcher,
  );
  const json = (await response.json()) as {
    result?: { points?: Array<{ id?: unknown; score?: unknown }> };
  };
  return (json.result?.points ?? []).flatMap(({ id, score }) =>
    (typeof id === "number" || typeof id === "string") &&
    typeof score === "number"
      ? [{ id: Number(id), score }]
      : [],
  );
}

export async function deleteDocumentVectors(
  documentId: string,
  qdrantUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const status = await fetcher(`${qdrantUrl}/collections/${collection}`);
  if (status.status === 404) return;
  if (!status.ok) throw new Error(`Qdrant unavailable (${status.status})`);
  await qdrantFetch(
    qdrantUrl,
    `/collections/${collection}/points/delete?wait=true`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: { must: [{ key: "documentId", match: { value: documentId } }] },
      }),
    },
    fetcher,
  );
}

export async function resetKnowledgeIndex(
  qdrantUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(
    `${qdrantUrl.replace(/\/$/, "")}/collections/${collection}`,
    {
      method: "DELETE",
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`Qdrant reset failed (${response.status})`);
  }
}

async function ensureCollection(
  qdrantUrl: string,
  size: number,
  fetcher: typeof fetch,
): Promise<void> {
  const response = await fetcher(`${qdrantUrl}/collections/${collection}`);
  if (response.ok) return;
  if (response.status !== 404)
    throw new Error(`Qdrant unavailable (${response.status})`);
  await qdrantFetch(
    qdrantUrl,
    `/collections/${collection}`,
    {
      method: "PUT",
      body: JSON.stringify({ vectors: { size, distance: "Cosine" } }),
    },
    fetcher,
  );
}

async function qdrantFetch(
  baseUrl: string,
  path: string,
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<Response> {
  const response = await fetcher(`${baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `Qdrant request failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  return response;
}
