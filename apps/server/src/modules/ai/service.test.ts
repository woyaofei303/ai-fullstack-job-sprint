import assert from "node:assert/strict";
import test from "node:test";
import { answerFromKnowledge } from "./service.js";

test("AI answers are accepted only when they cite retrieved knowledge", async () => {
  const valid = await answerFromKnowledge(
    {
      question: "How long does delivery take?",
      sources: [{ id: 7, content: "Delivery takes 3-5 business days." }],
      agent: {
        model: "vision-model",
        systemPrompt: "Answer as support.",
        temperature: 0.2,
        language: "auto",
      },
    },
    {
      mock: false,
      baseUrl: "https://ai.example/v1",
      apiKey: "key",
      embeddingModel: "embedding",
    },
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "Delivery takes 3-5 business days.",
                  sourceIds: [7],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
  );

  assert.deepEqual(valid, {
    answer: "Delivery takes 3-5 business days.",
    sourceIds: [7],
  });

  const invalid = await answerFromKnowledge(
    {
      question: "Can I get a refund?",
      sources: [{ id: 7, content: "Delivery takes 3-5 business days." }],
      agent: {
        model: "vision-model",
        systemPrompt: "Answer as support.",
        temperature: 0.2,
        language: "auto",
      },
    },
    {
      mock: false,
      baseUrl: "https://ai.example/v1",
      apiKey: "key",
      embeddingModel: "embedding",
    },
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "Refunds are always available.",
                  sourceIds: [99],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
  );

  assert.equal(invalid, null);
});
