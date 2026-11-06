// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

import React, { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import MobileSheet from '../mobile/MobileSheet';
import { notifyPatient } from './notifyPatient';

const ROUTE_OPTIONS = [
    'oral',
    'intravenous',
    'intramuscular',
    'subcutaneous',
    'topical',
    'inhalation',
    'rectal',
    'ophthalmic',
];

/** Today as `YYYY-MM-DD` in the doctor's own zone: a start date must not shift a day. */
const todayInput = () => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
};

const blankForm = () => ({
    medication: '',
    dosage: '',
    frequency: '',
    route: 'oral',
    start_date: todayInput(),
    end_date: '',
    refills_left: '0',
    instructions: '',
});

// The form lives in the sheet body and submits from the button in the footer
// (`form="rx-form"`), so the panel is the frozen MobileSheet on both shapes while
// the payload, validation and post-submit flow stay exactly as they were.
const FORM_ID = 'rx-form';

const PrescribeModal = ({ isOpen, onClose, patient, onCreated }) => {
    const [form, setForm] = useState(blankForm);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const patientId = patient?.id || patient?._id || '';

    const setField = (field) => (event) => {
        const { value } = event.target;
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    /** Client-side checks before the request; the API validates again and wins on conflict. */
    const validate = () => {
        if (!patientId) return 'No patient selected.';
        if (!form.medication.trim()) return 'Medication is required.';
        if (!form.dosage.trim()) return 'Dosage is required.';
        if (!form.frequency.trim()) return 'Frequency is required.';
        if (!form.start_date) return 'Start date is required.';
        if (form.end_date && form.end_date < form.start_date) {
            return 'End date cannot be before the start date.';
        }
        const refills = Number(form.refills_left);
        if (form.refills_left !== '' && (!Number.isInteger(refills) || refills < 0)) {
            return 'Refills must be a whole number, 0 or more.';
        }
        return '';
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (submitting) return;

        const problem = validate();
        if (problem) {
            setError(problem);
            return;
        }

        setSubmitting(true);
        setError('');

        const response = await apiRequest('/prescriptions/', {
            method: 'POST',
            body: JSON.stringify({
                patient_id: patientId,
                medication: form.medication.trim(),
                dosage: form.dosage.trim(),
                frequency: form.frequency.trim(),
                route: form.route,
                start_date: form.start_date,
                end_date: form.end_date ? form.end_date : null,
                status: 'active',
                instructions: form.instructions.trim(),
                refills_left: Number(form.refills_left || 0),
            }),
        });

        if (!response.success) {
            setError(response.error || 'Could not save the prescription.');
            setSubmitting(false);
            return;
        }

        const record = response.data || {};
        const warning = await notifyPatient({
            patientId,
            title: 'New prescription',
            body: `${record.medication || form.medication.trim()} ${record.dosage || form.dosage.trim()} - ${
                record.frequency || form.frequency.trim()
            }. Open Medications for the full instructions.`,
            category: 'medication',
        });

        setSubmitting(false);
        setForm(blankForm());
        onCreated(record, warning);
    };

    const handleClose = () => {
        if (submitting) return;
        setError('');
        onClose();
    };

    // `text-base` keeps the OS from zooming the page on focus; `.tap` keeps every
    // field at least 44px tall even with a short value on a 360px screen.
    const fieldClass =
        'tap w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg text-base focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-primary-500 dark:focus:border-primary-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500';
    const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2';

    // The failure message sits in the footer, just above the buttons, so a check
    // that fails while the body is scrolled away can never be missed.
    const footer = (
        <div className="space-y-3">
            {error && (
                <div
                    role="alert"
                    className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3"
                >
                    <AlertCircle
                        className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
                        aria-hidden="true"
                    />
                    <p className="min-w-0 text-sm text-red-800 dark:text-red-300 break-words">{error}</p>
                </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                    type="button"
                    onClick={handleClose}
                    disabled={submitting}
                    className="tap inline-flex w-full items-center justify-center rounded-lg px-6 font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 sm:w-auto"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    form={FORM_ID}
                    disabled={submitting}
                    className={`tap inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 font-medium bg-primary-600 dark:bg-primary-700 text-white hover:bg-primary-700 dark:hover:bg-primary-600 shadow-lg shadow-primary-500/30 transition-all sm:w-auto ${
                        submitting ? 'opacity-50 cursor-wait' : 'transform hover:-translate-y-0.5'
                    }`}
                >
                    {submitting && (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    )}
                    <span>{submitting ? 'Saving...' : 'Save prescription'}</span>
                </button>
            </div>
        </div>
    );

    return (
        <MobileSheet
            open
            onClose={handleClose}
            title="New prescription"
            description={`${patient?.name ? `For ${patient.name}` : 'Selected patient'}${
                patientId ? ` (${patientId})` : ''
            }`}
            closeLabel="Close"
            size="lg"
            footer={footer}
        >
            <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                    <div className="min-w-0">
                        <label className={labelClass} htmlFor="rx-medication">Medication</label>
                        <input
                            id="rx-medication"
                            className={fieldClass}
                            value={form.medication}
                            onChange={setField('medication')}
                            placeholder="e.g. Metformin"
                            autoComplete="off"
                            required
                        />
                    </div>
                    <div className="min-w-0">
                        <label className={labelClass} htmlFor="rx-dosage">Dosage</label>
                        <input
                            id="rx-dosage"
                            className={fieldClass}
                            value={form.dosage}
                            onChange={setField('dosage')}
                            placeholder="e.g. 500 mg"
                            autoComplete="off"
                            required
                        />
                    </div>
                    <div className="min-w-0">
                        <label className={labelClass} htmlFor="rx-frequency">Frequency</label>
                        <input
                            id="rx-frequency"
                            className={fieldClass}
                            value={form.frequency}
                            onChange={setField('frequency')}
                            placeholder="e.g. twice daily"
                            autoComplete="off"
                            required
                        />
                    </div>
                    <div className="min-w-0">
                        <label className={labelClass} htmlFor="rx-route">Route</label>
                        <select
                            id="rx-route"
                            className={fieldClass}
                            value={form.route}
                            onChange={setField('route')}
                        >
                            {ROUTE_OPTIONS.map((route) => (
                                <option key={route} value={route}>
                                    {route.charAt(0).toUpperCase() + route.slice(1)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="min-w-0">
                        <label className={labelClass} htmlFor="rx-start">Start date</label>
                        <input
                            id="rx-start"
                            type="date"
                            className={fieldClass}
                            value={form.start_date}
                            onChange={setField('start_date')}
                            required
                        />
                    </div>
                    <div className="min-w-0">
                        <label className={labelClass} htmlFor="rx-end">End date (optional)</label>
                        <input
                            id="rx-end"
                            type="date"
                            className={fieldClass}
                            value={form.end_date}
                            onChange={setField('end_date')}
                            min={form.start_date || undefined}
                        />
                    </div>
                    <div className="min-w-0">
                        <label className={labelClass} htmlFor="rx-refills">Refills left</label>
                        <input
                            id="rx-refills"
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            className={fieldClass}
                            value={form.refills_left}
                            onChange={setField('refills_left')}
                        />
                    </div>
                </div>

                <div className="min-w-0">
                    <label className={labelClass} htmlFor="rx-instructions">Instructions (optional)</label>
                    <textarea
                        id="rx-instructions"
                        className={fieldClass}
                        rows="3"
                        value={form.instructions}
                        onChange={setField('instructions')}
                        placeholder="Take with food, avoid alcohol, review in four weeks..."
                    />
                </div>
            </form>
        </MobileSheet>
    );
};

export default PrescribeModal;
