import { motion } from "framer-motion";
import { ArrowRight, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, RefreshCcw } from "lucide-react";
import React from "react";

interface Metric {
    name: string;
    baseline: number;
    current: number;
    unit: string;
    target: number;
    better: "lower" | "higher";
    icon: string;
    is_prediction?: boolean;
}

interface ProgressComparisonProps {
    metrics: Metric[];
}

type Comparison = {
    change: number | null;
    percentChange: number | null;
    isImproving: boolean;
    comparable: boolean;
};

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

// Two decimals is enough for a lab value and stops 118.4 - 142 from printing as
// 23.599999999999994. The sign is added by the caller, never by the number.
const round2 = (value: number) => Number(value.toFixed(2));

export function ProgressComparison({ metrics }: ProgressComparisonProps) {
    // The dashboard and the diagnosis page already gate on `length > 0`, but a
    // component that renders an empty card beats one that dies on `.map`.
    const list = Array.isArray(metrics) ? metrics : [];

    const calculateImprovement = (metric: Metric): Comparison => {
        if (!isFiniteNumber(metric.baseline) || !isFiniteNumber(metric.current)) {
            return { change: null, percentChange: null, isImproving: false, comparable: false };
        }
        const change = round2(metric.current - metric.baseline);
        // A baseline of 0 has no percentage change; saying so is better than
        // printing Infinity or NaN.
        const percentChange =
            metric.baseline === 0 ? null : round2(Math.abs((change / metric.baseline) * 100));
        const isImproving =
            metric.better === "lower" ? change < 0 : change > 0;
        return { change, percentChange, isImproving, comparable: true };
    };

    const withUnit = (value: number, unit: string) =>
        unit ? `${value} ${unit}` : `${value}`;

    // A field that is absent or not a number is said out loud rather than
    // rendered as "undefined mg/dL".
    const showReading = (value: unknown, unit: string) =>
        isFiniteNumber(value) ? withUnit(value, unit) : "not recorded";

    const withSign = (value: number) =>
        value > 0 ? `+${value}` : value < 0 ? `-${Math.abs(value)}` : "0";

    if (list.length === 0) {
        return (
            <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-4 md:p-6">
                <p className="text-sm text-muted-foreground">
                    No progress metrics were recorded for this visit, so there is no baseline to compare against.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {list.map((metric, idx) => {
                const { change, percentChange, isImproving, comparable } = calculateImprovement(metric);
                const isStable = comparable && Math.abs(change ?? 0) < 0.1;

                // The chip is the headline delta: a signed percentage when the
                // baseline allows one, otherwise the signed absolute change with
                // its unit. Never an unsigned number, never a bare "%".
                const signedPercent =
                    percentChange === null
                        ? null
                        : change === 0
                            ? "0%"
                            : `${(change ?? 0) > 0 ? "+" : "-"}${percentChange.toFixed(0)}%`;

                const deltaLabel = !comparable
                    ? "n/a"
                    : signedPercent ?? `${withSign(change ?? 0)} ${metric.unit}`.trim();

                const changeLine = !comparable
                    ? "Not comparable — the baseline or the current reading is missing."
                    : `${withSign(change ?? 0)} ${metric.unit}`.trim() +
                      (signedPercent === null
                          ? " (no percentage from a baseline of 0)"
                          : ` (${signedPercent} from baseline)`);

                return (
                    <motion.div
                        key={metric.name}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className={`bg-card rounded-2xl shadow-sm border p-4 md:p-6 transition-colors min-w-0 ${
                            metric.is_prediction
                            ? "border-primary/30 bg-primary/5 border-dashed"
                            : "border-border/50 hover:bg-muted/30"
                        }`}
                    >
                            {/* Metric header */}
                            <div className="flex flex-wrap justify-between items-start gap-2 mb-3 md:mb-4">
                                <div className="flex items-start gap-2 md:gap-3 min-w-0">
                                    <div className="text-xl md:text-2xl shrink-0" aria-hidden="true">{metric.icon}</div>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                                            <h4 className="font-semibold text-foreground break-words min-w-0">{metric.name}</h4>
                                            {metric.is_prediction && (
                                                <span className="shrink-0 whitespace-nowrap text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter">
                                                    Projected
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground break-words">
                                            Target: {showReading(metric.target, metric.unit)}
                                        </p>
                                    </div>
                                </div>

                                {/* Signed, so "improved" and "worsened" never read
                                    the same. Units live on the change line. */}
                                <div className={`shrink-0 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs font-bold border ${!comparable
                                        ? "bg-muted text-muted-foreground border-border"
                                        : isImproving
                                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-200"
                                            : isStable
                                                ? "bg-blue-500/10 text-blue-600 border-blue-200"
                                                : "bg-rose-500/10 text-rose-600 border-rose-200"
                                    }`}>
                                    {comparable && (isImproving
                                        ? <TrendingUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                        : <TrendingDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />)}
                                    <span className="whitespace-nowrap">{deltaLabel}</span>
                                </div>
                            </div>

                            {/* Baseline and current stack as labelled rows on a
                                phone and sit side by side from md up. */}
                            <div className="flex flex-col md:flex-row md:items-stretch gap-2 md:gap-3">
                                {/* Baseline */}
                                <div className="flex-1 min-w-0 flex flex-col gap-1">
                                    <span className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">Baseline</span>
                                    <div className="min-h-[2.5rem] rounded-lg bg-muted flex flex-wrap items-center gap-2 px-3 py-2 text-sm md:text-base text-muted-foreground font-mono font-medium relative overflow-hidden">
                                        <span className="min-w-0 break-words leading-snug">{showReading(metric.baseline, metric.unit)}</span>
                                    </div>
                                </div>

                                {/* Arrow: points down when the rows stack */}
                                <div className="self-center shrink-0 text-muted-foreground">
                                    <ArrowRight className="w-4 h-4 rotate-90 md:rotate-0" aria-hidden="true" />
                                </div>

                                {/* Current */}
                                <div className="flex-1 min-w-0 flex flex-col gap-1">
                                    <span className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">
                                        {metric.is_prediction ? "Predicted" : "Current"}
                                    </span>
                                    <div className={`min-h-[2.5rem] rounded-lg flex items-center px-3 py-2 text-sm md:text-base font-mono font-bold relative overflow-hidden transition-all group-hover:shadow-md ${
                                        metric.is_prediction
                                        ? "bg-primary text-primary-foreground"
                                        : isImproving ? "bg-emerald-500 text-emerald-950" : "bg-rose-500 text-rose-950"
                                        }`}>
                                        <div className="relative z-10 flex flex-wrap items-center gap-2 min-w-0">
                                            <span className="min-w-0 break-words leading-snug">{showReading(metric.current, metric.unit)}</span>
                                            {metric.is_prediction ? (
                                                <RefreshCcw className="w-3 h-3 shrink-0 animate-spin-slow" aria-hidden="true" />
                                            ) : (
                                                isImproving
                                                    ? <ArrowDownRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                                                    : <ArrowUpRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                                            )}
                                        </div>
                                        {/* Shimmer effect */}
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] animate-[shimmer_2s_infinite]" aria-hidden="true" />
                                    </div>
                                </div>
                            </div>

                            {/* The delta in full: sign, magnitude, unit. */}
                            <p className="mt-3 text-xs text-muted-foreground break-words">
                                {changeLine}
                                {metric.is_prediction && " Projected value, not a measured reading."}
                            </p>
                    </motion.div>
                );
            })}
        </div>
    );
}
