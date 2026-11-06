import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Home, RefreshCw, RotateCcw } from 'lucide-react';
import DarkModeToggle from './DarkModeToggle';

const primaryAction =
  'tap flex w-full sm:w-auto items-center justify-center gap-2 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800';

const secondaryAction =
  'tap flex w-full sm:w-auto items-center justify-center gap-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-3 px-6 rounded-lg transition-all duration-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800';

/**
 * Catches render errors inside one route subtree so a single broken screen does
 * not blank the whole site. Mounted per portal route in App.jsx, never around
 * the app root.
 *
 * The card always says what failed in words; the raw error text and the
 * component stack live behind a <details> so a bug can be described during a
 * demo without reaching for the browser console.
 */
class ErrorBoundaryInner extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, componentStack: '' };
    this.alertRef = React.createRef();
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Full detail goes to the console; the card stays short and readable.
    console.error(
      `[EUNOCURA] render error in ${this.props.name || 'view'}:`,
      error,
      info && info.componentStack
    );
    this.setState({ componentStack: (info && info.componentStack) || '' });
  }

  componentDidUpdate(prevProps, prevState) {
    // Navigating away from a crashed screen must release the card, otherwise the
    // boundary would keep showing the old error over a view that works again.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, componentStack: '' });
      return;
    }

    // Move focus into the card on the transition from healthy to crashed, so a
    // keyboard or screen-reader user is not left outside the message.
    if (this.state.error && !prevState.error && this.alertRef.current) {
      this.alertRef.current.focus();
    }
  }

  /**
   * Drop the captured error and re-render the children. A transient failure (a
   * race with a fetch, a bad prop that has since changed) recovers without a
   * page reload; a deterministic one simply lands back on this card.
   */
  handleRetry() {
    this.setState({ error: null, componentStack: '' });
  }

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const message = error && error.message ? error.message : String(error);
    const detail = String(message).trim() || 'No error message was provided.';
    const stack = (this.state.componentStack || '').trim();
    const viewName = this.props.name || 'This view';

    return (
      <div className="min-h-app bg-gray-50 dark:bg-gray-900 transition-colors duration-200 px-safe pt-safe pb-safe">
        <header className="bg-white dark:bg-gray-800 shadow-md border-b border-gray-100 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
            <Link
              to="/"
              className="flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
            >
              <span className="bg-gradient-to-br from-primary-600 to-primary-700 p-2 rounded-lg shadow-lg shrink-0">
                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-white" aria-hidden="true" />
              </span>
              <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">
                EUNOCURA
              </span>
            </Link>
            <DarkModeToggle />
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16">
          <div
            ref={this.alertRef}
            tabIndex={-1}
            role="alert"
            aria-live="assertive"
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5 sm:p-8 border border-gray-100 dark:border-gray-700 focus:outline-none"
          >
            <div className="flex items-start gap-3">
              <span className="bg-red-100 dark:bg-red-900/40 p-2 rounded-lg shrink-0">
                <AlertTriangle
                  className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-300"
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  Something went wrong in this view
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  The rest of EUNOCURA is still working. Reload this view, or head back to the
                  home page.
                </p>
              </div>
            </div>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 break-words">
              {viewName}
              {error && error.name ? ` · ${error.name}` : ''}
            </p>

            <details className="group mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60">
              <summary className="tap flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:focus-visible:ring-offset-gray-800">
                <ChevronRight
                  className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
                <span>Error details</span>
              </summary>
              <div className="px-3 pb-3">
                <pre className="mt-1 w-full max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs sm:text-sm text-red-700 dark:text-red-300">
                  {detail}
                </pre>
                {stack && (
                  <>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Component stack
                    </p>
                    <pre className="mt-1 w-full max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-gray-600 dark:text-gray-400">
                      {stack}
                    </pre>
                  </>
                )}
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  This is the raw render error from this screen. It is kept here so a bug can be
                  reported, or the demo debugged, without opening the browser console.
                </p>
              </div>
            </details>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={this.handleRetry} className={primaryAction}>
                <RotateCcw className="w-5 h-5" aria-hidden="true" />
                <span>Try again</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className={secondaryAction}
              >
                <RefreshCw className="w-5 h-5" aria-hidden="true" />
                <span>Reload page</span>
              </button>
              <Link to="/" className={secondaryAction}>
                <Home className="w-5 h-5" aria-hidden="true" />
                <span>Back to home</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * Thin wrapper that feeds the current location key into the class above, so any
 * navigation clears a captured error. The catching itself is the class.
 */
const ErrorBoundary = ({ children, name }) => {
  const location = useLocation();
  return (
    <ErrorBoundaryInner resetKey={location.key} name={name}>
      {children}
    </ErrorBoundaryInner>
  );
};

export default ErrorBoundary;
