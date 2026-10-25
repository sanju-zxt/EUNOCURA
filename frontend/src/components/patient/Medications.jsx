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

const PrescriptionCard = ({ rx }) => {
    const badge = statusStyle(rx.status);
    const startDate = formatDate(rx.start_date);
    const endDate = formatDate(rx.end_date);
    const refills = rx.refills_left;

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md dark:hover:bg-gray-700/50 transition-all">
            <div className="flex items-start justify-between mb-3">
                <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                        <Pill className="w-4 h-4 mr-2 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                        {text(rx.medication)}
                    </h4>
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                        {rx.doctor_name ? `Prescribed by ${rx.doctor_name}` : 'Prescriber not recorded'}
                    </p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap ${badge.pill}`}>
                    {badge.label}
                </span>
            </div>

            <div className="grid md:grid-cols-4 gap-3 mb-3">
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

            <div className="grid md:grid-cols-2 gap-3 mb-3">
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
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {endDate || (rx.status === 'active' ? 'Ongoing' : 'Not recorded')}
                        </p>
                    </div>
                </div>
            </div>

            {rx.instructions && (
                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded p-3">
                    <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1">Instructions:</p>
                    <p className="text-sm text-blue-800 dark:text-blue-300">{rx.instructions}</p>
                </div>
            )}
        </div>
    );
};

const Skeleton = () => (
    <div className="space-y-4 animate-pulse">
        {[0, 1, 2].map((row) => (
            <div key={row} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

    return (
        <div className="max-w-7xl mx-auto">
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">My Medications</h2>
                <p className="text-gray-600 dark:text-gray-400">Prescriptions on file from your doctor</p>
            </div>

            {/* Important Notice */}
            <div className="card mb-6 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-300 dark:border-yellow-700 hover:shadow-xl transition-all duration-200">
                <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-1">Important</h3>
                        <p className="text-sm text-yellow-800 dark:text-yellow-300">
                            Never skip or stop your medications without consulting your doctor.
                            If you experience any side effects, contact your prescribing doctor immediately.
                        </p>
                    </div>
                </div>
            </div>

            {/* Loading */}
            {loading && (
                <div className="card mb-6">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                        <Pill className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
                        Loading your prescriptions
                    </h3>
                    <Skeleton />
                </div>
            )}

            {/* Error */}
            {!loading && error && (
                <div className="card mb-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700">
                    <div className="flex items-start space-x-3">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <h3 className="font-semibold text-red-900 dark:text-red-200 mb-1">Could not load your medications</h3>
                            <p className="text-sm text-red-800 dark:text-red-300 mb-3">{error}</p>
                            <button
                                type="button"
                                onClick={load}
                                className="btn-secondary text-sm inline-flex items-center"
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
                <div className="card mb-6 text-center py-12 hover:shadow-xl transition-all duration-200">
                    <Pill className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-700 dark:text-gray-300 font-semibold mb-1">
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
                    <div className="card mb-6 hover:shadow-xl transition-all duration-200">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
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
                        <div className="card mb-6 hover:shadow-xl transition-all duration-200">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
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
            <div className="card bg-gradient-to-r from-teal-50 to-blue-50 dark:from-teal-900/20 dark:to-blue-900/20 border-2 border-teal-200 dark:border-teal-700 hover:shadow-xl transition-all duration-200">
                <div className="flex items-start space-x-3">
                    <div className="bg-gradient-to-br from-teal-500 to-teal-600 p-2 rounded-xl shadow-md">
                        <MessageCircle className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Questions about a medication?</h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                            Ask your care team before changing a dose, route or schedule. This list is a record of
                            what your doctor prescribed, not advice.
                        </p>
                        <Link
                            to="/patient/chatbot"
                            className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 text-sm font-semibold transition-colors"
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
