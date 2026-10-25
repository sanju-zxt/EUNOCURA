// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

import React, { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle,
    AlertTriangle,
    CheckCircle,
    FlaskConical,
    Pill,
    Plus,
    RefreshCw,
} from 'lucide-react';
import { apiRequest } from '../../utils/api';
import TestResults from './TestResults';
import PrescribeModal from './PrescribeModal';
import LabResultModal from './LabResultModal';

const STATUS_STYLES = {
    active: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
    completed: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    stopped: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
};

const statusStyle = (status) => {
    if (STATUS_STYLES[status]) return STATUS_STYLES[status];
    return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
};

// A plain YYYY-MM-DD is a calendar day, not an instant: parse it locally so it never shifts.
const formatDate = (value) => {
    if (!value) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const text = (value) => (value === null || value === undefined || value === '' ? '—' : value);

const PrescriptionCard = ({ rx }) => {
    const startDate = formatDate(rx.start_date);
    const endDate = formatDate(rx.end_date);

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
                <span className={`text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap ${statusStyle(rx.status)}`}>
                    {rx.status ? String(rx.status).toUpperCase() : 'UNKNOWN'}
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
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{text(rx.refills_left)}</p>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3 text-sm text-gray-700 dark:text-gray-300">
                <p>
                    <span className="text-xs text-gray-600 dark:text-gray-400 block">Started</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{startDate || 'Not recorded'}</span>
                </p>
                <p>
                    <span className="text-xs text-gray-600 dark:text-gray-400 block">Ends</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                        {endDate || (rx.status === 'active' ? 'Ongoing' : 'Not recorded')}
                    </span>
                </p>
            </div>

            {rx.instructions && (
                <div className="mt-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded p-3">
                    <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1">Instructions:</p>
                    <p className="text-sm text-blue-800 dark:text-blue-300">{rx.instructions}</p>
                </div>
            )}
        </div>
    );
};

const PrescriptionSkeleton = () => (
    <div className="space-y-4 animate-pulse">
        {[0, 1].map((row) => (
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

/**
 * Clinical actions for the open patient: prescribe, record a lab result, and read
 * both back. Results are rendered by TestResults, which owns its own fetch; it is
 * remounted with a new `key` after a write so the new point appears immediately.
 */
const PatientClinicalPanel = ({ patient }) => {
    const patientId = patient?.id || patient?._id || '';

    const [tab, setTab] = useState('prescriptions');
    const [prescriptions, setPrescriptions] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);

    const [prescribeOpen, setPrescribeOpen] = useState(false);
    const [labOpen, setLabOpen] = useState(false);
    const [resultsVersion, setResultsVersion] = useState(0);
    const [notice, setNotice] = useState(null);

    const loadPrescriptions = useCallback(async () => {
        if (!patientId) {
            setPrescriptions([]);
            setTotal(0);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');

        const response = await apiRequest(`/prescriptions/patient/${encodeURIComponent(patientId)}`);
        if (response.success) {
            const payload = response.data || {};
            const items = Array.isArray(payload.items) ? payload.items : [];
            setPrescriptions(items);
            setTotal(typeof payload.total === 'number' ? payload.total : items.length);
        } else {
            setPrescriptions([]);
            setTotal(0);
            setError(response.error || 'Could not load prescriptions for this patient.');
        }
        setLoading(false);
    }, [patientId]);

    useEffect(() => {
        loadPrescriptions();
    }, [loadPrescriptions, reloadKey]);

    // A new patient means a clean panel: no stale prescriptions, notices or tab choice.
    useEffect(() => {
        setTab('prescriptions');
        setNotice(null);
        setPrescribeOpen(false);
        setLabOpen(false);
    }, [patientId]);

    const handlePrescribed = (record, warning) => {
        setPrescribeOpen(false);
        if (record && record.id !== undefined) {
            setPrescriptions((prev) => [record, ...prev]);
            setTotal((prev) => prev + 1);
        }
        setNotice(
            warning
                ? { kind: 'warn', text: warning }
                : { kind: 'ok', text: `${record?.medication || 'Prescription'} saved and the patient was notified.` }
        );
    };

    const handleLabResult = (record, warning) => {
        setLabOpen(false);
        setResultsVersion((version) => version + 1);
        setNotice(
            warning
                ? { kind: 'warn', text: warning }
                : { kind: 'ok', text: `${record?.test_name || 'Lab result'} recorded and the patient was notified.` }
        );
    };

    const tabs = [
        { key: 'prescriptions', label: 'Prescriptions', count: total, icon: Pill },
        { key: 'results', label: 'Lab results', count: null, icon: FlaskConical },
    ];

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 mb-6 transition-colors duration-200">
            <div className="p-6 pb-0">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Clinical record</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            What this doctor has prescribed and measured for this patient
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setPrescribeOpen(true)}
                            disabled={!patientId}
                            className="inline-flex items-center px-4 py-2 rounded-lg bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Prescribe
                        </button>
                        <button
                            type="button"
                            onClick={() => setLabOpen(true)}
                            disabled={!patientId}
                            className="inline-flex items-center px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add lab result
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="mt-6 flex space-x-2 border-b border-gray-200 dark:border-gray-700">
                    {tabs.map((item) => {
                        const activeTab = tab === item.key;
                        return (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => setTab(item.key)}
                                className={`inline-flex items-center px-4 py-3 -mb-px border-b-2 text-sm font-semibold transition-colors ${
                                    activeTab
                                        ? 'border-primary-600 dark:border-primary-400 text-primary-700 dark:text-primary-300'
                                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                }`}
                            >
                                <item.icon className="w-4 h-4 mr-2" />
                                {item.label}
                                {item.count !== null && (
                                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                        {item.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="p-6">
                {notice && (
                    <div
                        className={`mb-5 flex items-start space-x-2 rounded-lg border p-3 ${
                            notice.kind === 'warn'
                                ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                                : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        }`}
                    >
                        {notice.kind === 'warn' ? (
                            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                        ) : (
                            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                            <p
                                className={`text-sm ${
                                    notice.kind === 'warn'
                                        ? 'text-yellow-800 dark:text-yellow-300'
                                        : 'text-green-800 dark:text-green-300'
                                }`}
                            >
                                {notice.text}
                            </p>
                            <button
                                type="button"
                                onClick={() => setNotice(null)}
                                className="mt-1 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                )}

                {tab === 'prescriptions' ? (
                    <>
                        {loading && <PrescriptionSkeleton />}

                        {!loading && error && (
                            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
                                <div className="flex items-start space-x-2">
                                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                        <p className="font-semibold text-red-900 dark:text-red-200">
                                            Could not load prescriptions
                                        </p>
                                        <p className="text-sm text-red-800 dark:text-red-300 mb-3">{error}</p>
                                        <button
                                            type="button"
                                            onClick={() => setReloadKey((key) => key + 1)}
                                            className="btn-secondary text-sm inline-flex items-center"
                                        >
                                            <RefreshCw className="w-4 h-4 mr-2" />
                                            Retry
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!loading && !error && prescriptions.length === 0 && (
                            <div className="text-center py-12 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                                <Pill className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                                <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    No prescriptions on file for this patient
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Nothing has been prescribed yet. Use Prescribe to record the first medication.
                                </p>
                            </div>
                        )}

                        {!loading && !error && prescriptions.length > 0 && (
                            <div className="space-y-4">
                                {prescriptions.map((rx, index) => (
                                    <PrescriptionCard key={rx.id || `rx-${index}`} rx={rx} />
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <div>
                        {/* TestResults owns its own loading, error and empty states. */}
                        <TestResults key={`${patientId}-${resultsVersion}`} patientId={patientId} />
                    </div>
                )}
            </div>

            <PrescribeModal
                isOpen={prescribeOpen}
                onClose={() => setPrescribeOpen(false)}
                patient={patient}
                onCreated={handlePrescribed}
            />
            <LabResultModal
                isOpen={labOpen}
                onClose={() => setLabOpen(false)}
                patient={patient}
                onCreated={handleLabResult}
            />
        </div>
    );
};

export default PatientClinicalPanel;
