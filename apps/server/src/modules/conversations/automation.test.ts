import assert from "node:assert/strict";
import test from "node:test";
import { decideAutomation } from "./automation.js";

test("a customer asking for a person enters the human queue", () => {
  assert.deepEqual(
    decideAutomation({
      text: "请转人工客服",
      handoffKeywords: ["人工客服", "human"],
      hasKnowledge: true,
      servicesAvailable: true,
    }),
    { kind: "handoff", reason: "customer_request" },
  );
});
