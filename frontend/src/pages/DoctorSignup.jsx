import React, { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Stethoscope,
  Mail,
  User,
  Phone,
  FileText,
  Briefcase,
  Award,
  AlertCircle,
  Users,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
} from 'lucide-react';
import DarkModeToggle from '../components/DarkModeToggle';
import useIsMobile from '../components/mobile/useIsMobile';

/* Shared field styling. `text-base` is explicit (16px floor) so the OS never
   zooms the page when a license number or specialisation gets focus. */
const INPUT_CLASS =
  'w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors duration-200 text-base';
const ICON_INPUT_CLASS = `${INPUT_CLASS} pl-10`;
const SELECT_CLASS = `${INPUT_CLASS} pl-10 pr-10 appearance-none`;

/* One descriptor per input, in the order the desktop form has always used.
   The phone steps below only choose *which* of these are visible; the markup
   itself is rendered once, so the two layouts cannot drift apart. */
const FIELDS = [
  {
    name: 'email',
    label: 'Email Address',
    Icon: Mail,
    type: 'email',
    placeholder: 'user@example.com',
    autoComplete: 'email',
    inputMode: 'email',
    autoCapitalize: 'none',
    spellCheck: false,
    enterKeyHint: 'next',
    withIcon: true,
  },
  {
    name: 'full_name',
    label: 'Full Name',
    Icon: User,
    type: 'text',
    placeholder: 'Dr. John Doe',
    autoComplete: 'name',
    autoCapitalize: 'words',
    enterKeyHint: 'next',
    withIcon: true,
  },
  {
    name: 'phone',
    label: 'Phone Number',
    Icon: Phone,
    type: 'tel',
    placeholder: '+1234567890',
    autoComplete: 'tel',
    inputMode: 'tel',
    enterKeyHint: 'next',
    withIcon: true,
  },
  {
    name: 'gender',
    label: 'Gender',
    Icon: Users,
    type: 'select',
    options: [
      { value: '', label: 'Select Gender' },
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
      { value: 'other', label: 'Other' },
    ],
    withIcon: true,
  },
  {
    name: 'license_number',
    label: 'License Number',
    Icon: FileText,
    type: 'text',
    placeholder: 'MD123456',
    autoComplete: 'off',
    autoCapitalize: 'characters',
    spellCheck: false,
    enterKeyHint: 'next',
    withIcon: true,
  },
  {
    name: 'specialization',
    label: 'Specialization',
    Icon: Briefcase,
    type: 'text',
    placeholder: 'Cardiology, Neurology, etc.',
    autoComplete: 'off',
    autoCapitalize: 'words',
    enterKeyHint: 'next',
    withIcon: true,
  },
  {
    name: 'years_experience',
    label: 'Years of Experience',
    Icon: Award,
    type: 'number',
    min: '0',
    placeholder: '5',
    autoComplete: 'off',
    inputMode: 'numeric',
    enterKeyHint: 'next',
    withIcon: true,
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    placeholder: 'Minimum 6 characters',
    autoComplete: 'new-password',
    enterKeyHint: 'next',
    withIcon: false,
  },
  {
    name: 'confirmPassword',
    label: 'Confirm Password',
    type: 'password',
    placeholder: 'Re-enter password',
    autoComplete: 'new-password',
    enterKeyHint: 'done',
    withIcon: false,
  },
];

/* Phone-only grouping. Same fields, same order; only the page is split so a
   thumb can reach Next instead of scrolling a nine-field column. */
const STEPS = [
  { id: 'account', title: 'Account', fields: ['email', 'full_name', 'phone', 'gender'] },
  { id: 'credentials', title: 'Credentials', fields: ['license_number', 'specialization', 'years_experience'] },
  { id: 'security', title: 'Password', fields: ['password', 'confirmPassword'] },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD_BY_NAME = FIELDS.reduce((acc, field) => {
  acc[field.name] = field;
  return acc;
}, {});

const DoctorSignup = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const isMobile = useIsMobile();
  const formTopRef = useRef(null);
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone: '',
    role: 'doctor',
    license_number: '',
    specialization: '',
    years_experience: 0,
    gender: '',
    password: '',
    confirmPassword: '',
    // temp field to avoid 422 error
    hashed_password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const value = e.target.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value;
    setFormData({
      ...formData,
      [e.target.name]: value,
    });
    setError('');
  };

  const validateForm = () => {
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return false;
    }
    return true;
  };

  /* The message a step refuses to advance with. It names the field with the
     label printed above it, so the banner and the empty input match. */
  const stepProblem = (index) => {
    const { fields } = STEPS[index];

    const emptyField = fields.find((name) => {
      const value = formData[name];
      return value === '' || value === null || value === undefined;
    });
    if (emptyField) {
      return `${FIELD_BY_NAME[emptyField]?.label || 'This field'} is required to continue.`;
    }

    if (fields.includes('email') && !EMAIL_PATTERN.test(String(formData.email).trim())) {
      return 'Enter a valid email address to continue.';
    }

    return '';
  };

  /* Moving between steps keeps the form top in view and puts focus back on the
     card, without opening the keyboard (focusing an input would). */
  const bringFormIntoView = () => {
    const node = formTopRef.current;
    if (!node) return;
    try {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      node.scrollIntoView();
    }
    window.requestAnimationFrame(() => {
      try {
        node.focus({ preventScroll: true });
      } catch {
        /* focus is a nicety, not a requirement */
      }
    });
  };

  const goNext = () => {
    const problem = stepProblem(step);
    if (problem) {
      setError(problem);
      bringFormIntoView();
      return;
    }
    setError('');
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
    bringFormIntoView();
  };

  const goBack = () => {
    setError('');
    setStep((current) => Math.max(current - 1, 0));
    bringFormIntoView();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // On a phone only the visible step is mounted, so the earlier steps have to
    // be re-checked here — otherwise a bad email could skip past step one.
    if (isMobile) {
      for (let index = 0; index < STEPS.length; index += 1) {
        const problem = stepProblem(index);
        if (problem) {
          setStep(index);
          setError(problem);
          bringFormIntoView();
          return;
        }
      }
    }

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const { confirmPassword, ...signupData } = formData;
      const result = await signup(signupData);

      if (result.success) {
        navigate('/doctor');
      } else {
        setError(result.error || 'Signup failed. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const currentStep = STEPS[step];
  const isLastStep = step === STEPS.length - 1;
  const visibleFields = isMobile
    ? currentStep.fields.map((name) => FIELD_BY_NAME[name])
    : FIELDS;

  const renderField = (field) => {
    const { name, label, Icon, withIcon } = field;

    return (
      <div key={name}>
        <label htmlFor={name} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label} *
        </label>
        <div className="relative">
          {Icon && (
            <Icon
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            />
          )}
          {field.type === 'select' ? (
            <>
              <select
                id={name}
                name={name}
                value={formData[name]}
                onChange={handleChange}
                required
                className={SELECT_CLASS}
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700 dark:text-gray-300">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </>
          ) : (
            <input
              type={field.type}
              id={name}
              name={name}
              value={formData[name]}
              onChange={handleChange}
              required
              min={field.min}
              placeholder={field.placeholder}
              inputMode={field.inputMode}
              autoComplete={field.autoComplete}
              autoCapitalize={field.autoCapitalize}
              spellCheck={field.spellCheck}
              enterKeyHint={field.enterKeyHint}
              className={withIcon ? ICON_INPUT_CLASS : INPUT_CLASS}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-app md:min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-start md:items-center justify-center px-4 pt-safe pb-safe transition-colors duration-200">
      {/* Dark Mode Toggle - Fixed position */}
      <div className="fixed top-4 right-4 z-50 mt-safe">
        <DarkModeToggle />
      </div>

      <div
        ref={formTopRef}
        tabIndex={-1}
        className="max-w-2xl w-full py-4 sm:py-8 scroll-mt-2"
      >
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-primary-600 p-3 rounded-lg shadow-lg">
              <Stethoscope className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Doctor Registration
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300">
            Create your doctor account on EUNOCURA
          </p>
        </div>

        {/* Signup Form */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-100 dark:border-gray-700 transition-colors duration-200">
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            {isMobile && (
              <div>
                <ol className="flex items-stretch gap-2" aria-label="Registration steps">
                  {STEPS.map((item, index) => {
                    const state = index === step ? 'current' : index < step ? 'complete' : 'upcoming';
                    return (
                      <li key={item.id} className="flex-1 min-w-0">
                        <div
                          aria-current={state === 'current' ? 'step' : undefined}
                          className={[
                            'flex items-center gap-2 h-full rounded-lg border px-2 py-2',
                            state === 'current'
                              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400',
                          ].join(' ')}
                        >
                          <span
                            className={[
                              'flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold flex-shrink-0',
                              state === 'complete'
                                ? 'bg-primary-600 text-white'
                                : state === 'current'
                                  ? 'bg-primary-600 text-white'
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
                            ].join(' ')}
                            aria-hidden="true"
                          >
                            {state === 'complete' ? <Check className="w-3 h-3" /> : index + 1}
                          </span>
                          <span className="text-xs font-semibold leading-tight break-words">
                            {item.title}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400" aria-live="polite">
                  Step {step + 1} of {STEPS.length} · {currentStep.title}
                </p>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg flex items-start gap-2"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm break-words min-w-0">{error}</span>
              </div>
            )}

            <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
              {visibleFields.map((field) => renderField(field))}
            </div>

            <div className="space-y-3">
              {(!isMobile || isLastStep) && (
                <button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className="btn-primary tap w-full py-3 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all duration-200"
                >
                  {loading && <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />}
                  {loading ? 'Creating Account...' : 'Create Doctor Account'}
                </button>
              )}

              {isMobile && (
                <div className="flex items-center gap-3">
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={goBack}
                      className="tap flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200"
                    >
                      <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                      Back
                    </button>
                  )}
                  {!isLastStep && (
                    <button
                      type="button"
                      onClick={goNext}
                      className="tap flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold transition-colors duration-200"
                    >
                      Next
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </form>

          {/* Login Link */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium">
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

export default DoctorSignup;
