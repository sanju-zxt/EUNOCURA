import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, Eye, EyeOff, Heart, Info, Loader2, Lock, Mail } from 'lucide-react';
import DarkModeToggle from '../components/DarkModeToggle';
import { ApiSettingsButton } from '../components/mobile/ApiSettings';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Try doctor login first
      let result = await login(formData.email, formData.password);
      
      if (result.success) {
        // `/auth/me` identifies the account as `role` (the rest of the app,
        // ProtectedRoute included, reads `user.role`). Reading `user_type` here
        // meant the role never matched and every successful login bounced the
        // user back to the marketing page instead of their portal.
        const role = result.user?.role || result.user?.user_type;
        if (role === 'doctor') {
          navigate('/doctor', { replace: true });
        } else if (role === 'patient') {
          navigate('/patient', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      } else {
        // Show what the backend actually said. This used to look for the
        // substring "not a" and replace the message with "Please use the correct
        // login portal for your account type." — but a 503 body of
        // "The database is unreachable, so this route cannot answer." contains
        // "not a" ("cannot answer"), so a dead database was reported as a role
        // mistake. A wrong prompt sends the user hunting for the wrong problem.
        setError(result.error || 'Login failed. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    // `min-h-app` is `100dvh`, so a keyboard that shrinks the webview shortens
    // this box instead of leaving the card parked behind the keyboard. The
    // phone layout also starts at the top (justify-start) rather than centring,
    // because a centred column taller than the viewport clips its own heading
    // as soon as the keyboard opens.
    <div className="min-h-app bg-gradient-to-br from-primary-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex flex-col items-center justify-start md:justify-center px-4 pt-safe pb-safe transition-colors duration-200">
      {/* Theme toggle (every screen size) + server address (phone only: inside
          the app localhost is the phone, so a reachable backend has to be
          entered by hand). */}
      <div className="fixed top-4 right-4 z-50 mt-safe pr-safe flex items-center gap-2">
        <ApiSettingsButton className="md:hidden" />
        <DarkModeToggle />
      </div>

      <div className="w-full max-w-md py-6 md:py-8">
        {/* Header */}
        <div className="text-center mb-6 md:mb-8">
          <div className="flex justify-center mb-3 md:mb-4">
            <div className="bg-primary-600 p-3 rounded-lg shadow-lg">
              <Heart className="w-9 h-9 md:w-10 md:h-10 text-white" aria-hidden="true" />
            </div>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">Welcome Back</h1>
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-300">
            Sign in to your EUNOCURA account
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5 md:p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
          <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
            {/* Wraps instead of clipping: a backend error can be a full sentence
                ("Cannot reach the server at http://10.0.2.2:8000 …"). */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-3 text-red-700 dark:text-red-400"
              >
                <AlertCircle className="mt-0.5 w-5 h-5 flex-shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm break-words">{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500"
                  aria-hidden="true"
                />
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-3 pl-10 pr-3 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors duration-200"
                  placeholder="user@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500"
                  aria-hidden="true"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-3 pl-10 pr-14 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors duration-200"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="tap absolute right-1 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" aria-hidden="true" />
                  ) : (
                    <Eye className="w-5 h-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="btn-primary tap flex w-full items-center justify-center gap-2 px-4 py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all duration-200"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {/* Signup Links */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-4">
              Don't have an account?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/signup/doctor"
                className="tap flex items-center justify-center text-center py-2.5 px-3 border border-primary-600 dark:border-primary-500 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors text-sm font-medium"
              >
                Doctor Signup
              </Link>
              <Link
                to="/signup/patient"
                className="tap flex items-center justify-center text-center py-2.5 px-3 border border-green-600 dark:border-green-500 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors text-sm font-medium"
              >
                Patient Signup
              </Link>
            </div>
          </div>

          {/* Back to Home */}
          <div className="mt-3 text-center">
            <Link
              to="/"
              className="tap inline-flex items-center justify-center px-3 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              ← Back to Home
            </Link>
          </div>
        </div>

        {/* What the demo accounts are. Stated plainly, and not softened: they are
            rows in the database this screen posts to, not mock data. No
            credentials are printed here — the README owns those. */}
        <div className="mt-4 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-blue-900 dark:text-blue-200">
          <p className="flex items-start gap-2 text-sm font-semibold">
            <Info className="mt-0.5 w-4 h-4 flex-shrink-0" aria-hidden="true" />
            <span>About the demo accounts</span>
          </p>
          <p className="mt-1.5 text-sm leading-relaxed break-words">
            This build is seeded with two demo accounts — one patient, one doctor — by{' '}
            <span className="font-mono text-[0.9em] break-all">backend/tools/seed_all.py</span>.
            They are real rows in the database this form signs in to, so the screens behind
            them load real records; nothing here is dummy data. Their credentials are listed
            in the repository README. If the seed was never run, sign-in fails with the
            backend's error — create your own account with a signup link above.
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            On a phone the app also has to know which machine runs the backend: tap the
            wifi button at the top right to set the server address.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
