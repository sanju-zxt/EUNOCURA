// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

import React, { useState } from 'react';
import { AlertCircle, Pill, X } from 'lucide-react';
import { apiRequest } from '../../utils/api';
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

    const fieldClass =
        'w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-primary-500 dark:focus:border-primary-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500';
    const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 dark:bg-opacity-70 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto transition-colors duration-200">
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-start space-x-3">
                        <div className="bg-gradient-to-br from-primary-600 to-primary-700 p-2.5 rounded-xl shadow-md">
                            <Pill className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Prescribe</h2>
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
                            <label className={labelClass} htmlFor="rx-medication">Medication</label>
                            <input
                                id="rx-medication"
                                className={fieldClass}
                                value={form.medication}
                                onChange={setField('medication')}
                                placeholder="e.g. Metformin"
                                required
                            />
                        </div>
                        <div>
                            <label className={labelClass} htmlFor="rx-dosage">Dosage</label>
                            <input
                                id="rx-dosage"
                                className={fieldClass}
                                value={form.dosage}
                                onChange={setField('dosage')}
                                placeholder="e.g. 500 mg"
                                required
                            />
                        </div>
                        <div>
                            <label className={labelClass} htmlFor="rx-frequency">Frequency</label>
                            <input
                                id="rx-frequency"
                                className={fieldClass}
                                value={form.frequency}
                                onChange={setField('frequency')}
                                placeholder="e.g. twice daily"
                                required
                            />
                        </div>
                        <div>
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
                        <div>
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
                        <div>
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
                        <div>
                            <label className={labelClass} htmlFor="rx-refills">Refills left</label>
                            <input
                                id="rx-refills"
                                type="number"
                                min="0"
                                step="1"
                                className={fieldClass}
                                value={form.refills_left}
                                onChange={setField('refills_left')}
                            />
                        </div>
                    </div>

                    <div>
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
                            className={`px-6 py-2.5 rounded-lg bg-primary-600 dark:bg-primary-700 text-white font-medium hover:bg-primary-700 dark:hover:bg-primary-600 shadow-lg shadow-primary-500/30 transition-all ${
                                submitting ? 'opacity-50 cursor-wait' : 'transform hover:-translate-y-0.5'
                            }`}
                        >
                            {submitting ? 'Saving...' : 'Save prescription'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PrescribeModal;
