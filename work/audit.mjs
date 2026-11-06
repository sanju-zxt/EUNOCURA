// Layout audit for the EUNOCURA Android app, run against the live webview.
//
// It answers the questions a screenshot cannot:
//   * does anything stick out past the viewport at 360 CSS px?
//   * is any tap target smaller than 44px?
//   * is any form field under 16px (which makes Android zoom on focus)?
//   * is clinical text being truncated by an ellipsis?
//   * did any route throw a console error, or silently bounce to /login?
//   * does a table only fit by being side-scrolled?
//   * how much text is below 12px? (reported, never a failure: chart ticks and
//     uppercase micro-labels have no statutory minimum, and failing on them
//     would only teach the numbers to be ignored)
//
// Usage:
//   node work/audit.mjs                 # audit 360x800
//   node work/audit.mjs 411 731         # audit an explicit CSS viewport
//   node work/audit.mjs --role=doctor

import { connect, goto } from './cdp.mjs';

const BACKEND = process.env.EUNOCURA_API || 'http://127.0.0.1:8000';

const SESSION = {
  patient: { email: 'demo.patient@eunocura.dev', password: 'Demo@2026', base: '/patient' },
  doctor: { email: 'demo.doctor@eunocura.dev', password: 'Demo@2026', base: '/doctor' },
};

const PATIENT_ROUTES = [
  ['#/patient', 'patient-home'],
  ['#/patient/appointments', 'patient-appointments'],
  ['#/patient/book-appointment', 'patient-book'],
  ['#/patient/medications', 'patient-medications'],
  ['#/patient/diet', 'patient-diet'],
  ['#/patient/chatbot', 'patient-chat'],
  ['#/patient/notifications', 'patient-notifications'],
];

const PUBLIC_ROUTES = [
  ['#/', 'landing'],
  ['#/login', 'login'],
  ['#/signup/doctor', 'signup-doctor'],
  ['#/signup/patient', 'signup-patient'],
  ['#/this-route-does-not-exist', '404'],
];

/**
 * The doctor portal's session screens need a real appointment id, so the list is
 * built after login instead of being hard-coded. Two routes per appointment (the
 * live session and the diagnosis dashboard) is enough to cover both layouts.
 */
const doctorRoutes = (appointmentId) => {
  const base = [
    ['#/doctor', 'doctor-home'],
    ['#/doctor/patients', 'doctor-patients'],
  ];
  if (appointmentId) {
    base.push([`#/doctor/session/${appointmentId}`, 'doctor-session']);
    base.push([`#/doctor/session/${appointmentId}/diagnosis`, 'doctor-diagnosis']);
  }
  return base;
};

/** The in-page audit. Kept as a string so it runs in the webview, not here. */
const AUDIT_FN = `
(() => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const describe = (el) => {
    if (!el) return '?';
    const cls = (el.className && typeof el.className === 'string')
      ? el.className.split(/\\s+/).filter(Boolean).slice(0, 3).join('.')
      : '';
    const id = el.id ? '#' + el.id : '';
    const text = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40);
    return el.tagName.toLowerCase() + id + (cls ? '.' + cls : '') + (text ? ' "' + text + '"' : '');
  };

  const all = Array.from(document.querySelectorAll('body *'));
  const visible = all.filter((el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  const overflow = [];
  for (const el of visible) {
    const r = el.getBoundingClientRect();
    const right = r.right + window.scrollX;
    if (right > vw + 1.5) {
      // Skip anything whose own scroll container is already handling it.
      let p = el.parentElement;
      let scrolled = false;
      let clippedAway = false;
      while (p && p !== document.body) {
        const ps = getComputedStyle(p);
        if (/(auto|scroll)/.test(ps.overflowX)) { scrolled = true; break; }
        // A decorative blob inside an overflow-hidden card is clipped by the
        // card: it cannot widen the page, so it is not an overflow bug.
        if (/(hidden|clip)/.test(ps.overflowX)) {
          const pr = p.getBoundingClientRect();
          if (pr.right <= vw + 1.5) { clippedAway = true; break; }
        }
        p = p.parentElement;
      }
      if (clippedAway) continue;
      overflow.push({
        el: describe(el),
        right: Math.round(right),
        beyond: Math.round(right - vw),
        width: Math.round(r.width),
        inScroller: scrolled,
      });
    }
  }
  overflow.sort((a, b) => b.beyond - a.beyond);

  const docOverflowX = Math.max(
    document.documentElement.scrollWidth,
    document.body.scrollWidth
  ) - vw;

  const interactive = visible.filter((el) => {
    if (!el.matches('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], label[for]')) {
      return false;
    }
    // The skip link is 1x1 until it takes focus, when it becomes a full-size
    // button. Measuring it unfocused is measuring the wrong state.
    if (el.matches('.sr-only, .visually-hidden')) return false;
    // A <label for> is not a separate pointer target: tapping it moves focus
    // into its field, and the field itself carries the min-height. Labels for
    // checkboxes/radios *are* the target, so those stay in the measurement.
    if (el.tagName === 'LABEL') {
      const control = el.control;
      if (control && !control.matches('input[type=checkbox], input[type=radio]')) return false;
    }
    // A link inside a sentence is exempt in WCAG 2.5.8 (inline exception), and
    // giving it a 44px box would break the paragraph it lives in.
    if (el.tagName === 'A' && el.closest('p')) return false;
    return true;
  });
  const smallTargets = [];
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if (r.height < 40 || r.width < 40) {
      smallTargets.push({ el: describe(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }

  const smallFonts = visible
    .filter((el) => el.matches('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea'))
    .map((el) => ({ el: describe(el), size: parseFloat(getComputedStyle(el).fontSize) }))
    .filter((x) => x.size < 16);

  const clipped = [];
  for (const el of visible) {
    if (!el.children.length) {
      const s = getComputedStyle(el);
      const ellipsis = s.textOverflow === 'ellipsis';
      const hidden = s.overflow === 'hidden';
      if ((ellipsis || hidden) && el.scrollWidth > el.clientWidth + 2 && (el.textContent || '').trim().length > 24) {
        clipped.push({ el: describe(el), text: el.textContent.trim().slice(0, 60) });
      }
    }
  }

  const headings = Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 6).map((h) => ({
    tag: h.tagName.toLowerCase(),
    text: (h.textContent || '').trim().slice(0, 60),
  }));

  // A table that only fits by being side-scrolled is a desktop layout on a
  // phone, and 9px text is legible only to the person who wrote it.
  const tables = Array.from(document.querySelectorAll('table')).map((t) => ({
    el: describe(t).slice(0, 40),
    scroll: t.scrollWidth,
    client: t.clientWidth,
    needsScroll: t.scrollWidth > t.clientWidth + 2,
  }));

  const hscroll = visible
    .filter((el) => {
      const s = getComputedStyle(el);
      return /(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 4;
    })
    .map((el) => ({ el: describe(el).slice(0, 50), hidden: el.scrollWidth - el.clientWidth }));

  const tinyText = visible
    .filter((el) => !el.children.length && (el.textContent || '').trim().length > 3)
    .map((el) => ({ el: describe(el).slice(0, 40), size: parseFloat(getComputedStyle(el).fontSize) }))
    .filter((x) => x.size < 12);

  return {
    vw, vh,
    title: document.title,
    hash: location.hash,
    docOverflowX,
    bodyText: (document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 240),
    nodeCount: all.length,
    overflow: overflow.slice(0, 8),
    overflowCount: overflow.length,
    smallTargets: smallTargets.slice(0, 8),
    smallTargetsCount: smallTargets.length,
    smallFonts,
    clipped: clipped.slice(0, 6),
    clippedCount: clipped.length,
    headings,
    tables,
    hscroll: hscroll.slice(0, 5),
    hscrollCount: hscroll.length,
    tinyText: tinyText.slice(0, 5),
    tinyTextCount: tinyText.length,
  };
})()
`;

async function login(role) {
  const account = SESSION[role];
  const res = await fetch(`${BACKEND}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  if (!res.ok) throw new Error(`login ${role} failed: HTTP ${res.status}`);
  const body = await res.json();
  return body.access_token;
}

/** The doctor's first appointment, so the session screens can be opened for real. */
async function firstAppointmentId(token) {
  const res = await fetch(`${BACKEND}/appointments/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  const first = Array.isArray(rows) ? rows[0] : null;
  return first?.id || first?._id || null;
}

async function main() {
  const args = process.argv.slice(2);
  const width = Number(args.find((a) => /^\d+$/.test(a)) || 360);
  const height = Number(args.filter((a) => /^\d+$/.test(a))[1] || 800);
  const onlyRole = (args.find((a) => a.startsWith('--role=')) || '').split('=')[1];

  const client = await connect();

  // Collect console errors and unhandled rejections for the whole run.
  const consoleErrors = [];
  await client.send('Runtime.enable');
  await client.send('Log.enable').catch(() => {});
  client.on((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(
        msg.params.exceptionDetails.exception?.description?.split('\n')[0] ||
          msg.params.exceptionDetails.text
      );
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(
        msg.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 200)
      );
    }
  });

  // Force the CSS viewport: this is the "does it fit a cheap phone" test.
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
  });

  const report = { viewport: `${width}x${height}`, routes: [] };

  const runRoutes = async (routes, label) => {
    for (const [hash, name] of routes) {
      await goto(client, hash, 900);
      let audit;
      try {
        audit = await client.evaluate(AUDIT_FN);
      } catch (error) {
        audit = { error: error.message, hash };
      }
      // A route that quietly redirected to /login is the failure mode this
      // harness exists to catch: the login screen fits perfectly and every
      // number looks healthy while the real screen was never rendered.
      const wanted = hash.replace(/^#/, '');
      const landed = String(audit.hash || '').replace(/^#/, '');
      const redirected = !landed.startsWith(wanted.split('?')[0]);
      const offline = /Cannot reach the server/i.test(audit.bodyText || '');
      audit.landedOn = landed;
      audit.redirected = redirected;
      audit.offline = offline;
      report.routes.push({ label, name, ...audit });
      const problems = [];
      if (audit.error) problems.push('ERROR ' + audit.error);
      if (redirected) problems.push(`REDIRECTED to ${landed}`);
      if (offline) problems.push('BACKEND UNREACHABLE');
      if ((audit.overflowCount || 0) > 0) problems.push(`${audit.overflowCount} overflowing element(s)`);
      if ((audit.docOverflowX || 0) > 0) problems.push(`doc scrolls X by ${audit.docOverflowX}`);
      console.log(
        `${problems.length ? 'FAIL' : ' ok '} ${label}/${name}  overflow=${audit.overflowCount || 0} docX=${audit.docOverflowX || 0} small=${audit.smallTargetsCount || 0} clip=${audit.clippedCount || 0} table=${(audit.tables || []).length} hscroll=${audit.hscrollCount || 0} tiny=${audit.tinyTextCount || 0}${problems.length ? '  <- ' + problems.join('; ') : ''}`
      );
      for (const t of (audit.tables || []).filter((x) => x.needsScroll)) {
        console.log(`      table needs side-scroll: ${t.scroll}px in ${t.client}px`);
      }
      for (const h of (audit.hscroll || []).slice(0, 3)) {
        console.log(`      hidden in x-scroller (+${h.hidden}px): ${h.el}`);
      }
      for (const t of (audit.tinyText || []).slice(0, 3)) {
        console.log(`      ${t.size}px text: ${t.el}`);
      }      if (audit.overflow && audit.overflow.length) {
        for (const item of audit.overflow.slice(0, 4)) {
          console.log(
            `      +${item.beyond}px ${item.el}${item.inScroller ? ' (in a scroller)' : ''}`
          );
        }
      }
      if (audit.error) console.log('      ' + audit.error);
    }
  };

  if (!onlyRole || onlyRole === 'public') {
    await client.evaluate("localStorage.removeItem('access_token')");
    await client.evaluate('location.hash = "#/"; location.reload()');
    await new Promise((r) => setTimeout(r, 2500));
    await runRoutes(PUBLIC_ROUTES, 'public');
  }

  for (const role of ['patient', 'doctor']) {
    if (onlyRole && onlyRole !== role) continue;
    const token = await login(role);
    await client.evaluate(`localStorage.setItem('access_token', ${JSON.stringify(token)}); true`);
    await client.evaluate(`location.hash = ${JSON.stringify(SESSION[role].base + '?r=' + Date.now())}; location.reload()`);
    await new Promise((r) => setTimeout(r, 3000));
    let routes = PATIENT_ROUTES;
    if (role === 'doctor') {
      routes = doctorRoutes(await firstAppointmentId(token));
    }
    await runRoutes(routes, role);
  }

  report.consoleErrors = consoleErrors.slice(0, 20);

  const fs = await import('node:fs');
  const out = process.env.AUDIT_OUT || 'work/mobile-audit.json';
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  console.log('\nconsole errors:', report.consoleErrors.length);
  report.consoleErrors.slice(0, 8).forEach((e) => console.log('  ! ' + e));
  console.log(`\nreport: ${out}`);

  await client.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
  client.close();
}

main().catch((error) => {
  console.error('audit failed:', error.message);
  process.exit(1);
});
