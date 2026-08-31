export type AutomationDecision =
  | { kind: "answer" }
  | {
      kind: "handoff";
      reason: "customer_request" | "no_knowledge" | "service_unavailable";
    };

export function decideAutomation(input: {
  text: string;
  handoffKeywords: string[];
  hasKnowledge: boolean;
  servicesAvailable: boolean;
}): AutomationDecision {
  const message = input.text.trim().toLowerCase();
  if (
    input.handoffKeywords.some((keyword) =>
      message.includes(keyword.trim().toLowerCase()),
    )
  ) {
    return { kind: "handoff", reason: "customer_request" };
  }
  if (!input.servicesAvailable) {
    return { kind: "handoff", reason: "service_unavailable" };
  }
  if (!input.hasKnowledge) {
    return { kind: "handoff", reason: "no_knowledge" };
  }
  return { kind: "answer" };
}
