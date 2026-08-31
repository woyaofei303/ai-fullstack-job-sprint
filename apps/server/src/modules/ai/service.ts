import crypto from "node:crypto";

export type AiConnection = {
  mock: boolean;
  baseUrl: string;
  apiKey?: string;
  embeddingModel: string;
};

export type AiAgentConfig = {
  model: string;
  systemPrompt: string;
  temperature: number;
  language: "auto" | "zh-CN" | "en";
};

export type KnowledgeSource = { id: number; content: string };

type GroundedAnswer = { answer: string; sourceIds: number[] };

export async function createEmbeddings(
  inputs: string[],
  connection: AiConnection,
  fetcher: typeof fetch = fetch,
): Promise<number[][]> {
  if (connection.mock) return inputs.map(mockEmbedding);
  if (!connection.apiKey) throw new Error("AI API key is not configured");
  const response = await fetcher(
    `${connection.baseUrl.replace(/\/$/, "")}/embeddings`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: connection.embeddingModel, input: inputs }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Embedding request failed (${response.status})`);
  }
  const json = (await response.json()) as {
    data?: Array<{ index?: number; embedding?: unknown }>;
  };
  const vectors = (json.data ?? [])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(({ embedding }) =>
      Array.isArray(embedding) &&
      embedding.every((value) => typeof value === "number")
        ? (embedding as number[])
        : null,
    );
  if (vectors.length !== inputs.length || vectors.some((vector) => !vector)) {
    throw new Error("Embedding response is invalid");
  }
  return vectors as number[][];
}

export async function describeImage(
  image: { bytes: Buffer; mimeType: string; caption: string },
  agent: AiAgentConfig,
  connection: AiConnection,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (connection.mock)
    return image.caption || "customer uploaded a product screenshot";
  const result = await chatJson(
    {
      model: agent.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            'Describe the customer support issue visible in the image as one concise search query. Return JSON: {"query":"..."}.',
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: image.caption || "Describe this support issue.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.mimeType};base64,${image.bytes.toString("base64")}`,
              },
            },
          ],
        },
      ],
    },
    connection,
    fetcher,
  );
  return typeof result.query === "string" && result.query.trim()
    ? result.query.trim().slice(0, 500)
    : image.caption;
}

export async function answerFromKnowledge(
  input: {
    question: string;
    sources: KnowledgeSource[];
    agent: AiAgentConfig;
    image?: { bytes: Buffer; mimeType: string };
  },
  connection: AiConnection,
  fetcher: typeof fetch = fetch,
): Promise<GroundedAnswer | null> {
  if (!input.sources.length) return null;
  if (connection.mock) {
    return {
      answer: `【模拟回答】${input.sources[0].content}`,
      sourceIds: [input.sources[0].id],
    };
  }
  const sourceText = input.sources
    .map(({ id, content }) => `[${id}] ${content}`)
    .join("\n\n");
  const questionContent: unknown = input.image
    ? [
        { type: "text", text: input.question },
        {
          type: "image_url",
          image_url: {
            url: `data:${input.image.mimeType};base64,${input.image.bytes.toString("base64")}`,
          },
        },
      ]
    : input.question;
  const result = await chatJson(
    {
      model: input.agent.model,
      temperature: input.agent.temperature,
      messages: [
        {
          role: "system",
          content: `${input.agent.systemPrompt}\nYou must use only the supplied sources. Return JSON with answer and sourceIds. If the sources do not answer the question, return {"answer":"","sourceIds":[]}. Reply language: ${input.agent.language}.`,
        },
        { role: "user", content: `Sources:\n${sourceText}` },
        { role: "user", content: questionContent },
      ],
    },
    connection,
    fetcher,
  );
  const allowed = new Set(input.sources.map(({ id }) => id));
  const sourceIds = Array.isArray(result.sourceIds)
    ? result.sourceIds.filter(
        (id): id is number => typeof id === "number" && allowed.has(id),
      )
    : [];
  if (
    typeof result.answer !== "string" ||
    !result.answer.trim() ||
    !sourceIds.length
  ) {
    return null;
  }
  return { answer: result.answer.trim(), sourceIds: [...new Set(sourceIds)] };
}

async function chatJson(
  body: Record<string, unknown>,
  connection: AiConnection,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  if (!connection.apiKey) throw new Error("AI API key is not configured");
  const response = await fetcher(
    `${connection.baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    },
  );
  if (!response.ok) throw new Error(`AI request failed (${response.status})`);
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string")
    throw new Error("AI response has no content");
  const cleaned = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const parsed: unknown = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI response is not an object");
  }
  return parsed as Record<string, unknown>;
}

function mockEmbedding(input: string): number[] {
  const bytes = crypto.createHash("sha256").update(input).digest();
  return [...bytes].map((byte) => (byte - 127.5) / 127.5);
}
