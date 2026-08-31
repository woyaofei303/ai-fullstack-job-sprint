export type KnowledgeChunk = {
  content: string;
  documentName: string;
};

export function chunkText(
  input: string,
  maxChars = 800,
  overlapChars = 120,
): string[] {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  if (normalized.split(" ").some((word) => word.length > maxChars)) {
    const step = Math.max(1, maxChars - Math.min(overlapChars, maxChars - 1));
    const chunks: string[] = [];
    for (let start = 0; start < normalized.length; start += step) {
      chunks.push(normalized.slice(start, start + maxChars));
      if (start + maxChars >= normalized.length) break;
    }
    return chunks;
  }
  const words = normalized.split(" ").filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    if (current.length && [...current, word].join(" ").length > maxChars) {
      chunks.push(current.join(" "));
      const overlap: string[] = [];
      while (
        current.length &&
        [current.at(-1)!, ...overlap].join(" ").length <= overlapChars
      ) {
        overlap.unshift(current.pop()!);
      }
      current = overlap;
    }
    current.push(word);
  }

  if (current.length) chunks.push(current.join(" "));
  return chunks;
}

function searchTokens(input: string): string[] {
  const text = input.toLowerCase();
  const tokens: string[] = text.match(/[a-z0-9_]+/g) ?? [];
  for (const run of text.match(/[\u3400-\u9fff]+/g) ?? []) {
    if (run.length === 1) tokens.push(run);
    else
      for (let i = 0; i < run.length - 1; i += 1)
        tokens.push(run.slice(i, i + 2));
  }
  return [...new Set(tokens)];
}

export function rankChunks<T extends KnowledgeChunk>(
  query: string,
  chunks: T[],
  limit = 4,
): T[] {
  const tokens = searchTokens(query);
  return chunks
    .map((chunk) => ({
      chunk,
      score: tokens.reduce(
        (sum, token) =>
          sum + (chunk.content.toLowerCase().includes(token) ? 1 : 0),
        0,
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk }) => chunk);
}
