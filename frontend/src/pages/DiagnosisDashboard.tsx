import { DashboardHeader } from "../components/diagnosis/DashboardHeader";
import { DiagnosisCard } from "../components/diagnosis/DiagnosisCard";
import { TestTrendChart } from "../components/diagnosis/TestTrendChart";
import { ProgressComparison } from "../components/diagnosis/ProgressComparison";
import { RiskScoreVisual } from "../components/diagnosis/RiskScoreVisual";
import { ClinicalReasoningFlow } from "../components/diagnosis/ClinicalReasoningFlow";
import React, { useState, useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { apiRequest } from "../utils/api";
import { exportComponentAsPDF } from "../utils/pdfExport";

// Type definitions matching backend JSON schema
interface DiagnosisData {
    patient: {
        name: string;
        last_updated: string;
    };
    primary_diagnosis: {
        condition: string;
        icd_code: string;
        confidence: number;
        status: "improving" | "worsening" | "stable";
        evidence_chain: Array<{
            appointment: string;
            date: string;
            value: string;
            change: "better" | "worse" | "same";
        }>;
    };
    test_trends: {
        [key: string]: {
            test_name: string;
            unit: string;
            normal_range: [number, number];
            data: Array<{
                date: string;
                value: number;
                appointment_number: number;
            }>;
        };
    };
    clinical_reasoning: {
        nodes: Array<{
            id: string;
            label: string;
            type: "input" | "process" | "output" | "evidence";
            icon: string;
        }>;
        connections: Array<{
            from: string;
            to: string;
            label?: string;
        }>;
    };
    risk_scores: Array<{
        name: string;
        value: number;
        max: number;
        interpretation: string;
    }>;
    progress_metrics: Array<{
        name: string;
        baseline: number;
        current: number;
        unit: string;
        target: number;
        better: "lower" | "higher";
        icon: string;
    }>;
    alternative_diagnoses?: Array<{
        icd_10_code: string;
        diagnosis_name: string;
        confidence_score: number;
        rationale: string;
    }>;
}

/**
 * This route sits OUTSIDE both portal shells (`/doctor/session/:id/diagnosis`),
 * so on a phone it has no header and no way back. This bar is that missing
 * chrome: 44px back target, a title that wraps instead of overflowing, and the
 * safe-area padding so it does not sit under the status bar. Hidden from `md`
 * up, where the page is reached by URL and keeps its original layout.
 */
function PhoneTopBar({ appointmentId }: { appointmentId?: string }) {
    return (
        <header className="md:hidden sticky top-0 z-30 pt-safe bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5">
                <Link
                    to={appointmentId ? `/doctor/session/${appointmentId}` : "/doctor"}
                    className="tap shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Back to the consultation"
                >
                    <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                    Back
                </Link>
                <h1 className="min-w-0 flex-1 text-sm font-semibold text-gray-900 dark:text-white">
                    Diagnosis dashboard
                </h1>
            </div>
        </header>
    );
}

function PageFrame({ appointmentId, children }: { appointmentId?: string; children: React.ReactNode }) {
    return (
        <div className="min-h-app bg-gray-50 dark:bg-gray-900 pb-safe transition-colors duration-200">
            <PhoneTopBar appointmentId={appointmentId} />
            {children}
        </div>
    );
}

function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
    return (
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <span aria-hidden="true">{icon}</span> {children}
        </h2>
    );
}

/** Placeholder blocks in the shape of the real page, so the layout does not jump. */
function LoadingSkeleton() {
    return (
        <div className="max-w-7xl mx-auto" aria-busy="true">
            <div className="animate-pulse space-y-6">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-5">
                    <div className="flex items-center gap-4">
                        <div className="h-14 w-14 shrink-0 rounded-2xl bg-gray-200 dark:bg-gray-700" />
                        <div className="min-w-0 flex-1 space-y-2">
                            <div className="h-5 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
                            <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-700/70" />
                        </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <div className="h-11 w-32 rounded-lg bg-gray-200 dark:bg-gray-700" />
                        <div className="h-11 w-24 rounded-lg bg-gray-200 dark:bg-gray-700/80" />
                        <div className="h-11 w-28 rounded-lg bg-gray-200 dark:bg-gray-700/60" />
                    </div>
                </div>

                <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
                    <div className="h-6 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="mt-4 h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-700/70" />
                    <div className="mt-3 h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700/60" />
                </div>

                <div className="h-4 w-36 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="min-h-[220px] rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
                        <div className="h-5 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
                        <div className="mt-6 h-[160px] rounded-lg bg-gray-100 dark:bg-gray-700/60" />
                    </div>
                    <div className="min-h-[220px] rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
                        <div className="h-5 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
                        <div className="mt-6 h-[160px] rounded-lg bg-gray-100 dark:bg-gray-700/60" />
                    </div>
                </div>
            </div>
            <p role="status" className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
                Loading diagnosis data...
            </p>
        </div>
    );
}

/** One honest line for a section the backend returned empty. */
function EmptyNote({ children }: { children: React.ReactNode }) {
    return (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            {children}
        </p>
    );
}

const DiagnosisDashboard = () => {
    const { appointmentId } = useParams<{ appointmentId: string }>();
    const [diagnosisData, setDiagnosisData] = useState<DiagnosisData | null>(null);
    const [med42Text, setMed42Text] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Retry re-runs the same GET instead of reloading the whole app: inside a
    // WebView a full reload loses the session view and flashes white.
    const [retryCount, setRetryCount] = useState(0);
    const dashboardContentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;

        const fetchDiagnosis = async () => {
            if (!appointmentId) {
                if (!cancelled) {
                    setError("No appointment ID provided");
                    setLoading(false);
                }
                return;
            }

            try {
                setLoading(true);
                setError(null);
                const result = await apiRequest(`/appointments/${appointmentId}`, {
                    method: 'GET',
                });

                if (cancelled) return;

                if (!result.success) {
                    throw new Error(result.error || 'Failed to fetch appointment');
                }

                const appointment = result.data;

                if (appointment?.generated_diagnosis) {
                    setDiagnosisData(appointment.generated_diagnosis);
                } else {
                    setError("No diagnosis data available. Please generate diagnosis first.");
                }

                // Also fetch the Med42 text
                if (appointment?.generated_diagnosis_text) {
                    setMed42Text(appointment.generated_diagnosis_text);
                }
            } catch (err: any) {
                if (cancelled) return;
                console.error("Error fetching diagnosis:", err);
                setError(err.response?.data?.detail || "Failed to load diagnosis data");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchDiagnosis();

        return () => {
            cancelled = true;
        };
    }, [appointmentId, retryCount]);

    const handleRetry = () => {
        setError(null);
        setLoading(true);
        setRetryCount((count) => count + 1);
    };

    if (loading) {
        return (
            <PageFrame appointmentId={appointmentId}>
                <div className="p-4 pb-8 lg:p-8">
                    <LoadingSkeleton />
                </div>
            </PageFrame>
        );
    }

    if (error || !diagnosisData) {
        return (
            <PageFrame appointmentId={appointmentId}>
                <div className="p-4 pb-8 lg:p-8">
                    <div className="mx-auto max-w-xl" role="alert">
                        <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm dark:border-red-900/60 dark:bg-gray-800 sm:p-6">
                            <div className="flex items-start gap-3">
                                <AlertTriangle
                                    className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
                                    aria-hidden="true"
                                />
                                <div className="min-w-0 flex-1">
                                    <h2 className="text-base font-bold text-gray-900 dark:text-white">
                                        Could not load this diagnosis
                                    </h2>
                                    <p className="mt-2 break-words text-sm text-red-600 dark:text-red-400">
                                        {error || "No diagnosis data available"}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleRetry}
                                        className="tap mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:bg-primary-700 hover:shadow-lg"
                                    >
                                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                                        Retry
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </PageFrame>
        );
    }

    const patientName = diagnosisData.patient?.name || "";
    const lastUpdatedRaw = diagnosisData.patient?.last_updated;

    // Convert evidence_chain to evidenceChain format for DiagnosisCard
    const diagnosisCardData = diagnosisData.primary_diagnosis
        ? {
            condition: diagnosisData.primary_diagnosis.condition,
            icd_code: diagnosisData.primary_diagnosis.icd_code,
            confidence: diagnosisData.primary_diagnosis.confidence,
            status: diagnosisData.primary_diagnosis.status,
            evidenceChain: (Array.isArray(diagnosisData.primary_diagnosis.evidence_chain)
                ? diagnosisData.primary_diagnosis.evidence_chain
                : []
            ).map(ev => ({
                appointment: ev.appointment,
                date: ev.date,
                value: ev.value,
                change: ev.change,
            })),
        }
        : null;

    // Convert test_trends to array format for TestTrendChart
    const testTrends = Object.entries(diagnosisData.test_trends || {}).map(([key, test]) => ({
        key,
        ...test,
    }));

    const riskScores = Array.isArray(diagnosisData.risk_scores) ? diagnosisData.risk_scores : [];
    const progressMetrics = Array.isArray(diagnosisData.progress_metrics) ? diagnosisData.progress_metrics : [];
    const alternativeDiagnoses = Array.isArray(diagnosisData.alternative_diagnoses)
        ? diagnosisData.alternative_diagnoses
        : [];
    const reasoningNodes = Array.isArray(diagnosisData.clinical_reasoning?.nodes)
        ? diagnosisData.clinical_reasoning.nodes
        : [];
    const reasoningConnections = Array.isArray(diagnosisData.clinical_reasoning?.connections)
        ? diagnosisData.clinical_reasoning.connections
        : [];

    // Format last_updated for display
    const formatLastUpdated = (dateString: string) => {
        try {
            const date = new Date(dateString);
            return date.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
            });
        } catch {
            return dateString;
        }
    };

    const handleExportPDF = async () => {
        if (dashboardContentRef.current) {
            const sanitizedName = (patientName || "patient").replace(/[^a-zA-Z0-9]/g, '_');
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = `diagnosis-${sanitizedName}-${dateStr}`;

            await exportComponentAsPDF(
                dashboardContentRef as React.RefObject<HTMLElement>,
                filename,
                { backgroundColor: '#ffffff' }
            );
        }
    };

    return (
        <PageFrame appointmentId={appointmentId}>
            <div className="p-4 pb-8 lg:p-8">
                <div ref={dashboardContentRef} className="max-w-7xl mx-auto">
                    <DashboardHeader
                        patientName={patientName}
                        lastUpdated={lastUpdatedRaw ? formatLastUpdated(lastUpdatedRaw) : ""}
                        onExportClick={handleExportPDF}
                    />

                    {/* Primary Diagnosis */}
                    <section className="mb-6 scroll-mt-16">
                        <SectionTitle icon="📊">PRIMARY DIAGNOSIS</SectionTitle>
                        {diagnosisCardData ? (
                            <DiagnosisCard diagnosis={diagnosisCardData} />
                        ) : (
                            <EmptyNote>No primary diagnosis was recorded for this appointment.</EmptyNote>
                        )}
                    </section>

                    {/* Test Trends Section */}
                    <section className="mb-6 scroll-mt-16">
                        <SectionTitle icon="📈">TEST TRENDS</SectionTitle>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {testTrends.map((test) => (
                                <div key={test.key} className="min-w-0 min-h-[220px]">
                                    <TestTrendChart
                                        testName={test.test_name}
                                        unit={test.unit}
                                        normalRange={test.normal_range}
                                        data={(Array.isArray(test.data) ? test.data : []).map(d => ({
                                            date: d.date,
                                            value: d.value,
                                            appointmentNumber: d.appointment_number,
                                        }))}
                                    />
                                </div>
                            ))}
                            {testTrends.length === 0 && (
                                <p className="text-gray-600 dark:text-gray-400 text-center py-8 col-span-full">No test trend data available</p>
                            )}
                        </div>
                    </section>

                    {/* Clinical Reasoning Section */}
                    <section className="mb-6 scroll-mt-16">
                        <SectionTitle icon="🧠">CLINICAL REASONING</SectionTitle>
                        <ClinicalReasoningFlow
                            nodes={reasoningNodes}
                            connections={reasoningConnections}
                        />
                    </section>

                    {/* Risk Assessment Section */}
                    <section className="mb-6 scroll-mt-16">
                        <SectionTitle icon="⚠️">RISK ASSESSMENT</SectionTitle>
                        {riskScores.length > 0 ? (
                            <RiskScoreVisual scores={riskScores} />
                        ) : (
                            <EmptyNote>No risk scores were recorded for this appointment.</EmptyNote>
                        )}
                    </section>

                    {/* Progress Monitoring Section */}
                    <section className="mb-6 scroll-mt-16">
                        <SectionTitle icon="📊">PROGRESS MONITORING</SectionTitle>
                        {progressMetrics.length > 0 ? (
                            <ProgressComparison metrics={progressMetrics} />
                        ) : (
                            <EmptyNote>No progress metrics were recorded for this appointment.</EmptyNote>
                        )}
                    </section>

                    {/* Med42 Full Text */}
                    {med42Text && (
                        <section className="mb-6 scroll-mt-16">
                            <SectionTitle icon="📝">MED42 DIAGNOSIS ANALYSIS</SectionTitle>
                            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border-l-4 border-primary-600 dark:border-primary-400 transition-colors duration-200">
                                <div className="prose prose-sm max-w-none">
                                    <pre className="whitespace-pre-wrap font-sans text-sm text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700/50 p-4 rounded-lg overflow-x-auto">
                                        {med42Text}
                                    </pre>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Alternative Diagnoses */}
                    {alternativeDiagnoses.length > 0 && (
                        <section className="mb-6 scroll-mt-16">
                            <SectionTitle icon="🔍">ALTERNATIVE DIAGNOSES</SectionTitle>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {alternativeDiagnoses.map((alt, index) => (
                                    <div
                                        key={index}
                                        className="min-w-0 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border-l-4 border-yellow-500 dark:border-yellow-400 transition-colors duration-200"
                                    >
                                        <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-xl font-bold text-gray-900 dark:text-white break-words">
                                                    {alt.diagnosis_name}
                                                </h3>
                                                <p className="text-sm text-gray-600 dark:text-gray-400 font-mono mt-1 break-words">
                                                    ICD-10: {alt.icd_10_code}
                                                </p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                                                    {Math.round(alt.confidence_score * 100)}%
                                                </div>
                                                <div className="text-xs text-gray-600 dark:text-gray-400">Confidence</div>
                                            </div>
                                        </div>
                                        <div className="mt-4">
                                            <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                                Rationale
                                            </h4>
                                            <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">
                                                {alt.rationale}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </PageFrame>
    );
};

export default DiagnosisDashboard;
