import { Badge, cn } from "./ui";

type TimelineStep = {
  label: string;
  time: string;
  tone: "neutral" | "primary" | "success" | "warning" | "danger";
};

export function StatusTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <div key={step.label} className="flex items-stretch gap-3">
            {/* Timeline node & connector track */}
            <div className="flex flex-col items-center w-5">
              <div className="my-auto flex items-center justify-center">
                <span
                  className={cn(
                    "h-3 w-3 rounded-full transition-all shrink-0",
                    step.tone === "success"
                      ? "bg-emerald-500 ring-4 ring-emerald-500/20"
                      : step.tone === "warning" || step.tone === "primary"
                        ? "bg-amber-500 ring-4 ring-amber-500/25 animate-pulse"
                        : step.tone === "danger"
                          ? "bg-rose-500 ring-4 ring-rose-500/20"
                          : "bg-slate-300 ring-2 ring-slate-100",
                  )}
                />
              </div>
              {!isLast && (
                <div className="w-0.5 flex-1 bg-slate-200 min-h-[14px]" />
              )}
            </div>

            {/* Card Content */}
            <div
              className={cn(
                "flex-1 rounded-2xl border px-4 py-3 transition-colors mb-3",
                step.tone === "success"
                  ? "border-emerald-200/70 bg-emerald-50/30"
                  : step.tone === "warning" || step.tone === "primary"
                    ? "border-amber-300/80 bg-amber-50/50 shadow-2xs"
                    : "border-black/5 bg-slate-50/70",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  className={cn(
                    "text-xs sm:text-sm font-semibold",
                    step.tone === "neutral" ? "text-slate-500" : "text-slate-900",
                  )}
                >
                  {step.label}
                </p>
                <Badge tone={step.tone}>{step.time}</Badge>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

