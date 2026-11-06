// Throwaway: show where each START SESSION button sits in the DOM.
import { connect, goto } from './cdp.mjs';

const c = await connect();
await goto(c, '#/doctor', 1500);

const result = await c.evaluate(`(() => {
  const buttons = Array.from(document.querySelectorAll('button')).filter((b) =>
    /start session/i.test(b.textContent || '')
  );
  return buttons.map((b, i) => {
    const chain = [];
    let node = b;
    for (let k = 0; k < 6 && node; k += 1) {
      chain.push({
        tag: node.tagName,
        cls: String(node.className || '').slice(0, 50),
        text: (node.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
      });
      node = node.parentElement;
    }
    return { i, chain };
  });
})()`);

console.log(JSON.stringify(result, null, 2));
c.close();
