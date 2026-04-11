import type { CompatibilityReport } from "../types";

type CompatibilityBadgeProps = {
  compatibility: CompatibilityReport;
  compact?: boolean;
};

const getVerdictClassName = (verdict: CompatibilityReport["verdict"]) => {
  switch (verdict) {
    case "verified":
      return "compatibility-verified";
    case "likely":
      return "compatibility-likely";
    case "experimental":
      return "compatibility-experimental";
    case "too_large":
      return "compatibility-too-large";
    case "unsupported":
      return "compatibility-unsupported";
  }
};

function CompatibilityBadge({ compatibility, compact = false }: CompatibilityBadgeProps) {
  return (
    <span className={`compatibility-badge ${getVerdictClassName(compatibility.verdict)}`}>
      <span>{compatibility.badgeLabel}</span>
      {!compact && compatibility.secondaryLabel && (
        <span className="compatibility-note">{compatibility.secondaryLabel}</span>
      )}
    </span>
  );
}

export default CompatibilityBadge;
