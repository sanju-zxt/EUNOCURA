import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import DarkModeToggle from './DarkModeToggle';

/**
 * Catches render errors inside one route subtree so a single broken screen does
 * not blank the whole site. Mounted per portal route in App.jsx, never around
 * the app root.
 */
class ErrorBoundaryInner extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
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
  }

  componentDidUpdate(prevProps) {
    // Navigating away from a crashed screen must release the card, otherwise the
    // boundary would keep showing the old error over a view that works again.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const message = error && error.message ? error.message : String(error);

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <header className="bg-white dark:bg-gray-800 shadow-md border-b border-gray-100 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <Link
              to="/"
              className="flex items-center space-x-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
            >
              <span className="bg-gradient-to-br from-primary-600 to-primary-700 p-2 rounded-lg shadow-lg">
                <AlertTriangle className="w-6 h-6 text-white" aria-hidden="true" />
              </span>
              <span className="text-xl font-bold bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">
                EUNOCURA
              </span>
            </Link>
            <DarkModeToggle />
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div
            role="alert"
            aria-live="assertive"
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8 border border-gray-100 dark:border-gray-700"
          >
            <div className="flex items-start space-x-3">
              <span className="bg-red-100 dark:bg-red-900/40 p-2 rounded-lg flex-shrink-0">
                <AlertTriangle
                  className="w-6 h-6 text-red-600 dark:text-red-300"
                  aria-hidden="true"
                />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Something went wrong in this view
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  The rest of EUNOCURA is still working. Reload this view, or head back to the
                  home page.
                </p>
              </div>
            </div>

            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {this.props.name || 'This view'}
            </p>
            <pre className="mt-2 w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 p-3 font-mono text-sm text-red-700 dark:text-red-300">
              {message}
            </pre>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex items-center justify-center space-x-2 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
              >
                <RotateCcw className="w-5 h-5" aria-hidden="true" />
                <span>Reload</span>
              </button>
              <Link
                to="/"
                className="flex items-center justify-center space-x-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-3 px-6 rounded-lg transition-all duration-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
              >
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
