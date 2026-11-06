// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

import React, { useState } from 'react';
import { AlertCircle, FlaskConical, Loader2 } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import MobileSheet from '../mobile/MobileSheet';
import { notifyPatient } from './notifyPatient';

/** `datetime-local` wants local wall time without a zone, so build it from local parts. */
const nowInput = () => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
};

const blankForm = () => ({
    test_name: '',
    value: '',
    unit: '',
    reference_low: '',
    reference_high: '',
    taken_at: nowInput(),
    note: '',
});

// The form lives in the sheet body and submits from the button in the footer
// (`form=...`), so the panel is the frozen MobileSheet on both shapes — bottom
// sheet on a phone, centred dialog at md — while the payload, validation and
// post-submit flow stay exactly as they were. The sheet body scrolls on its own,
// so a tall form on a short screen never pushes the actions out of reach.
const FORM_ID = 'lab-result-form';

const LabResultModal = ({ isOpen, onClose, patient, onCreated }) => {
    const [form, setForm] = useState(blankForm);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const patientId = patient?.id || patient?._id || '';

    const setField = (field) => (event) => {
        const { value } = event.target;
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const optionalNumber = (raw) => {
        const text = String(raw ?? '').trim();
        if (!text) return { value: null, ok: true };
        const num = Number(text);
        return { value: num, ok: Number.isFinite(num) };
    };

    /** Client-side checks before the request. `status` is never sent: the server derives it. */
    const validate = () => {
        if (!patientId) return 'No patient selected.';
        if (!form.test_name.trim()) return 'Test name is required.';
        const value = optionalNumber(form.value);
        if (form.value === '' || !value.ok) return 'Value must be a number.';

        const low = optionalNumber(form.reference_low);
        if (!low.ok) return 'Reference low must be a number.';
        const high = optionalNumber(form.reference_high);
        if (!high.ok) return 'Reference high must be a number.';
        if (low.value !== null && high.value !== null && low.value > high.value) {
            return 'Reference low cannot be greater than reference high.';
        }
        if (!form.taken_at) return 'Taken at is required.';
        if (Number.isNaN(new Date(form.taken_at).getTime())) return 'Taken at is not a valid date and time.';
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

        const low = optionalNumber(form.reference_low);
        const high = optionalNumber(form.reference_high);

        const response = await apiRequest('/lab-results/', {
            method: 'POST',
            body: JSON.stringify({
                patient_id: patientId,
                test_name: form.test_name.trim(),
                value: Number(form.value),
                unit: form.unit.trim(),
                reference_low: low.value,
                reference_high: high.value,
                taken_at: new Date(form.taken_at).toISOString(),
                note: form.note.trim() || null,
            }),
        });

        if (!response.success) {
            setError(response.error || 'Could not save the lab result.');
            setSubmitting(false);
            return;
        }

        const record = response.data || {};
        const warning = await notifyPatient({
            patientId,
            title: 'New lab result',
            body: `${record.test_name || form.test_name.trim()}: ${record.value ?? form.value}${
                record.unit || form.unit ? ` ${record.unit || form.unit.trim()}` : ''
            }. Open Test Results to see the trend.`,
            category: 'result',
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

    // `text-base` keeps the OS from zooming the page on focus, and `.tap` holds
    // every field at least 44px tall even with an empty value on a 360px screen.
    const fieldClass =
        'tap w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg text-base focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-primary-500 dark:focus:border-primary-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500';
    const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2';

    // The failure message sits in the footer, directly above the buttons, so a
    // check that fails while the body is scrolled away can never be missed.
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
                    className={`tap inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 font-medium bg-teal-600 dark:bg-teal-700 text-white hover:bg-teal-700 dark:hover:bg-teal-600 shadow-lg shadow-teal-500/30 transition-all sm:w-auto ${
                        submitting ? 'opacity-50 cursor-wait' : 'transform hover:-translate-y-0.5'
                    }`}
                >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                    <span>{submitting ? 'Saving...' : 'Save result'}</span>
                </button>
            </div>
        </div>
    );

    return (
        <MobileSheet
            open
            onClose={handleClose}
            title="Add lab result"
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
                        <label className={labelClass} htmlFor="lab-test">Test name</label>
                        <input
                            id="lab-test"
                            className={fieldClass}
                            value={form.test_name}
                            onChange={setField('test_name')}
                            placeholder="e.g. HbA1c"
                            autoComplete="off"
                            required
                        />
                    </div>
                    <div className="min-w-0">
                        <label className={labelClass} htmlFor="lab-unit">Unit (recommended)</label>
                        <input
                            id="lab-unit"
                            className={fieldClass}
                            value={form.unit}
                            onChange={setField('unit')}
                            placeholder="mg/dL, %, g/dL"
                            autoComplete="off"
                        />
                    </div>
                    <div className="min-w-0">
                        <label className={labelClass} htmlFor="lab-value">Value</label>
                        <input
                            id="lab-value"
                            type="number"
                            inputMode="decimal"
                            step="any"
                            className={fieldClass}
                            value={form.value}
                            onChange={setField('value')}
                            placeholder="e.g. 6.4"
                            required
                        />
                    </div>
                    <div className="min-w-0">
                        <label className={labelClass} htmlFor="lab-taken">Taken at</label>
                        <input
                            id="lab-taken"
                            type="datetime-local"
                            className={fieldClass}
                            value={form.taken_at}
                            onChange={setField('taken_at')}
                            required
                        />
                    </div>
                    <div className="min-w-0">
                        <label className={labelClass} htmlFor="lab-low">Reference low (optional)</label>
                        <input
                            id="lab-low"
                            type="number"
                            inputMode="decimal"
                            step="any"
                            className={fieldClass}
                            value={form.reference_low}
                            onChange={setField('reference_low')}
                            placeholder="e.g. 4.0"
                        />
                    </div>
                    <div className="min-w-0">
                        <label className={labelClass} htmlFor="lab-high">Reference high (optional)</label>
                        <input
                            id="lab-high"
                            type="number"
                            inputMode="decimal"
                            step="any"
                            className={fieldClass}
                            value={form.reference_high}
                            onChange={setField('reference_high')}
                            placeholder="e.g. 5.6"
                        />
                    </div>
                </div>

                <div className="flex items-start gap-2">
                    <FlaskConical
                        className="w-4 h-4 mt-0.5 flex-shrink-0 text-teal-600 dark:text-teal-400"
                        aria-hidden="true"
                    />
                    <p className="min-w-0 text-sm sm:text-xs text-gray-500 dark:text-gray-400 break-words">
                        The normal / high / low badge is calculated by the server from the value and this
                        range. It is not entered by hand.
                    </p>
                </div>

                <div className="min-w-0">
                    <label className={labelClass} htmlFor="lab-note">Note (optional)</label>
                    <textarea
                        id="lab-note"
                        className={fieldClass}
                        rows="3"
                        value={form.note}
                        onChange={setField('note')}
                        placeholder="Fasting sample, repeat in three months..."
                    />
                </div>
            </form>
        </MobileSheet>
    );
};

export default LabResultModal;
