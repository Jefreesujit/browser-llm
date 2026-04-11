import {
  BLOCKED_MODEL_IDS,
  SEARCH_ALLOWLIST,
  VERIFIED_MODEL_IDS,
} from "./models";
import type {
  CompatibilityReport,
  DeviceCapabilities,
  LocalModelVerdictCache,
  ModelDescriptor,
  ParameterTier,
  SearchFilters,
} from "./types";

const PARAMETER_REGEX = /(\d+(?:\.\d+)?)\s*([bm])/i;

const toParameterValue = (rawValue: number, unit: string) =>
  unit.toLowerCase() === "m" ? rawValue / 1000 : rawValue;

export const inferParameterInfo = (...candidates: Array<string | undefined>) => {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const match = candidate.match(PARAMETER_REGEX);
    if (!match) {
      continue;
    }

    const value = Number(match[1]);
    const unit = match[2];
    const parameterValue = toParameterValue(value, unit);
    const paramsLabel = unit.toLowerCase() === "m" ? `${value}M params` : `${value}B params`;

    if (parameterValue <= 0.5) {
      return { parameterTier: "XS" as const, paramsLabel };
    }

    if (parameterValue <= 1) {
      return { parameterTier: "S" as const, paramsLabel };
    }

    if (parameterValue <= 1.7) {
      return { parameterTier: "M" as const, paramsLabel };
    }

    if (parameterValue <= 3) {
      return { parameterTier: "L" as const, paramsLabel };
    }

    return { parameterTier: "XL" as const, paramsLabel };
  }

  return {
    parameterTier: "unknown" as const,
    paramsLabel: "Unknown size",
  };
};

const hasBrowserCompatibilitySignal = (model: ModelDescriptor) =>
  model.source === "curated" ||
  model.hf.tags.includes("transformers.js") ||
  model.hf.libraryName === "transformers.js" ||
  SEARCH_ALLOWLIST.has(model.id);

const isChatCapable = (model: ModelDescriptor) =>
  model.task === "vision" ||
  model.hf.tags.includes("conversational") ||
  Boolean(model.hf.hasChatTemplate) ||
  SEARCH_ALLOWLIST.has(model.id);

const isBlockedByPolicy = (model: ModelDescriptor) =>
  BLOCKED_MODEL_IDS.has(model.id) ||
  (model.source !== "curated" &&
    model.hf.tags.includes("custom_code") &&
    !SEARCH_ALLOWLIST.has(model.id));

const getDefaultVerifiedState = (model: ModelDescriptor) =>
  model.tested && model.parameterTier !== "L";

const getTierLabel = (tier: ParameterTier) => {
  switch (tier) {
    case "XS":
      return "Mobile-safe";
    case "S":
      return "Mobile-safe";
    case "M":
      return "Balanced";
    case "L":
      return "Desktop-only";
    case "XL":
      return "Unsupported";
    default:
      return "Unknown size";
  }
};

export const getCompatibilityReport = (
  model: ModelDescriptor,
  device: DeviceCapabilities,
  localVerdicts: LocalModelVerdictCache,
): CompatibilityReport => {
  const localVerdict = localVerdicts[model.id];

  if (!device.hasWebGpu) {
    return {
      verdict: "unsupported",
      badgeLabel: "Unsupported",
      secondaryLabel: "WebGPU required",
      reason: "This browser does not expose WebGPU here.",
      canLoad: false,
    };
  }

  if (localVerdict?.status === "failed_on_device") {
    return {
      verdict: "unsupported",
      badgeLabel: "Unsupported",
      secondaryLabel: "Unsupported on this device",
      reason: "This model previously failed to load on this device.",
      canLoad: false,
    };
  }

  if (!hasBrowserCompatibilitySignal(model) || isBlockedByPolicy(model)) {
    return {
      verdict: "unsupported",
      badgeLabel: "Unsupported",
      secondaryLabel: "Unsupported in browser",
      reason: "This model does not expose the browser-compatibility signals this app requires.",
      canLoad: false,
    };
  }

  if (!isChatCapable(model)) {
    return {
      verdict: "unsupported",
      badgeLabel: "Unsupported",
      secondaryLabel: "Not chat-ready",
      reason: "This model does not look chat-capable from the available metadata.",
      canLoad: false,
    };
  }

  if (model.parameterTier === "XL") {
    return {
      verdict: "unsupported",
      badgeLabel: "Unsupported",
      secondaryLabel: "Far too large",
      reason: "Models above 3B are blocked in this browser-first experience.",
      canLoad: false,
    };
  }

  if (model.task === "vision" && device.tier === "mobile") {
    return {
      verdict: "too_large",
      badgeLabel: "Likely too large",
      secondaryLabel: "Desktop-only",
      reason: "Curated vision models are kept to desktop in v1.",
      canLoad: false,
    };
  }

  if (device.tier === "mobile" && model.parameterTier === "L") {
    return {
      verdict: "too_large",
      badgeLabel: "Likely too large",
      secondaryLabel: "Desktop-only",
      reason: "This model exceeds the mobile-safe size budget.",
      canLoad: false,
    };
  }

  if (model.parameterTier === "unknown") {
    return {
      verdict: model.source === "curated" ? "likely" : "unsupported",
      badgeLabel: model.source === "curated" ? "Likely works" : "Unsupported",
      secondaryLabel: "Unknown size",
      reason:
        model.source === "curated"
          ? "This curated model is allowed even though its exact size was not inferred."
          : "This search result did not expose enough size metadata to be safely loaded by default.",
      canLoad: model.source === "curated",
    };
  }

  if (model.parameterTier === "L") {
    return {
      verdict: "experimental",
      badgeLabel: "Experimental",
      secondaryLabel: "Desktop-only",
      reason: "This model is within the desktop experimental range only.",
      canLoad: true,
    };
  }

  if (localVerdict?.status === "verified" || getDefaultVerifiedState(model)) {
    return {
      verdict: "verified",
      badgeLabel: "Verified",
      secondaryLabel: getTierLabel(model.parameterTier),
      reason: "This model is part of the supported browser-first set for this device tier.",
      canLoad: true,
    };
  }

  return {
    verdict: "likely",
    badgeLabel: "Likely works",
    secondaryLabel: getTierLabel(model.parameterTier),
    reason: "This model matches the app's compatibility heuristics but is not yet verified on this device.",
    canLoad: true,
  };
};

export const shouldShowSearchModel = (
  model: ModelDescriptor,
  filters: SearchFilters,
  device: DeviceCapabilities,
  localVerdicts: LocalModelVerdictCache,
) => {
  const compatibility = getCompatibilityReport(model, device, localVerdicts);

  if (compatibility.verdict === "unsupported") {
    return false;
  }

  if (compatibility.verdict === "too_large") {
    return false;
  }

  if (!filters.showExperimental && compatibility.verdict === "experimental") {
    return false;
  }

  if (filters.mobileSafe && model.parameterTier === "unknown") {
    return false;
  }

  if (
    filters.verifiedOnly &&
    localVerdicts[model.id]?.status !== "verified" &&
    !VERIFIED_MODEL_IDS.has(model.id)
  ) {
    return false;
  }

  return true;
};
