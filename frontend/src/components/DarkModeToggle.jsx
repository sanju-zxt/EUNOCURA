import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useDarkMode } from '../contexts/DarkModeContext';

/**
 * Theme switch used by every header in the app.
 *
 * Phone: a real 44×44 target (`.tap` plus an explicit box) that keeps its exact
 * footprint in both states — both icons live in the same fixed 20×20 frame and
 * cross-fade, so flipping the theme never reflows the header. The control is a
 * toggle button: `aria-pressed` carries the state and the label spells it out,
 * because an icon swap alone tells a screen reader nothing.
 *
 * Desktop (`md:`+): the 36×36 button the app has always rendered.
 *
 * State and persistence stay in `DarkModeContext`; this component only displays.
 */
const DarkModeToggle = () => {
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  return (
    <button
      type="button"
      onClick={toggleDarkMode}
      aria-label="Toggle dark mode"
      aria-pressed={isDarkMode}
      title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      data-testid="dark-mode-toggle"
      className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 md:h-9 md:w-9 md:min-h-0 md:min-w-0"
    >
      {/* Both icons are mounted at all times so the box never changes size. */}
      <span className="relative block h-5 w-5" aria-hidden="true">
        <Sun
          className={`absolute inset-0 h-5 w-5 text-yellow-500 transition-opacity duration-200 ${
            isDarkMode ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <Moon
          className={`absolute inset-0 h-5 w-5 text-gray-700 transition-opacity duration-200 ${
            isDarkMode ? 'opacity-0' : 'opacity-100'
          }`}
        />
      </span>
    </button>
  );
};

export default DarkModeToggle;
