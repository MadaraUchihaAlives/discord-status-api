# Implementation Plan

## Goal Description
Fix auth ("Firebase ID token required", "All fields required"), admin actions, domain redirects, add rate limiting, tabbed admin panel with device/SIM visibility, device-specific SMS routing, switch data layer to MySQL via cPanel PHP proxy, and clean up all broken characters and documentation.

## Status
- **Backend auth**: Fixed register/login to accept `idToken` OR `uid`; added 5 attempts/hour rate limit per IP+email.
- **Server redirects**: `api.sms.luffyxd.store` -> `sms.luffyxd.store`; `discord-status-api-tm91.onrender.com` -> `/login.html` unless `?dev=key`; dev key returns status string.
- **Admin fixes**: `suspend`, `unsuspend`, `set-role`, `delete`, `send-sms` all implemented and tested via `requireAdmin` middleware.
- **Device targeting**: `POST /api/sms/send` and panel route accept optional `device_id`; admin can send via user device with specific SIM.
- **Frontend**: Admin panel is tabbed (Overview/Users/Logs/Controls); users table shows devices and inline SMS form; send page has device dropdown; "Clean UI" card removed; all mojibake fixed; docs base path updated to `/smsapi/v1`.
- **Environment**: Added `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `DEV_PVT_KEY`, MySQL connection strings to `.env`.
- **Data layer**: Currently Firebase RTDB. Next step is to replace it with MySQL via `cpanel/api.php` proxy because the database is not publicly exposed.

## Remaining Critical Tasks
1. **MySQL Proxy**: Create `cpanel/api.php` connecting to `localhost` MySQL (`simonsre_smsapi`) and rewrite `render/sms-gateway/db.js` to call it instead of Firebase.
2. **Upload Frontend**: Push updated `cpanel/` contents to cPanel host (`sms.luffyxd.store`).
3. **Push Backend**: Commit all `render/` changes and push to GitHub `main` for Render auto-deploy.
4. **Docs**: Update `README.md` and `docs.html` with current endpoints and rate limit; do **not** expose PHP proxy or admin creation in public docs.
5. **Data Reset Instructions**: Document how to truncate MySQL tables or Firebase nodes.
