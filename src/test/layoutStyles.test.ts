import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(__dirname, "../styles.css"),
  "utf8",
);

describe("desktop layout stylesheet", () => {
  it("locks the desktop page and app shell while keeping chat panes scrollable", () => {
    expect(stylesheet).toMatch(/body\s*\{[\s\S]*overflow:\s*hidden;/);
    expect(stylesheet).toMatch(
      /\.app-frame\s*\{[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;/,
    );
    expect(stylesheet).toMatch(
      /\.app-content\s*\{[\s\S]*overflow:\s*hidden;/,
    );
    expect(stylesheet).toMatch(
      /\.chat-history-list\s*\{[\s\S]*overflow-y:\s*auto;/,
    );
    expect(stylesheet).toMatch(
      /\.chat-log\s*\{[\s\S]*overflow-y:\s*auto;/,
    );
    expect(stylesheet).toMatch(
      /\.composer\s*\{[\s\S]*position:\s*relative;/,
    );
  });
});
