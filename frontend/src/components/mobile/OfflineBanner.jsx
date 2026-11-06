import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, Settings2 } from 'lucide-react';
import { getApiBaseUrl, isNativePlatform, pingApi } from '../../utils/api';
import { onAppResume, onNetworkChange } from '../../services/native';
import { ApiSettingsSheet } from './ApiSettings';

const POLL_MS = 25000;

/**
 * A system-style strip that appears only when the backend cannot be reached.
 *
 * The distinction it makes matters: "no network interface" and "network fine,
 * server down" are different problems with different fixes, and a silent empty
 * screen is how a demo dies in front of an audience. Probing /healthz covers
 * both, because a reachable server returns JSON and an unreachable one throws.
 */
const OfflineBanner = () => {
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const [detail, setDetail] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mounted = useRef(true);
  const firstCheckDone = useRef(false);

  const check = useCallback(async ({ showSpinner = false } = {}) => {
    if (showSpinner) setChecking(true);
    const result = await pingApi();
    if (!mounted.current) return;
    // One failure right after a cold start is usually the radio waking up; only
    // trust it once a check has actually completed.
    setOffline(!result.ok);
    setDetail(result.ok ? '' : result.error || 'Network unreachable');
    setChecking(false);
    firstCheckDone.current = true;
  }, []);

  useEffect(() => {
    mounted.current = true;

    // Give the first paint a moment before adding a network request.
    const initial = window.setTimeout(() => check(), 1200);
    const interval = window.setInterval(() => check(), POLL_MS);

    const unsubscribeNetwork = onNetworkChange(({ connected }) => {
      if (!connected) {
        setOffline(true);
        setDetail('No network');
      } else {
        check();
      }
    });
    const unsubscribeResume = onAppResume(() => check());

    return () => {
      mounted.current = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
      Promise.resolve(unsubscribeNetwork).then((fn) => fn && fn());
      Promise.resolve(unsubscribeResume).then((fn) => fn && fn());
    };
  }, [check]);

  if (!offline) return null;

  return (
    <>
      <div
        role="alert"
        className="pt-safe bg-red-600 text-white text-sm shadow-md"
      >
        <div className="px-3 py-2 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">
              {isNativePlatform() ? 'Cannot reach the server' : 'Backend unreachable'}
            </p>
            <p className="text-[11px] leading-tight opacity-90 truncate font-mono">
              {getApiBaseUrl()} · {detail}
            </p>
          </div>
          <button
            type="button"
            onClick={() => check({ showSpinner: true })}
            className="tap flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 px-2 transition-colors"
            aria-label="Retry the connection"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="tap flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 px-2 transition-colors"
            aria-label="Change the server address"
          >
            <Settings2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <ApiSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
};

export default OfflineBanner;
