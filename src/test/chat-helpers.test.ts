import { describe, expect, it } from "vitest";

import {
  buildLastMessagePreview,
  buildThreadTitle,
  parseAssistantResponse,
} from "../app/chat-helpers";
import { createThreadMessage } from "./factories";

describe("parseAssistantResponse", () => {
  it("extracts completed reasoning blocks", () => {
    expect(
      parseAssistantResponse("Intro <think>private notes</think> Final"),
    ).toEqual({
      content: "Intro  Final".trim(),
      reasoning: "private notes",
      reasoningState: "complete",
    });
  });

  it("handles streaming reasoning blocks", () => {
    expect(parseAssistantResponse("Answer<think>still thinking")).toEqual({
      content: "Answer",
      reasoning: "still thinking",
      reasoningState: "streaming",
    });
  });
});

describe("thread metadata helpers", () => {
  it("uses the first user message for titles", () => {
    expect(
      buildThreadTitle([
        createThreadMessage({ role: "assistant", content: "Ignored" }),
        createThreadMessage({
          role: "user",
          content: "Plan the release checklist",
        }),
      ]),
    ).toBe("Plan the release checklist");
  });

  it("builds previews from the latest visible message", () => {
    expect(
      buildLastMessagePreview([
        createThreadMessage({ role: "user", content: "Hello" }),
        createThreadMessage({
          role: "assistant",
          content: "Here is the latest answer.",
        }),
      ]),
    ).toBe("Here is the latest answer.");
  });
});
