import { motion } from "framer-motion";
import { AlertTriangle, ShieldCheck, AlertOctagon } from "lucide-react";
import React from "react";

interface RiskScore {
    name: string;
    value: number;
    max: number;
    interpretation: string;
}

interface RiskScoreVisualProps {
    scores: RiskScore[];
}

export function RiskScoreVisual({ scores }: RiskScoreVisualProps) {
    const getRiskLevel = (percentage: number) => {
        if (percentage < 33) return { color: "text-emerald-500", bg: "bg-emerald-500", label: "Low Risk", icon: ShieldCheck };
        if (percentage < 66) return { color: "text-amber-500", bg: "bg-amber-500", label: "Moderate Risk", icon: AlertTriangle };
        return { color: "text-rose-500", bg: "bg-rose-500", label: "High Risk", icon: AlertOctagon };
    };

    // The dashboard already passes `|| []`, but a component that renders an
    // empty card is better than one that throws on `.map`.
    const list = Array.isArray(scores) ? scores : [];

    if (list.length === 0) {
        return (
            <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-4 md:p-6">
                <p className="text-sm text-muted-foreground">No risk scores available.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            {list.map((risk, idx) => {
                // A zero or non-numeric `max` would divide by zero; the bar then
                // stays empty instead of rendering `width: NaN%`.
                const percentage =
                    Number.isFinite(risk.value) && Number.isFinite(risk.max) && risk.max > 0
                        ? (risk.value / risk.max) * 100
                        : 0;
                const barPercent = Math.max(0, Math.min(100, percentage));
                const level = getRiskLevel(percentage);
                const Icon = level.icon;

                return (
                    <motion.div
                        key={risk.name}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-card rounded-2xl shadow-sm border border-border/50 p-4 md:p-6 min-w-0"
                    >
                        <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1 mb-3">
                            <div className="min-w-0 flex flex-col gap-1">
                                <span className="font-semibold text-foreground text-base md:text-lg break-words">
                                    {risk.name}
                                </span>
                                <div className="min-w-0 flex items-start gap-2">
                                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${level.color}`} aria-hidden="true" />
                                    <span className={`min-w-0 text-sm font-medium break-words leading-snug ${level.color}`}>
                                        {risk.interpretation}
                                    </span>
                                </div>
                            </div>
                            {/* The reading and its scale stay on one line so the
                                unit is never separated from the number. */}
                            <div className="shrink-0 text-right whitespace-nowrap">
                                <span className="text-xl md:text-2xl font-bold text-foreground font-mono">
                                    {risk.value}
                                </span>
                                <span className="text-muted-foreground text-sm font-medium ml-1">
                                    / {risk.max}
                                </span>
                            </div>
                        </div>

                        {/* Progress Bar Container */}
                        <div className="h-4 bg-secondary/50 rounded-full overflow-hidden relative">
                            {/* Background segments for texture */}
                            <div className="absolute inset-0 flex gap-1">
                                {Array.from({ length: 20 }).map((_, i) => (
                                    <div key={i} className="flex-1 border-r border-card/30 last:border-0" />
                                ))}
                            </div>

                            {/* Active Progress */}
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${barPercent}%` }}
                                transition={{ duration: 1.2, ease: "easeOut", delay: idx * 0.2 }}
                                className={`h-full ${level.bg} relative`}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                            </motion.div>
                        </div>

                        {/* Scale Labels */}
                        <div className="flex justify-between gap-2 mt-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                            <span>Low</span>
                            <span>Moderate</span>
                            <span>High</span>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}
