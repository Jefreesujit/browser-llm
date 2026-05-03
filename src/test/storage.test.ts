import { afterEach, describe, expect, it } from "vitest";

import {
  deriveStorageFeedback,
  getDefaultStorageMessage,
  loadLastAudioView,
  loadLastWorkspace,
  saveLastAudioView,
  saveLastWorkspace,
} from "../storage";

afterEach(() => {
  window.localStorage.clear();
});

describe("storage feedback helpers", () => {
  it("reports localStorage fallback when writes succeed on fallback storage", () => {
    expect(deriveStorageFeedback([{ ok: true }], "localstorage")).toEqual({
      status: "fallback_local_storage",
      warning: getDefaultStorageMessage("fallback_local_storage"),
    });
  });

  it("reports quota failures distinctly", () => {
    expect(
      deriveStorageFeedback([{ ok: false, reason: "quota" }], "indexeddb"),
    ).toEqual({
      status: "quota_exceeded",
      warning:
        "Browser storage is full. Delete some chats or downloaded models.",
    });
  });

  it("surfaces blocked storage sessions", () => {
    expect(
      deriveStorageFeedback([{ ok: false, reason: "blocked" }], "indexeddb"),
    ).toEqual({
      status: "unavailable",
      warning: "Browser storage is blocked in this session.",
    });
  });

  it("persists the last audio view independently", () => {
    saveLastAudioView("speak");
    expect(loadLastAudioView()).toBe("speak");
  });

  it("falls back to the legacy audio tab when no audio view is stored", () => {
    window.localStorage.setItem(
      "webllm:last-audio-tab",
      JSON.stringify("speak"),
    );
    expect(loadLastAudioView()).toBe("speak");
  });

  it("restores the last workspace after refresh", () => {
    saveLastWorkspace("audio");
    expect(loadLastWorkspace()).toBe("audio");
  });
});
