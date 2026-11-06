// Walk every screen in the packaged Android app and capture a real device frame.
//
// A CDP screenshot only shows the webview; `adb exec-out screencap` shows what the
// user actually sees, including the status bar and the native chrome. This drives
// the router, waits for content, then shells out for the frame.
//
// Usage: node work/screens.mjs [--base http://10.0.2.2:8000]

import { connect, goto } from './cdp.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ADB = process.env.ADB || 'C:/Users/Sanju/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const OUT = 'work/mobile-shots';
const BASE_ARG = process.argv.indexOf('--base');
const API_BASE = BASE_ARG > -1 ? process.argv[BASE_ARG + 1] : '';

fs.mkdirSync(OUT, { recursive: true });

const c = await connect();
await c.send('Runtime.enable');
await c.send('Page.enable');

const WIDTH = 360;
const HEIGHT = 800;
await c.send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 2,
  mobile: true,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(expression, { timeout = 12000, interval = 150 } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await c.evaluate(expression);
    if (last) return last;
    await sleep(interval);
  }
  return last;
}

function shot(name) {
  const file = path.join(OUT, `${name}.png`);
  const buf = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(file, buf);
  return `${file} (${(buf.length / 1024).toFixed(0)} KB)`;
}

/** True once the route has rendered real content and no spinner is showing. */
const SETTLED = `(() => {
  const spinners = document.querySelectorAll('[role="status"], .animate-spin');
  const main = document.querySelector('main') || document.body;
  return spinners.length === 0 && (main.innerText || '').trim().length > 40;
})()`;

async function visit(name, hashPath, { settle = 1200 } = {}) {
  await goto(c, hashPath, 400);
  const ok = await waitFor(SETTLED, { timeout: 15000 });
  await sleep(settle);
  const text = await c.evaluate(
    "((document.querySelector('main')||document.body).innerText||'').replace(/\\s+/g,' ').trim().slice(0,110)"
  );
  const overflow = await c.evaluate(`(() => {
    const d = document.documentElement;
    return { scrollW: d.scrollWidth, clientW: d.clientWidth };
  })()`);
  const file = shot(name);
  console.log(`${ok ? ' ok ' : 'WAIT'} ${name.padEnd(28)} ${hashPath}`);
  console.log(`      ${file}`);
  console.log(`      text: ${text}`);
  console.log(`      h-overflow: ${overflow.scrollW > overflow.clientW ? 'YES ' + overflow.scrollW + '>' + overflow.clientW : 'none'}`);
}

async function setInputs(email, password) {
  return c.evaluate(`(() => {
    const set = (el, value) => {
      if (!el) return false;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    };
    const inputs = document.querySelectorAll('form input');
    return set(inputs[0], ${JSON.stringify(email)}) && set(inputs[1], ${JSON.stringify(password)});
  })()`);
}

async function login(email, password) {
  await c.evaluate("localStorage.removeItem('access_token')");
  await c.evaluate('location.hash = "#/login"; location.reload()');
  const form = await waitFor('!!document.querySelector("form input")', { timeout: 25000 });
  if (!form) throw new Error('login form never appeared');
  const filled = await setInputs(email, password);
  if (!filled) throw new Error('could not fill the login form');
  await c.evaluate('document.querySelector(\'form button[type="submit"]\').click()');
  const landed = await waitFor(
    'location.hash.startsWith("#/patient") || location.hash.startsWith("#/doctor")',
    { timeout: 25000 }
  );
  if (!landed) {
    throw new Error('login did not land: ' + (await c.evaluate('document.body.innerText.slice(0,200)')));
  }
  await sleep(1200);
  return c.evaluate('location.hash');
}

async function logout() {
  await c.evaluate("localStorage.removeItem('access_token')");
}

// ---------------------------------------------------------------- setup -----
if (API_BASE) {
  await c.evaluate(`localStorage.setItem('eunocura.api_base', ${JSON.stringify(API_BASE)})`);
}
const effective = await c.evaluate(
  "localStorage.getItem('eunocura.api_base') || '(build default)'"
);
console.log(`API base: ${effective}\n`);

// ------------------------------------------------------- auth + landing -----
await c.evaluate("localStorage.removeItem('access_token')");
await visit('10-landing', '#/', { settle: 1500 });
await visit('11-login', '#/login');
await visit('12-signup-patient', '#/signup/patient');
await visit('13-signup-doctor', '#/signup/doctor');
await visit('14-not-found', '#/this-route-does-not-exist');

// -------------------------------------------------------------- patient -----
console.log(`\npatient login -> ${await login('demo.patient@eunocura.dev', 'Demo@2026')}\n`);
await visit('20-patient-dashboard', '#/patient', { settle: 2000 });
await visit('21-appointments', '#/patient/appointments');
await visit('22-book-appointment', '#/patient/book-appointment');
await visit('23-medications', '#/patient/medications');
await visit('24-diet', '#/patient/diet');
await visit('25-notifications', '#/patient/notifications');
await visit('26-chatbot', '#/patient/chatbot', { settle: 1800 });

// --------------------------------------------------------------- doctor -----
await logout();
console.log(`\ndoctor login -> ${await login('demo.doctor@eunocura.dev', 'Demo@2026')}\n`);
await visit('30-doctor-dashboard', '#/doctor', { settle: 2200 });
await visit('31-doctor-patients', '#/doctor/patients');

// The active session needs a real appointment id, and the dashboard only offers it
// as a labelled START SESSION|CONTINUE SESSION button (an explicit action by design). Press the real
// control rather than inventing an id, so the screenshot is reachable state.
await goto(c, '#/doctor', 600);
await waitFor('!!document.body.innerText.match(/START SESSION|CONTINUE SESSION/i)', { timeout: 15000 });
// Prefer the demo patient's card: the other row belongs to whoever last signed up
// through the form, and its free-text complaint is not ours to publish.
const started = await c.evaluate(`(() => {
  const buttons = Array.from(document.querySelectorAll('button')).filter((b) =>
    /START SESSION|CONTINUE SESSION/i.test(b.textContent || '')
  );
  // The row is the nearest card container; do not test an ancestor above it, or the
  // whole page matches every name at once.
  const cardOf = (b) => {
    let node = b;
    while (node && node !== document.body) {
      if (/\\bbg-white\\b/.test(String(node.className || ''))) return node;
      node = node.parentElement;
    }
    return null;
  };
  const preferred =
    buttons.find((b) => {
      const card = cardOf(b);
      return card && /Asha Rao/i.test(card.textContent || '');
    }) || buttons[0];
  if (!preferred) return null;
  preferred.click();
  return preferred.textContent.trim();
})()`);
const inSession = await waitFor('location.hash.includes("/doctor/session/")', { timeout: 15000 });
if (inSession) {
  await visit('32-doctor-session', await c.evaluate('location.hash'));

  // The active session swaps its panes for tabs on a phone (unit 23). Capture each
  // tab by pressing the real control, so the shot proves the tab actually switches.
  const tabLabels = await c.evaluate(
    `Array.from(document.querySelectorAll('[role="tab"]')).map((t) => (t.textContent || '').trim())`
  );
  for (const label of tabLabels || []) {
    await c.evaluate(`(() => {
      const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((t) => (t.textContent || '').trim() === ${JSON.stringify(label)});
      if (tab) tab.click();
    })()`);
    await sleep(900);
    const selected = await c.evaluate(
      `(() => { const t = Array.from(document.querySelectorAll('[role="tab"]')).find((x) => (x.textContent || '').trim() === ${JSON.stringify(label)}); return t ? t.getAttribute('aria-selected') : null; })()`
    );
    const name = `33-session-tab-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    console.log(`${selected === 'true' ? ' ok ' : 'WAIT'} ${name.padEnd(28)} selected=${selected}`);
    console.log(`      ${shot(name)}`);
  }
  if (!tabLabels || !tabLabels.length) console.log('      (no role=tab controls found)');
} else {
  console.log(`skip 32-doctor-session           press=${started} hash=${await c.evaluate('location.hash')}`);
}

await c.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.png'));
console.log(`\n${files.length} screenshots in ${OUT}`);
c.close();
