# XD SMS Gateway

Turn any Android phone into a private, programmable SMS gateway. A clean web control panel, a REST API, signed webhooks, and an admin console — backed by MySQL + JWT auth.

Developed by **2026 TeamXD by NabeelXD**.

---

## Architecture

- **Frontend (`cpanel/`)** — static site (HTML/CSS/JS). Auth uses email/password with bcrypt on the backend. Sessions are JWT-based.
- **Backend (`render/`)** — Node.js + Express + Socket.IO. Stores all data in MySQL via a cPanel PHP proxy. Hosted on Render.

Base API path: `https://api.sms.luffyxd.store/smsapi/v1`
Site: `https://sms.luffyxd.store`

---

## Prerequisites

1. MySQL database on cPanel: `simonsre_smsapi` (user: `simonsre_smsapi`, pass: `simonsre_smsapi`).
2. Import `cpanel/schema.sql` into that database via phpMyAdmin.
3. Upload `cpanel/` contents to `/home/simonsre/sms.luffyxd.store/` on the cPanel server.

---

## Backend deployment (Render)

1. Push the repo to GitHub. Render auto-deploys from `main`.
2. Set the following environment variables in Render Dashboard:

| Variable | Value |
| --- | --- |
| `JWT_SECRET` | any long random string |
| `FRONTEND_URL` | `https://sms.luffyxd.store` |
| `ADMIN_USERNAME` | `nabeelxd` |
| `ADMIN_PASSWORD` | `nabeelxd@123` |
| `DEV_PVT_KEY` | `nabeelxd` |
| `MYSQL_API_URL` | `https://sms.luffyxd.store/api.php` |

3. Point DNS:
   - `sms.luffyxd.store` → cPanel host
   - `api.sms.luffyxd.store` → Render URL
4. Confirm health: `GET https://api.sms.luffyxd.store/smsapi/v1/api/ping` → `{ "status": "ok" }`.

---

## Frontend deployment (cPanel)

Upload the **contents of `cpanel/`** to `/home/simonsre/sms.luffyxd.store/` on the cPanel server.

Pages:
- `index.html` — landing
- `login.html`, `register.html`, `forgot-password.html` — MySQL-backed auth
- `dashboard.html`, `send.html`, `devices.html`, `apikeys.html`, `webhooks.html`, `logs.html`, `settings.html` — control panel
- `docs.html` — API reference
- `testing.html` — end-to-end testing checklist
- `secure-login.html` — admin only (not linked publicly)

---

## Password reset

1. On `login.html` click **Forgot password?** → `forgot-password.html`.
2. Enter the account email → backend stores a reset token and returns a reset token.
3. Use the token with a new password via the reset endpoint (or build a simple reset page that calls `POST /api/auth/reset-password`).

---

## Admin console

- URL: `https://sms.luffyxd.store/secure-login.html`
- Credentials: `nabeelxd` / `nabeelxd@123`
- The admin panel uses **tabbed navigation** (Overview / Users / Logs / Controls).
- Click any user row to view their connected devices and send SMS directly from their phone/SIM.
- Suspension is enforced server-side: any request from a user with `role === "suspended"` is rejected with `403 Account suspended`.

---

## Audit logs

Sensitive actions write audit entries:

- `user_registered`, `user_login`, `user_logout`, `admin_login`
- `apikey_created`
- `device_connected`, `device_disconnected`, `device_deleted`
- `sms_queued`, `sms_sent`, `sms_failed`, `admin_sms_sent`
- `webhook_created`, `webhook_deleted`
- `gateway_paused`, `gateway_resumed`, `gateway_paused_all`, `gateway_resumed_all`
- `user_suspended`, `user_unsuspended`, `user_deleted`, `user_role_changed`
- `settings_changed`

Admins see the full stream in **System Logs**; regular users see only their own logs on `logs.html`.

---

## Testing

Run through `cpanel/testing.html` after every deploy. It persists progress in `localStorage` and covers: register, login, password reset, API key creation, device connect, send SMS, webhook delivery, logs, suspension enforcement, audit visibility, logout.

Backend integration test:
```bash
cd render && npm install && npm start
npm run test:sms
```

---

## API reference

Full interactive docs: `cpanel/docs.html`.

### Base path

All user-facing endpoints live under `/smsapi/v1`.

### Authentication

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/smsapi/v1/api/auth/register` | email + password (bcrypt) |
| POST | `/smsapi/v1/api/auth/login` | email + password (bcrypt) |
| POST | `/smsapi/v1/api/auth/logout` | JWT |
| POST | `/smsapi/v1/api/auth/forgot-password` | email |
| POST | `/smsapi/v1/api/auth/reset-password` | reset token + new password |
| POST | `/smsapi/v1/api/admin/login` | admin user/pass |

### Dashboard / stats

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/smsapi/v1/api/dashboard` | JWT |
| GET | `/smsapi/v1/api/statistics?period=today` | JWT |

### SMS

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/smsapi/v1/api/sms/send` | API key |
| POST | `/smsapi/v1/api/sms/send-bulk` | API key |
| POST | `/smsapi/v1/api/sms/send-panel` | JWT |
| GET | `/smsapi/v1/api/sms/status/:requestId` | JWT |
| GET | `/smsapi/v1/api/sms/history` | JWT |
| GET | `/smsapi/v1/api/sms/logs` | JWT |

### Android gateway loop

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/smsapi/v1/api/device/connect` | API key |
| POST | `/smsapi/v1/api/device/update` | API key |
| GET | `/smsapi/v1/api/get` | API key |
| POST | `/smsapi/v1/api/done` | API key |

### Devices / API keys / webhooks

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/smsapi/v1/api/devices` | JWT |
| POST | `/smsapi/v1/api/apikey/create` | JWT |
| POST | `/smsapi/v1/api/webhook/create` | JWT |
| POST | `/smsapi/v1/api/queue/clear` | JWT |

### Admin

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/smsapi/v1/api/admin/stats` | admin JWT |
| GET | `/smsapi/v1/api/admin/users` | admin JWT |
| GET | `/smsapi/v1/api/admin/users/:id/devices` | admin JWT |
| POST | `/smsapi/v1/api/admin/user/:id/suspend` | admin JWT |
| POST | `/smsapi/v1/api/admin/user/:id/unsuspend` | admin JWT |
| POST | `/smsapi/v1/api/admin/user/:id/delete` | admin JWT |
| POST | `/smsapi/v1/api/admin/user/:id/set-role` | admin JWT |
| POST | `/smsapi/v1/api/admin/user/:id/send-sms` | admin JWT |
| POST | `/smsapi/v1/api/admin/gateway/pause-all` | admin JWT |
| POST | `/smsapi/v1/api/admin/gateway/resume-all` | admin JWT |

### Example: send an SMS

```bash
curl -X POST https://api.sms.luffyxd.store/smsapi/v1/api/sms/send \
  -H "X-Api-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"+15551234567","message":"Hello from XD"}'
```

Response:

```json
{ "request_id": "uuid", "status": "pending", "message": "SMS queued", "id": "queue-item-id" }
```

---

## Domain behavior

- `https://api.sms.luffyxd.store/` → 301 to `https://sms.luffyxd.store/`
- `https://discord-status-api-tm91.onrender.com/` → 301 to `/login.html` (unless `?dev=DEV_PVT_KEY` shows the status string)

---

## Clearing data

To clear MySQL data: open phpMyAdmin, select `simonsre_smsapi`, and truncate the tables. To clear file-based cache, delete `cpanel/sms_gateway_data.json` if present.
