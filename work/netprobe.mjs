// One-off probe: why does the packaged webview fail to reach the backend?
// Prints the real Chromium network failure reason, not the generic
// "Failed to fetch" that fetch() hides behind.
import { connect } from './cdp.mjs';

const c = await connect();
await c.send('Log.enable');
await c.send('Runtime.enable');
await c.send('Network.enable');

const seen = [];
c.on((m) => {
  if (m.method === 'Log.entryAdded') {
    seen.push(`LOG ${m.params.entry.level}: ${m.params.entry.text}`);
  }
  if (m.method === 'Network.loadingFailed') {
    seen.push(
      `NETFAIL ${m.params.errorText} blocked=${m.params.blockedReason || '-'} cors=${JSON.stringify(m.params.corsErrorStatus || null)}`
    );
  }
});

console.log('origin   :', await c.evaluate('location.origin'));
console.log('secure   :', await c.evaluate('isSecureContext'));
console.log('api base :', await c.evaluate("localStorage.getItem('eunocura.api_base') || '(default)'"));

const result = await c.evaluate(
  "fetch('http://10.0.2.2:8000/healthz').then(r => 'HTTP ' + r.status).catch(e => 'ERR ' + e.message)"
);
console.log('fetch    :', result);
await new Promise((r) => setTimeout(r, 1500));
console.log(seen.length ? seen.join('\n') : '(no network/log events captured)');
c.close();
