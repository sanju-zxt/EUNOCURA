// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Lohith Sanju P and the EUNOCURA contributors

import { apiRequest } from '../../utils/api';

/**
 * Write one notification into a patient's inbox after a clinical write succeeded.
 *
 * The backend's category enum is `appointment | medication | result | system`, so a
 * prescription notice travels as `medication` - the closest category the inbox knows.
 *
 * Returns `null` on success and a readable warning string otherwise. A failed
 * notification never invalidates the prescription or lab result that triggered it:
 * the record is already stored, so the caller only shows the warning.
 */
export const notifyPatient = async ({ patientId, title, body, category = 'medication' }) => {
    if (!patientId) return 'The record was saved, but the patient was not notified (no patient id).';

    const response = await apiRequest('/notifications/', {
        method: 'POST',
        body: JSON.stringify({ user_id: patientId, title, body, category }),
    });

    if (response.success) return null;
    return `Saved, but the patient inbox was not updated: ${response.error || 'notification failed'}`;
};
