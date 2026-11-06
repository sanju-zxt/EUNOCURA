// One-off: why does the real login form not land in the portal?
import { connect } from './cdp.mjs';

const c = await connect();
await c.send('Runtime.enable');
await c.send('Emulation.setDeviceMetricsOverride', {
  width: 360,
  height: 800,
  deviceScaleFactor: 2,
  mobile: true,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (expr) => c.evaluate(expr);

await ev("localStorage.removeItem('access_token'); location.hash = '#/login'; location.reload()");
await sleep(2800);

console.log('hash      :', await ev('location.hash'));
console.log('forms     :', await ev('document.querySelectorAll("form").length'));
console.log(
  'form btns :',
  await ev(
    'JSON.stringify(Array.from(document.querySelectorAll("form button")).map(b => ({ type: b.type, txt: (b.textContent||"").trim().slice(0,24), disabled: b.disabled })))'
  )
);

const action = await ev(`(() => {
  const set = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const inputs = document.querySelectorAll('form input');
  set(inputs[0], 'demo.patient@eunocura.dev');
  set(inputs[1], 'Demo@2026');
  const btn = Array.from(document.querySelectorAll('form button')).find((b) => /sign in/i.test(b.textContent || ''));
  if (!btn) return 'no sign-in button';
  btn.click();
  return 'clicked: ' + (btn.textContent || '').trim();
})()`);
console.log('action    :', action);

await sleep(4500);
console.log('hash after:', await ev('location.hash'));
console.log('token     :', await ev('!!localStorage.getItem("access_token")'));
console.log(
  'body      :',
  (await ev('document.body.innerText')).replace(/\s+/g, ' ').slice(0, 260)
);
c.close();
