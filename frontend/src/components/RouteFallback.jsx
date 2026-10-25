import React from 'react';

/**
 * Fallback shown while a lazily-loaded route chunk is fetched.
 *
 * Deliberately plain: same full-height centred layout as ProtectedRoute's own
 * loading state, so swapping in a route causes no visible layout shift.
 *
 * Announced politely to screen readers (aria-live) so a chunk fetch is not a
 * silent gap for assistive tech. The spinner itself is decorative.
 */
const RouteFallback = () => {
  return (
    <div
      className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center transition-colors duration-200"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="text-center">
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"
          aria-hidden="true"
        ></div>
        <p className="text-gray-600 dark:text-gray-400 font-medium">EUNOCURA</p>
        <span className="sr-only">Loading, please wait.</span>
      </div>
    </div>
  );
};

export default RouteFallback;
