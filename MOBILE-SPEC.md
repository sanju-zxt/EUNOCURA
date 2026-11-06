# EUNOCURA — Mobile App Spec (50 units / 10 sessions)

Status: **in progress**. Companion to `COMPLETE-SPEC.md` (the web completion pass).

The goal is one installable Android app that runs the same React app, with a UI that
behaves like a phone app rather than a squeezed web page — and with nothing faked,
nothing crashing offline, and no regression to the honesty rules of the completion
pass (real data or a labelled fixture; a clinical claim survives only if its quote
exists on the cited page).

---

## 1. Why a webview shell, not a rewrite

Every screen already talks to the same REST API and every gate is green
(`ci_checks` 14/14, route smoke 29/29, build green). A React Native rewrite would
re-implement 36 components to reach the same endpoints, put the citation-or-drop
behaviour at risk, and take weeks. Capacitor wraps the existing bundle in a real
Android project we fully own, and the UI work below is what actually makes it feel
native.

| Choice | Reason |
|---|---|
| `@capacitor/core` + `@capacitor/android` 8.x | We own the Gradle project, so back-button, splash, status bar and signing are all editable. |
| `webDir: dist` | Same Vite build the browser gets; one bundle to keep honest. |
| `appId: dev.eunocura.app` | Matches the `dev.eunocura.dev` demo accounts. |
| HashRouter when native | A `file://`-style origin has no server to fall back on, so a deep link must not 404. |
| Runtime API base + override | `localhost` inside the app means the phone, not the laptop. |

## 2. Session and unit board

Ten sessions, fifty units. Sessions are executed in waves of 4–7 units because a
wave is what the provider rate limit and one human reviewer can actually carry;
the unit boundaries — not the concurrency — are what keeps two edits from landing
on the same file.

Legend: `[x]` done · `[~]` in progress · `[ ]` not started.

### Session 0 — Foundation (orchestrator only)

| # | Unit | Files | State |
|---|---|---|---|
| 01 | Capacitor project + config | `frontend/capacitor.config.ts` | [x] |
| 02 | Android platform, Gradle, signing, manifest, network security | `frontend/android/**` | [x] |
| 03 | Icon + splash generator, all densities, adaptive + monochrome | `frontend/tools/make_icons.py`, `public/icons/*`, `res/mipmap-*`, `res/drawable*/splash.png` | [x] |
| 04 | Device-resolvable API base, override, `resolveAssetUrl`, `pingApi` | `src/utils/api.js` | [x] |
| 05 | `index.html` meta + PWA manifest + icons | `index.html`, `public/manifest.webmanifest` | [x] |
| 06 | Mobile design tokens: safe area, `h-app`, `.tap`, `.scroll-x`, sheet animation, reduced motion | `src/index.css` | [x] |
| 07 | Mobile scripts (`mobile:sync`, `mobile:apk`) + version bump | `frontend/package.json` | [x] |
| 08 | This spec + README §12 | `MOBILE-SPEC.md`, `README.md` | [x] |

### Session 1 — Shell, navigation, mobile primitives (orchestrator only)

| # | Unit | Files | State |
|---|---|---|---|
| 09 | `useIsMobile`, `MobileSheet`, `MobileBottomNav`, `ApiSettingsSheet`, `OfflineBanner` | `src/components/mobile/*` | [ ] |
| 10 | Native bridge: status bar ↔ dark mode, splash hide, keyboard, back button, share, external links | `src/services/native.js` | [ ] |
| 11 | `App.jsx`: HashRouter on native, scroll reset, mount native bridge | `src/App.jsx` | [ ] |
| 12 | Patient portal shell: compact header + bottom nav + safe-area main | `src/pages/PatientPortal.jsx` | [ ] |
| 13 | Doctor portal shell: same treatment, two destinations | `src/pages/DoctorPortal.jsx` | [ ] |

### Session 2 — Patient screens (wave A)

| # | Unit | Files | State |
|---|---|---|---|
| 14 | Patient dashboard: stack cards, no horizontal overflow, trend chart responsive | `src/components/patient/PatientDashboard.jsx` | [ ] |
| 15 | Appointments list: card layout on mobile, sticky filter, cancel flow | `src/components/patient/MyAppointments.jsx` | [ ] |
| 16 | Booking wizard → full-screen stepped sheet on mobile | `src/components/patient/BookAppointment.jsx` | [ ] |
| 17 | Medications table → cards | `src/components/patient/Medications.jsx` | [ ] |
| 18 | Care plan / diet: readable measure, collapsible days | `src/components/patient/DietPlan.jsx` | [ ] |
| 19 | Notifications: swipe-sized rows, unread affordance, empty state | `src/components/patient/Notifications.jsx` | [ ] |
| 20 | Chat assistant: keyboard-safe composer, message bubble widths | `src/components/patient/Chatbot.jsx` | [ ] |

### Session 3 — Doctor screens (wave A)

| # | Unit | Files | State |
|---|---|---|---|
| 21 | Doctor dashboard | `src/components/doctor/DoctorDashboard.jsx` | [ ] |
| 22 | Patients page: search-first layout, tap-through rows | `src/components/doctor/PatientsPage.jsx` | [ ] |
| 23 | Active session: mobile tabs instead of side-by-side panes | `src/components/doctor/ActiveSession.jsx` | [ ] |
| 24 | Prescribe modal → bottom sheet | `src/components/doctor/PrescribeModal.jsx` | [ ] |
| 25 | New appointment modal → bottom sheet | `src/components/doctor/NewAppointmentModal.jsx` | [ ] |
| 26 | Lab result modal → bottom sheet, scrollable body | `src/components/doctor/LabResultModal.jsx` | [ ] |

### Session 4 — Doctor screens (wave B)

| # | Unit | Files | State |
|---|---|---|---|
| 27 | Test results: chart + table responsive | `src/components/doctor/TestResults.jsx` | [ ] |
| 28 | Chat modal + button | `src/components/doctor/ChatModal.jsx`, `ChatButton.jsx` | [ ] |
| 29 | Patient clinical panel | `src/components/doctor/PatientClinicalPanel.jsx` | [ ] |
| 30 | Citation panel + appointment history card | `src/components/doctor/CitationPanel.jsx`, `AppointmentHistoryCard.jsx` | [ ] |
| 31 | PDF viewer: pinch/scroll, controls not clipped | `src/components/doctor/PDFViewer.jsx` | [ ] |

### Session 5 — Auth and landing

| # | Unit | Files | State |
|---|---|---|---|
| 32 | Landing page: hero fits 360×640, real tap targets | `src/pages/HomePage.jsx` | [ ] |
| 33 | Login: keyboard-safe, autofill hints, demo-account disclosure | `src/pages/Login.jsx` | [ ] |
| 34 | Patient signup: date input, stepper on mobile | `src/pages/PatientSignup.jsx` | [ ] |
| 35 | Doctor signup | `src/pages/DoctorSignup.jsx` | [ ] |

### Session 6 — Diagnosis dashboard

| # | Unit | Files | State |
|---|---|---|---|
| 36 | Diagnosis dashboard shell | `src/pages/DiagnosisDashboard.tsx` | [ ] |
| 37 | Diagnosis card + risk score visual | `src/components/diagnosis/{DiagnosisCard,RiskScoreVisual}.tsx` | [ ] |
| 38 | Trend chart + progress comparison | `src/components/diagnosis/{TestTrendChart,ProgressComparison}.tsx` | [ ] |
| 39 | Reasoning flow + modal + header | `src/components/diagnosis/{ClinicalReasoningFlow,ClinicalReasoningModal,DashboardHeader,Main}.tsx` | [ ] |

### Session 7 — Shared chrome

| # | Unit | Files | State |
|---|---|---|---|
| 40 | Dark toggle + fixture notice | `src/components/{DarkModeToggle,FixtureNotice}.jsx` | [ ] |
| 41 | Error boundary + not-found + route fallback | `src/components/ErrorBoundary.jsx`, `src/pages/NotFound.jsx`, `src/components/RouteFallback.jsx` | [ ] |

### Session 8 — Verification and delivery

| # | Unit | State |
|---|---|---|
| 42 | `npm run build` + `cap sync` + `assembleRelease` green | [x] |
| 43 | Emulator install, login as both demo roles | [x] |
| 44 | Screenshot every patient screen, fix what breaks | [x] |
| 45 | Screenshot every doctor screen, fix what breaks | [x] |
| 46 | Screenshot auth + landing + 404 | [x] |
| 47 | `logcat` triage (no red JS errors, no mixed-content blocks) | [x] |
| 48 | Back-button + keyboard + offline banner behaviour on device | [~] not captured |
| 49 | Backend regression: `ci_checks` 14/14 + route smoke + PHI probes | [x] |
| 50 | APK to `Downloads/EUNOCURA.apk` + honest report of what was not device-tested | [x] |

## 3. File ownership (the rule that keeps 50 units from colliding)

1. **One unit, one file.** A unit may only write the files in its row. If a unit
   needs a change elsewhere, it reports the need instead of making it.
2. **Shared primitives are frozen before any wave starts.** Sessions 0 and 1 are
   orchestrator-only because they define the contract (`MobileSheet`,
   `MobileBottomNav`, `useIsMobile`, `native.js`, `resolveAssetUrl`). Leaf screens
   consume them, never re-implement them.
3. **No new dependencies.** Every visual change must be achievable with the
   packages already in `package.json` plus the Capacitor plugins listed in §5.
4. **No invented data.** An empty state says it is empty. A fixture is labelled or
   deleted.
5. **`npm run build` must stay green** after every unit; a unit that breaks the
   build is reverted, not patched by the next unit.

## 4. Mobile UI contract

| Rule | Value |
|---|---|
| Breakpoint | Tailwind `md:` (768px). Below = phone layout. |
| Minimum tap target | 44×44 px (`.tap`) |
| Form input font size | ≥ 16px, so the OS never zooms on focus |
| Bottom nav height | 64px + `env(safe-area-inset-bottom)` |
| Sticky header height | 56px + `env(safe-area-inset-top)` |
| Content padding | 16px phone, 24px tablet, 32px desktop |
| Modals | `MobileSheet` = bottom sheet on phone, centred dialog ≥ `md` |
| Tables | Card list on phone, table ≥ `md` |
| Charts | `ResponsiveContainer` with a `min-h` so they never collapse to 0 |
| Horizontal scroll | `.scroll-x` on any table/chip row that keeps its columns |

## 5. Native plugins in use

`@capacitor/app` (back button, app state) · `@capacitor/status-bar` ·
`@capacitor/splash-screen` · `@capacitor/keyboard` · `@capacitor/network`
(offline banner) · `@capacitor/share` (PDF handoff) · `@capacitor/filesystem`
(temp writes before sharing) · `@capacitor/haptics` (selection feedback) ·
`@capacitor/toast` (short confirmations).

Every plugin call is wrapped: on web they no-op so `npm run dev` keeps working.

## 6. Honest limits of this build

- The APK talks to a **development backend over plain HTTP**. It is an internal
  demo build, not a store release: no TLS, no Play Store signing key.
- Free-text generation still depends on a reachable Ollama host; without it the
  app degrades to stored data and says so (`/healthz` reports the reason).
- `faster-whisper` (speech) and FAISS/torch (vector store) remain blocked by the
  machine's Application Control policy. The UI shows text-only mode rather than
  pretending.
- Screens were verified on a single emulator profile (API 34, 1080×1920). Small
  phones (320dp wide) are handled in CSS but were not photographed on hardware.
