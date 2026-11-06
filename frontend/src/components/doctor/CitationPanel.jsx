import React from 'react';

/**
 * The evidence panel for a generated answer.
 *
 * Phone shape: one compact claim per row, in this order — claim, status, page,
 * quote. The quote and its page number are never separated, never collapsed
 * behind a disclosure and never clipped: a claim is only allowed to stand
 * because its line exists on that page, so hiding either half of the proof
 * would make the panel dishonest. Desktop keeps the same badges in the same
 * header, so the wide layout is unchanged.
 */
const CitationPanel = ({ report, onJump, loading, error }) => {
    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Checking the evidence...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-red-600 dark:text-red-400 break-words">Error: {error}</p>
            </div>
        );
    }

    if (!report) {
        return null;
    }

    const supported = report.supported || 0;
    const corrected = report.page_corrected || 0;
    const dropped = report.dropped || 0;
    const total = report.total || supported + corrected + dropped || 0;

    const coveragePercent = typeof report.coverage === 'number' ? Math.round(report.coverage * 100) : 0;

    // Never let a malformed payload reach the screen as `undefined.map`.
    const claims = Array.isArray(report.claims) ? report.claims : [];

    const getStatusBadge = (status, page) => {
        if (status === 'supported') {
            return (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                    supported
                </span>
            );
        } else if (status === 'page_corrected') {
            return (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                    {page ? `page ${page} — corrected` : 'page corrected'}
                </span>
            );
        } else if (status === 'dropped') {
            return (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                    dropped
                </span>
            );
        }
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                {status}
            </span>
        );
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 break-words">{report.headline}</h3>
                <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                        <span>Coverage</span>
                        <span>{coveragePercent}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden flex">
                        {total > 0 && (
                            <>
                                <div
                                    className="bg-green-500 h-2"
                                    style={{ width: `${(supported / total) * 100}%` }}
                                    title={`Supported: ${supported}`}
                                ></div>
                                <div
                                    className="bg-yellow-500 h-2"
                                    style={{ width: `${(corrected / total) * 100}%` }}
                                    title={`Page corrected: ${corrected}`}
                                ></div>
                                <div
                                    className="bg-gray-500 h-2"
                                    style={{ width: `${(dropped / total) * 100}%` }}
                                    title={`Dropped: ${dropped}`}
                                ></div>
                            </>
                        )}
                    </div>
                    {/* A chip row, so it scrolls sideways instead of pushing the
                        panel wider than the phone. At md it fits on one line and
                        looks exactly as before. */}
                    <div className="scroll-x mt-2 flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                        <div className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span>Supported ({supported})</span>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap">
                            <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                            <span>Page corrected ({corrected})</span>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap">
                            <div className="w-2 h-2 rounded-full bg-gray-500"></div>
                            <span>Dropped ({dropped})</span>
                        </div>
                    </div>
                </div>
                {report.model && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 break-words">Model: {report.model}</p>
                )}
            </div>
            {/* On a phone the panel lives inside the composer's own scroller, so
                capping it here would nest a second scroll area and cut claims in
                half. The cap stays from md, where it has always been. */}
            <div className="p-4 space-y-3 md:max-h-[500px] md:overflow-auto">
                {claims.length === 0 ? (
                    <p className="text-sm italic text-gray-600 dark:text-gray-400">
                        No claims were offered for this document, so there is nothing to cite.
                    </p>
                ) : claims.map((claimItem, index) => {
                    const isKept = claimItem.status === 'supported' || claimItem.status === 'page_corrected';
                    const canJump = isKept && claimItem.page && onJump;

                    return (
                        <div
                            key={index}
                            className={`p-3 rounded-lg border ${
                                claimItem.status === 'supported'
                                    ? 'border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/10'
                                    : claimItem.status === 'page_corrected'
                                    ? 'border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/10'
                                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                            } ${canJump ? 'cursor-pointer hover:shadow-sm transition-shadow' : ''}`}
                            onClick={() => {
                                if (canJump) {
                                    onJump(claimItem.page, claimItem.coords || null);
                                }
                            }}
                        >
                            <div className="flex flex-col gap-2 mb-2">
                                <div className="min-w-0">
                                    <p className="text-sm text-gray-900 dark:text-white break-words">{claimItem.claim}</p>
                                </div>
                                {/* Badges wrap rather than push the row past 360px. */}
                                <div className="flex flex-wrap items-center gap-2">
                                    {getStatusBadge(claimItem.status, claimItem.page)}
                                    {isKept && claimItem.page && claimItem.status === 'supported' && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                            Page {claimItem.page}
                                        </span>
                                    )}
                                    {/* A phone has no hover to reveal that the row
                                        is tappable, so the affordance is stated —
                                        phone only, so the desktop row is unchanged. */}
                                    {canJump && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400 md:hidden">Tap to open the page</span>
                                    )}
                                </div>
                            </div>
                            {/* The line itself. It wraps; it is never truncated. */}
                            {isKept && claimItem.quote && (
                                <p className="text-sm text-gray-700 dark:text-gray-300 italic mt-2 pl-2 border-l-2 border-gray-300 dark:border-gray-600 break-words">
                                    "{claimItem.quote}"
                                </p>
                            )}
                            {/* A kept claim should always carry its line. If the
                                payload did not send one, say so instead of showing a
                                verification badge with no evidence behind it. */}
                            {isKept && !claimItem.quote && (
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 break-words">
                                    No line was returned with this claim, so nothing can be quoted for it.
                                </p>
                            )}
                            {claimItem.status === 'dropped' && claimItem.reason && (
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 break-words">{claimItem.reason}</p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CitationPanel;
