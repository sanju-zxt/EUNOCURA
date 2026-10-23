import React from 'react';

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
                <p className="text-sm text-red-600 dark:text-red-400">Error: {error}</p>
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
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{report.headline}</h3>
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
                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-600 dark:text-gray-400">
                        <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span>Supported ({supported})</span>
                        </div>
                        <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                            <span>Page corrected ({corrected})</span>
                        </div>
                        <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 rounded-full bg-gray-500"></div>
                            <span>Dropped ({dropped})</span>
                        </div>
                    </div>
                </div>
                {report.model && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">Model: {report.model}</p>
                )}
            </div>
            <div className="p-4 max-h-[500px] overflow-auto space-y-3">
                {Array.isArray(report.claims) && report.claims.map((claimItem, index) => {
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
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                    <p className="text-sm text-gray-900 dark:text-white mb-2">{claimItem.claim}</p>
                                    <div className="flex items-center space-x-2">
                                        {getStatusBadge(claimItem.status, claimItem.page)}
                                        {isKept && claimItem.page && claimItem.status === 'supported' && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                                Page {claimItem.page}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {isKept && claimItem.quote && (
                                <p className="text-sm text-gray-700 dark:text-gray-300 italic mt-2 pl-2 border-l-2 border-gray-300 dark:border-gray-600">
                                    "{claimItem.quote}"
                                </p>
                            )}
                            {claimItem.status === 'dropped' && claimItem.reason && (
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{claimItem.reason}</p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CitationPanel;
