import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill, MessageCircle, Apple, Bell, Calendar, Activity, CalendarPlus, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';

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

const UPCOMING_STATUSES = ['scheduled', 'in_progress'];

// An appointment is upcoming while its status says so and its slot has not gone past.
const appointmentWhen = (appointment) => toDate(appointment?.start_time) || toDate(appointment?.appointment_date);

const bySoonest = (a, b) => {
  const left = appointmentWhen(a);
  const right = appointmentWhen(b);
  return (left ? left.getTime() : Infinity) - (right ? right.getTime() : Infinity);
};

const TONES = {
  blue: {
    card: 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 border-blue-200 dark:border-blue-700',
    label: 'text-blue-700 dark:text-blue-300',
    value: 'text-blue-900 dark:text-blue-100',
    caption: 'text-blue-700 dark:text-blue-300',
    chip: 'from-blue-500 to-blue-600',
    skeleton: 'bg-blue-200 dark:bg-blue-700/60',
  },
  green: {
    card: 'bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 border-green-200 dark:border-green-700',
    label: 'text-green-700 dark:text-green-300',
    value: 'text-green-900 dark:text-green-100',
    caption: 'text-green-700 dark:text-green-300',
    chip: 'from-green-500 to-green-600',
    skeleton: 'bg-green-200 dark:bg-green-700/60',
  },
  teal: {
    card: 'bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-900/30 dark:to-teal-800/30 border-teal-200 dark:border-teal-700',
    label: 'text-teal-700 dark:text-teal-300',
    value: 'text-teal-900 dark:text-teal-100',
    caption: 'text-teal-700 dark:text-teal-300',
    chip: 'from-teal-500 to-teal-600',
    skeleton: 'bg-teal-200 dark:bg-teal-700/60',
  },
  orange: {
    card: 'bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/30 border-orange-200 dark:border-orange-700',
    label: 'text-orange-700 dark:text-orange-300',
    value: 'text-orange-900 dark:text-orange-100',
    caption: 'text-orange-700 dark:text-orange-300',
    chip: 'from-orange-500 to-orange-600',
    skeleton: 'bg-orange-200 dark:bg-orange-700/60',
  },
};

// A stat card only renders what the API returned; `loading` draws a bar instead of a number.
const StatCard = ({ tone, label, value, caption, icon: Icon, to, loading = false, valueClassName = 'text-3xl' }) => {
  const styles = TONES[tone];

  const body = (
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <p className={`text-sm mb-1 font-medium ${styles.label}`}>{label}</p>
        {loading ? (
          <div className={`h-8 w-16 rounded animate-pulse ${styles.skeleton}`} />
        ) : (
          <p className={`font-bold leading-tight ${valueClassName} ${styles.value}`}>{value}</p>
        )}
        <p className={`text-xs mt-1 ${styles.caption}`}>{caption}</p>
      </div>
      <div className={`bg-gradient-to-br ${styles.chip} p-3 rounded-xl shadow-lg flex-shrink-0`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
  );

  const classes = `card ${styles.card} hover:shadow-xl transition-all duration-200`;

  if (!to) {
    return <div className={classes}>{body}</div>;
  }

  return (
    <Link to={to} className={`${classes} block transform hover:-translate-y-1`}>
      {body}
    </Link>
  );
};

const PatientDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const patientId = user?._id || user?.id || null;
  const displayName = (user?.full_name || '').trim();

  const [activeMedications, setActiveMedications] = useState([]);
  const [medsLoading, setMedsLoading] = useState(true);
  const [medsError, setMedsError] = useState(null);

  const [appointments, setAppointments] = useState([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState(null);

  // Unread badge comes from the notifications API; null while unavailable.
  const [unreadNotifications, setUnreadNotifications] = useState(null);
  const [notificationsState, setNotificationsState] = useState('loading');

  const loadMedications = useCallback(async () => {
    setMedsLoading(true);
    const result = await apiRequest('/prescriptions/me');
    if (result.success) {
      const list = Array.isArray(result.data?.items) ? result.data.items : [];
      setActiveMedications(list.filter(rx => rx.status === 'active'));
      setMedsError(null);
    } else {
      setActiveMedications([]);
      setMedsError(result.error || 'Medication list unavailable.');
    }
    setMedsLoading(false);
  }, []);

  const loadAppointments = useCallback(async () => {
    if (!patientId) {
      setAppointments([]);
      setAppointmentsLoading(authLoading);
      setAppointmentsError(authLoading ? null : 'No signed-in patient, so appointments cannot be loaded.');
      return;
    }

    setAppointmentsLoading(true);
    const result = await apiRequest(`/appointments/?patient_id=${encodeURIComponent(patientId)}`);
    if (result.success) {
      const list = Array.isArray(result.data)
        ? result.data
        : Array.isArray(result.data?.items)
          ? result.data.items
          : [];
      setAppointments(list);
      setAppointmentsError(null);
    } else {
      setAppointments([]);
      setAppointmentsError(result.error || 'Appointments unavailable.');
    }
    setAppointmentsLoading(false);
  }, [patientId, authLoading]);

  const loadNotifications = useCallback(async () => {
    setNotificationsState('loading');
    const result = await apiRequest('/notifications/me');
    if (!result.success) {
      setUnreadNotifications(null);
      setNotificationsState('error');
      return;
    }
    const list = Array.isArray(result.data?.items) ? result.data.items : [];
    setUnreadNotifications(
      typeof result.data?.unread === 'number' ? result.data.unread : list.filter(n => !n.read).length
    );
    setNotificationsState('ready');
  }, []);

  useEffect(() => {
    loadMedications();
  }, [loadMedications]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const upcomingAppointments = useMemo(() => {
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    return appointments
      .filter((appointment) => UPCOMING_STATUSES.includes(String(appointment?.status || '').toLowerCase()))
      .filter((appointment) => {
        const when = appointmentWhen(appointment);
        return !when || when.getTime() >= cutoff;
      })
      .sort(bySoonest);
  }, [appointments]);

  const completedVisits = useMemo(
    () => appointments.filter((appointment) => String(appointment?.status || '').toLowerCase() === 'completed').length,
    [appointments]
  );

  const nextAppointment = upcomingAppointments[0] || null;
  const upcomingMedications = activeMedications.slice(0, 3);

  const nextAppointmentWhen = nextAppointment
    ? nextAppointment.start_time || nextAppointment.appointment_date
    : null;
  const nextAppointmentDate = formatDate(nextAppointmentWhen);
  const nextAppointmentTime = formatTime(nextAppointmentWhen);
  const nextDoctor = nextAppointment?.doctor?.name || null;

  const reminder = useMemo(() => {
    if (nextAppointment) {
      const when = appointmentWhen(nextAppointment);
      const hoursAway = when ? (when.getTime() - Date.now()) / 3600000 : null;
      // Only surface the slot when it is actually near; the stat card covers the rest.
      if (hoursAway !== null && hoursAway <= 48 && hoursAway >= -12) {
        const doctor = nextAppointment.doctor?.name || 'your doctor';
        const date = formatDate(nextAppointment.start_time || nextAppointment.appointment_date);
        const time = formatTime(nextAppointment.start_time);
        const details = [date ? `on ${date}` : null, time ? `at ${time}` : null].filter(Boolean).join(' ');
        return {
          tone: 'urgent',
          title: 'Appointment reminder',
          body: `Your appointment with ${doctor} is ${details || 'coming up'}.`,
          to: '/patient/appointments',
          linkLabel: 'View appointments',
        };
      }
    }

    if (!medsLoading && !medsError && activeMedications.length > 0) {
      return {
        tone: 'info',
        title: 'Medication reminder',
        body: `You have ${activeMedications.length} active prescription${activeMedications.length === 1 ? '' : 's'} on file. Check the schedule before your next dose.`,
        to: '/patient/medications',
        linkLabel: 'View medication schedule',
      };
    }

    return null;
  }, [nextAppointment, activeMedications, medsLoading, medsError]);

  const medicationsCaption = medsLoading
    ? 'Checking prescriptions'
    : medsError
      ? 'Prescription list unavailable'
      : `${activeMedications.length === 1 ? 'prescription' : 'prescriptions'} on file`;

  const nextAppointmentCaption = appointmentsLoading || authLoading
    ? 'Checking your schedule'
    : appointmentsError
      ? 'Schedule unavailable'
      : nextAppointment
        ? [nextDoctor, nextAppointmentTime].filter(Boolean).join(' at ') || 'Booked'
        : 'Tap to book a visit';

  const completedCaption = appointmentsLoading || authLoading
    ? 'Checking your history'
    : appointmentsError
      ? 'History unavailable'
      : appointments.length > 0
        ? `of ${appointments.length} appointment${appointments.length === 1 ? '' : 's'} on record`
        : 'No appointment history yet';

  const unreadValue = notificationsState === 'loading'
    ? '—'
    : notificationsState === 'error'
      ? '—'
      : unreadNotifications;

  const unreadCaption = notificationsState === 'loading'
    ? 'Loading notifications'
    : notificationsState === 'error'
      ? 'Notifications unavailable'
      : unreadNotifications > 0
        ? 'unread items'
        : 'You are all caught up';

  return (
    <div className="max-w-7xl mx-auto">
      {/* Welcome Section */}
      <div className="mb-8">
        {authLoading ? (
          <>
            <div className="h-9 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-3" />
            <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </>
        ) : (
          <>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome back{displayName ? `, ${displayName.split(' ')[0]}` : ''}!
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {user?.email ? (
                <>
                  Signed in as{' '}
                  <span className="font-medium text-gray-800 dark:text-gray-200">{user.email}</span>
                </>
              ) : (
                "Here's your health overview for today"
              )}
            </p>
          </>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard
          tone="blue"
          label="Active Medications"
          icon={Pill}
          to="/patient/medications"
          loading={medsLoading}
          value={activeMedications.length}
          caption={medicationsCaption}
        />

        <StatCard
          tone="green"
          label="Next Appointment"
          icon={Calendar}
          to={nextAppointment ? '/patient/appointments' : '/patient/book-appointment'}
          loading={appointmentsLoading || authLoading}
          valueClassName="text-2xl"
          value={appointmentsError ? '—' : nextAppointment ? nextAppointmentDate || 'Scheduled' : 'None booked'}
          caption={nextAppointmentCaption}
        />

        <StatCard
          tone="teal"
          label="Completed Visits"
          icon={CheckCircle}
          to="/patient/appointments"
          loading={appointmentsLoading || authLoading}
          value={appointmentsError ? '—' : completedVisits}
          caption={completedCaption}
        />

        <StatCard
          tone="orange"
          label="Notifications"
          icon={Bell}
          to="/patient/notifications"
          loading={notificationsState === 'loading'}
          value={unreadValue}
          caption={unreadCaption}
        />
      </div>

      {appointmentsError && !appointmentsLoading && (
        <div className="card mb-8 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Appointment details could not be loaded — {appointmentsError}
              </p>
            </div>
            <button
              type="button"
              onClick={loadAppointments}
              className="btn-secondary text-sm inline-flex items-center justify-center flex-shrink-0"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Reminder derived from real data — hidden entirely when there is nothing to say */}
      {reminder && (
        <div
          className={`card mb-8 border-2 hover:shadow-xl transition-all duration-200 ${
            reminder.tone === 'urgent'
              ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
              : 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
          }`}
        >
          <div className="flex items-start space-x-3">
            <AlertCircle
              className={`w-6 h-6 flex-shrink-0 mt-1 ${
                reminder.tone === 'urgent'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-blue-600 dark:text-blue-400'
              }`}
            />
            <div className="flex-1">
              <h3
                className={`text-lg font-bold mb-1 ${
                  reminder.tone === 'urgent'
                    ? 'text-red-900 dark:text-red-200'
                    : 'text-blue-900 dark:text-blue-200'
                }`}
              >
                {reminder.title}
              </h3>
              <p
                className={`mb-3 ${
                  reminder.tone === 'urgent'
                    ? 'text-red-800 dark:text-red-300'
                    : 'text-blue-800 dark:text-blue-300'
                }`}
              >
                {reminder.body}
              </p>
              <Link
                to={reminder.to}
                className={`font-semibold text-sm transition-colors ${
                  reminder.tone === 'urgent'
                    ? 'text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300'
                    : 'text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300'
                }`}
              >
                {reminder.linkLabel} →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Link to="/patient/book-appointment" className="card hover:shadow-xl transition-all duration-200 group transform hover:-translate-y-1">
          <div className="flex items-start space-x-4">
            <div className="bg-gradient-to-br from-teal-500 to-teal-600 p-3 rounded-xl shadow-md group-hover:shadow-lg transition-shadow">
              <CalendarPlus className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                Book New Appointment
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Find and book appointments with doctors near you</p>
            </div>
          </div>
        </Link>

        <Link to="/patient/medications" className="card hover:shadow-xl transition-all duration-200 group transform hover:-translate-y-1">
          <div className="flex items-start space-x-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-3 rounded-xl shadow-md group-hover:shadow-lg transition-shadow">
              <Pill className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                View My Medications
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Check your medication schedule and instructions</p>
            </div>
          </div>
        </Link>

        <Link to="/patient/chatbot" className="card hover:shadow-xl transition-all duration-200 group transform hover:-translate-y-1">
          <div className="flex items-start space-x-4">
            <div className="bg-gradient-to-br from-green-500 to-green-600 p-3 rounded-xl shadow-md group-hover:shadow-lg transition-shadow">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                Ask Health Questions
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Chat with our AI assistant for quick answers</p>
            </div>
          </div>
        </Link>

        <Link to="/patient/diet" className="card hover:shadow-xl transition-all duration-200 group transform hover:-translate-y-1">
          <div className="flex items-start space-x-4">
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-3 rounded-xl shadow-md group-hover:shadow-lg transition-shadow">
              <Apple className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                My Diet Plan
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">View your personalized nutrition recommendations</p>
            </div>
          </div>
        </Link>

        <Link to="/patient/notifications" className="card hover:shadow-xl transition-all duration-200 group transform hover:-translate-y-1">
          <div className="flex items-start space-x-4">
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-3 rounded-xl shadow-md group-hover:shadow-lg transition-shadow relative">
              <Bell className="w-6 h-6 text-white" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold shadow-lg">
                  {unreadNotifications}
                </span>
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                Notifications
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Stay updated with your health reminders</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Active Medications */}
      <div className="card mb-8 hover:shadow-xl transition-all duration-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Active Medications</h3>
          <Link to="/patient/medications" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-semibold transition-colors">
            View All →
          </Link>
        </div>
        <div className="space-y-3">
          {medsLoading && (
            <div className="space-y-3 animate-pulse">
              {[0, 1].map((row) => (
                <div key={row} className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="bg-gray-200 dark:bg-gray-600 rounded-lg w-9 h-9" />
                  <div className="flex-1">
                    <div className="h-4 w-40 bg-gray-200 dark:bg-gray-600 rounded mb-2" />
                    <div className="h-3 w-28 bg-gray-200 dark:bg-gray-600 rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!medsLoading && medsError && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                Medication list unavailable — {medsError}
              </p>
              <button
                type="button"
                onClick={loadMedications}
                className="btn-secondary text-sm inline-flex items-center"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </button>
            </div>
          )}

          {!medsLoading && !medsError && upcomingMedications.length === 0 && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                No active prescriptions on file. Your doctor has not prescribed anything yet.
              </p>
            </div>
          )}

          {!medsLoading && !medsError && upcomingMedications.map((med) => (
            <div key={med.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
              <div className="flex items-center space-x-3">
                <div className="bg-blue-100 dark:bg-blue-900/40 p-2 rounded-lg">
                  <Pill className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{med.medication} {med.dosage}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {med.frequency}{med.route ? ` · ${med.route}` : ''}
                  </p>
                </div>
              </div>
              <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-3 py-1 rounded-full font-semibold">
                Active
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Health Tips */}
      <div className="card bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border-2 border-green-200 dark:border-green-700 hover:shadow-xl transition-all duration-200">
        <div className="flex items-start space-x-3">
          <div className="bg-gradient-to-br from-green-500 to-green-600 p-2 rounded-xl shadow-md">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Today's Health Tip</h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              Remember to take a 30-minute walk after your evening meal. Regular physical activity helps
              manage blood pressure and improves heart health. Stay hydrated and avoid heavy meals before bedtime.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientDashboard;
