import React, { Suspense, lazy, useEffect } from 'react';
import {
  BrowserRouter,
  HashRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { DarkModeProvider } from './contexts/DarkModeContext';
import ProtectedRoute from './components/ProtectedRoute';
import RouteFallback from './components/RouteFallback';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from './components/mobile/OfflineBanner';
import { initNativeShell, onBackButton } from './services/native';
import { isNativePlatform } from './utils/api';
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

/**
 * Behaviour the browser gets for free and an app has to ask for.
 *
 * - The bundle runs from a webview with no server behind it, so a deep link has
 *   to be handled by the router itself (hence HashRouter on native, below).
 * - Starting a screen at the middle of the previous scroll offset is the single
 *   loudest "this is a website" tell.
 * - Android's back gesture should walk the history stack, then leave the app
 *   instead of trapping the user on the landing page.
 */
const NativeShell = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    initNativeShell();
  }, []);

  // Scroll to the top on a real navigation, but let a hash link behave normally.
  useEffect(() => {
    if (location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.hash]);

  useEffect(() => {
    let dispose = () => {};
    let cancelled = false;

    onBackButton(({ canGoBack }) => {
      // The router's first entry is "/", so "can go back" plus a non-root path
      // is exactly when a back press should pop a route.
      if (canGoBack && location.pathname !== '/') {
        navigate(-1);
        return true;
      }
      return false;
    }).then((fn) => {
      if (cancelled) fn();
      else dispose = fn;
    });

    return () => {
      cancelled = true;
      dispose();
    };
  }, [navigate, location.pathname]);

  return null;
};

// HashRouter: the packaged app is loaded from a synthetic https origin with no
// server-side rewrite, so "/patient/appointments" must live after the "#" or a
// reload lands on a 404 the shell cannot serve. The browser keeps clean URLs.
const Router = isNativePlatform() ? HashRouter : BrowserRouter;

function App() {
  return (
    <DarkModeProvider>
      <AuthProvider>
        <Router>
          <NativeShell />
          <div className="min-h-app bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-white focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-300 dark:focus:ring-primary-500"
            >
              Skip to main content
            </a>
            <OfflineBanner />
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
