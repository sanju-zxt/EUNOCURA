import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Heart, Pill, MessageCircle, Apple, Bell, Home, LogOut, User, Calendar, CalendarPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../utils/api';
import DarkModeToggle from '../components/DarkModeToggle';
import PatientDashboard from '../components/patient/PatientDashboard';
import MyAppointments from '../components/patient/MyAppointments';
import BookAppointment from '../components/patient/BookAppointment';
import Medications from '../components/patient/Medications';
import Chatbot from '../components/patient/Chatbot';
import DietPlan from '../components/patient/DietPlan';
import Notifications from '../components/patient/Notifications';

const PatientPortal = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const patientId = user?._id || user?.id;
  const [doctor, setDoctor] = useState(null);
  const [doctorState, setDoctorState] = useState('loading');

  // The sidebar used to name a doctor for every account. Ask the real appointment
  // list who this patient is actually seeing, and say nothing when nobody is assigned.
  useEffect(() => {
    let cancelled = false;
    if (!patientId) {
      setDoctorState('empty');
      return () => { cancelled = true; };
    }
    (async () => {
      setDoctorState('loading');
      const res = await apiRequest(`/appointments/?patient_id=${encodeURIComponent(patientId)}`);
      if (cancelled) return;
      if (!res.success || !Array.isArray(res.data)) {
        setDoctorState('error');
        return;
      }
      const upcoming = res.data
        .filter((a) => ['scheduled', 'in_progress', 'paused'].includes(a?.status))
        .sort((a, b) => String(a?.appointment_date || '').localeCompare(String(b?.appointment_date || '')));
      const found = upcoming.map((a) => a?.doctor).find((d) => d && d.name) || null;
      setDoctor(found);
      setDoctorState(found ? 'ready' : 'empty');
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  const navItems = [
    { path: '/patient', icon: Home, label: 'Dashboard', exact: true },
    { path: '/patient/appointments', icon: Calendar, label: 'My Appointments' },
    { path: '/patient/book-appointment', icon: CalendarPlus, label: 'Book Appointment' },
    { path: '/patient/medications', icon: Pill, label: 'Medications' },
    { path: '/patient/diet', icon: Apple, label: 'Care Plan' },
    { path: '/patient/chatbot', icon: MessageCircle, label: 'Health Assistant' },
    { path: '/patient/notifications', icon: Bell, label: 'Notifications' },
  ];

  const isActive = (path, exact) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      {/* Top Navigation */}
      <header className="bg-white dark:bg-gray-800 shadow-lg border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20 backdrop-blur-sm bg-opacity-95 dark:bg-opacity-95">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-green-600 to-green-700 p-2.5 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200">
                <Heart className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-green-600 to-green-800 dark:from-green-400 dark:to-green-600 bg-clip-text text-transparent">Patient Portal</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">{user?.full_name || 'Patient'}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <DarkModeToggle />
              <button
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 hover:shadow-md"
              >
                <LogOut className="w-5 h-5" />
                <span className="hidden sm:inline font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation */}
        <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-[calc(100vh-73px)] sticky top-[73px] shadow-lg transition-colors duration-200 overflow-hidden flex flex-col">
          <nav className="p-4 space-y-2 flex-shrink-0">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isActive(item.path, item.exact)
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:shadow-sm'
                }`}
              >
                <item.icon className={`w-5 h-5 transition-transform duration-200 ${
                  isActive(item.path, item.exact) ? 'scale-110' : 'group-hover:scale-110'
                }`} />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* Quick Info — the doctor on this patient's next appointment, or nothing. */}
          <div className="p-4 mt-auto mb-4 mx-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-gray-700 dark:to-gray-600 rounded-xl border border-green-100 dark:border-gray-600 flex-shrink-0">
            <div className="flex items-center space-x-2 mb-2">
              <User className="w-4 h-4 text-green-600 dark:text-green-400" />
              <p className="text-xs font-semibold text-green-900 dark:text-green-300">Your Doctor</p>
            </div>
            {doctorState === 'ready' && doctor ? (
              <>
                <p className="text-sm font-bold text-green-900 dark:text-white">{doctor.name}</p>
                <p className="text-xs text-green-700 dark:text-gray-300">{doctor.specialization || 'Care team'}</p>
              </>
            ) : doctorState === 'loading' ? (
              <div className="space-y-1.5" aria-busy="true" aria-label="Loading your care team">
                <div className="h-3.5 w-24 rounded bg-green-200/70 dark:bg-gray-500/50 animate-pulse" />
                <div className="h-3 w-16 rounded bg-green-200/50 dark:bg-gray-500/40 animate-pulse" />
              </div>
            ) : doctorState === 'error' ? (
              <p className="text-xs text-green-800 dark:text-gray-300">Could not load your care team.</p>
            ) : (
              <>
                <p className="text-xs text-green-800 dark:text-gray-300">No doctor assigned yet.</p>
                <Link to="/patient/book-appointment" className="text-xs font-semibold text-green-700 dark:text-green-300 underline">
                  Book an appointment
                </Link>
              </>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
          <Routes>
            <Route index element={<PatientDashboard />} />
            <Route path="appointments" element={<MyAppointments />} />
            <Route path="book-appointment" element={<BookAppointment />} />
            <Route path="medications" element={<Medications />} />
            <Route path="chatbot" element={<Chatbot />} />
            <Route path="diet" element={<DietPlan />} />
            <Route path="notifications" element={<Notifications />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export default PatientPortal;

