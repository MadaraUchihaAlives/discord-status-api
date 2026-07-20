# XD SMS Gateway

Turn any Android phone into a private, programmable SMS gateway. A clean web control panel, a REST + WebSocket API, signed webhooks, and an admin console — backed entirely by Firebase (Auth + Realtime Database).

Developed by **2026 TeamXD by NabeelXD**.

---

## Architecture

- **Frontend (`cpanel/`)** — static site (HTML/CSS/JS). Auth uses **Firebase Authentication** (email/password + password reset). No server-side sessions for the browser; the backend issues a short-lived JWT for API calls.
- **Backend (`render/`)** — Node.js + Express + Socket.IO. Stores all data in **Firebase Realtime Database** and verifies Firebase ID tokens with the **Firebase Admin SDK**. Hosted on Render.
- **Android app** — connects over the API, polls the queue, sends SMS from the SIM, reports delivery. (You build this separately; see the Android section.)

Base URL: `https://api.sms.luffyxd.store`
Site: `https://sms.luffyxd.store`

---

## Prerequisites (Firebase)

Both the frontend and backend MUST use the **same** Firebase project. The config in `cpanel/assets/js/config.js` is the source of truth:

```
projectId: api-firebase-nabeelxd
authDomain: api-firebase-nabeelxd.firebaseapp.com
databaseURL: https://api-firebase-nabeelxd-default-rtdb.asia-southeast1.firebasedatabase.app
```

In the Firebase console for `api-firebase-nabeelxd`:

1. **Authentication → Sign-in method** → enable **Email/Password**.
2. **Authentication → Settings → Authorized domains** → add `sms.luffyxd.store` and `api.sms.luffyxd.store`.
3. **Realtime Database** → create the database (region `asia-southeast1`). Set rules to **deny** public access (the backend uses the **Database secret** / Admin SDK, the browser never touches RTDB directly).
4. **Project settings → Service accounts** → generate a private key JSON. This becomes `FIREBASE_SERVICE_ACCOUNT` on Render.
5. **Project settings → Service accounts → Database secrets** → copy the secret. This becomes `FIREBASE_DATABASE_SECRET` on Render.

---

## Backend deployment (Render)

1. Push the `render/` folder to a Git repo connected to Render (or use the Render Dashboard "Deploy from existing repo").
2. Set the following environment variables (do **not** delete existing ones — these are the ones the app reads):

| Variable | Value |
| --- | --- |
| `JWT_SECRET` | any long random string |
| `FRONTEND_URL` | `https://sms.luffyxd.store` |
| `ADMIN_USERNAME` | `nabeelxd` |
| `ADMIN_PASSWORD` | `nabeelxd@123` |
| `FIREBASE_PROJECT_ID` | `api-firebase-nabeelxd` |
| `FIREBASE_DATABASE_URL` | `https://api-firebase-nabeelxd-default-rtdb.asia-southeast1.firebasedatabase.app/` |
| `FIREBASE_SERVICE_ACCOUNT` | the service-account JSON (from step 4 above) |
| `FIREBASE_DATABASE_SECRET` | the RTDB secret (from step 5 above) |

3. The `render.yaml` already sets `buildCommand: npm install` and `startCommand: npm start`.
4. Point `api.sms.luffyxd.store` (DNS CNAME) → your Render URL.
5. Confirm health: `GET https://api.sms.luffyxd.store/api/ping` → `{ "status": "ok" }`.

Without `FIREBASE_SERVICE_ACCOUNT` the backend **cannot verify Firebase ID tokens**, so registration/login will fail with `Invalid Firebase token`. This file is required for the gateway to function.

---

## Frontend deployment (cPanel / static host)

Upload the **contents of `cpanel/`** to `sms.luffyxd.store` (the document root). No build step — it is plain static HTML/CSS/JS.

Pages:
- `index.html` — landing / marketing
- `login.html`, `register.html`, `forgot-password.html` — Firebase auth
- `dashboard.html`, `send.html`, `devices.html`, `apikeys.html`, `webhooks.html`, `logs.html`, `settings.html` — control panel
- `docs.html` — full interactive API reference
- `testing.html` — end-to-end testing checklist
- `secure-login.html` — **admin only** (not linked from the public site)

---

## Password reset (Firebase)

1. On `login.html` click **Forgot password?** → `forgot-password.html`.
2. Enter the account email → the page calls `firebase.auth().sendPasswordResetEmail(email)`.
3. Firebase emails a reset link (template configured in Firebase → Authentication → Templates).
4. The user sets a new password on Firebase's hosted page and returns to `login.html`.

No backend endpoint is involved — Firebase Auth handles the whole flow.

---

## Admin console

- URL: `https://sms.luffyxd.store/secure-login.html`
- Credentials: `nabeelxd` / `nabeelxd@123` (from `ADMIN_USERNAME` / `ADMIN_PASSWORD`).
- The admin panel is **not** linked from the public navigation; only someone who knows the URL can reach it.
- Admin capabilities:
  - View all users, suspend / unsuspend / delete accounts, promote to admin
  - Pause / resume every gateway globally
  - Read the full system audit log (logins, API key changes, admin actions, SMS events)
- Suspension is enforced server-side: any request that has a session whose user `role === "suspended"` is rejected with `403 Account suspended`, so a suspended user cannot call any user or API-key endpoint.

---

## Audit logs

Every sensitive action writes an entry via `logActivity(...)` in `render/sms-gateway/routes.js`:

- `user_registered`, `user_login`, `user_logout`, `admin_login`
- `apikey_created`, `apikey_revoked`
- `device_connected`, `device_disconnected`, `device_deleted`
- `sms_queued`, `sms_sent`, `sms_failed`
- `webhook_created`, `webhook_deleted`
- `gateway_paused`, `gateway_resumed`, `gateway_paused_all`, `gateway_resumed_all`
- `user_suspended`, `user_unsuspended`, `user_deleted`, `user_role_changed`
- `settings_changed`

Admins see the full stream in the **System Logs** panel of `admin.html`; regular users see only their own logs on `logs.html`.

---

## Testing

1. **Interactive checklist** — open `https://sms.luffyxd.store/testing.html` after every deploy. It persists progress in `localStorage` and walks through: register, login, password reset, API key creation, device connect, send SMS, webhook delivery, logs, suspension enforcement, audit visibility, logout.
2. **Backend integration** — from `render/`:
   ```bash
   npm install
   npm start
   npm run test:sms   # requires FIREBASE_SERVICE_ACCOUNT + FIREBASE_DATABASE_SECRET to be set
   ```

---

## API reference (summary)

Full interactive docs with copy-paste `curl` examples: `cpanel/docs.html`.

### Authentication

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Firebase ID token | Create account (verifies `idToken`) |
| POST | `/api/auth/login` | Firebase ID token | Exchange `idToken` for JWT |
| POST | `/api/auth/logout` | JWT | Invalidate session |
| POST | `/api/admin/login` | admin user/pass | Admin JWT |

### Dashboard / stats

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/dashboard` | JWT |
| GET | `/api/statistics?period=today` | JWT |

### SMS

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/sms/send` | API key |
| POST | `/api/sms/send-bulk` | API key |
| POST | `/api/sms/send-panel` | JWT (dashboard send) |
| GET | `/api/sms/status/:requestId` | JWT |
| GET | `/api/sms/history` | JWT |
| GET | `/api/sms/logs` | JWT |

### Android gateway loop

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/device/connect` | API key |
| POST | `/api/device/update` | API key |
| GET | `/api/get` | API key |
| POST | `/api/done` | API key |

### Devices / API keys / webhooks

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/devices` | JWT |
| POST | `/api/apikey/create` | JWT |
| POST | `/api/webhook/create` | JWT |
| POST | `/api/queue/clear` | JWT |

### Admin

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/admin/stats` | admin JWT |
| GET | `/api/admin/users` | admin JWT |
| GET | `/api/admin/logs` | admin JWT |
| POST | `/api/admin/user/:id/suspend` | admin JWT |
| POST | `/api/admin/user/:id/unsuspend` | admin JWT |
| POST | `/api/admin/user/:id/delete` | admin JWT |
| POST | `/api/admin/user/:id/set-role` | admin JWT |
| POST | `/api/admin/gateway/pause-all` | admin JWT |
| POST | `/api/admin/gateway/resume-all` | admin JWT |

### Example: send an SMS via API key

```bash
curl -X POST https://api.sms.luffyxd.store/api/sms/send \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"+15551234567","message":"Hello from XD"}'
```

Response:

```json
{ "request_id": "uuid", "status": "pending", "message": "SMS queued", "id": "queue-item-id" }
```

---

## Android app guide (you build this)

The app only needs to:

1. **Save the API key** shown once in the dashboard (`apikeys.html`).
2. **Connect on start** — `POST /api/device/connect` with hardware info (model, carrier, SIM, battery). Store the returned `device_id`.
3. **Poll every ~2s** — `GET /api/get?device_id=...`. If `success: true`, you get `{ id, request_id, phone_number, message, sim_slot }`.
4. **Send the SMS** using Android `SmsManager.sendTextMessage(phone_number, null, message, null, null, null)` on the requested `sim_slot`.
5. **Report delivery** — `POST /api/done` with `{ id, status: "sent" | "failed", device_id }`.
6. **Heartbeat every 30s** — `POST /api/device/update` with battery / network / RAM.

Permissions required in `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.SEND_SMS" />
<uses-permission android:name="android.permission.READ_PHONE_STATE" />
<uses-permission android:name="android.permission.INTERNET" />
```

Recommended flow for a no-code build (Sketchware / Kodular / MIT App Inventor): store the API key in `TinyDB`, use a `Clock` timer (2000 ms) to call `/api/get`, a `WebView`/`HTTP` component to POST, and map the response to `SmsManager`.

---

## Notes / known constraints

- The Discord + PCPanel code in `render/server.js` is unrelated to the SMS gateway and is kept intact. It logs a warning locally when `BOT_TOKEN` is absent — this does not affect the SMS API.
- Firebase ID-token verification requires `FIREBASE_SERVICE_ACCOUNT` on Render. Without it, browser login returns `Invalid Firebase token`.
- RTDB writes use the database secret (`FIREBASE_DATABASE_SECRET`); the browser never talks to RTDB directly, so the public rules can stay locked down.
