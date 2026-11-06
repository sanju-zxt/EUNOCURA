import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RotateCw, Server, Wifi, WifiOff } from 'lucide-react';
import MobileSheet from './MobileSheet';
import {
  getApiBaseUrl,
  getApiBaseUrlOverride,
  getDefaultApiBaseUrl,
  isNativePlatform,
  pingApi,
  setApiBaseUrl,
} from '../../utils/api';
import { hapticSuccess, showToast } from '../../services/native';

const stateStyles = {
  idle: { icon: Server, tone: 'text-gray-500 dark:text-gray-400' },
  checking: { icon: Loader2, tone: 'text-primary-600 dark:text-primary-400' },
  ok: { icon: CheckCircle2, tone: 'text-green-600 dark:text-green-400' },
  fail: { icon: AlertCircle, tone: 'text-red-600 dark:text-red-400' },
};

/**
 * Where the app looks for its backend.
 *
 * This exists because `localhost` means three different machines depending on
 * where the bundle runs: the laptop in a browser, the laptop from the emulator
 * (10.0.2.2), and the phone itself once `adb reverse` is in play. Nothing can
 * guess that, so the value is user-editable, persisted, and testable before it
 * is saved.
 */
export const ApiSettingsSheet = ({ open, onClose }) => {
  const current = getApiBaseUrl();
  const [value, setValue] = useState(getApiBaseUrlOverride() || current);
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const [saved, setSaved] = useState(false);

  // Re-seed each time it opens: the base may have changed elsewhere.
  useEffect(() => {
    if (!open) return;
    setValue(getApiBaseUrlOverride() || getApiBaseUrl());
    setStatus({ state: 'idle', message: '' });
    setSaved(false);
  }, [open]);

  const probe = async (target) => {
    setStatus({ state: 'checking', message: 'Contacting the server…' });
    const result = await pingApi(target);
    if (result.ok) {
      setStatus({
        state: 'ok',
        message: `Reachable in ${result.ms} ms · status "${result.body?.status || 'ok'}"`,
      });
    } else {
      setStatus({
        state: 'fail',
        message: result.error === 'Network unreachable'
          ? 'No response. Check the address, the cable/wifi and that the backend is running.'
          : `Server answered ${result.error}. The address resolves, but /healthz is not healthy.`,
      });
    }
    return result.ok;
  };

  const save = () => {
    const applied = setApiBaseUrl(value);
    setSaved(true);
    hapticSuccess();
    showToast(`Using ${applied}`);
    // A reload is the honest reset: every mounted screen may be holding a
    // failure from the old address, and re-fetching them all is what a restart
    // would do anyway.
    window.setTimeout(() => window.location.reload(), 350);
  };

  const reset = () => {
    setApiBaseUrl('');
    setValue(getDefaultApiBaseUrl());
    setStatus({ state: 'idle', message: '' });
  };

  const Icon = stateStyles[status.state].icon;

  return (
    <MobileSheet
      open={open}
      onClose={onClose}
      title="Server address"
      description="The app talks to the EUNOCURA backend. Point it at whichever machine runs it."
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => probe(value)}
            className="tap flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-3 text-sm font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <RotateCw className="w-4 h-4" aria-hidden="true" />
            Test
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saved}
            className="tap flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-60 px-4 py-3 text-sm font-semibold text-white transition-colors"
          >
            Save &amp; reload
          </button>
        </div>
      }
    >
      <label
        htmlFor="api-base-input"
        className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
      >
        Base URL
      </label>
      <input
        id="api-base-input"
        type="url"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck="false"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="http://192.168.1.20:8000"
        className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-3 font-mono text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />

      <div className={`mt-3 flex items-start gap-2 text-sm ${stateStyles[status.state].tone}`} role="status" aria-live="polite">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${status.state === 'checking' ? 'animate-spin' : ''}`} aria-hidden="true" />
        <span className="min-w-0 break-words">
          {status.state === 'idle' ? 'Not tested yet.' : status.message}
        </span>
      </div>

      <dl className="mt-4 space-y-2 rounded-xl bg-gray-50 dark:bg-gray-900/60 p-3 text-xs">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-gray-500 dark:text-gray-400">In use now</dt>
          <dd className="font-mono text-gray-800 dark:text-gray-200 break-all text-right">{current}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-gray-500 dark:text-gray-400">Default for this build</dt>
          <dd className="font-mono text-gray-800 dark:text-gray-200 break-all text-right">{getDefaultApiBaseUrl()}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-gray-500 dark:text-gray-400">Running as</dt>
          <dd className="text-gray-800 dark:text-gray-200 text-right">
            {isNativePlatform() ? 'Android app' : 'Web browser'}
          </dd>
        </div>
      </dl>

      <div className="mt-4 rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 p-3 text-xs text-blue-900 dark:text-blue-200">
        <p className="font-semibold">Which address should this be?</p>
        <ul className="mt-1.5 space-y-1 list-disc pl-4">
          <li><span className="font-mono">http://10.0.2.2:8000</span> — Android emulator, backend on this PC.</li>
          <li><span className="font-mono">http://127.0.0.1:8000</span> — phone on USB with <span className="font-mono">adb reverse tcp:8000 tcp:8000</span>.</li>
          <li><span className="font-mono">http://&lt;laptop-ip&gt;:8000</span> — phone and laptop on the same wifi.</li>
        </ul>
      </div>

      <button
        type="button"
        onClick={reset}
        className="tap mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        Reset to the build default
      </button>
    </MobileSheet>
  );
};

/**
 * Header button that opens the sheet. Lives next to the theme toggle so the
 * setting is reachable even when the network is fine.
 */
export const ApiSettingsButton = ({ className = '' }) => {
  const [open, setOpen] = useState(false);
  const [reachable, setReachable] = useState(null);

  useEffect(() => {
    let cancelled = false;
    pingApi().then((result) => {
      if (!cancelled) setReachable(result.ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          'tap flex items-center justify-center rounded-lg transition-colors',
          'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600',
          className,
        ].join(' ')}
        aria-label="Server address and connection"
        title={reachable === false ? 'Server unreachable' : 'Server settings'}
      >
        {reachable === false ? (
          <WifiOff className="w-5 h-5 text-red-600 dark:text-red-400" aria-hidden="true" />
        ) : (
          <Wifi
            className={`w-5 h-5 ${reachable ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-200'}`}
            aria-hidden="true"
          />
        )}
      </button>
      <ApiSettingsSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
};

export default ApiSettingsButton;
