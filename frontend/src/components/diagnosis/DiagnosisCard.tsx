import { motion } from "framer-motion";
import { ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import React from "react";

interface EvidencePoint {
    appointment: string;
    date: string;
    value: string;
    change: "better" | "same" | "worse";
}

interface DiagnosisCardProps {
    diagnosis: {
        condition: string;
        icd_code: string;
        confidence: number;
        status: "improving" | "stable" | "worsening";
        evidenceChain: EvidencePoint[];
    };
}

const RING_RADIUS = 48;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function DiagnosisCard({ diagnosis }: DiagnosisCardProps) {
    // A confidence that is missing or not a number is shown as an em dash rather
    // than "NaN%"; nothing is substituted for it.
    const confidence =
        typeof diagnosis?.confidence === "number" && Number.isFinite(diagnosis.confidence)
            ? diagnosis.confidence
            : null;
    const confidencePercent = confidence === null ? null : Math.round(confidence * 100);
    const strokeDashoffset =
        confidence === null ? RING_CIRCUMFERENCE : RING_CIRCUMFERENCE - confidence * RING_CIRCUMFERENCE;

    const statusConfig = {
        improving: {
            icon: TrendingUp,
            label: "Improving",
            class: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
        },
        stable: {
            icon: Minus,
            label: "Stable",
            class: "bg-blue-500/10 text-blue-600 border-blue-500/20"
        },
        worsening: {
            icon: TrendingDown,
            label: "Worsening",
            class: "bg-rose-500/10 text-rose-600 border-rose-500/20"
        },
    };

    // An unrecognised status renders no pill rather than a guessed one.
    const status = statusConfig[diagnosis.status] ?? null;
    const StatusIcon = status?.icon ?? null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-2xl shadow-sm border border-border/50 px-4 py-4 md:px-10 md:py-6 overflow-hidden relative"
        >
            <div className="absolute top-0 left-0 w-1 h-full bg-primary" />

            <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center gap-4 md:gap-6">
                <div className="min-w-0 flex-1 space-y-3">
                    <div className="min-w-0 space-y-1">
                        <h2 className="text-xl md:text-3xl font-bold text-foreground break-words">
                            {diagnosis.condition}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 md:gap-3">
                            <span className="max-w-full shrink-0 px-2.5 py-0.5 rounded-md bg-muted text-muted-foreground text-xs font-mono font-medium border border-border break-words">
                                ICD-10: {diagnosis.icd_code}
                            </span>
                            {StatusIcon && status && (
                                <div className={`flex shrink-0 items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap ${status.class}`}>
                                    <StatusIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                    {status.label}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Confidence Ring with Gradients. The viewBox lets the ring scale
                    down on a phone instead of clipping: at 128px the user-space
                    unit is 1px, so the desktop rendering is unchanged. */}
                <div className="relative shrink-0 self-center md:self-auto flex items-center justify-center">
                    <svg className="w-28 h-28 md:w-32 md:h-32 -rotate-90" viewBox="0 0 128 128">
                        <defs>
                            <linearGradient id="confidenceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="hsl(var(--primary))" />
                                <stop offset="100%" stopColor="hsl(var(--primary) / 0.5)" />
                            </linearGradient>
                        </defs>
                        <circle
                            cx="60"
                            cy="64"
                            r="48"
                            fill="none"
                            strokeWidth="8"
                            className="stroke-muted/20"
                        />
                        <motion.circle
                            cx="60"
                            cy="64"
                            r="48"
                            fill="none"
                            strokeWidth="8"
                            strokeLinecap="round"
                            stroke="url(#confidenceGradient)"
                            initial={{ strokeDashoffset: RING_CIRCUMFERENCE }}
                            animate={{ strokeDashoffset }}
                            transition={{ duration: 1.5, ease: "easeOut" }}
                            style={{ strokeDasharray: RING_CIRCUMFERENCE }}
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl md:text-2xl font-bold text-foreground whitespace-nowrap">
                            {confidencePercent === null ? "—" : `${confidencePercent}%`}
                        </span>
                        <span className="text-[10px] md:text-[11px] font-medium text-muted-foreground uppercase tracking-wide md:tracking-wider whitespace-nowrap">
                            Confidence
                        </span>
                    </div>
                </div>
            </div>

            {/* Evidence Timeline */}
            {/* <div className="bg-muted/30 rounded-xl p-5 border border-border/50">
                <h4 className="text-sm font-semibold text-muted-foreground mb-6 uppercase tracking-wider flex items-center gap-2">
                    Documentation Trail
                </h4>
                <div className="relative">
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border/60 -translate-y-1/2" />

                    <div className="flex justify-between items-center relative z-10 px-20">
                        {diagnosis.evidenceChain.map((point, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.15 }}
                                className="group relative"
                            >
                                <div className="flex flex-col items-center">
                                    <motion.div
                                        whileHover={{ scale: 1.15 }}
                                        className={`w-4 h-4 rounded-full border-2 border-card shadow-sm z-10 transition-colors duration-300 ${point.change === "better"
                                            ? "bg-emerald-500"
                                            : point.change === "same"
                                                ? "bg-blue-500"
                                                : "bg-rose-500"
                                            }`}
                                    />

                                    <div className="absolute top-8 left-1/2 -translate-x-1/2 w-max max-w-[140px] text-center pt-2 opacity-100 transition-all">
                                        <div className="text-xs font-semibold text-foreground mb-0.5">
                                            {point.value}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground bg-card/80 px-1.5 py-0.5 rounded border border-border/50 backdrop-blur-sm">
                                            {point.date}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                <div className="mt-24 text-center">
                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        className="text-primary text-sm font-medium hover:text-primary/80 inline-flex items-center gap-1 transition-colors"
                    >
                        View Full Evidence Graph <ArrowRight className="w-3.5 h-3.5" />
                    </motion.button>
                </div>
            </div> */}
        </motion.div>
    );
}
