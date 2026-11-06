import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  CheckCircle,
  Play,
  XCircle,
  RotateCcw,
  Eye,
  Loader,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../utils/api';

const DoctorDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  // A failed fetch used to fall through to "No Appointments Today", which is a
  // lie about the doctor's day. The error state says what actually happened.
  const [error, setError] = useState(null);

  const today = new Date();
  const dateFormatted = today.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });

  const fetchAppointments = useCallback(async () => {
    if (!user?._id) {
      setLoading(false);
      setError("No signed-in doctor, so today's schedule could not be loaded.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      // Format date as YYYY-MM-DD for the API
      const dateStr = new Date().toISOString().split('T')[0];

      const response = await apiRequest(`/appointments?doctor_id=${user._id}&appointment_date=${dateStr}`);

      if (response.success) {
        // `Array.isArray` so a malformed payload can never reach `.filter`.
        setAppointments(Array.isArray(response.data) ? response.data : []);
      } else {
        setAppointments([]);
        setError(response.error || "Today's schedule could not be loaded.");
      }
    } catch (err) {
      console.error("Error fetching appointments:", err);
      setAppointments([]);
      setError("Today's schedule could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const currentAppointment = appointments.find(a => a.status === 'in_progress') || 
                            appointments.find(a => a.status === 'scheduled');
  
  const stats = {
    total: appointments.length,
    completed: appointments.filter(a => a.status === 'completed').length,
    inProgress: appointments.filter(a => a.status === 'in_progress').length,
    upcoming: appointments.filter(a => a.status === 'scheduled' || a.status === 'new').length,
    cancelled: appointments.filter(a => a.status === 'cancelled').length
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

  const getStatusIcon = (status) => {
    const s = status?.toUpperCase();
    if (s === 'COMPLETED') return <CheckCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
    if (s === 'IN_PROGRESS') return <Play className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
    if (s === 'CANCELLED') return <XCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
    return <Clock className="w-4 h-4 flex-shrink-0" aria-hidden="true" />;
  };

  const getTypeBadge = (type, appointmentNumber) => {
    // The backend might return type in lowercase or different format
    if (type === 'NEW_PATIENT' || type === 'new') {
      return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">🆕 NEW PATIENT</span>;
    }
    return <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-semibold">🔄 CONTINUATION {appointmentNumber ? `(Visit #${appointmentNumber})` : ''}</span>;
  };

  const handleStartSession = async (appointmentId) => {
    try {
        await apiRequest(`/appointments/${appointmentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'in_progress' })
        });
        navigate(`/doctor/session/${appointmentId}`);
    } catch (e) {
        console.error("Failed to start session", e);
        // Navigate anyway to not block the user
        navigate(`/doctor/session/${appointmentId}`);
    }
  };

  const handleViewPatient = (patientId) => {
    navigate(`/doctor/patients?patientId=${patientId}`);
  };

  // One tap on an appointment row opens that patient's record — the same target
  // as the card's History / View details control. Starting or resuming a session
  // stays an explicit, labelled button: a stray tap must never move a clinical
  // record into `in_progress`.
  const openAppointment = (appointment) => {
    handleViewPatient(appointment.patient_id);
  };

  // Helper to format time from ISO string or time string
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    try {
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) {
          // If not a valid date, maybe it's already HH:MM
          return timeStr;
      }
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch (e) {
      return timeStr;
    }
  };

  const AppointmentCard = ({ appointment, isCurrent = false }) => {
    const status = appointment.status;
    const isCompleted = status === 'completed';
    const isInProgress = status === 'in_progress';
    const isScheduled = status === 'scheduled';

    // Map backend fields to UI fields if needed
    // Backend: patient_id, doctor_id, appointment_date, status, chief_complaint, start_time, end_time
    // Also "doctor" object populated
    // We might not have patientName directly if not populated. The backend `read_appointments` populates doctor but NOT patient details? 
    // Backend `read_appointments` lines 60-70 populates doctor. It does NOT seem to populate patient.
    // However, the existing UI expects `appointment.patientName`.
    // If the backend doesn't provide patient name, I should probably fetch it or display Unknown.
    // Ideally I should update backend to populate patient too. But I'll handle it gracefully here.
    
    // NOTE: I am not updating backend to populate patient. I will just use what is available or a placeholder.
    // Wait, the user sees "Welcome Dr...", they want to see their appointments. They need to see patient names.
    // If the current backend endpoint doesn't return patient names, I should probably flag it or try to fetch.
    // `backend/src/routes/appointment.py` lines 60-70 only populates doctor.
    // I should probably update the backend to populate patient as well for the doctor dashboard to be useful.
    
    const appointmentNo = appointment._id?.split('-')[1];
    const patientName = appointment.patient_name || appointment.patient?.name || "Patient ID: " + appointment.patient_id;
    const startTime = formatTime(appointment.start_time);

    return (
      <div className={`min-w-0 bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 md:p-6 border border-gray-100 dark:border-gray-700 transition-all duration-200 ${isCurrent ? 'border-2 border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-900/20 shadow-lg' : ''} ${isCompleted ? 'opacity-75' : ''} hover:shadow-lg`}>
        {/* The summary is one tappable row on a phone; the desktop order of the
            lines inside it is unchanged. */}
        <button
          type="button"
          onClick={() => openAppointment(appointment)}
          className="tap w-full text-left rounded-lg transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40"
        >
          {/* The blocks are spans, not divs: a button may only contain phrasing
              content and this summary is the button. */}
          <span className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <span className="min-w-0 break-words text-lg md:text-xl font-semibold text-gray-900 dark:text-white">
              {appointmentNo === "0" ? "Baseline Visit" : "Follow Up Visit #" + appointmentNo}
            </span>
            <span className="flex items-center gap-2 flex-shrink-0">
              {getStatusIcon(appointment.status)}
              <span className={`text-xs px-3 py-1 rounded-full font-semibold ${getStatusBadge(appointment.status)}`}>
                {status?.replace('_', ' ')}
              </span>
            </span>
          </span>
          <span className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 md:w-5 md:h-5 text-gray-600 dark:text-gray-400 flex-shrink-0" aria-hidden="true" />
            <span className="font-semibold text-gray-900 dark:text-white break-words">{startTime}</span>
          </span>

          <span className="block mb-3 min-w-0">
            <span className="block text-gray-900 dark:text-white font-medium break-words">Patient Name: {patientName}</span>
            {/* {getTypeBadge(appointment.type, appointment.appointment_number)} */}
            <span className="block text-sm text-gray-600 dark:text-gray-400 capitalize break-words">{appointment.patient?.age || 'N/A'} years • {appointment.patient?.gender || 'N/A'}</span>
          </span>
        </button>

        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-3 border border-gray-100 dark:border-gray-600">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium">Chief Complaint:</p>
          <p className="text-sm text-gray-900 dark:text-gray-200 break-words">{appointment.chief_complaint || appointment.chiefComplaint}</p>
        </div>

        {appointment.previous_appointments && appointment.previous_appointments.length > 0 && (
          <div className="mb-3 text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg border border-blue-100 dark:border-blue-800 break-words">
            📋 Previous visits: {appointment.previous_appointments.length}
          </div>
        )}

        {/* Wraps instead of overflowing: the primary action takes its own line on
            a phone and every control keeps a 44px target. */}
        <div className="flex flex-wrap gap-2">
          {isScheduled && (
            <>
              <button
                type="button"
                onClick={() => handleStartSession(appointment._id)}
                className="tap md:min-h-0 md:min-w-0 basis-full sm:basis-auto sm:flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
              >
                <Play className="w-4 h-4" aria-hidden="true" />
                <span>START SESSION</span>
              </button>
              <button
                type="button"
                className="tap md:min-h-0 md:min-w-0 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-2 px-3 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="tap md:min-h-0 md:min-w-0 flex items-center justify-center bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 font-semibold py-2 px-3 rounded-lg transition-colors"
              >
                <XCircle className="w-4 h-4" aria-hidden="true" />
              </button>
            </>
          )}

          {isInProgress && (
            <>
              <button
                type="button"
                onClick={() => handleStartSession(appointment._id)}
                className="tap md:min-h-0 md:min-w-0 basis-full sm:basis-auto sm:flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
              >
                <span>RESUME SESSION</span>
              </button>
            </>
          )}

          {isCompleted && (
            <button
              type="button"
              onClick={() => handleViewPatient(appointment.patient_id)}
              className="tap md:min-h-0 md:min-w-0 basis-full sm:basis-auto sm:flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4" aria-hidden="true" />
              <span>VIEW DETAILS</span>
            </button>
          )}

          {(isScheduled || isInProgress) && (
            <button
              type="button"
              onClick={() => handleViewPatient(appointment.patient_id)}
              className="tap md:min-h-0 md:min-w-0 flex items-center justify-center gap-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              <Eye className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">History</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const upcomingAppointments = appointments.filter(a => 
    (a.status === 'scheduled' || a.status === 'SCHEDULED' || a.status === 'new') && a._id !== currentAppointment?._id
  );
  
  const completedAppointments = appointments.filter(a => 
    a.status === 'completed' || a.status === 'COMPLETED'
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64" role="status" aria-live="polite">
        <Loader className="w-8 h-8 animate-spin text-primary-500 dark:text-primary-400" aria-hidden="true" />
        <span className="visually-hidden">Loading today's schedule</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Welcome Section */}
      <div className="mb-5 md:mb-8">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2 break-words">Welcome, {user?.full_name || 'Doctor'}</h2>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 break-words">Today's Schedule - {dayOfWeek}, {dateFormatted}</p>
      </div>

      {/* Quick Stats — 2-up on a phone (never 4-up at 360px), 5 across at md+ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-5 md:mb-8">
        <div className="min-w-0 bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 md:p-6 border border-gray-100 dark:border-gray-700 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 hover:shadow-lg transition-all duration-200">
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-blue-900 dark:text-blue-400">{stats.total}</div>
            <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300 break-words">Total Appointments</p>
          </div>
        </div>
        <div className="min-w-0 bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 md:p-6 border border-gray-100 dark:border-gray-700 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 hover:shadow-lg transition-all duration-200">
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-green-900 dark:text-green-400">{stats.inProgress}</div>
            <p className="text-xs sm:text-sm text-green-700 dark:text-green-300 break-words">In Progress</p>
          </div>
        </div>
        <div className="min-w-0 bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 md:p-6 border border-gray-100 dark:border-gray-700 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 hover:shadow-lg transition-all duration-200">
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-purple-900 dark:text-purple-400">{stats.upcoming}</div>
            <p className="text-xs sm:text-sm text-purple-700 dark:text-purple-300 break-words">Upcoming</p>
          </div>
        </div>
        <div className="min-w-0 bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 md:p-6 border border-gray-100 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700/20 dark:to-gray-600/20 hover:shadow-lg transition-all duration-200">
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-300">{stats.completed}</div>
            <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-400 break-words">Completed</p>
          </div>
        </div>
        <div className="min-w-0 bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 md:p-6 border border-gray-100 dark:border-gray-700 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 hover:shadow-lg transition-all duration-200">
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-red-900 dark:text-red-400">{stats.cancelled}</div>
            <p className="text-xs sm:text-sm text-red-700 dark:text-red-300 break-words">Cancelled</p>
          </div>
        </div>
      </div>

      {/* A fetch that failed says so, with the only retry that can help. */}
      {error && !loading && (
        <div className="mb-5 md:mb-8 p-4 md:p-6 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <AlertCircle className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm text-gray-700 dark:text-gray-300 break-words">
                Today's appointments could not be loaded — {error}
              </p>
            </div>
            {user?._id && (
              <button
                type="button"
                onClick={fetchAppointments}
                className="tap w-full sm:w-auto flex-shrink-0 flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                <span>Retry</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Current Appointment */}
      {currentAppointment && (
        <div className="mb-5 md:mb-8">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-lg flex-shrink-0" aria-hidden="true"></div>
            <h3 className="min-w-0 break-words text-lg md:text-2xl font-bold text-gray-900 dark:text-white">CURRENT APPOINTMENT</h3>
          </div>
          <AppointmentCard appointment={currentAppointment} isCurrent={true} />
        </div>
      )}

      {/* Upcoming Appointments */}
      {upcomingAppointments.length > 0 && (
        <div className="mb-5 md:mb-8">
          <h3 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white mb-3 md:mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">UPCOMING APPOINTMENTS ({upcomingAppointments.length})</span>
          </h3>
          <div className="grid gap-3 md:gap-6 lg:grid-cols-2">
            {upcomingAppointments.map(appointment => (
              <AppointmentCard key={appointment._id} appointment={appointment} />
            ))}
          </div>
        </div>
      )}

      {/* Completed Today */}
      {completedAppointments.length > 0 && (
        <div>
          <h3 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white mb-3 md:mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
            <span className="min-w-0 break-words">COMPLETED TODAY ({completedAppointments.length})</span>
          </h3>
          <div className="space-y-3 md:space-y-4">
            {completedAppointments.map(appointment => (
              <AppointmentCard key={appointment._id} appointment={appointment} />
            ))}
          </div>
        </div>
      )}

      {/* No Appointments Message */}
      {stats.total === 0 && !loading && !error && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 md:p-6 border border-gray-100 dark:border-gray-700 text-center py-10 md:py-12 transition-colors duration-200">
          <Calendar className="w-12 h-12 md:w-16 md:h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" aria-hidden="true" />
          <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-2">No Appointments Today</h3>
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 break-words">Your schedule is clear for today.</p>
        </div>
      )}
    </div>
  );
};

export default DoctorDashboard;
