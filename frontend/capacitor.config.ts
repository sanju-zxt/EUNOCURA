import type { CapacitorConfig } from '@capacitor/cli';

/**
 * EUNOCURA native shell.
 *
 * Why a webview shell instead of a React Native rewrite: every screen already
 * talks to the same REST API, and the whole point of the completion pass was
 * that nothing is faked. Rebuilding the UI would put that at risk for zero gain.
 *
 * `webDir` is Vite's `dist`. The Android project is committed so a build is
 * reproducible without regenerating it.
 */
const config: CapacitorConfig = {
  appId: 'dev.eunocura.app',
  appName: 'EUNOCURA',
  webDir: 'dist',
  android: {
    // The ANDROID side of mixed content. Note `server.androidScheme` below does
    // the real work — see the comment there.
    allowMixedContent: true,
    // Keeps the app from reloading the bundle when the keyboard opens.
    captureInput: true,
    // Remote debugging stays on so `chrome://inspect` can measure a layout that
    // is failing on a real screen. This is an internal demo build (it also talks
    // HTTP), so the trade-off is documented in README §12 — set this to false
    // before any public release.
    webContentsDebuggingEnabled: true,
  },
  server: {
    // `http`, not `https`. The bundle is served from a synthetic origin inside
    // the webview, and the API is plain HTTP (an emulator host or a LAN laptop).
    // With the default `https` origin every single request was refused as mixed
    // content *before it left the phone*: the app saw "Failed to fetch" while
    // /healthz was green in a browser. `allowMixedContent` alone does not cover
    // fetch(), so the origin itself has to match the wire protocol.
    // `http://localhost` is still a secure context per the spec, so localStorage,
    // the mic (getUserMedia) and the camera all keep working.
    // Switch this back to 'https' once the API is served over TLS.
    androidScheme: 'http',
    // cleartext: the backend is served over plain HTTP during development and
    // on the demo laptop. Documented in README §12; not for a public deploy.
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: false,
      backgroundColor: '#0ea5e9',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0ea5e9',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'native',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
