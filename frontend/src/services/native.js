/**
 * Native bridge.
 *
 * Every call here is a no-op in a browser, so `npm run dev` and the web deploy
 * keep working with zero conditionals at the call site. Plugins are imported
 * dynamically: that keeps the Capacitor bridge out of the entry chunk on the
 * web, and means a missing plugin degrades to "nothing happened" instead of a
 * white screen.
 */
import { isNativePlatform } from '../utils/api';

export const isNative = () => isNativePlatform();

/** Small wrapper so a plugin that is absent on this platform cannot throw. */
const safe = async (loader, fn) => {
  if (!isNative()) return null;
  try {
    const mod = await loader();
    return await fn(mod);
  } catch (error) {
    // A plugin failure is never worth crashing a screen over.
    if (import.meta.env.DEV) {
      console.warn('[native] call failed', error);
    }
    return null;
  }
};

const loadStatusBar = () => import('@capacitor/status-bar');
const loadSplash = () => import('@capacitor/splash-screen');
const loadKeyboard = () => import('@capacitor/keyboard');
const loadApp = () => import('@capacitor/app');
const loadShare = () => import('@capacitor/share');
const loadFilesystem = () => import('@capacitor/filesystem');
const loadHaptics = () => import('@capacitor/haptics');
const loadToast = () => import('@capacitor/toast');
const loadNetwork = () => import('@capacitor/network');

/**
 * Paint the system bars to match the app theme.
 * Colour literals mirror the brand: sky-600 in light mode, slate-900 in dark.
 */
export const setStatusBarTheme = (isDark) =>
  safe(loadStatusBar, ({ StatusBar, Style }) =>
    Promise.all([
      StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }),
      StatusBar.setBackgroundColor({ color: isDark ? '#0f172a' : '#0284c7' }),
    ])
  );

/** Hide the launch plate once the first React paint has happened. */
export const hideSplash = () =>
  safe(loadSplash, ({ SplashScreen }) => SplashScreen.hide());

export const showSplash = () =>
  safe(loadSplash, ({ SplashScreen }) => SplashScreen.show());

/** Thin, dark keyboard that resizes the webview instead of covering the input. */
export const configureKeyboard = () =>
  safe(loadKeyboard, ({ Keyboard, KeyboardResize, KeyboardStyle }) =>
    Promise.all([
      Keyboard.setResizeMode({ mode: KeyboardResize.Native }),
      Keyboard.setStyle({ style: KeyboardStyle.Dark }),
    ])
  );

export const hideKeyboard = () => safe(loadKeyboard, ({ Keyboard }) => Keyboard.hide());

/**
 * Hardware/gesture back button.
 *
 * The handler returns `true` when the app consumed the press, which tells us to
 * keep the webview alive; `false` means "nothing was open", so Android gets the
 * press back and the app minimises like a normal app.
 */
export const onBackButton = async (handler) => {
  if (!isNative()) return () => {};
  try {
    const { App } = await loadApp();
    const listener = await App.addListener('backButton', ({ canGoBack }) => {
      const consumed = handler({ canGoBack });
      if (!consumed) {
        // No history and no open overlay: leave the app rather than trapping
        // the user on a dead screen.
        App.exitApp().catch(() => {});
      }
    });
    return () => {
      try {
        listener.remove();
      } catch {
        /* already gone */
      }
    };
  } catch {
    return () => {};
  }
};

/** Fires when the app returns to the foreground — used to re-probe the API. */
export const onAppResume = async (handler) => {
  if (!isNative()) return () => {};
  try {
    const { App } = await loadApp();
    const listener = await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) handler();
    });
    return () => {
      try {
        listener.remove();
      } catch {
        /* already gone */
      }
    };
  } catch {
    return () => {};
  }
};

export const hapticTap = () =>
  safe(loadHaptics, ({ Haptics, ImpactStyle }) =>
    Haptics.impact({ style: ImpactStyle.Light })
  );

export const hapticSuccess = () =>
  safe(loadHaptics, ({ Haptics, NotificationType }) =>
    Haptics.notification({ type: NotificationType.Success })
  );

export const showToast = (text) =>
  safe(loadToast, ({ Toast }) => Toast.show({ text, duration: 'short' }));

/**
 * Hand a file to another app.
 *
 * The API hands out absolute URLs; Android cannot share a remote URL as a file,
 * so the bytes are streamed into the cache directory first. If anything fails we
 * fall back to sharing the URL itself, which at least opens a browser.
 */
export const shareUrl = async ({ title, text, url }) => {
  const shared = await safe(loadShare, ({ Share }) =>
    Share.share({ title, text, url, dialogTitle: title || 'Share' })
  );
  if (shared) return shared;

  // Web fallback: the Web Share API where it exists, otherwise copy to clipboard.
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      return await navigator.share({ title, text, url });
    } catch {
      return null;
    }
  }
  try {
    await navigator.clipboard.writeText(url || text || '');
    return { copied: true };
  } catch {
    return null;
  }
};

/**
 * Write a base64 payload into the app cache and share it as a real file.
 * Used by the PDF export and the lab-result download.
 */
export const shareBase64File = async ({ fileName, base64, mimeType = 'application/pdf' }) => {
  const native = await safe(loadFilesystem, async ({ Filesystem, Directory }) => {
    const result = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    return result.uri;
  });

  if (!native) return false;

  await safe(loadShare, ({ Share }) =>
    Share.share({ title: fileName, url: native, dialogTitle: `Share ${fileName}` })
  );
  return true;
};

/** True = the device has a working network interface (not that the API is up). */
export const getNetworkStatus = async () => {
  if (!isNative()) {
    return { connected: typeof navigator === 'undefined' ? true : navigator.onLine };
  }
  const status = await safe(loadNetwork, ({ Network }) => Network.getStatus());
  return { connected: status ? status.connected : true };
};

export const onNetworkChange = async (handler) => {
  if (!isNative()) {
    if (typeof window === 'undefined') return () => {};
    const onOnline = () => handler({ connected: true });
    const onOffline = () => handler({ connected: false });
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }
  try {
    const { Network } = await loadNetwork();
    const listener = await Network.addListener('networkStatusChange', (status) =>
      handler({ connected: status.connected })
    );
    return () => {
      try {
        listener.remove();
      } catch {
        /* already gone */
      }
    };
  } catch {
    return () => {};
  }
};

/** Boot the shell: bars, keyboard, splash. Safe to call more than once. */
let booted = false;
export const initNativeShell = async () => {
  if (!isNative() || booted) return;
  booted = true;
  await configureKeyboard();
  await setStatusBarTheme(document.documentElement.classList.contains('dark'));
  // Let the first paint settle so the user never sees a blank white flash.
  window.setTimeout(() => hideSplash(), 80);
};
