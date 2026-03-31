import type { CompatibilityReport, ModelDescriptor } from "../types";
import CompatibilityBadge from "./CompatibilityBadge";

type ModelCardProps = {
  model: ModelDescriptor;
  compatibility: CompatibilityReport;
  onLoad: (model: ModelDescriptor) => void;
  disabled?: boolean;
  loading?: boolean;
};

const getModelMetaLabel = (model: ModelDescriptor) => {
  if (model.category === "coding") {
    return "Coding";
  }

  if (model.category === "reasoning") {
    return "Reasoning";
  }

  if (model.task === "vision") {
    return "Vision";
  }

  if (model.category === "desktop_experimental") {
    return "Experimental";
  }

  if (model.category === "balanced") {
    return "Balanced";
  }

  return "General";
};

function ModelCard({ model, compatibility, onLoad, disabled = false, loading = false }: ModelCardProps) {
  return (
    <article className="model-card">
      <div className="model-card-header">
        <div className="model-card-heading">
          <p className="model-card-eyebrow">{model.publisher}</p>
          <h3>{model.label}</h3>
        </div>
        <CompatibilityBadge compatibility={compatibility} compact />
      </div>
      <p className="model-card-summary">{model.summary}</p>
      <div className="model-card-details">
        <p className="model-card-meta-line">
          {model.paramsLabel} · {getModelMetaLabel(model)}
        </p>
        {model.estimatedDownloadLabel && (
          <p className="model-card-footnote">{model.estimatedDownloadLabel}</p>
        )}
      </div>
      <button
        className="primary-button model-card-button"
        type="button"
        onClick={() => onLoad(model)}
        disabled={disabled || !compatibility.canLoad}
      >
        {loading ? "Loading..." : "Load Model"}
      </button>
    </article>
  );
}

export default ModelCard;
