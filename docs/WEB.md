# Use FORGE on a Windows PC

Use Node.js 24. In PowerShell, inside your Forge-App checkout:

```powershell
git fetch origin
git switch feat/forge-web
npm ci
npm run web
```

Open `http://localhost:8080` in current Chrome or Edge. Keep PowerShell running.
The first build may take a few minutes. To reopen an existing build without
rebuilding, run `npm run preview:web`. Stop it with Ctrl+C. Re-run `npm run web`
after updating the code; this preview does not hot-reload edits.
For normal use, keep the same hostname and port so you return to the same records.

To use your iPhone as well, open a second PowerShell window in Forge-App, run
`npx expo start --go`, and scan its QR code on your iPhone as before. Leave both
terminals running. Use `npm run web` for the PC rather than pressing W: SDK 57
has a worker-bundling issue in the browser development server. A plain HTTP LAN address is not a supported browser
storage origin: use localhost on the PC, or HTTPS for remote browser access.

## Records and platform differences

- Workouts, templates, exercise search, charts and journals share the mobile
  screens, validation, calculations, SQLite schema and JSON backup format.
- Browser records persist in that browser's storage for the exact site address.
  The iPhone database is separate. Opening the website does not transfer or
  overwrite your phone records, and neither device syncs automatically.
- Export a JSON backup in You on the phone, transfer it privately to the PC, and
  import it in You on the browser if you want a copy. Import replaces local
  records after confirmation; it does not merge them. Export each device first.
- Browser export downloads a JSON file; browser import uses a file picker. Phone
  export/import continue to use native sharing and document selection.
- In-app rest timers work in both versions. Background reminders are supported
  only by the phone app. Browser background tabs may delay visual timer updates.
- Optional cloud accounts use native SecureStore on phones and tab-scoped
  sessionStorage on the browser. Closing the tab requires signing in again.
  Browser storage does not have native SecureStore protections. Live Supabase
  authentication and synchronization require the existing project setup and
  remain unverified against a real backend.
- Use a normal browser profile; private browsing, blocked storage, clearing site
  data or browser eviction can remove records. Back up regularly. Avoid opening
  multiple FORGE tabs at once because SQLite's persistent files can be locked.
- An Expo Go session still uses the development server. This change does not
  create a standalone iPhone build, a public website or a service worker/PWA.

## How browser support stays separate

Expo selects `.web.ts` files only for browser bundles. The web database adapter
starts Expo SQLite's worker asynchronously, then uses the existing repository.
The native database adapter and schema retain their existing behavior. Platform
adapters handle confirmation dialogs, notifications, backup files and account
session storage. No iOS/Android app IDs or stored-data formats change.

`react-native-web` and `@expo/metro-runtime` use the versions included with SDK 57.
React DOM is pinned to the same version as React to prevent peer-version drift.
`metro.config.js` enables the SQLite WebAssembly asset and a browser-only SQLite
worker-channel adapter. The SDK 57 bridge has an iteration-based timeout and
truncates response lengths above 255 bytes; the adapter uses a real deadline,
a four-byte length and explicit oversized-response errors. It retains Expo
SQLite, OPFS persistence and the existing repository. This adapter depends on
SDK 57 internals: review/remove it on SDK upgrades and run the browser tests.
It is never selected for iOS or Android. The exporter scopes its full dependency
graph setting to the browser command.
The browser command exports static files and serves them with a small local
Node server and the same isolation headers. This avoids the SDK 57 development
worker-bundling failures without patching Expo or changing native dependencies.
The local server binds only to localhost and serves only dist-web.

## Validation

Verified in the Linux development environment: 47 domain/database/bridge tests,
12 native component tests and the real Chromium workout/backup test passed.
Type checking, lint and formatting passed. iOS and Android Hermes exports and
the static browser export passed. The browser test also exercised `npm run web`
from startup, with fresh disposable browser storage. The native bundles were
checked to exclude the browser database adapters.

These checks do not establish physical iPhone/Android behavior, live Supabase
authentication, or a Windows hardware/browser run. The Windows launch scripts
use Node APIs and npm commands without Unix shell environment syntax.

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:ui
npm run export
npm run export:web
npx playwright install chromium
npm run test:web
```

The browser test starts a separate local server on port 8080 and uses disposable
browser storage. It checks onboarding, navigation, exercise search, set entry,
reload persistence, finish confirmation, backup download, confirmed deletion and
backup restoration. It must never be run against your real records. To use an
already running disposable development server, set FORGE_WEB_URL. An optional
FORGE_BROWSER_PATH selects an installed Chromium executable.

## Hosting later

`npm run export:web` produces `dist-web/`. A future static host must serve it over
HTTPS with these response headers, including HTML, worker and asset requests:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`public/_headers` supplies these rules for hosts that recognize that format.
Other hosts need equivalent configuration. Serve `.wasm` as `application/wasm`
and support the exported route HTML files. Verify the browser reports
`crossOriginIsolated === true`; otherwise FORGE displays a storage startup error.
Do not remove isolation or silently fall back to temporary storage. A hosted
copy uses a new origin with separate records and needs its own Supabase callback
allowlist if cloud accounts are enabled.
