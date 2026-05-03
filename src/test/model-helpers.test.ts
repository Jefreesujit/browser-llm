import { afterEach, describe, expect, it } from "vitest";

import {
  getFallbackThreadModel,
  getRecommendedModel,
} from "../app/model-helpers";
import { CURATED_MODELS_BY_ID } from "../models";
import { saveLastModel } from "../storage";
import { createDeviceCapabilities } from "./factories";

describe("chat model defaults", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults first-run chat to Gemma 3 270M", () => {
    const model = getRecommendedModel(createDeviceCapabilities(), {});

    expect(model?.id).toBe("onnx-community/gemma-3-270m-it-ONNX");
  });

  it("keeps the saved last chat model when it is still loadable", () => {
    saveLastModel(CURATED_MODELS_BY_ID["onnx-community/gemma-3-1b-it-ONNX"]);

    const model = getRecommendedModel(createDeviceCapabilities(), {});

    expect(model?.id).toBe("onnx-community/gemma-3-1b-it-ONNX");
  });

  it("uses Gemma 3 270M as the fallback thread model too", () => {
    const model = getFallbackThreadModel(createDeviceCapabilities(), {});

    expect(model?.id).toBe("onnx-community/gemma-3-270m-it-ONNX");
  });
});
