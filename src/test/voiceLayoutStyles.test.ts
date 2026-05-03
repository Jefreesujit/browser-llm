import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(__dirname, "../styles.css"),
  "utf8",
);

describe("voice layout stylesheet", () => {
  it("keeps the voice cards equal-height and makes waveform spikes more prominent", () => {
    expect(stylesheet).toMatch(
      /\.audio-content-grid\s*\{[\s\S]*grid-auto-rows:\s*minmax\(0,\s*1fr\);/,
    );
    expect(stylesheet).toMatch(
      /\.audio-panel-header\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/,
    );
    expect(stylesheet).toMatch(
      /\.audio-panel-actions\s*\{[\s\S]*flex-wrap:\s*nowrap;/,
    );
    expect(stylesheet).toMatch(
      /\.audio-panel-card\s*\{[\s\S]*height:\s*100%;/,
    );
    expect(stylesheet).toMatch(
      /\.audio-panel-actions-bottom\s*\{[\s\S]*justify-content:\s*flex-end;/,
    );
    expect(stylesheet).toMatch(
      /\.audio-waveform\s*\{[\s\S]*min-height:\s*96px;/,
    );
    expect(stylesheet).toMatch(
      /\.audio-recording-monitor\s*\{[\s\S]*background:\s*rgba\(16,\s*33,\s*39,\s*0\.06\);/,
    );
    expect(stylesheet).toMatch(
      /\.audio-recording-dot\s*\{[\s\S]*background:\s*#102127;/,
    );
  });
});
