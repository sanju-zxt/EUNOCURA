import { motion } from "framer-motion";
import { Activity, FileText, Share2, Calendar, User, Clock } from "lucide-react";
import React from "react";

interface DashboardHeaderProps {
    patientName: string;
    lastUpdated: string;
    onExportClick?: () => void;
}

export function DashboardHeader({ patientName, lastUpdated, onExportClick }: DashboardHeaderProps) {
    // Both parts are optional in practice: the dashboard route passes an empty
    // string when the record has no name or no timestamp, and "· updated" with
    // nothing after it is worse than saying nothing.
    const hasName = typeof patientName === "string" && patientName.trim().length > 0;
    const hasUpdated = typeof lastUpdated === "string" && lastUpdated.trim().length > 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative bg-card rounded-2xl shadow-sm border border-border/40 p-4 mb-6 md:p-5 md:mb-8 overflow-hidden group"
        >
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none transition-opacity duration-500 group-hover:opacity-75" />
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 md:gap-6">
                <div className="flex min-w-0 items-center gap-3 md:gap-5">
                    <motion.div
                        whileHover={{ scale: 1.05, rotate: 5 }}
                        className="w-14 h-14 md:w-16 md:h-16 shrink-0 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 flex items-center justify-center shadow-inner"
                    >
                        <Activity className="w-7 h-7 md:w-8 md:h-8 text-primary" aria-hidden="true" />
                    </motion.div>

                    <div className="min-w-0 flex-1 space-y-1 md:space-y-1.5">
                        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground break-words">
                            Diagnosis Dashboard
                        </h1>
                        {(hasName || hasUpdated) && (
                            <p className="text-xs sm:text-sm text-muted-foreground break-words">
                                {hasName ? patientName : ""}
                                {hasName && hasUpdated ? " · " : ""}
                                {hasUpdated ? `updated ${lastUpdated}` : ""}
                            </p>
                        )}
                    </div>
                </div>

                {/* Three targets in one row do not fit a 360px card, so the row
                    wraps instead of shrinking the labels; each button keeps the
                    44px minimum height from `.tap`. */}
                <div className="flex flex-wrap gap-2 md:gap-3">
                    <ActionButton icon={FileText} label="Export PDF" variant="primary" onClick={onExportClick} />
                    <ActionButton icon={Share2} label="Share" variant="secondary" />
                    <ActionButton icon={Calendar} label="Follow-up" variant="secondary" />
                </div>
            </div>
        </motion.div>
    );
}

function ActionButton({ icon: Icon, label, variant, onClick }: { icon: any, label: string, variant: 'primary' | 'secondary', onClick?: () => void }) {
    return (
        <motion.button
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={`
        tap md:min-h-0 md:py-2.5 inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 md:px-4 font-medium text-sm transition-all shadow-sm
        ${variant === 'primary'
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20'
                    : 'bg-card border border-border hover:bg-muted/50 text-foreground'}
      `}
        >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            {label}
        </motion.button>
    );
}
