import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill, AlertCircle, Calendar, CheckCircle, XCircle, RefreshCw, MessageCircle } from 'lucide-react';
import { apiRequest } from '../../utils/api';

const STATUS_STYLES = {
    active: { pill: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300', label: 'Active' },
    completed: { pill: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', label: 'Completed' },
    stopped: { pill: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300', label: 'Stopped' },
};

const statusStyle = (status) => {
    if (STATUS_STYLES[status]) return STATUS_STYLES[status];
    const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
    return { pill: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', label };
};

// Dates arrive as ISO-8601 UTC strings, but a plain YYYY-MM-DD must not shift a day.
const formatDate = (value) => {
    if (!value) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const text = (value) => (value === null || value === undefined || value === '' ? '—' : value);

const StatusPill = ({ badge }) => (
    <span className={`inline-block text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap ${badge.pill}`}>
        {badge.label}
    </span>
);

/**
 * One label/value pair. On a phone this is the whole card body: a drug name and a
 * dose are clinical facts, so the value wraps onto a second line rather than being
 * clipped or pushed sideways.
 */
const DetailRow = ({ label, value }) => (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
        <dt className="flex-shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400">{label}</dt>
        <dd className="min-w-0 break-words text-right text-sm font-semibold text-gray-900 dark:text-white">{value}</dd>
    </div>
);

const PrescriptionCard = ({ rx }) => {
    const badge = statusStyle(rx.status);
    const startDate = formatDate(rx.start_date);
    const endDate = formatDate(rx.end_date);
    const refills = rx.refills_left;
    const prescriber = rx.doctor_name ? `Prescribed by ${rx.doctor_name}` : 'Prescriber not recorded';
    const endsLabel = endDate || (rx.status === 'active' ? 'Ongoing' : 'Not recorded');

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md dark:hover:bg-gray-700/50 transition-all">
            {/* Phone: name on its own line (never truncated), status becomes a
                labelled row below. Desktop keeps the badge top-right. */}
            <div className="mb-3 flex flex-col items-start gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                    <h4 className="flex items-start text-base font-semibold text-gray-900 dark:text-white md:items-center md:text-lg">
                        <Pill className="w-4 h-4 mr-2 mt-0.5 md:mt-0 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                        <span className="min-w-0 break-words">{text(rx.medication)}</span>
                    </h4>
                    <p className="hidden md:block text-sm text-blue-600 dark:text-blue-400">{prescriber}</p>
                </div>
                <div className="hidden md:block flex-shrink-0">
                    <StatusPill badge={badge} />
                </div>
            </div>

            {/* Phone: paired label/value rows, in the order the record is kept. */}
            <dl className="mb-3 md:hidden">
                <DetailRow label="Dosage" value={text(rx.dosage)} />
                <DetailRow label="Frequency" value={text(rx.frequency)} />
                <DetailRow label="Route" value={text(rx.route)} />
                <DetailRow
                    label="Refills left"
                    value={refills === null || refills === undefined || refills === '' ? '—' : refills}
                />
                <DetailRow label="Started" value={startDate || 'Not recorded'} />
                <DetailRow label="Ends" value={endsLabel} />
                <DetailRow label="Prescriber" value={prescriber} />
                <DetailRow label="Status" value={<StatusPill badge={badge} />} />
            </dl>

            {/* Desktop: the grids this card has always used. */}
            <div className="mb-3 hidden gap-3 md:grid md:grid-cols-4">
                <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Dosage</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{text(rx.dosage)}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Frequency</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{text(rx.frequency)}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Route</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{text(rx.route)}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Refills left</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {refills === null || refills === undefined || refills === '' ? '—' : refills}
                    </p>
                </div>
            </div>

            <div className="mb-3 hidden gap-3 md:grid md:grid-cols-2">
                <div className="flex items-start space-x-2">
                    <Calendar className="w-4 h-4 mt-0.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                    <div>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Started</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{startDate || 'Not recorded'}</p>
                    </div>
                </div>
                <div className="flex items-start space-x-2">
                    <Calendar className="w-4 h-4 mt-0.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                    <div>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Ends</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{endsLabel}</p>
                    </div>
                </div>
            </div>

            {rx.instructions && (
                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded p-3">
                    <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1">Instructions:</p>
                    <p className="text-sm text-blue-800 dark:text-blue-300 break-words">{rx.instructions}</p>
                </div>
            )}
        </div>
    );
};

const Skeleton = () => (
    <div className="space-y-4 animate-pulse">
        {[0, 1, 2].map((row) => (
            <div key={row} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="h-5 w-48 max-w-full bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[0, 1, 2, 3].map((cell) => (
                        <div key={cell} className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />
                    ))}
                </div>
            </div>
        ))}
    </div>
);

const Medications = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        const result = await apiRequest('/prescriptions/me');
        if (result.success) {
            setItems(Array.isArray(result.data?.items) ? result.data.items : []);
            setError(null);
        } else {
            setItems([]);
            setError(result.error || 'Could not load your prescriptions.');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const activePrescriptions = items.filter((rx) => rx.status === 'active');
    const pastPrescriptions = items.filter((rx) => rx.status !== 'active');

    // The portal's <main> already supplies the 16px phone gutter, so the cards own
    // only their inner padding (p-4 on a phone, the .card p-6 at md+).
    return (
        <div className="mx-auto w-full max-w-7xl">
            <div className="mb-5 md:mb-8">
                <h2 className="mb-1 text-xl font-bold text-gray-900 dark:text-white md:mb-2 md:text-3xl">My Medications</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 md:text-base">
                    Prescriptions on file from your doctor
                </p>
            </div>

            {/* Important Notice */}
            <div className="card mb-4 border-2 border-yellow-300 bg-yellow-50 p-4 hover:shadow-xl transition-all duration-200 dark:border-yellow-700 dark:bg-yellow-900/20 md:mb-6 md:p-6">
                <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                        <h3 className="mb-1 font-semibold text-yellow-900 dark:text-yellow-200">Important</h3>
                        <p className="text-sm text-yellow-800 dark:text-yellow-300">
                            Never skip or stop your medications without consulting your doctor.
                            If you experience any side effects, contact your prescribing doctor immediately.
                        </p>
                    </div>
                </div>
            </div>

            {/* Loading */}
            {loading && (
                <div className="card mb-4 p-4 md:mb-6 md:p-6">
                    <h3 className="mb-4 flex items-center text-lg font-bold text-gray-900 dark:text-white md:text-xl">
                        <Pill className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
                        Loading your prescriptions
                    </h3>
                    <Skeleton />
                </div>
            )}

            {/* Error */}
            {!loading && error && (
                <div className="card mb-4 border-2 border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20 md:mb-6 md:p-6">
                    <div className="flex items-start space-x-3">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                            <h3 className="mb-1 font-semibold text-red-900 dark:text-red-200">Could not load your medications</h3>
                            <p className="mb-3 text-sm text-red-800 dark:text-red-300">{error}</p>
                            <button
                                type="button"
                                onClick={load}
                                className="btn-secondary tap inline-flex items-center text-sm"
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Retry
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty */}
            {!loading && !error && items.length === 0 && (
                <div className="card mb-4 px-4 py-10 text-center hover:shadow-xl transition-all duration-200 md:mb-6 md:p-6 md:py-12">
                    <Pill className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600 md:w-16 md:h-16" />
                    <p className="mb-1 font-semibold text-gray-700 dark:text-gray-300">
                        No prescriptions on file yet — your doctor has not prescribed anything
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Prescriptions appear here as soon as your doctor records one after a consultation.
                    </p>
                </div>
            )}

            {/* Active first, then everything already completed or stopped */}
            {!loading && !error && items.length > 0 && (
                <>
                    <div className="card mb-4 p-4 hover:shadow-xl transition-all duration-200 md:mb-6 md:p-6">
                        <h3 className="mb-4 flex items-center text-lg font-bold text-gray-900 dark:text-white md:text-xl">
                            <CheckCircle className="w-5 h-5 mr-2 text-green-600 dark:text-green-400" />
                            Active Prescriptions ({activePrescriptions.length})
                        </h3>
                        {activePrescriptions.length > 0 ? (
                            <div className="space-y-4">
                                {activePrescriptions.map((rx, index) => (
                                    <PrescriptionCard key={rx.id || `active-${index}`} rx={rx} />
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-600 dark:text-gray-400">No active prescriptions right now.</p>
                        )}
                    </div>

                    {pastPrescriptions.length > 0 && (
                        <div className="card mb-4 p-4 hover:shadow-xl transition-all duration-200 md:mb-6 md:p-6">
                            <h3 className="mb-4 flex items-center text-lg font-bold text-gray-900 dark:text-white md:text-xl">
                                <XCircle className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
                                Past Prescriptions ({pastPrescriptions.length})
                            </h3>
                            <div className="space-y-4">
                                {pastPrescriptions.map((rx, index) => (
                                    <PrescriptionCard key={rx.id || `past-${index}`} rx={rx} />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Questions */}
            <div className="card border-2 border-teal-200 bg-gradient-to-r from-teal-50 to-blue-50 p-4 hover:shadow-xl transition-all duration-200 dark:border-teal-700 dark:from-teal-900/20 dark:to-blue-900/20 md:p-6">
                <div className="flex items-start space-x-3">
                    <div className="bg-gradient-to-br from-teal-500 to-teal-600 p-2 rounded-xl shadow-md">
                        <MessageCircle className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-white">Questions about a medication?</h3>
                        <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">
                            Ask your care team before changing a dose, route or schedule. This list is a record of
                            what your doctor prescribed, not advice.
                        </p>
                        <Link
                            to="/patient/chatbot"
                            className="tap inline-flex items-center text-sm font-semibold text-teal-600 transition-colors hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
                        >
                            Ask a health question
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Medications;
