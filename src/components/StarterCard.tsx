import type { ModelDescriptor } from "../types";

type StarterCardProps = {
  model: ModelDescriptor;
  onLoad: (model: ModelDescriptor) => void;
  disabled?: boolean;
  loading?: boolean;
};

const getStarterMeta = (model: ModelDescriptor) => {
  if (model.category === "coding") {
    return "Coding";
  }

  if (model.category === "reasoning") {
    return "Reasoning";
  }

  if (model.task === "vision") {
    return "Vision";
  }

  if (model.category === "balanced") {
    return "Balanced";
  }

  return "Fast start";
};

function StarterCard({ model, onLoad, disabled = false, loading = false }: StarterCardProps) {
  return (
    <article className="starter-card">
      <div className="starter-card-copy">
        <p className="model-card-eyebrow">{model.publisher}</p>
        <h3>{model.label}</h3>
        <p className="starter-card-summary">{model.summary}</p>
      </div>
      <p className="starter-card-meta">
        {model.paramsLabel} · {getStarterMeta(model)}
      </p>
      <button
        className="primary-button starter-card-button"
        type="button"
        onClick={() => onLoad(model)}
        disabled={disabled}
      >
        {loading ? "Loading..." : "Load Model"}
      </button>
    </article>
  );
}

export default StarterCard;
