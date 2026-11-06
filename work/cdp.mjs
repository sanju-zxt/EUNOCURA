// Minimal Chrome DevTools Protocol client for the EUNOCURA Android webview.
//
// Why this exists: the emulator screenshot is a PNG, and a PNG cannot tell you
// that a card is 12px too wide. This runs JS inside the real app, on the real
// viewport, and reports numbers.
//
// Setup (once per device):
//   adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
//   node work/cdp.mjs eval "location.hash"
//
// Usage:
//   node work/cdp.mjs            -> list targets
//   node work/cdp.mjs eval "1+1"
//   node work/cdp.mjs goto "#/login"
//
// Node 22+ has a global WebSocket, so this needs no dependencies.

const ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';

export async function listTargets() {
  const res = await fetch(`${ENDPOINT}/json`);
  return res.json();
}

export async function connect() {
  const targets = await listTargets();
  const page = targets.find((t) => t.type === 'page');
  if (!page) {
    throw new Error(
      `No page target on ${ENDPOINT}. Is the app running and the port forwarded?`
    );
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket failed')), { once: true });
    setTimeout(() => reject(new Error('WebSocket open timed out')), 8000);
  });

  let nextId = 1;
  const pending = new Map();
  const events = [];
  const listeners = new Set();

  ws.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else resolve(msg.result);
      return;
    }
    events.push(msg);
    listeners.forEach((fn) => fn(msg));
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });

  /**
   * Evaluate an expression in the page and return its value.
   * A promise result is awaited, and the value is JSON-serialised back.
   */
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const detail =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        'evaluation failed';
      throw new Error(detail);
    }
    return result.result?.value;
  };

  const on = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  const close = () => {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  };

  return { send, evaluate, on, events, close, target: page };
}

/** Navigate the hash router and wait for the route to settle. */
export async function goto(client, hashPath, waitMs = 700) {
  await client.evaluate(
    `(() => { const h = ${JSON.stringify(hashPath)}; if (location.hash !== h) location.hash = h; return location.hash; })()`
  );
  await new Promise((r) => setTimeout(r, waitMs));
  return client.evaluate('location.hash');
}

if (process.argv[1] && process.argv[1].endsWith('cdp.mjs')) {
  const [, , command, ...rest] = process.argv;
  const client = await connect();

  if (!command) {
    const targets = await listTargets();
    console.log(JSON.stringify(targets, null, 2));
  } else if (command === 'eval') {
    const value = await client.evaluate(rest.join(' '));
    console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  } else if (command === 'goto') {
    console.log('now at', await goto(client, rest[0]));
  } else if (command === 'shot') {
    const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
    const fs = await import('node:fs');
    fs.writeFileSync(rest[0] || 'shot.png', Buffer.from(data, 'base64'));
    console.log('wrote', rest[0] || 'shot.png');
  } else {
    console.log('unknown command', command);
  }

  client.close();
}
