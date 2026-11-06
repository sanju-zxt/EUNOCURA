import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Heart,
  Mail,
  User,
  Phone,
  Calendar,
  Droplet,
  AlertCircle,
  Users,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
} from 'lucide-react';
import DarkModeToggle from '../components/DarkModeToggle';
import useIsMobile from '../components/mobile/useIsMobile';
import { hapticTap } from '../services/native';

// One id so a field the message is about can point at the alert.
const ERROR_ID = 'patient-signup-error';

const LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2';
const ICON_CLASS =
  'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500';

// Shared field styling: 16px text so the phone never zooms on focus, and a
// 44px minimum height so a tap lands on the control instead of the label.
const FIELD_BASE =
  'w-full rounded-lg border bg-white dark:bg-gray-700 py-2 text-base text-gray-900 dark:text-white ' +
  'placeholder-gray-400 dark:placeholder-gray-500 transition-colors duration-200 ' +
  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent';

/**
 * The five fields of the phone stepper are the same six personal details plus
 * the two password fields, split into the two screens a phone can hold with the
 * keyboard open. Desktop renders all of them at once, exactly as before, so the
 * step list below is only ever consulted below `md`.
 */
const STEPS = [
  {
    id: 'details',
    label: 'Details',
    title: 'Your details',
    fields: ['email', 'full_name', 'phone', 'gender', 'date_of_birth', 'blood_group'],
  },
  {
    id: 'password',
    label: 'Password',
    title: 'Choose a password',
    fields: ['password', 'confirmPassword'],
  },
];

const PatientSignup = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const isMobile = useIsMobile();

  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone: '',
    role: 'patient',
    gender: '',
    date_of_birth: '',
    blood_group: '',
    password: '',
    confirmPassword: '',
    // temp field to avoid 422 error
    hashed_password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Phone stepper only. On desktop `step` stays at 0 and is never read.
  const [step, setStep] = useState(0);
  const [invalidField, setInvalidField] = useState('');

  const formRef = useRef(null);
  const stepHeadingRef = useRef(null);
  const lastFocusedStep = useRef(0);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
    setInvalidField('');
  };

  const validateForm = () => {
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setInvalidField('confirmPassword');
      return false;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      setInvalidField('password');
      return false;
    }
    return true;
  };

  const submitAccount = async () => {
    setLoading(true);

    try {
      const { confirmPassword, ...signupData } = formData;
      const result = await signup(signupData);

      if (result.success) {
        navigate('/patient');
      } else {
        setError(result.error || 'Signup failed. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInvalidField('');

    // Phone: on an intermediate step a submit is "Next", so nothing can try to
    // create an account from half-filled data.
    if (isMobile && step < STEPS.length - 1) {
      goNext();
      return;
    }

    if (!validateForm()) {
      return;
    }

    await submitAccount();
  };

  /**
   * Advance one step, but only with the fields on this screen actually filled.
   * The message is the platform's own constraint message for the offending
   * control, so it says exactly what is wrong instead of a generic "invalid".
   */
  const goNext = () => {
    const form = formRef.current;
    const current = STEPS[step];
    const invalidName =
      form && form.elements
        ? current.fields.find((name) => {
            const field = form.elements.namedItem(name);
            return field && field.validity && !field.validity.valid;
          })
        : undefined;

    if (invalidName) {
      const field = form.elements.namedItem(invalidName);
      setInvalidField(invalidName);
      setError(field.validationMessage || 'Please check this field before continuing.');
      try {
        field.focus();
        field.scrollIntoView({ block: 'center' });
      } catch {
        /* focus is a nicety, not a requirement */
      }
      return;
    }

    setError('');
    setInvalidField('');
    hapticTap();
    setStep((current_) => Math.min(current_ + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setError('');
    setInvalidField('');
    hapticTap();
    setStep((current_) => Math.max(current_ - 1, 0));
  };

  // The phone keyboard's enter key advances the stepper instead of doing
  // nothing. On the last step the real submit button keeps the default, so
  // enter still creates the account.
  const handleFormKeyDown = (event) => {
    if (!isMobile || step >= STEPS.length - 1) return;
    if (event.key !== 'Enter' || event.defaultPrevented) return;
    const tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
    if (tag === 'textarea' || tag === 'button') return;
    event.preventDefault();
    goNext();
  };

  // Announce and move focus to the new screen's heading. Skipped on the first
  // paint and on a resize, so nothing steals focus from the user.
  useEffect(() => {
    if (!isMobile || lastFocusedStep.current === step) return;
    lastFocusedStep.current = step;
    const heading = stepHeadingRef.current;
    if (!heading) return;
    try {
      heading.focus();
    } catch {
      /* focus is a nicety, not a requirement */
    }
  }, [step, isMobile]);

  const fieldClass = (name, spacing = 'px-4') =>
    [
      FIELD_BASE,
      spacing,
      invalidField === name
        ? 'border-red-500 dark:border-red-500'
        : 'border-gray-300 dark:border-gray-600',
    ].join(' ');

  const isLastStep = step === STEPS.length - 1;

  const fields = {
    email: (
      <div key="email" className="min-w-0">
        <label htmlFor="email" className={LABEL_CLASS}>
          Email Address *
        </label>
        <div className="relative">
          <Mail className={ICON_CLASS} aria-hidden="true" />
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            aria-invalid={invalidField === 'email' || undefined}
            aria-describedby={invalidField === 'email' ? ERROR_ID : undefined}
            className={fieldClass('email', 'pl-10 pr-4')}
            placeholder="user@example.com"
          />
        </div>
      </div>
    ),

    full_name: (
      <div key="full_name" className="min-w-0">
        <label htmlFor="full_name" className={LABEL_CLASS}>
          Full Name *
        </label>
        <div className="relative">
          <User className={ICON_CLASS} aria-hidden="true" />
          <input
            type="text"
            id="full_name"
            name="full_name"
            value={formData.full_name}
            onChange={handleChange}
            required
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="next"
            aria-invalid={invalidField === 'full_name' || undefined}
            aria-describedby={invalidField === 'full_name' ? ERROR_ID : undefined}
            className={fieldClass('full_name', 'pl-10 pr-4')}
            placeholder="John Doe"
          />
        </div>
      </div>
    ),

    phone: (
      <div key="phone" className="min-w-0">
        <label htmlFor="phone" className={LABEL_CLASS}>
          Phone Number *
        </label>
        <div className="relative">
          <Phone className={ICON_CLASS} aria-hidden="true" />
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
            autoComplete="tel"
            inputMode="tel"
            enterKeyHint="next"
            aria-invalid={invalidField === 'phone' || undefined}
            aria-describedby={invalidField === 'phone' ? ERROR_ID : undefined}
            className={fieldClass('phone', 'pl-10 pr-4')}
            placeholder="+1234567890"
          />
        </div>
      </div>
    ),

    gender: (
      <div key="gender" className="min-w-0">
        <label htmlFor="gender" className={LABEL_CLASS}>
          Gender *
        </label>
        <div className="relative">
          <Users className={ICON_CLASS} aria-hidden="true" />
          <select
            id="gender"
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            required
            aria-invalid={invalidField === 'gender' || undefined}
            aria-describedby={invalidField === 'gender' ? ERROR_ID : undefined}
            className={fieldClass('gender', 'pl-10 pr-10 appearance-none')}
          >
            <option value="">Select Gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700 dark:text-gray-300">
            <svg
              className="fill-current h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
            </svg>
          </div>
        </div>
      </div>
    ),

    // The native date picker follows the browser's colour scheme, so without
    // `color-scheme` the calendar glyph and the popup are dark-on-dark in dark
    // mode. The two arbitrary properties let the platform draw a readable one.
    date_of_birth: (
      <div key="date_of_birth" className="min-w-0">
        <label htmlFor="date_of_birth" className={LABEL_CLASS}>
          Date of Birth *
        </label>
        <div className="relative">
          <Calendar className={ICON_CLASS} aria-hidden="true" />
          <input
            type="date"
            id="date_of_birth"
            name="date_of_birth"
            value={formData.date_of_birth}
            onChange={handleChange}
            required
            autoComplete="bday"
            aria-invalid={invalidField === 'date_of_birth' || undefined}
            aria-describedby={invalidField === 'date_of_birth' ? ERROR_ID : undefined}
            className={`${fieldClass('date_of_birth', 'pl-10 pr-4')} [color-scheme:light] dark:[color-scheme:dark]`}
          />
        </div>
      </div>
    ),

    blood_group: (
      <div key="blood_group" className="min-w-0">
        <label htmlFor="blood_group" className={LABEL_CLASS}>
          Blood Group *
        </label>
        <div className="relative">
          <Droplet className={ICON_CLASS} aria-hidden="true" />
          <select
            id="blood_group"
            name="blood_group"
            value={formData.blood_group}
            onChange={handleChange}
            required
            aria-invalid={invalidField === 'blood_group' || undefined}
            aria-describedby={invalidField === 'blood_group' ? ERROR_ID : undefined}
            className={fieldClass('blood_group', 'pl-10 pr-10 appearance-none')}
          >
            <option value="">Select Blood Group</option>
            <option value="A+">A+</option>
            <option value="A-">A-</option>
            <option value="B+">B+</option>
            <option value="B-">B-</option>
            <option value="AB+">AB+</option>
            <option value="AB-">AB-</option>
            <option value="O+">O+</option>
            <option value="O-">O-</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700 dark:text-gray-300">
            <svg
              className="fill-current h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
            </svg>
          </div>
        </div>
      </div>
    ),

    password: (
      <div key="password" className="min-w-0">
        <label htmlFor="password" className={LABEL_CLASS}>
          Password *
        </label>
        <div className="relative">
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            aria-invalid={invalidField === 'password' || undefined}
            aria-describedby={invalidField === 'password' ? ERROR_ID : undefined}
            className={fieldClass('password')}
            placeholder="Minimum 6 characters"
          />
        </div>
      </div>
    ),

    confirmPassword: (
      <div key="confirmPassword" className="min-w-0">
        <label htmlFor="confirmPassword" className={LABEL_CLASS}>
          Confirm Password *
        </label>
        <div className="relative">
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-invalid={invalidField === 'confirmPassword' || undefined}
            aria-describedby={invalidField === 'confirmPassword' ? ERROR_ID : undefined}
            className={fieldClass('confirmPassword')}
            placeholder="Re-enter password"
          />
        </div>
      </div>
    ),
  };

  const submitButton = (
    <button
      type="submit"
      disabled={loading}
      aria-busy={loading}
      className="tap flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-green-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          <span>Creating Account...</span>
        </>
      ) : (
        <span>Create Patient Account</span>
      )}
    </button>
  );

  return (
    // `min-h-app` is `100dvh`, so a keyboard that shrinks the webview shortens
    // this box instead of leaving the card parked behind the keyboard, and the
    // phone layout starts at the top rather than centring a column taller than
    // the viewport.
    <div className="min-h-app bg-gradient-to-br from-green-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex flex-col items-center justify-start md:justify-center px-4 pt-safe pb-safe transition-colors duration-200">
      {/* Dark Mode Toggle - Fixed position */}
      <div className="fixed top-4 right-4 z-50 mt-safe pr-safe">
        <DarkModeToggle />
      </div>

      <div className="max-w-2xl w-full py-6 md:py-8">
        {/* Header */}
        <div className="text-center mb-6 md:mb-8">
          <div className="flex justify-center mb-3 md:mb-4">
            <div className="bg-green-600 p-3 rounded-lg shadow-lg">
              <Heart className="w-9 h-9 md:w-10 md:h-10 text-white" aria-hidden="true" />
            </div>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Patient Registration
          </h1>
          <p className="text-sm md:text-base text-gray-600 dark:text-gray-300">
            Create your patient account on EUNOCURA
          </p>
        </div>

        {/* Signup Form */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5 md:p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            onKeyDown={handleFormKeyDown}
            className="space-y-5 md:space-y-6"
          >
            {/* Wraps instead of clipping: a backend error is a full sentence. */}
            {error && (
              <div
                id={ERROR_ID}
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-3 text-red-700 dark:text-red-400"
              >
                <AlertCircle className="mt-0.5 w-5 h-5 flex-shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm break-words">{error}</span>
              </div>
            )}

            {isMobile ? (
              <>
                {/* Stepper: which screen of the form is on screen, and where the
                    user is in it. `aria-current` is the announcement. */}
                <div>
                  <ol className="flex items-center gap-2" aria-label="Registration progress">
                    {STEPS.map((entry, index) => {
                      const isCurrent = index === step;
                      const isDone = index < step;
                      return (
                        <li key={entry.id} className="flex-1 min-w-0">
                          <div
                            aria-current={isCurrent ? 'step' : undefined}
                            className={[
                              'flex items-center gap-2 rounded-lg border px-2.5 py-2',
                              isCurrent
                                ? 'border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-900/20'
                                : 'border-gray-200 dark:border-gray-700',
                            ].join(' ')}
                          >
                            <span
                              className={[
                                'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
                                isCurrent || isDone
                                  ? 'bg-green-600 text-white'
                                  : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
                              ].join(' ')}
                              aria-hidden="true"
                            >
                              {isDone ? <Check className="w-3.5 h-3.5" /> : index + 1}
                            </span>
                            <span
                              className={[
                                'min-w-0 text-sm font-semibold leading-tight break-words',
                                isCurrent
                                  ? 'text-green-800 dark:text-green-300'
                                  : 'text-gray-600 dark:text-gray-400',
                              ].join(' ')}
                            >
                              {entry.label}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  <h2
                    ref={stepHeadingRef}
                    tabIndex={-1}
                    className="mt-3 text-lg font-bold text-gray-900 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800 rounded"
                  >
                    {STEPS[step].title}
                    <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400" aria-live="polite">
                      Step {step + 1} of {STEPS.length}
                    </span>
                  </h2>
                </div>

                <div className="space-y-4">
                  {STEPS[step].fields.map((name) => fields[name])}
                </div>

                {/* Back / Next. Both are full-height 44px targets; the submit is
                    only on the last step so a thumb never hits it early. */}
                <div className="flex items-center gap-3">
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={goBack}
                      className="tap flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 transition-colors duration-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                    >
                      <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                      <span>Back</span>
                    </button>
                  )}
                  {!isLastStep && (
                    <button
                      type="button"
                      onClick={goNext}
                      className="tap flex flex-[2] items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-green-700 hover:shadow-lg"
                    >
                      <span>Next</span>
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                    </button>
                  )}
                  {isLastStep && <div className="min-w-0 flex-[2]">{submitButton}</div>}
                </div>
              </>
            ) : (
              <>
                <div className="grid md:grid-cols-2 gap-6">
                  {STEPS[0].fields.concat(STEPS[1].fields).map((name) => fields[name])}
                </div>
                {submitButton}
              </>
            )}
          </form>

          {/* Login Link */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Already have an account?{' '}
              <Link
                to="/login"
                className="tap inline-flex items-center px-1 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium"
              >
                Sign In
              </Link>
            </p>
            <Link
              to="/"
              className="tap inline-flex items-center justify-center mt-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientSignup;
