import type {
  DeviceCapabilities,
  ModelDescriptor,
  ThreadMessage,
  ThreadMessageStatus,
} from "../types";

export const createDeviceCapabilities = (
  overrides: Partial<DeviceCapabilities> = {},
): DeviceCapabilities => ({
  hasWebGpu: true,
  supportsFp16: true,
  tier: "desktop",
  browserLabel: "Chrome",
  userAgent: "test",
  ...overrides,
});

export const createModelDescriptor = (
  overrides: Partial<ModelDescriptor> & {
    hf?: Partial<ModelDescriptor["hf"]>;
    runtime?: Partial<ModelDescriptor["runtime"]>;
  } = {},
): ModelDescriptor => {
  const { hf, runtime, ...rest } = overrides;

  return {
    id: "test/model",
    label: "Test Model",
    summary: "Test summary",
    source: "curated",
    task: "text",
    publisher: "onnx-community",
    paramsLabel: "1B params",
    parameterTier: "S",
    category: "balanced",
    hf: {
      modelId: "test/model",
      pipelineTag: "text-generation",
      tags: ["transformers.js", "conversational"],
      libraryName: "transformers.js",
      hasChatTemplate: true,
      ...hf,
    },
    runtime: {
      contextWindowTokens: 4096,
      preferredDtype: "q4f16",
      fallbackDtype: "q4",
      ...runtime,
    },
    ...rest,
  };
};

export const createThreadMessage = (
  overrides: Partial<ThreadMessage> = {},
  status: ThreadMessageStatus = "complete",
): ThreadMessage => ({
  id: crypto.randomUUID(),
  threadId: "thread-1",
  sequence: 1,
  role: "user",
  content: "Hello",
  createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  status,
  ...overrides,
});
