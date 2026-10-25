// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

import React, { useState } from 'react';
import { AlertCircle, FlaskConical, X } from 'lucide-react';
import { apiRequest } from '../../utils/api';
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

    const fieldClass =
        'w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-primary-500 dark:focus:border-primary-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500';
    const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 dark:bg-opacity-70 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto transition-colors duration-200">
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-start space-x-3">
                        <div className="bg-gradient-to-br from-teal-600 to-teal-700 p-2.5 rounded-xl shadow-md">
                            <FlaskConical className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Add lab result</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {patient?.name ? `For ${patient.name}` : 'Selected patient'}
                                {patientId ? ` (${patientId})` : ''}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {error && (
                        <div className="flex items-start space-x-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                        </div>
                    )}

                    <div className="grid sm:grid-cols-2 gap-5">
                        <div>
                            <label className={labelClass} htmlFor="lab-test">Test name</label>
                            <input
                                id="lab-test"
                                className={fieldClass}
                                value={form.test_name}
                                onChange={setField('test_name')}
                                placeholder="e.g. HbA1c"
                                required
                            />
                        </div>
                        <div>
                            <label className={labelClass} htmlFor="lab-unit">Unit (recommended)</label>
                            <input
                                id="lab-unit"
                                className={fieldClass}
                                value={form.unit}
                                onChange={setField('unit')}
                                placeholder="mg/dL, %, g/dL"
                            />
                        </div>
                        <div>
                            <label className={labelClass} htmlFor="lab-value">Value</label>
                            <input
                                id="lab-value"
                                type="number"
                                step="any"
                                className={fieldClass}
                                value={form.value}
                                onChange={setField('value')}
                                placeholder="e.g. 6.4"
                                required
                            />
                        </div>
                        <div>
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
                        <div>
                            <label className={labelClass} htmlFor="lab-low">Reference low (optional)</label>
                            <input
                                id="lab-low"
                                type="number"
                                step="any"
                                className={fieldClass}
                                value={form.reference_low}
                                onChange={setField('reference_low')}
                                placeholder="e.g. 4.0"
                            />
                        </div>
                        <div>
                            <label className={labelClass} htmlFor="lab-high">Reference high (optional)</label>
                            <input
                                id="lab-high"
                                type="number"
                                step="any"
                                className={fieldClass}
                                value={form.reference_high}
                                onChange={setField('reference_high')}
                                placeholder="e.g. 5.6"
                            />
                        </div>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        The normal / high / low badge is calculated by the server from the value and this
                        range. It is not entered by hand.
                    </p>

                    <div>
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

                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={submitting}
                            className="px-6 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className={`px-6 py-2.5 rounded-lg bg-teal-600 dark:bg-teal-700 text-white font-medium hover:bg-teal-700 dark:hover:bg-teal-600 shadow-lg shadow-teal-500/30 transition-all ${
                                submitting ? 'opacity-50 cursor-wait' : 'transform hover:-translate-y-0.5'
                            }`}
                        >
                            {submitting ? 'Saving...' : 'Save result'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LabResultModal;
