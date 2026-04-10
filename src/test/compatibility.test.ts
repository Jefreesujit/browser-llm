import { describe, expect, it } from "vitest";

import { getCompatibilityReport, inferParameterInfo } from "../compatibility";
import { createDeviceCapabilities, createModelDescriptor } from "./factories";

describe("inferParameterInfo", () => {
  it("infers parameter tiers from model labels", () => {
    expect(inferParameterInfo("Qwen 1.5B")).toEqual({
      parameterTier: "M",
      paramsLabel: "1.5B params",
    });
    expect(inferParameterInfo("Smol 360M")).toEqual({
      parameterTier: "XS",
      paramsLabel: "360M params",
    });
  });
});

describe("getCompatibilityReport", () => {
  it("marks missing WebGPU as unsupported", () => {
    const report = getCompatibilityReport(
      createModelDescriptor(),
      createDeviceCapabilities({ hasWebGpu: false }),
      {},
    );

    expect(report.verdict).toBe("unsupported");
    expect(report.canLoad).toBe(false);
  });

  it("blocks curated vision models on mobile", () => {
    const report = getCompatibilityReport(
      createModelDescriptor({
        task: "vision",
        category: "vision",
        parameterTier: "M",
      }),
      createDeviceCapabilities({ tier: "mobile" }),
      {},
    );

    expect(report.verdict).toBe("too_large");
    expect(report.canLoad).toBe(false);
  });
});
