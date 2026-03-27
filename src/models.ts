import type { ModelMode } from "./types";

export type ModelDefinition = {
  key: ModelMode;
  label: string;
  modelName: string;
  paramsLabel: string;
  blurb: string;
  downloadLabel: string;
  modelId: string;
  contextWindowTokens: number;
  kind: "text" | "vision";
  preferredDtype?: "q4f16" | "q4" | "q8" | "int8" | "uint8" | "fp16" | "fp32";
  fallbackDtype?: "q4" | "q8" | "int8" | "uint8" | "fp16" | "fp32";
  chatTemplateOptions?: Record<string, boolean | number | string>;
};

export const MODEL_DEFINITIONS: Record<ModelMode, ModelDefinition> = {
  fast: {
    key: "fast",
    label: "Fast",
    modelName: "SmolLM2",
    paramsLabel: "360M params",
    blurb: "Smallest download and quickest warm-up.",
    downloadLabel: "273 MB download",
    modelId: "HuggingFaceTB/SmolLM2-360M-Instruct",
    contextWindowTokens: 8192,
    kind: "text",
    preferredDtype: "q4f16",
  },
  thinking: {
    key: "thinking",
    label: "Thinking",
    modelName: "Qwen3",
    paramsLabel: "0.6B params",
    blurb: "Official Qwen thinking model with a smaller browser footprint.",
    downloadLabel: "Smaller thinking-model download",
    modelId: "onnx-community/Qwen3-0.6B-ONNX",
    contextWindowTokens: 32768,
    kind: "text",
    preferredDtype: "q4f16",
    fallbackDtype: "q4",
    chatTemplateOptions: {
      enable_thinking: true,
    },
  },
  vision: {
    key: "vision",
    label: "Vision",
    modelName: "Qwen3.5",
    paramsLabel: "0.8B params",
    blurb: "Image-aware chat with text and one attached image per turn.",
    downloadLabel: "~850 MB download",
    modelId: "onnx-community/Qwen3.5-0.8B-ONNX",
    contextWindowTokens: 262144,
    kind: "vision",
  },
};

export const MODEL_OPTIONS = Object.values(MODEL_DEFINITIONS);
export const DEFAULT_MODEL_MODE: ModelMode = "fast";
