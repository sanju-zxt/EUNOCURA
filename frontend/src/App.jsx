import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { DarkModeProvider } from './contexts/DarkModeContext';
import ProtectedRoute from './components/ProtectedRoute';
import RouteFallback from './components/RouteFallback';
import ErrorBoundary from './components/ErrorBoundary';
// Kept eager on purpose: the landing page and the login form are the first paint
// on venue wifi, so they must not wait on a second round trip. The 404 is eager
// too, so a bad URL is never held up (or broken) by a chunk fetch.
import HomePage from './pages/HomePage';
import Login from './pages/Login';
import NotFound from './pages/NotFound';

// Everything behind a click or a guard is fetched on demand.
const DoctorSignup = lazy(() => import('./pages/DoctorSignup'));
const PatientSignup = lazy(() => import('./pages/PatientSignup'));
const DoctorPortal = lazy(() => import('./pages/DoctorPortal'));
const PatientPortal = lazy(() => import('./pages/PatientPortal'));
const DiagnosisDashboard = lazy(() => import('./pages/DiagnosisDashboard'));

function App() {
  return (
    <DarkModeProvider>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-white focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-300 dark:focus:ring-primary-500"
            >
              Skip to main content
            </a>
            <div id="main-content" tabIndex={-1} className="focus:outline-none">
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup/doctor" element={<DoctorSignup />} />
                  <Route path="/signup/patient" element={<PatientSignup />} />
                  {/* Boundaries sit inside the guards: a guard redirect still
                      wins, and a crash stays fenced to its own portal. */}
                  <Route
                    path="/doctor/*"
                    element={
                      <ProtectedRoute requiredRole="doctor">
                        <ErrorBoundary name="Doctor portal">
                          <DoctorPortal />
                        </ErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/patient/*"
                    element={
                      <ProtectedRoute requiredRole="patient">
                        <ErrorBoundary name="Patient portal">
                          <PatientPortal />
                        </ErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  {/* Unchanged guard (none) on purpose: this route worked
                      before, so only the boundary is added. */}
                  <Route
                    path="/doctor/session/:appointmentId/diagnosis"
                    element={
                      <ErrorBoundary name="Diagnosis dashboard">
                        <DiagnosisDashboard />
                      </ErrorBoundary>
                    }
                  />
                  {/* Catch-all: a visible 404 instead of a silent bounce to "/". */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </div>
          </div>
        </Router>
      </AuthProvider>
    </DarkModeProvider>
  );
}
export default App;
