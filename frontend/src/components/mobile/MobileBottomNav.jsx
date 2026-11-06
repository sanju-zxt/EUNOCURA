import React, { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import MobileSheet from './MobileSheet';
import { hapticTap } from '../../services/native';

/**
 * The phone's primary navigation.
 *
 * Seven patient screens cannot fit on a 360px-wide bar, and shrinking them until
 * they do is how a web page pretends to be an app. So: four slots plus overflow.
 * Items marked `primary` claim a slot; everything else lives behind "More",
 * which is still one tap away and still reachable with the back button.
 *
 * Reached only below `md`. The portal keeps the sidebar above that, so nothing
 * changes on a tablet in landscape.
 */
const MobileBottomNav = ({ items, accent = 'primary' }) => {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const { visible, overflow } = useMemo(() => {
    if (items.length <= 4) return { visible: items, overflow: [] };

    const flagged = items.filter((item) => item.primary);
    if (flagged.length > 0 && flagged.length <= 4) {
      const rest = items.filter((item) => !item.primary);
      return { visible: flagged, overflow: rest };
    }
    return { visible: items.slice(0, 4), overflow: items.slice(4) };
  }, [items]);

  const isActive = (item) => {
    if (item.exact) return location.pathname === item.path;
    return location.pathname.startsWith(item.path);
  };

  const overflowActive = overflow.some(isActive);

  const accents = {
    primary: {
      text: 'text-primary-600 dark:text-primary-400',
      rail: 'bg-primary-600 dark:bg-primary-400',
      dot: 'bg-primary-50 dark:bg-primary-900/30',
    },
    green: {
      text: 'text-green-600 dark:text-green-400',
      rail: 'bg-green-600 dark:bg-green-400',
      dot: 'bg-green-50 dark:bg-green-900/30',
    },
  };
  const tone = accents[accent] || accents.primary;

  const tabClass = (active) =>
    [
      'tap relative flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 rounded-xl transition-colors',
      active
        ? `${tone.text} font-semibold`
        : 'text-gray-500 dark:text-gray-400 font-medium hover:text-gray-700 dark:hover:text-gray-200',
    ].join(' ');

  return (
    <>
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-gray-800/95 backdrop-blur border-t border-gray-200 dark:border-gray-700 pb-safe"
      >
        <div className="grid grid-flow-col auto-cols-fr px-1">
          {visible.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={tabClass(active)}
                aria-current={active ? 'page' : undefined}
                onClick={() => hapticTap()}
              >
                <span className="relative flex items-center justify-center h-6">
                  <Icon className="w-[22px] h-[22px]" aria-hidden="true" />
                </span>
                <span className="text-[11px] leading-tight truncate max-w-full px-0.5">
                  {item.shortLabel || item.label}
                </span>
                <span
                  className={`absolute top-0 h-0.5 w-8 rounded-full ${active ? tone.rail : 'bg-transparent'}`}
                  aria-hidden="true"
                />
              </Link>
            );
          })}

          {overflow.length > 0 && (
            <button
              type="button"
              onClick={() => {
                hapticTap();
                setMoreOpen(true);
              }}
              className={tabClass(overflowActive)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
            >
              <span className="relative flex items-center justify-center h-6">
                <MoreHorizontal className="w-[22px] h-[22px]" aria-hidden="true" />
              </span>
              <span className="text-[11px] leading-tight">More</span>
              <span
                className={`absolute top-0 h-0.5 w-8 rounded-full ${overflowActive ? tone.rail : 'bg-transparent'}`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      </nav>

      <MobileSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
        description="Every screen in this portal."
        size="sm"
      >
        <ul className="space-y-1">
          {items.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={() => setMoreOpen(false)}
                  className={[
                    'tap flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] transition-colors',
                    active
                      ? `${tone.dot} ${tone.text} font-semibold`
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700',
                  ].join(' ')}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {active && <span className="text-xs font-medium opacity-80">Open</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </MobileSheet>
    </>
  );
};

export default MobileBottomNav;
