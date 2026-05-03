import { describe, expect, it } from "vitest";

import {
  EMPTY_TRANSCRIPTION_MESSAGE,
  normalizeTranscriptionText,
} from "../app/audio-helpers";

describe("audio transcription helpers", () => {
  it("keeps direct transcription text when available", () => {
    expect(
      normalizeTranscriptionText("Hello from the model.", [
        { text: "ignored", timestamp: [0, 1] },
      ]),
    ).toBe("Hello from the model.");
  });

  it("rebuilds transcript text from chunks when the direct text is empty", () => {
    expect(
      normalizeTranscriptionText("", [
        { text: "Hello", timestamp: [0, 0.5] },
        { text: "world", timestamp: [0.5, 1] },
      ]),
    ).toBe("Hello world");
  });

  it("exposes the empty-transcription fallback copy when nothing is recognized", () => {
    expect(EMPTY_TRANSCRIPTION_MESSAGE).toMatch(/No speech was detected/i);
    expect(normalizeTranscriptionText("", [])).toBe("");
  });
});
