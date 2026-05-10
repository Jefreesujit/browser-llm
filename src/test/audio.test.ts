import { describe, expect, it } from "vitest";

import {
  normalizeAudioSamples,
  resampleAudio,
  trimSilence,
} from "../audio";

describe("audio preprocessing helpers", () => {
  it("resamples microphone audio to the target rate", () => {
    const samples = new Float32Array([0, 0.5, 1, 0.5]);
    expect(resampleAudio(samples, 4, 2)).toHaveLength(2);
  });

  it("trims quiet leading and trailing silence while keeping speech", () => {
    const samples = new Float32Array([0, 0, 0.02, 0.2, 0.15, 0.01, 0, 0]);
    const trimmed = trimSilence(samples, 1000, 0.015, 0);
    expect(Array.from(trimmed)).toHaveLength(3);
    expect(trimmed[0]).toBeCloseTo(0.02, 5);
    expect(trimmed[1]).toBeCloseTo(0.2, 5);
    expect(trimmed[2]).toBeCloseTo(0.15, 5);
  });

  it("boosts low-volume recordings to a stronger peak", () => {
    const normalized = normalizeAudioSamples(new Float32Array([0.1, -0.2, 0.3]));
    expect(Math.max(...Array.from(normalized).map((value) => Math.abs(value)))).toBeCloseTo(0.92, 2);
  });
});
