import type { ModelDescriptor } from "../../types";

export const formatContextWindow = (tokens: number) => {
  if (tokens >= 1000) {
    const value = tokens / 1000;
    return Number.isInteger(value)
      ? `${value}K tokens`
      : `${value.toFixed(1)}K tokens`;
  }

  return `${tokens} tokens`;
};

export const getModelFlags = (model: ModelDescriptor) => {
  const flags = [model.compatibility?.badgeLabel ?? "Browser-ready"];

  if (model.task === "vision") {
    flags.push("Image support");
  } else {
    flags.push("Text chat");
  }

  if (model.category === "coding") {
    flags.push("Coding");
  }

  if (model.category === "reasoning") {
    flags.push("Reasoning");
  }

  if (
    model.category === "desktop_experimental" ||
    model.compatibility?.verdict === "experimental"
  ) {
    flags.push("Experimental");
  }

  return flags;
};

export const getStarterPrompts = (model: ModelDescriptor) => {
  if (model.task === "vision") {
    return [
      "Describe the image and summarize the key details.",
      "Extract the main text and explain what it means.",
      "What stands out in this image and why?",
    ];
  }

  if (model.category === "coding") {
    return [
      "Write a small utility function and explain it.",
      "Review this bug and suggest the fix.",
      "Refactor this code for readability.",
      "Explain how this code works step by step.",
    ];
  }

  if (model.category === "reasoning") {
    return [
      "Compare two options and recommend one.",
      "Break this problem into clear steps.",
      "Give me the tradeoffs behind this decision.",
      "Help me think through the risks here.",
    ];
  }

  return [
    "Summarize a topic clearly for me.",
    "Help me draft a message or email.",
    "Explain a concept in simple terms.",
    "Give me a quick plan for this task.",
  ];
};
