// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

import React, { useCallback, useEffect, useId, useState } from 'react';
import {
    AlertCircle,
    AlertTriangle,
    CheckCircle,
    ChevronDown,
    FlaskConical,
    Pill,
    Plus,
    RefreshCw,
} from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { hapticTap } from '../../services/native';
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

/**
 * One label/value pair in a prescription's phone definition list.
 *
 * A drug name, a dose and a date are clinical facts, so the value wraps onto a
 * second line rather than being clipped or pushed off the right edge.
 */
const DetailRow = ({ label, value }) => (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-1.5 last:border-b-0 dark:border-gray-700">
        <dt className="flex-shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400">{label}</dt>
        <dd className="min-w-0 break-words text-right text-sm font-semibold text-gray-900 dark:text-white">{value}</dd>
    </div>
);

/**
 * A long list (every prescription on file) folded behind a 44px disclosure
 * header on a phone. Desktop never sees the header: the list renders exactly as
 * it always has, so the wide layout loses nothing.
 */
const ListSection = ({ panelId, title, count, note, open, onToggle, children }) => (
    <section>
        <h4 className="md:hidden">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={panelId}
                className="tap flex w-full items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-left text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-white dark:hover:bg-gray-700/50"
            >
                <span className="min-w-0 flex-1 break-words">
                    {title}
                    {typeof count === 'number' && (
                        <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                            {count}
                        </span>
                    )}
                </span>
                <ChevronDown
                    className={`w-5 h-5 flex-shrink-0 text-gray-500 transition-transform duration-200 dark:text-gray-400 ${
                        open ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                />
            </button>
        </h4>
        <div id={panelId} className={open ? '' : 'hidden md:block'}>
            {note ? (
                <p className="mb-2 mt-2 text-xs text-gray-600 dark:text-gray-400 md:hidden">{note}</p>
            ) : null}
            {children}
        </div>
    </section>
);

const PrescriptionCard = ({ rx }) => {
    const startDate = formatDate(rx.start_date);
    const endDate = formatDate(rx.end_date);
    const refills =
        rx.refills_left === null || rx.refills_left === undefined || rx.refills_left === ''
            ? '—'
            : rx.refills_left;
    const prescriber = rx.doctor_name ? `Prescribed by ${rx.doctor_name}` : 'Prescriber not recorded';
    const endsLabel = endDate || (rx.status === 'active' ? 'Ongoing' : 'Not recorded');
    const statusLabel = rx.status ? String(rx.status).toUpperCase() : 'UNKNOWN';

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md dark:hover:bg-gray-700/50 transition-all">
            {/* Phone: the drug name owns the full width and the status moves to its
                own labelled row. Desktop keeps the badge in the top-right corner. */}
            <div className="mb-3 flex flex-col items-start gap-2 md:flex-row md:items-start md:justify-between">
                <div className="w-full min-w-0 md:w-auto md:flex-1">
                    <h4 className="text-base font-semibold text-gray-900 dark:text-white flex items-start md:items-center md:text-lg">
                        <Pill
                            className="w-4 h-4 mr-2 mt-0.5 md:mt-0 text-teal-600 dark:text-teal-400 flex-shrink-0"
                            aria-hidden="true"
                        />
                        <span className="min-w-0 break-words">{text(rx.medication)}</span>
                    </h4>
                    <p className="hidden md:block text-sm text-blue-600 dark:text-blue-400">{prescriber}</p>
                </div>
                <div className="hidden md:block flex-shrink-0">
                    <span
                        className={`text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap ${statusStyle(rx.status)}`}
                    >
                        {statusLabel}
                    </span>
                </div>
            </div>

            {/* Phone: a definition list, not a squeezed grid — every value wraps. */}
            <dl className="mb-3 md:hidden">
                <DetailRow label="Dosage" value={text(rx.dosage)} />
                <DetailRow label="Frequency" value={text(rx.frequency)} />
                <DetailRow label="Route" value={text(rx.route)} />
                <DetailRow label="Refills left" value={refills} />
                <DetailRow label="Started" value={startDate || 'Not recorded'} />
                <DetailRow label="Ends" value={endsLabel} />
                <DetailRow label="Prescriber" value={prescriber} />
                <DetailRow
                    label="Status"
                    value={
                        <span className={`inline-block text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap ${statusStyle(rx.status)}`}>
                            {statusLabel}
                        </span>
                    }
                />
            </dl>

            {/* Desktop: the two grids this card has always used. */}
            <div className="hidden gap-3 mb-3 md:grid md:grid-cols-4">
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

            <div className="hidden gap-3 text-sm text-gray-700 dark:text-gray-300 md:grid md:grid-cols-2">
                <p>
                    <span className="text-xs text-gray-600 dark:text-gray-400 block">Started</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{startDate || 'Not recorded'}</span>
                </p>
                <p>
                    <span className="text-xs text-gray-600 dark:text-gray-400 block">Ends</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{endsLabel}</span>
                </p>
            </div>

            {rx.instructions && (
                <div className="mt-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded p-3">
                    <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1">Instructions:</p>
                    <p className="text-sm break-words text-blue-800 dark:text-blue-300">{rx.instructions}</p>
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

    // The prescription list is the one long list on this panel, so on a phone it
    // folds away behind a 44px disclosure header. It starts open; desktop ignores
    // both the header and the state.
    const [listOpen, setListOpen] = useState(true);
    const listPanelId = useId();

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
        setListOpen(true);
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
            <div className="px-4 pt-4 pb-0 md:p-6 md:pb-0">
                <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-start md:justify-between">
                    <div className="min-w-0">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white md:text-2xl">Clinical record</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            What this doctor has prescribed and measured for this patient
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
                        <button
                            type="button"
                            onClick={() => setPrescribeOpen(true)}
                            disabled={!patientId}
                            className="tap inline-flex w-full items-center justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50 md:w-auto"
                        >
                            <Plus className="w-4 h-4 mr-2 flex-shrink-0" aria-hidden="true" />
                            Prescribe
                        </button>
                        <button
                            type="button"
                            onClick={() => setLabOpen(true)}
                            disabled={!patientId}
                            className="tap inline-flex w-full items-center justify-center px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50 md:w-auto"
                        >
                            <Plus className="w-4 h-4 mr-2 flex-shrink-0" aria-hidden="true" />
                            Add lab result
                        </button>
                    </div>
                </div>

                {/* Tabs. On a phone the two share the width evenly and stay 44px tall. */}
                <div className="mt-6 flex gap-1 border-b border-gray-200 dark:border-gray-700 md:gap-0 md:space-x-2">
                    {tabs.map((item) => {
                        const activeTab = tab === item.key;
                        return (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => setTab(item.key)}
                                className={`tap inline-flex min-w-0 flex-1 items-center justify-center px-3 py-3 -mb-px border-b-2 text-sm font-semibold transition-colors md:flex-none md:px-4 ${
                                    activeTab
                                        ? 'border-primary-600 dark:border-primary-400 text-primary-700 dark:text-primary-300'
                                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                }`}
                            >
                                <item.icon className="w-4 h-4 mr-2 flex-shrink-0" aria-hidden="true" />
                                <span className="min-w-0 break-words">{item.label}</span>
                                {item.count !== null && (
                                    <span className="ml-2 flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                        {item.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="px-4 py-4 md:p-6">
                {notice && (
                    <div
                        className={`mb-5 flex items-start space-x-2 rounded-lg border p-3 ${
                            notice.kind === 'warn'
                                ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                                : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        }`}
                    >
                        {notice.kind === 'warn' ? (
                            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                        ) : (
                            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                        )}
                        <div className="min-w-0 flex-1">
                            <p
                                className={`text-sm break-words ${
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
                                className="tap mt-1 inline-flex items-center text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
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
                                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-red-900 dark:text-red-200">
                                            Could not load prescriptions
                                        </p>
                                        <p className="text-sm break-words text-red-800 dark:text-red-300 mb-3">{error}</p>
                                        <button
                                            type="button"
                                            onClick={() => setReloadKey((key) => key + 1)}
                                            className="btn-secondary tap text-sm inline-flex items-center justify-center"
                                        >
                                            <RefreshCw className="w-4 h-4 mr-2 flex-shrink-0" aria-hidden="true" />
                                            Retry
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!loading && !error && prescriptions.length === 0 && (
                            <div className="text-center px-4 py-8 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg md:py-12">
                                <Pill className="w-10 h-10 md:w-12 md:h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" aria-hidden="true" />
                                <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    No prescriptions on file for this patient
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Nothing has been prescribed yet. Use Prescribe to record the first medication.
                                </p>
                            </div>
                        )}

                        {!loading && !error && prescriptions.length > 0 && (
                            <ListSection
                                panelId={listPanelId}
                                title="Medications on file"
                                count={prescriptions.length}
                                note={
                                    total > prescriptions.length
                                        ? `Showing ${prescriptions.length} of ${total} on record.`
                                        : ''
                                }
                                open={listOpen}
                                onToggle={() => {
                                    hapticTap();
                                    setListOpen((open) => !open);
                                }}
                            >
                                <div className="space-y-4">
                                    {prescriptions.map((rx, index) => (
                                        <PrescriptionCard key={rx.id || `rx-${index}`} rx={rx} />
                                    ))}
                                </div>
                            </ListSection>
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
