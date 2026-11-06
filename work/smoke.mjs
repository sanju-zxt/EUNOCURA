// Functional smoke test for the EUNOCURA Android app.
//
// The layout audit proves screens *fit*. This proves they *work*: it drives the
// real controls in the real webview (bottom tab bar, the "More" sheet, the API
// settings sheet, dark mode, a real login through the form) and asserts what
// happened. Everything runs against the packaged bundle on the emulator.
//
// Usage: node work/smoke.mjs [width] [height]

import { connect, goto } from './cdp.mjs';

const WIDTH = Number(process.argv[2] || 360);
const HEIGHT = Number(process.argv[3] || 800);

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const c = await connect();
await c.send('Runtime.enable');
const consoleErrors = [];
c.on((m) => {
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] || 'exception');
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 160));
  }
});

await c.send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 2,
  mobile: true,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click the first element matching a selector, reporting whether it existed. */
async function click(selector, { wait = 700 } = {}) {
  const clicked = await c.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  })()`);
  if (clicked && wait) await sleep(wait);
  return clicked;
}

// The packaged app defaults to the deployed API. Pointing a run at this machine
// instead (emulator loopback 10.0.2.2, or `adb reverse` + 127.0.0.1) is what the
// Settings sheet does by hand, so set the same localStorage key here.
// Usage: $env:EUNOCURA_API_BASE = 'http://10.0.2.2:8000'; node work/smoke.mjs
const API_BASE_OVERRIDE = process.env.EUNOCURA_API_BASE || '';

const hash = () => c.evaluate('location.hash');
const text = () => c.evaluate('document.body.innerText.replace(/\\s+/g, " ").trim()');

/** Poll a JS predicate instead of sleeping a guessed number of milliseconds. */
async function waitFor(expression, { timeout = 8000, interval = 150 } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await c.evaluate(expression);
    if (last) return last;
    await sleep(interval);
  }
  return last;
}

if (API_BASE_OVERRIDE) {
  await c.evaluate(
    `localStorage.setItem('eunocura.api_base', ${JSON.stringify(API_BASE_OVERRIDE)})`
  );
}

// ---- 1. login through the real form ----------------------------------------
await c.evaluate("localStorage.removeItem('access_token')");
await c.evaluate('location.hash = "#/login"; location.reload()');
// A cold start on the emulator re-parses the bundle and re-fetches the lazy
// route chunk; a fixed sleep either races it or wastes time. Wait for the form.
await waitFor('!!document.querySelector("form input")', { timeout: 20000 });
const effectiveBase = await c.evaluate(`(() => {
  try { return localStorage.getItem('eunocura.api_base') || '(build default)'; } catch { return '(no storage)'; }
})()`);
record('API base in use', true, effectiveBase);

const filled = await c.evaluate(`(() => {
  const set = (el, value) => {
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  const inputs = document.querySelectorAll('form input');
  return set(inputs[0], 'demo.patient@eunocura.dev') && set(inputs[1], 'Demo@2026');
})()`);
record('login form accepts input', filled);

await click('form button[type="submit"]', { wait: 0 });
await waitFor('location.hash.startsWith("#/patient")', { timeout: 20000 });
await sleep(400);
const landedHash = await hash();
const landedNorm = (landedHash || '').replace(/^#/, '');
record('login submits and lands in the portal', landedNorm.startsWith('/patient'), landedHash);
if (!landedNorm.startsWith('/patient')) {
  console.log('       body:', (await text()).slice(0, 200));
}

// ---- 2. bottom navigation ---------------------------------------------------
const tabs = await c.evaluate(`Array.from(document.querySelectorAll('nav[aria-label="Primary"] a')).map((a) => ({
  label: (a.textContent || '').trim(), to: a.getAttribute('href')
}))`);
record('bottom nav renders 4 primary tabs', tabs.length === 4, tabs.map((t) => t.label).join(' / ') || 'none found');

let navOk = tabs.length > 0;
const navDetail = [];
for (const tab of tabs) {
  const to = (tab.to || '').replace(/^#/, '');
  await click(`nav[aria-label="Primary"] a[href="${tab.to}"]`, { wait: 0 });
  // Wait for the route AND the tab bar together: the bar is the thing being
  // asserted, so a check that samples mid-navigation proves nothing.
  await waitFor(
    `location.hash.replace(/^#/, '').startsWith(${JSON.stringify(to)}) && !!document.querySelector('nav[aria-label="Primary"]')`,
    { timeout: 12000 }
  );
  const now = (await hash()).replace(/^#/, '');
  const landed = now.startsWith(to) || to.startsWith(now) || now === to || (to === '/patient' && now === '/patient');
  const hasChrome = await c.evaluate("!!document.querySelector('nav[aria-label=Primary]')");
  if (!landed || !hasChrome) {
    navOk = false;
    navDetail.push(`${tab.label}->${now}${hasChrome ? '' : ' (no tab bar)'}`);
  }
}
record('every bottom tab navigates and keeps the tab bar', navOk, navDetail.join(', ') || 'all 4');

// ---- 3. "More" sheet --------------------------------------------------------
const moreOpened = await c.evaluate(`(() => {
  const nav = document.querySelector('nav[aria-label="Primary"]');
  const more = nav && nav.querySelector('button');
  if (!more) return false;
  more.click();
  return true;
})()`);
await sleep(700);
const sheetVisible = await c.evaluate(`(() => {
  const dialog = document.querySelector('[role="dialog"], .fixed.inset-0');
  if (!dialog) return null;
  const r = dialog.getBoundingClientRect();
  return { h: Math.round(r.height), w: Math.round(r.width), text: (dialog.innerText || '').slice(0, 60) };
})()`);
record('"More" opens a sheet', Boolean(moreOpened && sheetVisible), JSON.stringify(sheetVisible));

// Pick a link inside the sheet if there is one (Care Plan / Assistant / Alerts).
const sheetLink = await c.evaluate(`(() => {
  const dialog = document.querySelector('[role="dialog"], .fixed.inset-0');
  if (!dialog) return null;
  const link = dialog.querySelector('a[href]');
  if (!link) return null;
  const href = link.getAttribute('href');
  link.click();
  return href;
})()`);
await sleep(1200);
if (sheetLink) {
  const target = sheetLink.replace(/^#/, '');
  const now = (await hash()).replace(/^#/, '');
  record('sheet destinations actually route', now.startsWith(target), `${target} -> ${now}`);
  await c.evaluate('history.back()');
  await sleep(900);
}

// ---- 4. dark mode ----------------------------------------------------------
await goto(c, '#/patient', 0);
await waitFor('!!document.querySelector(\'button[aria-label="Toggle dark mode"]\')', { timeout: 15000 });
await sleep(300);
const before = await c.evaluate('document.documentElement.classList.contains("dark")');
const toggled = await click('button[aria-label="Toggle dark mode"], button[aria-pressed]', { wait: 800 });
const after = await c.evaluate('document.documentElement.classList.contains("dark")');
record('dark-mode toggle flips the theme', toggled && before !== after, `clicked=${toggled} ${before} -> ${after}`);
await click('button[aria-label="Toggle dark mode"]', { wait: 500 });

// ---- 5. chat composer + API settings sheet ---------------------------------
await goto(c, '#/patient/chatbot', 1400);
// The composer may open in either mode, so aim for the text field and fall back
// to pressing the mode toggle once instead of assuming a starting state.
const composerToggle = await c.evaluate(`(() => {
  if (document.querySelector('.h-chat textarea')) return 'already-text';
  const btn = Array.from(document.querySelectorAll('.h-chat button')).find((b) => /switch to text/i.test(b.title || ''));
  if (!btn) return 'no-toggle';
  btn.click();
  return 'toggled';
})()`);
await sleep(600);
const composer = await c.evaluate(`(() => {
  const input = document.querySelector('.h-chat textarea, .h-chat input[type="text"]');
  if (!input) return { found: false };
  const r = input.getBoundingClientRect();
  const vh = window.innerHeight;
  return { found: true, bottom: Math.round(r.bottom), vh, visible: r.bottom <= vh && r.top >= 0, font: getComputedStyle(input).fontSize };
})()`);
record(
  'chat composer sits inside the viewport',
  composerToggle !== 'no-toggle' && composer.found && composer.visible,
  `mode=${composerToggle} bottom=${composer.bottom} of ${composer.vh}, font=${composer.font}`
);

const bubble = await c.evaluate(`(() => {
  const scroller = document.querySelector('.h-chat .overflow-y-auto');
  return scroller ? { scroll: scroller.clientHeight, content: scroller.scrollHeight } : null;
})()`);
record('chat message list is its own scroller', Boolean(bubble && bubble.scroll > 120), JSON.stringify(bubble));

// Composer must actually send: type, press send, assert a user bubble appears
// and the field is cleared. This is the one interaction a chat screen exists for.
const sendTest = await c.evaluate(`(() => {
  const ta = document.querySelector('.h-chat textarea');
  if (!ta) return { ok: false, why: 'no textarea' };
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  set.call(ta, 'hello');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return { ok: true };
})()`);
await sleep(400);
const sendClicked = await c.evaluate(`(() => {
  const btn = document.querySelector('.h-chat button[aria-label="Send message"]');
  if (!btn) return { found: false };
  btn.click();
  return { found: true, disabled: btn.disabled };
})()`);
await sleep(1500);
const sendResult = await c.evaluate(`(() => {
  const ta = document.querySelector('.h-chat textarea');
  const scroller = document.querySelector('.h-chat .overflow-y-auto');
  return {
    cleared: ta ? ta.value === '' : null,
    bubbles: scroller ? scroller.querySelectorAll('.rounded-2xl').length : 0,
  };
})()`);
record(
  'chat composer sends a message',
  sendTest.ok && Boolean(sendClicked.found) && !sendClicked.disabled && sendResult.cleared === true && sendResult.bubbles > 0,
  JSON.stringify({ sendTest, sendClicked, sendResult })
);

await goto(c, '#/patient', 1200);
const apiSheet = await click('button[aria-label*="server" i], button[title*="server" i]', { wait: 900 });
const apiSheetText = await c.evaluate('document.body.innerText.includes("Server address") || document.body.innerText.includes("server address")');
record('API settings sheet opens from the header', Boolean(apiSheet && apiSheetText), apiSheet ? '' : 'button not found');

// ---- 6. keyboard-style resize ----------------------------------------------
await c.send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: Math.round(HEIGHT * 0.62),
  deviceScaleFactor: 2,
  mobile: true,
});
await sleep(600);
const navStillThere = await c.evaluate(`(() => {
  const nav = document.querySelector('nav[aria-label="Primary"]');
  if (!nav) return null;
  const r = nav.getBoundingClientRect();
  return { bottom: Math.round(r.bottom), vh: window.innerHeight, visible: r.bottom <= window.innerHeight + 1 && r.top >= 0 };
})()`);
record('tab bar stays on screen when the keyboard shrinks the view', Boolean(navStillThere && navStillThere.visible), JSON.stringify(navStillThere));

await c.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
record('no console errors during the run', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed at ${WIDTH}x${HEIGHT}`);
const fs = await import('node:fs');
fs.writeFileSync('work/mobile-smoke.json', JSON.stringify({ viewport: `${WIDTH}x${HEIGHT}`, results }, null, 2));
c.close();
process.exit(failed.length ? 1 : 0);
