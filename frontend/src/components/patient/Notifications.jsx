import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Pill,
  Calendar,
  FileText,
  Trash2,
  Check,
  CheckCheck,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { apiRequest } from '../../utils/api';

const CATEGORY_ORDER = ['appointment', 'medication', 'result', 'system'];

const CATEGORY_META = {
  appointment: {
    label: 'Appointments',
    chip: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800/40',
    active: 'bg-green-600 text-white shadow-md',
    icon: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400',
  },
  medication: {
    label: 'Medication',
    chip: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/40',
    active: 'bg-blue-600 text-white shadow-md',
    icon: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
  },
  result: {
    label: 'Test Results',
    chip: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/40',
    active: 'bg-purple-600 text-white shadow-md',
    icon: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
  },
  system: {
    label: 'System',
    chip: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
    active: 'bg-gray-600 text-white shadow-md',
    icon: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  },
};

const CATEGORY_ICON = {
  appointment: Calendar,
  medication: Pill,
  result: FileText,
  system: Bell,
};

/** Format an ISO timestamp for the card footer; falls back to the raw string. */
const formatStamp = (iso) => {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  const date = parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = parsed.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date} at ${time}`;
};

// Card chrome. On a phone a card is 16px inset (`px-4 py-4`) so a row keeps the
// thumbnail-sized gutters; from md the original 24px padding returns unchanged.
const CARD_PAD = 'px-4 py-4 md:p-6';
// A centred block (loading / empty / error) keeps its own vertical rhythm, so it
// states both axes explicitly instead of layering two conflicting padding sets.
const CENTER_PAD = 'px-4 py-12 md:px-6 md:py-16';
const EMPTY_PAD = 'px-4 py-10 md:px-6 md:py-12';

const Notifications = () => {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [pending, setPending] = useState({});
  const [busyAll, setBusyAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await apiRequest('/notifications/me');
    if (!response.success) {
      setItems([]);
      setUnread(0);
      setError(response.error || 'Could not load your notifications.');
    } else {
      const list = Array.isArray(response.data?.items) ? response.data.items : [];
      setItems(list);
      setUnread(
        typeof response.data?.unread === 'number'
          ? response.data.unread
          : list.filter((n) => !n.read).length
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A filter chip can disappear (e.g. the last unread is read); fall back to All.
  useEffect(() => {
    if (filter === 'unread' && unread === 0) {
      setFilter('all');
    } else if (CATEGORY_ORDER.includes(filter) && !items.some((n) => n.category === filter)) {
      setFilter('all');
    }
  }, [filter, items, unread]);

  const chips = useMemo(() => {
    const list = [{ key: 'all', label: 'All', count: items.length }];
    if (unread > 0) {
      list.push({ key: 'unread', label: 'Unread', count: unread });
    }
    CATEGORY_ORDER.forEach((category) => {
      const count = items.filter((n) => n.category === category).length;
      if (count > 0) {
        list.push({
          key: category,
          label: CATEGORY_META[category].label,
          count,
        });
      }
    });
    return list;
  }, [items, unread]);

  const visible = useMemo(() => {
    if (filter === 'unread') return items.filter((n) => !n.read);
    if (CATEGORY_ORDER.includes(filter)) return items.filter((n) => n.category === filter);
    return items;
  }, [items, filter]);

  const setItemPending = (id, value) => {
    setPending((prev) => {
      const next = { ...prev };
      if (value) next[id] = true;
      else delete next[id];
      return next;
    });
  };

  const markAsRead = async (id) => {
    const target = items.find((n) => n.id === id);
    if (!target || target.read || pending[id]) return;

    setActionError(null);
    setItemPending(id, true);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((count) => Math.max(0, count - 1));

    const response = await apiRequest(`/notifications/${id}/read`, { method: 'POST' });
    if (!response.success) {
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: false } : n)));
      setUnread((count) => count + 1);
      setActionError(response.error || 'Could not mark that notification as read.');
    }
    setItemPending(id, false);
  };

  const markAllAsRead = async () => {
    if (unread === 0 || busyAll) return;

    const snapshot = items;
    const previousUnread = unread;
    setActionError(null);
    setBusyAll(true);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);

    const response = await apiRequest('/notifications/read-all', { method: 'POST' });
    if (!response.success) {
      setItems(snapshot);
      setUnread(previousUnread);
      setActionError(response.error || 'Could not mark all notifications as read.');
    }
    setBusyAll(false);
  };

  const deleteNotification = async (id) => {
    const index = items.findIndex((n) => n.id === id);
    if (index === -1 || pending[id]) return;

    const snapshot = items;
    const wasUnread = !items[index].read;
    const previousUnread = unread;
    setActionError(null);
    setItemPending(id, true);
    setItems((prev) => prev.filter((n) => n.id !== id));
    if (wasUnread) setUnread((count) => Math.max(0, count - 1));

    const response = await apiRequest(`/notifications/${id}`, { method: 'DELETE' });
    if (!response.success) {
      setItems(snapshot);
      setUnread(previousUnread);
      setActionError(response.error || 'Could not delete that notification.');
    }
    setItemPending(id, false);
  };

  const retry = () => load();

  return (
    // The portal main element already supplies the phone gutter (px-4), so the
    // cards add their own 16px inside it rather than doubling the page padding.
    <div className="max-w-5xl mx-auto">
      <div className="mb-5 sm:mb-8">
        <h2 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2">Notifications</h2>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Stay updated with your health reminders and alerts
        </p>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mb-4 md:mb-6 rounded-xl border-2 border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-4 md:px-4 md:py-3 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 dark:text-red-300 break-words min-w-0">{actionError}</p>
        </div>
      )}

      {loading ? (
        <div className={`card ${CENTER_PAD} text-center`} aria-busy="true">
          <Loader2 className="w-10 h-10 text-primary-600 dark:text-primary-400 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600 dark:text-gray-400">Loading your notifications...</p>
        </div>
      ) : error ? (
        <div className={`card ${CENTER_PAD} text-center`}>
          <AlertTriangle className="w-16 h-16 text-red-400 dark:text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Could not load notifications
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-xl mx-auto break-words">{error}</p>
          <button
            onClick={retry}
            className="btn-secondary tap md:min-h-0 md:min-w-0 inline-flex items-center justify-center"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Stats and Actions — kept above the list on a phone so "Mark all read"
              is the first thing a thumb reaches, not something below 40 rows. */}
          <div
            className={`card ${CARD_PAD} mb-4 md:mb-6 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border-2 border-orange-200 dark:border-orange-700 hover:shadow-xl transition-all duration-200`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-3 rounded-xl shadow-md relative flex-shrink-0">
                  <Bell className="w-6 h-6 text-white" />
                  {unread > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold shadow-lg">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {unread} Unread Notification{unread !== 1 ? 's' : ''}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {items.length} total notification{items.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              {unread > 0 && (
                <button
                  onClick={markAllAsRead}
                  disabled={busyAll}
                  className="btn-secondary tap md:min-h-0 md:min-w-0 w-full md:w-auto inline-flex items-center justify-center text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {busyAll ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCheck className="w-4 h-4 mr-2" />
                  )}
                  Mark All Read
                </button>
              )}
            </div>
          </div>

          {/* Filters — counts come from the loaded rows, never invented */}
          {items.length > 0 && (
            <div className={`card ${CARD_PAD} mb-4 md:mb-6 hover:shadow-xl transition-all duration-200`}>
              <div className="flex flex-wrap gap-2">
                {chips.map((chip) => {
                  const isActive = filter === chip.key;
                  const meta = CATEGORY_META[chip.key];
                  const idle =
                    chip.key === 'all' || chip.key === 'unread'
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      : meta.chip;
                  const active = meta ? meta.active : 'bg-primary-600 text-white shadow-md';
                  return (
                    <button
                      key={chip.key}
                      onClick={() => setFilter(chip.key)}
                      aria-pressed={isActive}
                      className={`tap md:min-h-0 md:min-w-0 inline-flex items-center justify-center px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                        isActive ? active : idle
                      }`}
                    >
                      {chip.label} ({chip.count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notifications List */}
          <div className="space-y-3">
            {visible.length === 0 ? (
              <div className={`card ${EMPTY_PAD} text-center`}>
                <Bell className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                {items.length === 0 ? (
                  <>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      You have no notifications
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      Reminders and updates from your care team will appear here.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      Nothing in this filter
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      No notifications match the selected category.
                    </p>
                    <button
                      onClick={() => setFilter('all')}
                      className="btn-secondary tap md:min-h-0 md:min-w-0 inline-flex items-center justify-center text-sm"
                    >
                      Show all
                    </button>
                  </>
                )}
              </div>
            ) : (
              visible.map((notif) => {
                const meta = CATEGORY_META[notif.category] || CATEGORY_META.system;
                const Icon = CATEGORY_ICON[notif.category] || Bell;
                const isPending = Boolean(pending[notif.id]);
                return (
                  <div
                    key={notif.id}
                    className={`card ${CARD_PAD} relative transition-all duration-200 hover:shadow-lg ${
                      notif.read
                        ? 'bg-white dark:bg-gray-800'
                        : 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700'
                    }`}
                  >
                    {/* Phone only: an unread row is actionable, so the whole row
                        marks it read. This is a real <button> rather than a click
                        handler on a div, so a keyboard or screen reader gets the
                        same action; the footer below sits above it in the stack
                        so its own controls still receive their taps. */}
                    {!notif.read && (
                      <button
                        type="button"
                        onClick={() => markAsRead(notif.id)}
                        disabled={isPending}
                        aria-label={`Mark as read: ${notif.title}`}
                        className="tap absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-not-allowed md:hidden"
                      />
                    )}

                    {/* Nothing here is interactive, so it stays under the row's
                        tap target; the spacing is the same 16px the desktop used. */}
                    <div className="flex items-start gap-3 md:gap-4">
                      <div className={`${meta.icon} p-2.5 md:p-3 rounded-xl shadow-md flex-shrink-0`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4
                            className={`min-w-0 break-words text-base text-gray-900 dark:text-white ${
                              notif.read ? 'font-normal md:font-semibold' : 'font-bold'
                            }`}
                          >
                            {notif.title}
                          </h4>
                          {!notif.read && (
                            <span className="mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-blue-600 dark:bg-blue-400" />
                          )}
                        </div>
                        {notif.body && (
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 break-words">{notif.body}</p>
                        )}
                        {/* Footer. Phone: stacked, so the stamp gets its own line
                            and never has to compete with the buttons for width.
                            From md it is the row the desktop always had. */}
                        <div className="pointer-events-none relative z-10 flex flex-col items-start gap-2 md:flex-row md:flex-wrap md:items-center md:justify-between">
                          <div className="pointer-events-none flex min-w-0 flex-wrap items-center gap-2">
                            {!notif.read && (
                              <span className="md:hidden inline-flex flex-shrink-0 items-center rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white dark:bg-blue-500">
                                Unread
                              </span>
                            )}
                            <p className="min-w-0 break-words text-xs text-gray-500 dark:text-gray-400">
                              {formatStamp(notif.created_at)}
                            </p>
                          </div>
                          <div className="pointer-events-auto flex w-full items-center justify-end gap-2 md:w-auto md:gap-3">
                            {notif.link &&
                              (notif.link.startsWith('/') ? (
                                <Link
                                  to={notif.link}
                                  className="tap md:min-h-0 md:min-w-0 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 px-3 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-xs font-semibold transition-colors md:border-0 md:px-0"
                                >
                                  Open
                                  <ExternalLink className="w-3 h-3 ml-1" />
                                </Link>
                              ) : (
                                <a
                                  href={notif.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="tap md:min-h-0 md:min-w-0 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 px-3 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-xs font-semibold transition-colors md:border-0 md:px-0"
                                >
                                  Open
                                  <ExternalLink className="w-3 h-3 ml-1" />
                                </a>
                              ))}
                            {/* The phone marks a row read by tapping it, so this
                                text control is the md+ affordance only. */}
                            {!notif.read && (
                              <button
                                type="button"
                                onClick={() => markAsRead(notif.id)}
                                disabled={isPending}
                                className="hidden md:inline-flex text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed items-center"
                              >
                                {isPending ? (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3 mr-1" />
                                )}
                                Mark as read
                              </button>
                            )}
                            <button
                              onClick={() => deleteNotification(notif.id)}
                              disabled={isPending}
                              aria-label={`Delete notification: ${notif.title}`}
                              className="tap md:min-h-0 md:min-w-0 inline-flex items-center justify-center rounded-lg border border-red-200 dark:border-red-800 px-3 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed md:border-0 md:px-0"
                            >
                              {isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Notifications;
