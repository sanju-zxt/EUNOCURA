import React from 'react';

/**
 * Fallback shown while a lazily-loaded route chunk is fetched.
 *
 * Deliberately plain: same full-height centred layout as ProtectedRoute's own
 * loading state, so swapping in a route causes no visible layout shift. The ring
 * and the two text lines occupy a fixed height, so nothing jumps when the chunk
 * arrives or when the system asks for reduced motion (the ring then holds still
 * and the label carries the message).
 *
 * Announced politely to screen readers (aria-live) so a chunk fetch is not a
 * silent gap for assistive tech. The spinner itself is decorative.
 */
const RouteFallback = () => {
  return (
    <div
      className="min-h-app bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-safe pt-safe pb-safe transition-colors duration-200"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="px-6 text-center">
        <div className="relative h-12 w-12 mx-auto mb-4" aria-hidden="true">
          <div className="absolute inset-0 rounded-full border-2 border-gray-200 dark:border-gray-700"></div>
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-b-primary-600 motion-safe:animate-spin"></div>
        </div>
        <p className="text-gray-600 dark:text-gray-400 font-medium">EUNOCURA</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      </div>
    </div>
  );
};

export default RouteFallback;
