import type { Stage } from "../types";

interface Props {
  stage: Stage;
}

const STAGES: Array<{ key: Stage; label: string }> = [
  { key: "embedding", label: "Embedding" },
  { key: "retrieving", label: "Retrieving" },
  { key: "generating", label: "Generating" },
];

function Spinner() {
  return (
    <span className="inline-block w-3 h-3 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
  );
}

export function StageIndicator({ stage }: Props) {
  if (stage === "idle" || stage === "done" || stage === "error") return null;

  const activeIndex = STAGES.findIndex((s) => s.key === stage);

  return (
    <div className="flex items-center gap-2 text-sm font-mono">
      {STAGES.map((s, i) => {
        const isActive = i === activeIndex;
        const isDone = i < activeIndex;

        return (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-px w-6 transition-colors duration-300 ${
                  isDone ? "bg-emerald-500" : "bg-zinc-700"
                }`}
              />
            )}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all duration-300 ${
                isActive
                  ? "border-sky-500 text-sky-300 bg-sky-950"
                  : isDone
                  ? "border-emerald-600 text-emerald-400 bg-emerald-950"
                  : "border-zinc-700 text-zinc-600"
              }`}
            >
              {isActive && <Spinner />}
              {isDone && (
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              <span>{s.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
