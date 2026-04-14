import { describe, expect, it } from "vitest";

import {
  buildSearchTerms,
  normalizeSearchQuery,
  scoreSearchModel,
  tokenizeSearchQuery,
} from "../hf";
import { createModelDescriptor } from "./factories";

describe("hf search helpers", () => {
  it("normalizes search strings and resolves family aliases", () => {
    expect(normalizeSearchQuery(" Qwen3.5-Coder!! ")).toBe("qwen3.5 coder");
    expect(tokenizeSearchQuery("Qwen3.5 coder for browser")).toEqual([
      "qwen",
      "coder",
    ]);
  });

  it("keeps repo id search terms intact", () => {
    expect(buildSearchTerms("onnx-community/Qwen3-Coder-0.6B")).toContain(
      "onnx-community/Qwen3-Coder-0.6B",
    );
  });

  it("scores exact repo matches higher than partial matches", () => {
    const exact = createModelDescriptor({
      id: "onnx-community/Qwen3-Coder-0.6B",
      label: "Qwen3 Coder 0.6B",
    });
    const partial = createModelDescriptor({
      id: "onnx-community/Qwen3-0.6B",
      label: "Qwen3 0.6B",
    });

    expect(
      scoreSearchModel(exact, "onnx-community/Qwen3-Coder-0.6B"),
    ).toBeGreaterThan(
      scoreSearchModel(partial, "onnx-community/Qwen3-Coder-0.6B"),
    );
  });
});
