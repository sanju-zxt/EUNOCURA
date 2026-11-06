import React from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Stethoscope, Home, Users, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import DarkModeToggle from '../components/DarkModeToggle';
import { ApiSettingsButton } from '../components/mobile/ApiSettings';
import MobileBottomNav from '../components/mobile/MobileBottomNav';
import DoctorDashboard from '../components/doctor/DoctorDashboard';
import PatientsPage from '../components/doctor/PatientsPage';
import ActiveSession from '../components/doctor/ActiveSession';

const DoctorPortal = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const navItems = [
        { path: '/doctor', icon: Home, label: 'Dashboard', shortLabel: 'Home', exact: true, primary: true },
        { path: '/doctor/patients', icon: Users, label: 'Patients', shortLabel: 'Patients', exact: false, primary: true },
    ];

    const isActive = (path, exact) => {
        if (exact) {
            return location.pathname === path;
        }
        return location.pathname.startsWith(path);
    };

    // A live session is a focused task: it owns the screen on a phone, so the
    // tab bar steps out of the way. Back (or the session's own exit) returns.
    const inSession = /^\/doctor\/session\//.test(location.pathname);

    return (
        <div className="min-h-app bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
            {/* Top Navigation */}
            <header className="pt-safe bg-white dark:bg-gray-800 shadow-lg border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20 backdrop-blur-sm bg-opacity-95 dark:bg-opacity-95">
                <div className="px-4 sm:px-6 lg:px-8 py-2.5 sm:py-4">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
                            <div className="bg-gradient-to-br from-primary-600 to-primary-700 p-2 sm:p-2.5 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 flex-shrink-0">
                                <Stethoscope className="w-5 h-5 sm:w-6 sm:h-6 text-white" aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-base sm:text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-800 dark:from-primary-400 dark:to-primary-600 bg-clip-text text-transparent truncate">
                                    Doctor Portal
                                </h1>
                                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
                                    {user?.full_name || 'Doctor'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            <div className="md:hidden flex">
                                <ApiSettingsButton />
                            </div>
                            <DarkModeToggle />
                            <button
                                onClick={() => {
                                    logout();
                                    navigate('/');
                                }}
                                className="tap flex items-center justify-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 hover:shadow-md px-2.5 sm:px-4"
                                aria-label="Log out"
                            >
                                <LogOut className="w-5 h-5" aria-hidden="true" />
                                <span className="hidden sm:inline font-medium">Logout</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex">
                {/* Sidebar Navigation */}
                <aside className="hidden md:flex w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-[calc(100vh-73px)] sticky top-[73px] shadow-lg transition-colors duration-200 overflow-hidden flex-col">
                    <nav className="p-4 space-y-2 flex-shrink-0">
                        {navItems.map((item) => (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`tap flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive(item.path, item.exact)
                                    ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5'
                                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:shadow-sm'
                                    }`}
                            >
                                <item.icon className={`w-5 h-5 transition-transform duration-200 ${isActive(item.path, item.exact) ? 'scale-110' : 'group-hover:scale-110'}`} />
                                <span className="text-sm font-medium">{item.label}</span>
                            </Link>
                        ))}
                    </nav>

                    {/* Sidebar Footer */}
                    <div className="mt-auto p-4 mx-4 mb-4 bg-gradient-to-br from-primary-50 to-blue-50 dark:from-gray-700 dark:to-gray-600 rounded-xl border border-primary-100 dark:border-gray-600 flex-shrink-0">
                        <p className="text-xs text-gray-600 dark:text-gray-300 font-medium">EUNOCURA v2.0</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Healthcare Management</p>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 min-w-0 px-4 py-5 sm:p-6 bg-gray-50 dark:bg-gray-900 transition-colors duration-200 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
                    <Routes>
                        <Route index element={<DoctorDashboard />} />
                        <Route path="patients" element={<PatientsPage />} />
                        <Route path="session/:appointmentId" element={<ActiveSession />} />
                    </Routes>
                </main>
            </div>

            {!inSession && <MobileBottomNav items={navItems} accent="primary" />}
        </div>
    );
};

export default DoctorPortal;
