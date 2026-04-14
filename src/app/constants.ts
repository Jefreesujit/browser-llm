import type { DeviceCapabilities } from "../types";

export const DEFAULT_DEVICE_CAPABILITIES: DeviceCapabilities = {
  hasWebGpu: false,
  supportsFp16: false,
  tier: "desktop",
  browserLabel: "Your browser",
  userAgent: "",
};

export const THREAD_FLUSH_DEBOUNCE_MS = 800;
export const UI_STATE_FLUSH_DEBOUNCE_MS = 250;
export const AUTO_SCROLL_BOTTOM_THRESHOLD = 48;
export const SCROLL_STATE_DEBOUNCE_MS = 120;
