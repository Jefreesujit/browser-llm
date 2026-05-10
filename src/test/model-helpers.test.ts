import { afterEach, describe, expect, it } from "vitest";

import {
  buildAudioSections,
  buildRecentAudioModels,
  getAudioTaskForModel,
  getFallbackAudioModel,
  getFallbackThreadModel,
  getRecommendedModel,
} from "../app/model-helpers";
import { CURATED_MODELS_BY_ID } from "../models";
import { saveLastModel } from "../storage";
import { createDeviceCapabilities, createModelDescriptor } from "./factories";

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

  it("surfaces speak models in the audio sections", () => {
    const sections = buildAudioSections("speak", createDeviceCapabilities(), {});
    const modelIds = sections.flatMap((section) =>
      section.models.map(({ model }) => model.id),
    );

    expect(modelIds).toContain("onnx-community/Supertonic-TTS-ONNX");
    expect(modelIds).toContain("Xenova/speecht5_tts");
    expect(modelIds).not.toContain("onnx-community/moonshine-base-ONNX");
  });

  it("filters recent audio models by task", () => {
    const recentModels = [
      createModelDescriptor({
        id: "onnx-community/moonshine-base-ONNX",
        label: "Moonshine Base",
        task: "stt",
        category: "audio_recommended",
      }),
      createModelDescriptor({
        id: "onnx-community/Supertonic-TTS-ONNX",
        label: "Supertonic TTS",
        task: "tts",
        category: "audio_recommended",
      }),
    ];

    const models = buildRecentAudioModels(
      "speak",
      recentModels,
      createDeviceCapabilities(),
      {},
    );

    expect(models).toHaveLength(1);
    expect(models[0]?.model.id).toBe("onnx-community/Supertonic-TTS-ONNX");
  });

  it("keeps Supertonic TTS as the default speak model", () => {
    expect(getFallbackAudioModel("speak")?.id).toBe(
      "onnx-community/Supertonic-TTS-ONNX",
    );
  });

  it("maps audio model tasks back to the correct workspace tab", () => {
    expect(
      getAudioTaskForModel(
        createModelDescriptor({
          task: "stt",
        }),
      ),
    ).toBe("transcribe");
    expect(
      getAudioTaskForModel(
        createModelDescriptor({
          task: "tts",
        }),
      ),
    ).toBe("speak");
  });
});
