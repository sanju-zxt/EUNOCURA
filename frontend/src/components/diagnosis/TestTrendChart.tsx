import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceArea,
    ReferenceLine,
    Label,
} from "recharts";
import { motion } from "framer-motion";
import { Activity, ArrowRight } from "lucide-react";
import React from "react";
import useIsMobile from "../mobile/useIsMobile";

interface DataPoint {
    date: string;
    value: number;
    appointmentNumber: number;
    is_prediction?: boolean;
}

interface TestTrendChartProps {
    testName: string;
    unit: string;
    normalRange?: [number, number] | [];
    data: DataPoint[];
}

export function TestTrendChart({
    testName,
    unit,
    normalRange = [],
    data,
}: TestTrendChartProps) {
    // Only the axis/font decisions that CSS cannot express: recharts takes tick
    // sizes and tick counts as numbers, not as classes.
    const isMobile = useIsMobile();

    // `data` arrives from two callers; a component that plots nothing is better
    // than one that throws on `.map`.
    const points = Array.isArray(data) ? data : [];

    // A malformed date must not become the string "Invalid Date" on an axis.
    const formatDate = (raw: string) => {
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return raw || "—";
        return parsed.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        });
    };

    const chartData = points.map((point, idx) => ({
        ...point,
        isBaseline: idx === 0,
        formattedDate: formatDate(point.date),
    }));

    const hasNormalRange = normalRange && normalRange.length === 2 &&
        typeof normalRange[0] === 'number' && typeof normalRange[1] === 'number';

    const isAbnormal = (value: number) => {
        if (!hasNormalRange) return false;
        return value < normalRange[0]! || value > normalRange[1]!;
    };

    // The unit travels with the number everywhere it is shown, so a bare "142"
    // is never left without its scale. A missing value is said out loud rather
    // than rendered as "undefined mg/dL".
    const withUnit = (value: number) => {
        if (!Number.isFinite(value)) return "not recorded";
        return unit ? `${value} ${unit}` : `${value}`;
    };

    const rangeText = hasNormalRange
        ? `${normalRange[0]} - ${normalRange[1]}`
        : "N/A";

    // Fewer than two readings is "no trend", not "stable" — the badge would be
    // a claim the data does not support.
    const trend =
        points.length >= 2
            ? points[points.length - 1].value < points[0].value
                ? "decreasing"
                : points[points.length - 1].value > points[0].value
                    ? "increasing"
                    : "stable"
            : null;

    const predictionStartIndex = points.findIndex(p => p.is_prediction);
    const predictionStartPoint = predictionStartIndex !== -1 ? chartData[predictionStartIndex] : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-2xl shadow-sm border border-border/50 p-4 sm:p-6 flex flex-col min-w-0"
        >
            <div className="flex flex-wrap justify-between items-start gap-2 mb-4 sm:mb-6">
                <div className="min-w-0">
                    <h3 className="text-lg font-bold text-foreground flex items-start gap-2 min-w-0">
                        <Activity className="w-4 h-4 text-primary shrink-0 mt-1" aria-hidden="true" />
                        <span className="min-w-0 break-words">{testName}</span>
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 break-words">
                        Normal Range: <span className="font-mono font-medium text-foreground">
                            {rangeText}{unit ? ` ${unit}` : ""}
                        </span>
                    </p>
                </div>

                {trend && (
                    <div className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${trend === 'stable' ? 'bg-secondary text-secondary-foreground' : 'bg-primary/10 text-primary'
                        }`}>
                        {trend}
                    </div>
                )}
            </div>

            {/* The wrapper carries a real height at 360px, so ResponsiveContainer
                always measures a box instead of collapsing to 0px. */}
            <div className="w-full min-w-0 h-[240px] min-h-[220px] sm:h-[250px]">
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: isMobile ? 6 : 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />

                            {/* Normal Range Band - Only render if valid */}
                            {hasNormalRange && (
                                <ReferenceArea
                                    y1={normalRange[0]}
                                    y2={normalRange[1]}
                                    fill="hsl(var(--success))"
                                    fillOpacity={0.1}
                                />
                            )}

                            {predictionStartPoint && (
                                <ReferenceLine
                                    x={predictionStartPoint.formattedDate}
                                    stroke="hsl(var(--muted-foreground))"
                                    strokeDasharray="3 3"
                                >
                                    <Label
                                        value="Prediction Start"
                                        position="insideTopLeft"
                                        fill="hsl(var(--muted-foreground))"
                                        fontSize={isMobile ? 9 : 10}
                                        offset={10}
                                    />
                                </ReferenceLine>
                            )}

                            {/* On a phone the ticks shrink and thin out rather than
                                overlap: shorter labels, a minimum gap between them,
                                and the unit only on the tooltip and the header. */}
                            <XAxis
                                dataKey="formattedDate"
                                tick={{ fontSize: isMobile ? 10 : 11, fill: "hsl(var(--muted-foreground))" }}
                                stroke="hsl(var(--border))"
                                tickLine={false}
                                axisLine={false}
                                dy={isMobile ? 8 : 10}
                                interval="preserveStartEnd"
                                minTickGap={isMobile ? 26 : 8}
                            />

                            <YAxis
                                domain={[
                                    (dataMin: number) => {
                                        if (!hasNormalRange) return Math.floor(dataMin * 0.9);
                                        return Math.floor(Math.min(dataMin, normalRange[0]!) * 0.9);
                                    },
                                    (dataMax: number) => {
                                        if (!hasNormalRange) return Math.ceil(dataMax * 1.1);
                                        return Math.ceil(Math.max(dataMax, normalRange[1]!) * 1.1);
                                    },
                                ]}
                                tick={{ fontSize: isMobile ? 10 : 11, fill: "hsl(var(--muted-foreground))" }}
                                stroke="hsl(var(--border))"
                                tickLine={false}
                                axisLine={false}
                                unit={!isMobile && unit ? ` ${unit}` : ""}
                                width={isMobile ? 40 : 45}
                            />

                            <Tooltip
                                cursor={{ stroke: "hsl(var(--border))", strokeWidth: 2 }}
                                wrapperStyle={{ zIndex: 50, maxWidth: "calc(100vw - 3rem)" }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const point = payload[0].payload;
                                        const abnormal = isAbnormal(point.value);
                                        return (
                                            <div className="bg-popover/95 backdrop-blur-md p-3 shadow-xl rounded-xl border border-border text-xs z-50 max-w-[calc(100vw-3rem)] break-words">
                                                <p className="font-bold text-foreground mb-1">
                                                    {point.formattedDate}
                                                </p>
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    <span className="text-muted-foreground">Value:</span>
                                                    <span
                                                        className={`font-mono font-bold ${abnormal ? "text-rose-500" : "text-emerald-500"
                                                            }`}
                                                    >
                                                        {withUnit(point.value)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />

                            <Line
                                type="monotone"
                                dataKey="value"
                                stroke="hsl(var(--primary))"
                                strokeWidth={3}
                                dot={({ cx, cy, payload }) => {
                                    const abnormal = isAbnormal(payload.value);
                                    return (
                                        <circle
                                            key={payload.date}
                                            cx={cx}
                                            cy={cy}
                                            r={isMobile ? 3 : 4}
                                            fill={abnormal ? "hsl(var(--destructive))" : "hsl(var(--background))"}
                                            stroke={abnormal ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                                            strokeWidth={2}
                                            className="transition-all hover:r-6 cursor-pointer"
                                        />
                                    );
                                }}
                                activeDot={{ r: 6, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                                animationDuration={1000}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center gap-1 px-4 text-center">
                        <p className="text-sm font-medium text-foreground break-words">
                            No readings recorded for {testName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            There is no value for this test yet, so there is nothing to plot.
                        </p>
                    </div>
                )}
            </div>

            {/* The shaded band is a legend in itself: name it below the plot so
                it never eats plot height on a 360px screen. */}
            {hasNormalRange && chartData.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-4 shrink-0 rounded-sm bg-success/20 border border-success/50" aria-hidden="true" />
                        Shaded band = normal range
                    </span>
                </div>
            )}

            {/* One point is a dot, not a trend — say which it is. */}
            {points.length === 1 && (
                <p className="mt-auto pt-4 text-xs text-muted-foreground break-words">
                    Only one reading recorded ({withUnit(points[0].value)}). A trend needs at least two.
                </p>
            )}

            {points.length > 1 && (
                <div className="mt-auto pt-4 flex flex-wrap justify-between items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <div className="break-words">
                        Start: <span className="font-medium text-foreground">{withUnit(points[0].value)}</span>
                    </div>
                    <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                    <div className="break-words">
                        Latest: <span className="font-bold text-foreground">{withUnit(points[points.length - 1].value)}</span>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
