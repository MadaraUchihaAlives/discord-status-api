# Implementation Plan

## Goal Description
Fix auth ("Firebase ID token required", "All fields required"), admin actions, domain redirects, add rate limiting, tabbed admin panel with device/SIM visibility, device-specific SMS routing, switch data layer to MySQL via cPanel PHP proxy, rename frontend to .php, remove all Firebase references, and fix all remaining bugs.

## Status
- **Backend auth**: Completely removed Firebase. Now uses pure MySQL + bcrypt + JWT. Register/login accept email + password directly.
- **Server redirects**: `api.sms.luffyxd.store` -> `sms.luffyxd.store`; `discord-status-api-tm91.onrender.com` -> `/login.php` unless `?dev=key`; dev key returns status string.
- **Admin fixes**: `suspend`, `unsuspend`, `set-role`, `delete`, `send-sms` all working via `requireAdmin` middleware.
- **Device targeting**: `POST /api/sms/send` accepts optional `device_id`; admin can send via user device with specific SIM.
- **Frontend**: All files renamed from .html to .php. Admin panel is tabbed (Overview/Users/Logs/Controls); users table shows devices and inline SMS form; send page has device dropdown. All Firebase references removed.
- **Architecture**: Render App -> HTTPS -> cPanel PHP proxy (`api.php`) -> localhost MariaDB. No external DB access needed.
- **Environment**: `MYSQL_API_URL`, `MYSQL_API_USER`, `MYSQL_API_PASS`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `DEV_PVT_KEY` all set in Render env.

## All Tasks Completed
- [x] Remove Firebase from backend auth
- [x] Remove Firebase from frontend (all .php files)
- [x] Remove Firebase backend files (firebase-admin.js, firebase-init.js, firebase-verify.js)
- [x] Rename all .html to .php
- [x] Update all internal links to .php
- [x] Create cpanel/api.php (MySQL proxy)
- [x] Create cpanel/schema.sql with password_hash and password_reset_tokens
- [x] Rewrite db.js to use PHP proxy instead of Firebase
- [x] Mount routes under /smsapi/v1
- [x] Fix admin login to use env vars
- [x] Add password reset endpoints
- [x] Remove cpanel/ from git tracking but keep local for deployment
- [x] Upload all .php files to cPanel
- [x] Trigger Render deploy
