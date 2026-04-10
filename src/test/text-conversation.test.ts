import { describe, expect, it } from "vitest";

import {
  computePromptBudget,
  normalizeConversationTurns,
  shouldRefreshSummary,
} from "../worker/text-conversation";
import { createModelDescriptor } from "./factories";

describe("normalizeConversationTurns", () => {
  it("merges adjacent turns with the same role after the first user turn", () => {
    expect(
      normalizeConversationTurns([
        { role: "system", content: "Rules" },
        { role: "user", content: "First" },
        { role: "user", content: "Second" },
        { role: "assistant", content: "Reply" },
      ]),
    ).toEqual([
      { role: "system", content: "Rules" },
      { role: "user", content: "First\n\nSecond" },
      { role: "assistant", content: "Reply" },
    ]);
  });
});

describe("text conversation thresholds", () => {
  it("computes a bounded prompt budget", () => {
    expect(
      computePromptBudget(
        createModelDescriptor({ runtime: { contextWindowTokens: 4096 } }),
        {
          maxNewTokens: 2048,
          temperature: 0.7,
          topP: 0.9,
        },
      ),
    ).toBe(1920);
  });

  it("refreshes summaries when message count or token budget thresholds are exceeded", () => {
    expect(shouldRefreshSummary(8, 100, 1000)).toBe(true);
    expect(shouldRefreshSummary(3, 351, 1000)).toBe(true);
    expect(shouldRefreshSummary(3, 350, 1000)).toBe(false);
  });
});
