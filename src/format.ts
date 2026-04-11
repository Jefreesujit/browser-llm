export const formatBytes = (value: number | null | undefined) => {
  if (!value || Number.isNaN(value)) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unitIndex]}`;
};

export const formatCount = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
};
