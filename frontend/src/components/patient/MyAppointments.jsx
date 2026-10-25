import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  CalendarPlus,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  FileText,
  FlaskConical,
  PauseCircle,
  RefreshCw,
  Stethoscope,
  XCircle,
} from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

const UPCOMING_STATUSES = ['scheduled', 'in_progress', 'paused'];
const PAST_STATUSES = ['completed', 'cancelled'];

const STATUS_STYLES = {
  scheduled: { pill: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', label: 'Scheduled' },
  in_progress: { pill: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300', label: 'In Progress' },
  paused: { pill: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300', label: 'Paused' },
  completed: { pill: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', label: 'Completed' },
  cancelled: { pill: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300', label: 'Cancelled' },
};

const normaliseStatus = (status) => String(status || '').toLowerCase();

const statusStyle = (status) => {
  const key = normaliseStatus(status);
  if (STATUS_STYLES[key]) return STATUS_STYLES[key];
  const label = key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Unknown';
  return { pill: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', label };
};

const StatusIcon = ({ status }) => {
  const key = normaliseStatus(status);
  if (key === 'completed') return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />;
  if (key === 'cancelled') return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />;
  if (key === 'paused') return <PauseCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />;
  if (key === 'in_progress') return <Clock className="w-5 h-5 text-green-600 dark:text-green-400 animate-pulse flex-shrink-0" />;
  return <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />;
};

// Dates arrive either as full ISO strings or as a plain YYYY-MM-DD, which must not shift a day.
const toDate = (value) => {
  if (!value) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
};

const formatTime = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null;
};

const appointmentWhen = (appointment) => toDate(appointment?.start_time) || toDate(appointment?.appointment_date);

const soonestFirst = (a, b) => {
  const left = appointmentWhen(a);
  const right = appointmentWhen(b);
  return (left ? left.getTime() : Infinity) - (right ? right.getTime() : Infinity);
};

const newestFirst = (a, b) => {
  const left = appointmentWhen(a);
  const right = appointmentWhen(b);
  return (right ? right.getTime() : -Infinity) - (left ? left.getTime() : -Infinity);
};

const documentName = (doc, fallback) => doc?.doc_name || doc?.name || fallback;

const DocumentsRow = ({ icon: Icon, iconClass, label, detail, href }) => (
  <div className="flex items-start justify-between gap-3 p-2 rounded bg-gray-50 dark:bg-gray-700/60">
    <div className="flex items-start space-x-2 min-w-0">
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconClass}`} />
      <div className="min-w-0">
        <span className="text-sm font-semibold text-gray-900 dark:text-white break-words">{label}</span>
        {detail && <p className="text-xs text-gray-600 dark:text-gray-400 break-words">{detail}</p>}
      </div>
    </div>
    {href && (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 whitespace-nowrap transition-colors"
      >
        Open
      </a>
    )}
  </div>
);

const AppointmentCard = ({ appointment, expanded, onToggleNote }) => {
  const badge = statusStyle(appointment.status);
  const status = normaliseStatus(appointment.status);
  const doctorName = appointment.doctor?.name || 'Doctor not recorded';
  const specialization = appointment.doctor?.specialization;

  const dateLabel = formatDate(appointment.appointment_date || appointment.start_time);
  const startLabel = formatTime(appointment.start_time);
  const endLabel = formatTime(appointment.end_time);

  const reports = Array.isArray(appointment.reports) ? appointment.reports : [];
  const tests = Array.isArray(appointment.tests) ? appointment.tests : [];
  const draftDiagnosis = appointment.generated_diagnosis?.primary_diagnosis || null;
  const clinicianNote = appointment.doctor_diagnosis?.text || null;
  const clinicianFiles = Array.isArray(appointment.doctor_diagnosis?.files) ? appointment.doctor_diagnosis.files : [];
  const summary = appointment.discussion_summary || null;

  const hasRecords = reports.length > 0 || tests.length > 0 || Boolean(draftDiagnosis) || clinicianFiles.length > 0;
  const hasNote = Boolean(clinicianNote) || Boolean(summary);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md dark:hover:bg-gray-700/50 transition-all">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="flex items-start space-x-3 min-w-0">
          <StatusIcon status={appointment.status} />
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white break-words">{doctorName}</h3>
            <p className="text-sm text-blue-600 dark:text-blue-400 flex items-center">
              <Stethoscope className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
              {specialization || 'Speciality not recorded'}
            </p>
          </div>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap ${badge.pill}`}>
          {badge.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="flex items-start space-x-2">
          <Calendar className="w-4 h-4 mt-0.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400">Date</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{dateLabel || 'Not recorded'}</p>
          </div>
        </div>
        <div className="flex items-start space-x-2">
          <Clock className="w-4 h-4 mt-0.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400">Time</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {startLabel ? (endLabel ? `${startLabel} – ${endLabel}` : startLabel) : 'Not recorded'}
            </p>
          </div>
        </div>
      </div>

      {appointment.chief_complaint && (
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-3">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Reason for Visit:</p>
          <p className="text-sm text-gray-900 dark:text-white font-semibold break-words">{appointment.chief_complaint}</p>
        </div>
      )}

      {hasRecords && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mb-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Records from this visit:</h4>
          <div className="space-y-2">
            {reports.map((report, index) => (
              <DocumentsRow
                key={report?.report_id || `report-${index}`}
                icon={FileText}
                iconClass="text-green-600 dark:text-green-400"
                label={documentName(report, 'Report')}
                detail={report?.summary}
                href={report?.uri}
              />
            ))}
            {tests.map((testDoc, index) => {
              const names = Array.isArray(testDoc?.tests)
                ? testDoc.tests.map((item) => item?.name).filter(Boolean).join(', ')
                : '';
              return (
                <DocumentsRow
                  key={testDoc?.doc_id || `test-${index}`}
                  icon={FlaskConical}
                  iconClass="text-purple-600 dark:text-purple-400"
                  label={documentName(testDoc, 'Test results')}
                  detail={names || testDoc?.summary || null}
                  href={testDoc?.uri}
                />
              );
            })}
            {draftDiagnosis && (
              <DocumentsRow
                icon={ClipboardList}
                iconClass="text-amber-600 dark:text-amber-400"
                label={draftDiagnosis.diagnosis_name || 'Generated diagnosis draft'}
                detail="Model-generated draft recorded during the consult — not a confirmed diagnosis."
              />
            )}
            {clinicianFiles.map((file, index) => (
              <DocumentsRow
                key={file?.name || `dx-file-${index}`}
                icon={FileText}
                iconClass="text-blue-600 dark:text-blue-400"
                label={file?.name || `Clinician file ${index + 1}`}
                href={file?.uri}
              />
            ))}
          </div>
        </div>
      )}

      {hasNote && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <button
            type="button"
            onClick={onToggleNote}
            className="text-sm font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 inline-flex items-center transition-colors"
          >
            {expanded ? 'Hide visit note' : 'View visit note'}
            {expanded ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
          </button>

          {expanded && (
            <div className="mt-3 space-y-3 max-h-96 overflow-y-auto">
              {summary && (
                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1">Visit summary</p>
                  <p className="text-sm text-blue-800 dark:text-blue-300 whitespace-pre-wrap break-words">{summary}</p>
                </div>
              )}
              {clinicianNote && (
                <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Clinician's note</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">{clinicianNote}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!hasRecords && !hasNote && status !== 'scheduled' && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No records have been attached to this appointment.
        </p>
      )}
    </div>
  );
};

const Skeleton = () => (
  <div className="space-y-4 animate-pulse">
    {[0, 1].map((row) => (
      <div key={row} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
        <div className="h-14 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    ))}
  </div>
);

const MyAppointments = () => {
  const { user, loading: authLoading } = useAuth();
  const patientId = user?._id || user?.id || null;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    if (!patientId) {
      setItems([]);
      setLoading(authLoading);
      setError(authLoading ? null : 'No signed-in patient, so appointments cannot be loaded.');
      return;
    }

    setLoading(true);
    const result = await apiRequest(`/appointments/?patient_id=${encodeURIComponent(patientId)}`);
    if (result.success) {
      const list = Array.isArray(result.data)
        ? result.data
        : Array.isArray(result.data?.items)
          ? result.data.items
          : [];
      // The endpoint returns everyone's rows if the filter is dropped, so re-check ownership.
      setItems(list.filter((appointment) => String(appointment?.patient_id) === String(patientId)));
      setError(null);
    } else {
      setItems([]);
      setError(result.error || 'Could not load your appointments.');
    }
    setLoading(false);
  }, [patientId, authLoading]);

  useEffect(() => {
    load();
  }, [load]);

  const { upcomingAppointments, pastAppointments } = useMemo(() => {
    const upcoming = [];
    const past = [];
    items.forEach((appointment) => {
      const status = normaliseStatus(appointment?.status);
      if (UPCOMING_STATUSES.includes(status)) upcoming.push(appointment);
      else if (PAST_STATUSES.includes(status)) past.push(appointment);
    });
    return {
      upcomingAppointments: upcoming.sort(soonestFirst),
      pastAppointments: past.sort(newestFirst),
    };
  }, [items]);

  const completedCount = items.filter((appointment) => normaliseStatus(appointment?.status) === 'completed').length;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">My Appointments</h2>
        <p className="text-gray-600 dark:text-gray-400">Your consultations on record from your care team</p>
      </div>

      {loading && (
        <div className="card mb-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
            Loading your appointments
          </h3>
          <Skeleton />
        </div>
      )}

      {!loading && error && (
        <div className="card mb-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 dark:text-red-200 mb-1">Could not load your appointments</h3>
              <p className="text-sm text-red-800 dark:text-red-300 mb-3">{error}</p>
              <button type="button" onClick={load} className="btn-secondary text-sm inline-flex items-center">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="card mb-6 text-center py-12 hover:shadow-xl transition-all duration-200">
          <Calendar className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-700 dark:text-gray-300 font-semibold mb-1">No appointments yet</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Appointments appear here once one is booked for you.
          </p>
          <Link to="/patient/book-appointment" className="btn-primary text-sm inline-flex items-center">
            <CalendarPlus className="w-4 h-4 mr-2" />
            Book an appointment
          </Link>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="card bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 border-blue-200 dark:border-blue-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">{items.length}</div>
                <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">Total Appointments</p>
              </div>
            </div>
            <div className="card bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 border-green-200 dark:border-green-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-900 dark:text-green-100">{upcomingAppointments.length}</div>
                <p className="text-sm text-green-700 dark:text-green-300 font-medium">Upcoming</p>
              </div>
            </div>
            <div className="card bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 border-gray-200 dark:border-gray-600 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{completedCount}</div>
                <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">Completed</p>
              </div>
            </div>
          </div>

          <div className="card mb-6 hover:shadow-xl transition-all duration-200">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-green-600 dark:text-green-400" />
              Upcoming Appointments ({upcomingAppointments.length})
            </h3>
            {upcomingAppointments.length > 0 ? (
              <div className="space-y-4">
                {upcomingAppointments.map((appointment, index) => (
                  <AppointmentCard
                    key={appointment._id || appointment.id || `upcoming-${index}`}
                    appointment={appointment}
                    expanded={expandedId === (appointment._id || appointment.id)}
                    onToggleNote={() =>
                      setExpandedId((current) =>
                        current === (appointment._id || appointment.id) ? null : appointment._id || appointment.id
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No upcoming appointments. Book one when you need a consultation.
              </p>
            )}
          </div>

          <div className="card hover:shadow-xl transition-all duration-200">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-gray-600 dark:text-gray-400" />
              Past Appointments ({pastAppointments.length})
            </h3>
            {pastAppointments.length > 0 ? (
              <div className="space-y-4">
                {pastAppointments.map((appointment, index) => (
                  <AppointmentCard
                    key={appointment._id || appointment.id || `past-${index}`}
                    appointment={appointment}
                    expanded={expandedId === (appointment._id || appointment.id)}
                    onToggleNote={() =>
                      setExpandedId((current) =>
                        current === (appointment._id || appointment.id) ? null : appointment._id || appointment.id
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">No past appointments on record.</p>
            )}
          </div>
        </>
      )}

      <div className="card mt-8 bg-gradient-to-r from-teal-50 to-blue-50 dark:from-teal-900/20 dark:to-blue-900/20 border-2 border-teal-200 dark:border-teal-700 hover:shadow-xl transition-all duration-200">
        <div className="flex items-start space-x-3">
          <div className="bg-gradient-to-br from-teal-500 to-teal-600 p-2 rounded-xl shadow-md">
            <CalendarPlus className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Need a different slot?</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              Appointments on this page are created and updated by your care team. To change one, ask your doctor
              or book a new slot.
            </p>
            <Link
              to="/patient/book-appointment"
              className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 text-sm font-semibold transition-colors"
            >
              Book an appointment
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyAppointments;
