import React, { useState, useRef } from 'react';
import {
    Calendar,
    Clock,
    Eye,
    Download,
    Play,
    MessageCircle,
    FileText,
    Sparkles,
    CheckCircle
} from 'lucide-react';
import ChatModal from './ChatModal';
import DiagnosisDashboard from '../diagnosis/Main';
import { exportComponentAsPDF } from '../../utils/pdfExport';
import { resolveAssetUrl } from '../../utils/api';

/**
 * One label/value pair in the card's phone layout: the label stays put and the
 * value wraps. A date, a doctor and a chief complaint are clinical facts, so
 * they get a full-width row instead of being squeezed into a column.
 */
const DetailRow = ({ label, value }) => (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 dark:border-gray-700 py-1.5 last:border-b-0">
        <dt className="flex-shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400">{label}</dt>
        <dd className="min-w-0 break-words text-right text-sm font-semibold text-gray-900 dark:text-white">{value}</dd>
    </div>
);

const AppointmentHistoryCard = ({
    appointment,
    patientId,
    patientName,
    onStartSession,
    currentUser
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const cardRef = useRef(null);

    const session = appointment.session;
    const appointmentNo = appointment.id.split('-')[1];

    const handleExportPDF = async () => {
        // Ensure card is expanded to capture all details
        if (!isExpanded && session) {
            setIsExpanded(true);
            // Wait for React to re-render and DOM to update
            // Use multiple animation frames to ensure expansion is complete
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        setTimeout(resolve, 500); // Additional delay for animations
                    });
                });
            });
        } else if (isExpanded) {
            // Even if already expanded, wait a bit to ensure everything is rendered
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (cardRef.current) {
            const appointmentType = appointmentNo == 0 ? 'baseline' : `followup-${appointmentNo}`;
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = `appointment-${appointmentType}-${dateStr}`;
            
            await exportComponentAsPDF(
                cardRef,
                filename,
                { backgroundColor: '#ffffff' }
            );
        }
    };

    const getStatusBadge = (status) => {
        const badges = {
            'scheduled': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
            'in_progress': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
            'paused': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
            'completed': 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
            'cancelled': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
        };
        return badges[status] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    };

    const statusLabel = (appointment.status || 'completed').replace('_', ' ');

    // Same two fields the card has always printed, phrased for a labelled row and
    // without writing "undefined" into a clinical record.
    const scheduleLabel = (() => {
        const { scheduledDate, scheduledTime } = appointment;
        if (scheduledDate && scheduledTime) return `${scheduledDate} at ${scheduledTime}`;
        if (scheduledDate) return scheduledDate;
        if (scheduledTime) return scheduledTime;
        return 'Not recorded';
    })();

    return (
        <>
            <div 
                ref={cardRef}
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 md:p-6 border border-gray-100 dark:border-gray-700 transition-all duration-200 ${isExpanded ? 'ring-2 ring-primary-500 dark:ring-primary-400 shadow-lg' : 'hover:shadow-lg'}`}
            >
                {/* Appointment Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 mb-1 md:items-center">
                            <Calendar className="w-5 h-5 mt-0.5 flex-shrink-0 text-gray-600 dark:text-gray-400 md:mt-0" aria-hidden="true" />
                            <h4 className="min-w-0 text-base md:text-lg font-bold text-gray-900 dark:text-white break-words">
                                {appointmentNo == 0 ? "Baseline Visit" : `Follow Up Visit #${appointmentNo}`}
                            </h4>
                        </div>
                        {/* Desktop: the three lines this card has always shown. */}
                        <p className="hidden md:block text-base font-semibold mb-1 text-gray-900 dark:text-white">Doctor: {appointment.doctor?.name || 'Unknown'}</p>
                        <p className="hidden md:block text-sm text-gray-700 dark:text-gray-300 mb-1"><span className="font-semibold">Chief Complaint:</span> {appointment.chiefComplaint}</p>
                        <p className="hidden md:block text-sm text-gray-600 dark:text-gray-400 mb-1 italic">
                            "{appointment.scheduledDate} at {appointment.scheduledTime}"
                        </p>

                        {/* Phone: stacked labelled rows, so the status no longer
                            competes with the title for the 360px line. */}
                        <dl className="mt-2 md:hidden">
                            <DetailRow label="Doctor" value={appointment.doctor?.name || 'Unknown'} />
                            <DetailRow label="Chief complaint" value={appointment.chiefComplaint || 'Not recorded'} />
                            <DetailRow label="Scheduled" value={scheduleLabel} />
                            <DetailRow
                                label="Status"
                                value={
                                    <span className={`inline-block text-xs px-3 py-1 rounded-full font-semibold ${getStatusBadge(appointment.status || 'completed')}`}>
                                        {statusLabel}
                                    </span>
                                }
                            />
                        </dl>
                    </div>
                    <span className={`hidden md:inline-flex flex-shrink-0 text-xs px-3 py-1 rounded-full font-semibold ${getStatusBadge(appointment.status || 'completed')}`}>
                        {statusLabel}
                    </span>
                </div>

                {/* Action Buttons — full-width stacked rows on a phone, one row from md. */}
                <div className="flex flex-col gap-2 md:flex-row">
                    {/* Start/Resume Session Buttons for PatientsPage */}
                    {onStartSession && appointment.status === 'in_progress' && (currentUser?._id === appointment.doctor?.id || currentUser?.id === appointment.doctor?.id) && (
                        <button
                            onClick={() => onStartSession(appointment.id)}
                            className="min-h-[44px] w-full md:min-h-0 md:w-auto md:flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center shadow-md hover:shadow-lg"
                        >
                            <Play className="w-4 h-4 mr-2" aria-hidden="true" />
                            RESUME SESSION
                        </button>
                    )}

                    {onStartSession && appointment.status === 'scheduled' && (currentUser?._id === appointment.doctor?.id || currentUser?.id === appointment.doctor?.id) && (
                        <button
                            onClick={() => onStartSession(appointment.id)}
                            className="min-h-[44px] w-full md:min-h-0 md:w-auto md:flex-1 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center shadow-md hover:shadow-lg"
                        >
                            <Play className="w-4 h-4 mr-2" aria-hidden="true" />
                            START SESSION
                        </button>
                    )}

                    {/* Completed / History View Actions */}
                    {(!appointment.status || appointment.status === 'completed') && (
                        <>
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="min-h-[44px] w-full md:min-h-0 md:w-auto md:flex-1 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center shadow-md hover:shadow-lg"
                            >
                                <Eye className="w-4 h-4 mr-2" aria-hidden="true" />
                                {isExpanded ? 'Hide Details' : 'View Details'}
                            </button>

                            <button
                                onClick={() => setIsChatOpen(true)}
                                className="min-h-[44px] w-full md:min-h-0 md:w-auto md:flex-1 bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center border border-indigo-200 dark:border-indigo-700 shadow-sm hover:shadow-md"
                            >
                                <MessageCircle className="w-4 h-4 mr-2" aria-hidden="true" />
                                View Chats
                            </button>

                            <button 
                                onClick={handleExportPDF}
                                className="min-h-[44px] w-full md:min-h-0 md:w-auto bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center shadow-sm hover:shadow-md"
                            >
                                <Download className="w-4 h-4 mr-2" aria-hidden="true" />
                                Export
                            </button>
                        </>
                    )}
                </div>

                {/* Expanded Details */}
                {isExpanded && session && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <h5 className="text-lg font-bold text-gray-900 dark:text-white mb-4 break-words">Session Details</h5>

                        {/* Discussion */}
                        {session.discussion && (
                            <div className="mb-6">
                                <h6 className="flex items-center text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                                    <span className="w-5 h-5 mr-2 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">🎤</span>
                                    Discussion
                                </h6>
                                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-100 dark:border-gray-600 max-h-60 overflow-y-auto">
                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed break-words">{session.discussion}</p>
                                </div>
                            </div>
                        )}

                        {/* Reports */}
                        {session.reports && session.reports.length > 0 && (
                            <div className="mb-6">
                                <h6 className="flex items-center text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                                    <span className="w-5 h-5 mr-2 flex items-center justify-center bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full">📋</span>
                                    Reports
                                </h6>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {session.reports.map((report, idx) => (
                                        <div key={idx} className="flex items-center justify-between gap-2 md:gap-0 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:border-green-300 dark:hover:border-green-500 rounded-lg p-3 shadow-sm transition-all group">
                                            {/* A report's filename is what a clinician scans for;
                                                on a phone it wraps in full instead of ending in "…". */}
                                            <div className="flex min-w-0 items-center space-x-3 md:overflow-hidden">
                                                <FileText className="w-5 h-5 flex-shrink-0 text-gray-400 dark:text-gray-500 group-hover:text-green-500 dark:group-hover:text-green-400" aria-hidden="true" />
                                                <span className="min-w-0 text-sm font-medium text-gray-700 dark:text-gray-300 break-words md:truncate" title={report.file_name}>{report.file_name}</span>
                                            </div>
                                            <a
                                                href={resolveAssetUrl(report.uri || report.file_url || report.pdf_url)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="ml-2 flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center p-1.5 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors md:min-h-0 md:min-w-0"
                                                title="Open Report"
                                            >
                                                <Eye className="w-4 h-4" aria-hidden="true" />
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tests */}
                        {session.tests && session.tests.length > 0 && (
                            <div className="mb-6">
                                <h6 className="flex items-center text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                                    <span className="w-5 h-5 mr-2 flex items-center justify-center bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full">🧪</span>
                                    Tests
                                </h6>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {session.tests.map((test, idx) => (
                                        <div key={idx} className="flex items-center justify-between gap-2 md:gap-0 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-500 rounded-lg p-3 shadow-sm transition-all group">
                                            <div className="flex min-w-0 items-center space-x-3 md:overflow-hidden">
                                                <FileText className="w-5 h-5 flex-shrink-0 text-gray-400 dark:text-gray-500 group-hover:text-purple-500 dark:group-hover:text-purple-400" aria-hidden="true" />
                                                <span className="min-w-0 text-sm font-medium text-gray-700 dark:text-gray-300 break-words md:truncate" title={test.doc_name}>{test.doc_name}</span>
                                            </div>
                                            <a
                                                href={resolveAssetUrl(test.uri || test.file_url || test.pdf_url)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="ml-2 flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center p-1.5 text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors md:min-h-0 md:min-w-0"
                                                title="Open Test Document"
                                            >
                                                <Eye className="w-4 h-4" aria-hidden="true" />
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Generated Diagnosis */}
                        {(appointment.diagnosis_generated_at || session.generated_diagnosis) && (
                            <div className="mb-6 mt-8 border-2 border-indigo-100 dark:border-indigo-800 bg-white dark:bg-gray-800 rounded-lg p-4">
                                <div className="mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                                    <h6 className="text-lg font-bold text-gray-900 dark:text-white flex items-center break-words">
                                        <Sparkles className="w-5 h-5 mr-2 flex-shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                                        AI Diagnostic Analysis
                                    </h6>
                                    {appointment.diagnosis_generated_at && (
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            Generated on {new Date(appointment.diagnosis_generated_at).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                                {session.generated_diagnosis && (
                                    <DiagnosisDashboard
                                        data={session.generated_diagnosis}
                                        text={session.generated_diagnosis_text}
                                    />
                                )}
                            </div>
                        )}

                        {/* Fallback if no details */}
                        {!session.discussion && (!session.reports || session.reports.length === 0) && (!session.tests || session.tests.length === 0) && !appointment.diagnosis_generated_at && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-4">No detailed session records available.</p>
                        )}
                    </div>
                )}
            </div>

            {/* Chat History Modal */}
            <ChatModal
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                appointmentId={appointment.id}
                patientId={patientId}
                patientName={patientName}
                readOnly={true}
            />
        </>
    );
};

export default AppointmentHistoryCard;
