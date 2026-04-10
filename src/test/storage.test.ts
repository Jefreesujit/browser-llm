import { describe, expect, it } from "vitest";

import { deriveStorageFeedback, getDefaultStorageMessage } from "../storage";

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
});
