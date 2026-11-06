# Mobile pass — agent brief

Read this before editing anything. It is the contract every unit in
`MOBILE-SPEC.md` follows.

## Working directory

`C:\Users\Sanju\Projects\MedAI\frontend` (the React app). Never touch `backend/`.

## Your unit

You own **exactly the files listed in your task**. Do not create, edit or delete
anything else — not `package.json`, not `index.html`, not `index.css`, not
`App.jsx`, not another unit's component. If your screen needs a change in a file
you do not own, say so in your report instead of making it.

## What "mobile" means here

The same component renders on a 360×800 phone and a 1440px desktop. You are
adding the phone shape, not replacing the desktop one.

| Concern | Phone (< 768px, Tailwind below `md:`) | Desktop (`md:` and up) |
|---|---|---|
| Navigation | handled by the shell — do not add a sidebar | unchanged |
| Tables | card list | table |
| Modals | `MobileSheet` (bottom sheet) | `MobileSheet` renders a centred dialog automatically |
| Padding | `px-4 py-4` | `p-6` |
| Type | `text-sm` body, `text-lg`–`text-xl` headings | unchanged |
| Charts | `ResponsiveContainer` with a `min-h-[220px]` wrapper | unchanged |

Hard rules:

1. **No horizontal overflow at 360px.** No fixed widths above `w-full`, no
   `min-w-[520px]` outside a `.scroll-x` wrapper.
2. **Tap targets ≥ 44×44px** on anything interactive. The `.tap` utility exists
   (`min-height:44px; min-width:44px`).
3. **Form inputs ≥ 16px font** so the OS never zooms. Use `text-base` or larger.
4. **Text must not truncate the meaning.** Prefer wrapping over `truncate` for
   clinical content (drug names, dosages, lab values).
5. **Keep every existing behaviour.** Same API calls, same props, same exported
   name, same validation, same aria labels. A mobile pass that drops a fetch is a
   regression, not a redesign.

## Primitives available to you (already written — import, never copy)

```js
// Bottom sheet on a phone, centred dialog at md+. Handles focus trap, Escape,
// backdrop click and body scroll lock.
import MobileSheet from '../mobile/MobileSheet';
<MobileSheet
  open={open}
  onClose={close}
  title="New prescription"
  description="Optional one-liner"
  size="md"            // sm | md | lg | xl
  footer={<div>…actions…</div>}
>
  …body, scrolls on its own…
</MobileSheet>

// true below 768px. Only needed when the JSX itself must differ (not for CSS).
import useIsMobile from '../mobile/useIsMobile';
```

Service helpers (`src/services/native.js`), all no-ops in a browser:

```js
import { hapticTap, showToast, shareUrl, shareBase64File, isNative } from '../services/native';
```

URL helper — **use this for any `file_url` / `pdf_url` / `download_url` the
backend returns**, because it hands back `http://localhost:8000/...` which is
unreachable from a phone:

```js
import { resolveAssetUrl } from '../utils/api';
const src = resolveAssetUrl(result.file_url);
```

CSS utilities already in `src/index.css`: `.tap`, `.scroll-x`, `.h-app`,
`.min-h-app`, `.pt-safe`, `.pb-safe`, `.px-safe`, `.mb-safe`, `.animate-sheet-up`,
`.animate-fade-in`, `.visually-hidden`.

## Honesty rules (do not regress these)

- **No invented data.** If a list is empty, render an empty state that says so.
  Never add sample rows, placeholder patients, fake vitals or demo numbers.
  The only labelled fixture left in the repo is `src/data/previewDietPlan.js`,
  and it already renders behind `<FixtureNotice>` — leave that mechanism intact.
- **No fake capability.** If something is not wired, say it is not wired.
- **Degrade, don't crash.** A failed fetch renders an error with a retry. Never
  let a `undefined.map` reach the screen; guard with `Array.isArray`.
- A clinical claim is still only allowed where the quote exists on the cited page.

## Dependencies

**Do not install anything and do not edit `package.json`.** The available set is
React 18, react-router-dom 6, recharts 2, lucide-react, framer-motion,
react-markdown, tailwindcss 3, plus the Capacitor plugins already listed in
`MOBILE-SPEC.md` §5. Icons come from `lucide-react`.

## Verify before you report

Do **not** run `npm run build`, `npm install`, `npm test` or `cap sync` — the
orchestrator owns the build, and concurrent builds fight over `dist/`.

Do run this parse check on **every file you touched** (it is fast and catches
what matters):

```powershell
cd C:\Users\Sanju\Projects\MedAI\frontend
node -e "const e=require('esbuild');const f=require('fs');for(const p of ['src/…your/file.jsx']){try{e.transformSync(f.readFileSync(p,'utf8'),{loader:'jsx',jsx:'automatic'});console.log('OK',p)}catch(err){console.log('FAIL',p,err.message)}}"
```

For `.tsx` files use `loader:'tsx'`.

Any `FAIL` must be fixed before you report.

## Report format

Reply with, in this order:

1. **Files changed** (paths only).
2. **What changed** — one bullet per behaviour, not per class name.
3. **What you did not do** — anything in your task you skipped, and why.
4. **Risks** — anything a reviewer should eyeball on a device.
5. **Parse check** — the output line per file (`OK src/…`).

Keep it short. No code dumps. Do not claim device verification — you cannot see a
screen.
