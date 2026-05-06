import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(__dirname, "../styles.css"),
  "utf8",
);

describe("desktop layout stylesheet", () => {
  it("switches desktop overflow ownership between landing and workspace modes", () => {
    expect(stylesheet).toMatch(/body\s*\{[\s\S]*overflow:\s*hidden;/);
    expect(stylesheet).toMatch(
      /\.app-frame-layout-workspace\s*\{[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;/,
    );
    expect(stylesheet).toMatch(
      /\.app-frame-layout-landing\s*\{[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;/,
    );
    expect(stylesheet).toMatch(
      /\.app-shell-layout-workspace\s*\{[\s\S]*height:\s*calc\(100dvh - 6px\);[\s\S]*overflow:\s*hidden;/,
    );
    expect(stylesheet).toMatch(
      /\.app-shell-layout-landing\s*\{[\s\S]*height:\s*calc\(100dvh - 6px\);[\s\S]*overflow:\s*hidden;/,
    );
    expect(stylesheet).toMatch(
      /\.app-shell-layout-landing\s+\.app-main\s*\{[\s\S]*overflow-y:\s*auto;[\s\S]*overflow-x:\s*hidden;/,
    );
    expect(stylesheet).toMatch(
      /\.app-shell-layout-landing\s+\.app-main\s*\{[\s\S]*scrollbar-width:\s*none;[\s\S]*-ms-overflow-style:\s*none;/,
    );
    expect(stylesheet).toMatch(
      /\.app-shell-layout-landing::-webkit-scrollbar,\s*[\s\S]*\.app-shell-layout-landing\s+\.app-main::-webkit-scrollbar\s*\{[\s\S]*display:\s*none;/,
    );
    expect(stylesheet).toMatch(
      /\.app-shell-layout-landing\s*\{[\s\S]*padding:\s*22px;/,
    );
    expect(stylesheet).toMatch(
      /\.app-shell-layout-landing\s+\.app-content\s*\{[\s\S]*display:\s*block;[\s\S]*overflow:\s*visible;/,
    );
    expect(stylesheet).toMatch(
      /\.app-shell-layout-landing\s+\.app-content\s*>\s*\.landing-panel\s*\{[\s\S]*height:\s*auto;[\s\S]*margin:\s*0\s+auto;[\s\S]*overflow:\s*visible;/,
    );
    expect(stylesheet).toMatch(
      /\.app-shell-layout-landing\s+\.app-sidebar\s*\{[\s\S]*top:\s*22px;[\s\S]*height:\s*calc\(100dvh - 44px\);/,
    );
    expect(stylesheet).toMatch(
      /\.app-shell-layout-workspace\s+\.app-content\s*\{[\s\S]*overflow:\s*hidden;/,
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
