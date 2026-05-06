import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AppLayout from "../components/AppLayout";

describe("AppLayout", () => {
  it("applies landing layout mode classes to the shared shell", () => {
    const { container } = render(
      <AppLayout
        workspace="chat"
        layoutMode="landing"
        settingsActive={false}
        dataActive={false}
        progressClassName="panel-progress"
        progressWidth="100%"
        githubUrl="https://example.com"
        onSelectWorkspace={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenData={vi.fn()}
      >
        <section>Child</section>
      </AppLayout>,
    );

    expect(container.querySelector(".app-frame-layout-landing")).toBeInTheDocument();
    expect(container.querySelector(".app-shell-layout-landing")).toBeInTheDocument();
  });

  it("applies workspace layout mode classes to the shared shell", () => {
    const { container } = render(
      <AppLayout
        workspace="audio"
        layoutMode="workspace"
        settingsActive={false}
        dataActive={false}
        progressClassName="panel-progress"
        progressWidth="100%"
        githubUrl="https://example.com"
        onSelectWorkspace={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenData={vi.fn()}
      >
        <section>Child</section>
      </AppLayout>,
    );

    expect(container.querySelector(".app-frame-layout-workspace")).toBeInTheDocument();
    expect(container.querySelector(".app-shell-layout-workspace")).toBeInTheDocument();
  });
});
