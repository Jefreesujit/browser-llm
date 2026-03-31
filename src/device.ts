import type { DeviceCapabilities, DeviceTier } from "./types";

const isLikelyMobile = (userAgent: string) => {
  if (/android|iphone|ipad|ipod|mobile/i.test(userAgent)) {
    return true;
  }

  if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 1) {
    return window.innerWidth <= 900;
  }

  return window.innerWidth <= 720;
};

const getBrowserLabel = (userAgent: string) => {
  if (/edg\//i.test(userAgent)) {
    return "Edge";
  }

  if (/chrome\//i.test(userAgent)) {
    return "Chrome";
  }

  if (/safari\//i.test(userAgent)) {
    return "Safari";
  }

  if (/firefox\//i.test(userAgent)) {
    return "Firefox";
  }

  return "Your browser";
};

export const getDeviceTier = (userAgent: string): DeviceTier =>
  isLikelyMobile(userAgent) ? "mobile" : "desktop";

export const detectDeviceCapabilities = async (): Promise<DeviceCapabilities> => {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const browserLabel = getBrowserLabel(userAgent);
  const hasWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  let supportsFp16 = false;

  if (hasWebGpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      supportsFp16 = Boolean(adapter?.features?.has("shader-f16"));
    } catch {
      supportsFp16 = false;
    }
  }

  return {
    hasWebGpu,
    supportsFp16,
    tier: getDeviceTier(userAgent),
    browserLabel,
    userAgent,
  };
};

export const getDeviceSummary = (capabilities: DeviceCapabilities) => {
  if (!capabilities.hasWebGpu) {
    return `${capabilities.browserLabel} does not expose WebGPU here, so model loading is disabled.`;
  }

  if (capabilities.tier === "mobile") {
    return capabilities.supportsFp16
      ? `${capabilities.browserLabel} looks mobile-capable with WebGPU and fp16 support.`
      : `${capabilities.browserLabel} looks mobile-capable with WebGPU; smaller q4 models are safest.`;
  }

  return capabilities.supportsFp16
    ? `${capabilities.browserLabel} looks desktop-capable with WebGPU and fp16 support.`
    : `${capabilities.browserLabel} looks desktop-capable with WebGPU; q4 fallbacks may be used.`;
};
