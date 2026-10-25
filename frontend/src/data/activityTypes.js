/**
 * The activity types a consultation session step can have.
 *
 * This is the only thing still imported from the old `appointmentData.js`
 * fixture module, and it is not data: it is a UI enum. It lives on its own so
 * that deleting the fake patients / appointments / schedules did not mean
 * inventing a duplicate set of string literals inside `ActiveSession.jsx`.
 */
export const ACTIVITY_TYPES = {
  RECORDING: 'recording',
  DOCUMENTS: 'documents',
  REPORT: 'report',
  TESTS: 'tests',
  DIAGNOSIS: 'diagnosis',
  ADDITIONAL_DOCS: 'additional_docs',
};
