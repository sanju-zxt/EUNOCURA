import React from 'react';
import { FlaskConical } from 'lucide-react';

/**
 * Honest label for screens that still render fixture data.
 *
 * `src/data/previewDietPlan.js` is the only fixture left in the repo, and it
 * only renders when a patient has no clinician plan on file. A judge who logs in
 * as a new patient must be able to tell that apart from a working backend, so
 * the screen itself says so — not only the README.
 *
 * Phone: the banner is deliberately loud (dashed amber, 16px inset) and the copy
 * wraps instead of truncating, so `src/data/previewDietPlan.js` stays readable
 * at 360px. It is a static note, never a toast: no close button, nothing that
 * can be dismissed, and `role="note"` rather than a live region because the text
 * does not change while it is on screen.
 *
 * Desktop (`md:`+): same banner, same padding, same type as before the mobile
 * pass.
 *
 * Props are unchanged: `feature`, `source`, `note`.
 */
const FixtureNotice = ({ feature, source = 'src/data/previewDietPlan.js', note }) => (
    <div
        role="note"
        className="mb-6 rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex items-start gap-3"
    >
        <FlaskConical
            className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
            aria-hidden="true"
        />
        <div className="min-w-0 flex-1 text-sm leading-relaxed md:leading-5 space-y-1 md:space-y-0">
            <p className="font-semibold text-amber-900 dark:text-amber-200 break-words">
                Interactive preview · fixture data
            </p>
            <p className="text-amber-800 dark:text-amber-300 break-words">
                {note || `This ${feature} screen renders sample rows from ${source}. It is not connected to a backend route yet, and none of it is real patient data.`}
            </p>
        </div>
    </div>
);

export default FixtureNotice;
