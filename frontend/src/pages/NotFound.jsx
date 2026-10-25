import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Heart, Home, LogIn, Stethoscope, SearchX, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import DarkModeToggle from '../components/DarkModeToggle';

const linkPrimary =
  'flex items-center justify-center space-x-2 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800';

const linkSecondary =
  'flex items-center justify-center space-x-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-3 px-6 rounded-lg transition-all duration-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800';

/**
 * Real 404 for the catch-all route. A mistyped URL stays visible (path echoed
 * back) instead of being silently swapped for the landing page, and the links
 * point at the portal that matches the signed-in role.
 */
const NotFound = () => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const signedIn = isAuthenticated();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-200">
      <header className="bg-white dark:bg-gray-800 shadow-md border-b border-gray-100 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center space-x-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
          >
            <span className="bg-gradient-to-br from-primary-600 to-primary-700 p-2 rounded-lg shadow-lg">
              <Heart className="w-6 h-6 text-white" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-xl font-bold bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">
                EUNOCURA
              </span>
              <span className="block text-xs text-gray-600 dark:text-gray-400">
                Healthcare Management System
              </span>
            </span>
          </Link>
          <DarkModeToggle />
        </div>
      </header>

      {/* The skip-link target lives in App.jsx so every route shares one id. */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8 border border-gray-100 dark:border-gray-700">
          <div className="flex items-start space-x-3">
            <span className="bg-blue-100 dark:bg-blue-900/40 p-2 rounded-lg flex-shrink-0">
              <SearchX className="w-6 h-6 text-primary-600 dark:text-primary-300" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Page not found
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                That address does not match any screen in EUNOCURA. Check the link, or start
                again from one of the routes below.
              </p>
            </div>
          </div>

          <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Requested path
          </p>
          <p className="mt-2 w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-3 font-mono text-sm text-gray-800 dark:text-gray-200">
            {location.pathname}
          </p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link to="/" className={linkPrimary}>
              <Home className="w-5 h-5" aria-hidden="true" />
              <span>Home</span>
            </Link>
            {signedIn && user?.role === 'doctor' && (
              <Link to="/doctor" className={linkSecondary}>
                <Stethoscope className="w-5 h-5" aria-hidden="true" />
                <span>Doctor portal</span>
              </Link>
            )}
            {signedIn && user?.role === 'patient' && (
              <Link to="/patient" className={linkSecondary}>
                <Users className="w-5 h-5" aria-hidden="true" />
                <span>Patient portal</span>
              </Link>
            )}
            <Link to="/login" className={linkSecondary}>
              <LogIn className="w-5 h-5" aria-hidden="true" />
              <span>{signedIn ? 'Switch account' : 'Login'}</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
