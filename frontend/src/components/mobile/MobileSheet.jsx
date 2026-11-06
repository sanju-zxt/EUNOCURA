import React, { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import useIsMobile from './useIsMobile';

/**
 * One dialog, two shapes.
 *
 * On a phone it is a bottom sheet: it rises from the safe-area edge, has a drag
 * handle, and never covers the whole screen so the page stays visible behind it.
 * At >= md it is an ordinary centred dialog, so the desktop app is unchanged.
 *
 * Accessibility is the part that is easy to lose in a sheet: focus moves into
 * the panel, Tab is trapped, Escape closes, the page behind cannot scroll, and
 * the body scroll position is restored on close.
 */
const MobileSheet = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeLabel = 'Close',
  hideClose = false,
  className = '',
}) => {
  const isMobile = useIsMobile();
  const panelRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  const scrollLock = useRef({ overflow: '', paddingRight: '' });

  const close = useCallback(() => {
    if (onClose) onClose();
  }, [onClose]);

  // Escape closes; Tab cycles inside the panel.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = panel.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  // Lock the page behind the sheet without losing the scroll offset.
  useEffect(() => {
    if (!open) return undefined;
    const { body } = document;
    scrollLock.current = {
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    const offset = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (offset > 0) body.style.paddingRight = `${offset}px`;

    return () => {
      body.style.overflow = scrollLock.current.overflow;
      body.style.paddingRight = scrollLock.current.paddingRight;
    };
  }, [open]);

  // Move focus into the panel once it is mounted.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const target =
      panel.querySelector('[data-autofocus]') ||
      panel.querySelector(
        'input:not([type="hidden"]), textarea, select, button:not([disabled]), a[href]'
      ) ||
      panel;
    // A rAF keeps the focus ring from flashing during the slide-in.
    window.requestAnimationFrame(() => {
      try {
        target.focus({ preventScroll: true });
      } catch {
        /* focus is a nicety, not a requirement */
      }
    });
  }, [open]);

  if (!open) return null;

  const sizes = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
  };

  const sheet = (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      {/* Backdrop. Clicking it is the phone's expected "dismiss". */}
      <div
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm animate-fade-in"
        onClick={close}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={[
          'relative w-full bg-white dark:bg-gray-800 shadow-2xl flex flex-col',
          // Phone: full-width sheet, rounded top, capped so context stays visible.
          'rounded-t-2xl max-h-[92dvh] animate-sheet-up',
          // Tablet/desktop: a normal dialog in the middle of the screen.
          'sm:rounded-2xl sm:max-h-[85vh] sm:animate-fade-in',
          sizes[size] || sizes.md,
          // The safe-area inset is only meaningful in the sheet shape.
          'pb-safe sm:pb-0',
          className,
        ].join(' ')}
      >
        {/* Drag handle. Purely decorative on the phone (the sheet is not
            draggable) but it is the visual cue that this is a sheet. */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        {(title || !hideClose) && (
          <div className="flex items-start gap-3 px-5 pt-4 sm:pt-5 pb-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
            <div className="min-w-0 flex-1">
              {title && (
                <h2
                  id={titleId}
                  className="text-base sm:text-lg font-bold text-gray-900 dark:text-white break-words"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={close}
                className="tap -mr-2 -mt-1 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
                aria-label={closeLabel}
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

        {footer && (
          <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-3 flex-shrink-0 bg-white dark:bg-gray-800 rounded-b-none sm:rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  // Portalled so a parent with `overflow: hidden` (a card, a table wrapper)
  // cannot clip the sheet.
  if (typeof document === 'undefined') return sheet;
  return createPortal(sheet, document.body);
};

export default MobileSheet;
