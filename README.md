# Keshav — Team, Tasks & Attendance

*Architectural · Hardware · Paint · Electrical*

Task delegation, recurring tasks, selfie + geofence attendance, leave & approvals, timesheets, chat with voice notes,
WhatsApp alerts, goals, performance & rewards, live location — as an **Android + iOS app** and a **web admin panel**.

```
backend/   PHP 8 + MySQL REST API (no Composer — runs on any cPanel / Hostinger shared hosting)
admin/     React + Vite admin panel (static build, upload to hosting)
mobile/    Expo (React Native) app — one codebase for Android and iOS
```

## Branding
Gold-bronze lotus + KESHAV wordmark, walnut brown and cream marble palette.
Logo source: `admin/src/lotus.svg`; app icons/splash in `mobile/assets/`; login banner `admin/public/brand-banner.jpg`.
Colours live in `admin/src/styles.css` (`:root`) and `mobile/src/lib/theme.ts`.

## 1. Backend on shared hosting (cPanel / Hostinger)

1. **Database** — hosting panel → MySQL Databases → create DB + user. Open phpMyAdmin → Import `backend/database/schema.sql`.
2. **Upload** the whole `backend/` folder as `public_html/api/` (the root `.htaccess` blocks `src/`, `config/`, `storage/`).
3. **Config** — copy `config/config.example.php` → `config/config.php` and set DB details, a random `jwt_secret`
   (`php -r "echo bin2hex(random_bytes(32));"`), `base_path` = `/api`, and `cors_origins`.
4. Make `storage/` writable (755/775).
5. **Cron** (cPanel → Cron Jobs, every 5 minutes):
   `php /home/USERNAME/public_html/api/cron/run.php`
   — creates recurring tasks, sends "due in 1 hour" reminders and overdue alerts, closes forgotten punches.
6. Check `https://yourdomain.com/api/` → `{"app":"Keshav API","db":true}`.
7. **First company** — with SSH: `php database/seed.php` loads a demo company (code `KESHAV`, owner mobile
   `9800011220`, password `admin123`). For a real company insert one row in `companies` and one owner in `users`
   (set `password_hash` with `php -r "echo password_hash('yourpass', PASSWORD_DEFAULT);"`), then add the rest from the admin panel.

Needs PHP ≥ 8.0 with `pdo_mysql`, `curl`, `fileinfo`, `mbstring` (all on by default on most hosts).

### SMS OTP, WhatsApp, push
| Feature | Setting in `config.php` |
|---|---|
| OTP SMS | `sms.provider` = `msg91` or `2factor` + keys. `log` writes OTPs to `storage/logs/otp.log` (dev only). |
| WhatsApp alerts & replies ("1" Started / "2" Done) | `whatsapp.provider` = `meta` + Cloud API phone number id & token; webhook URL `https://yourdomain.com/api/webhooks/whatsapp` |
| Push notifications | Automatic via Expo push (Android FCM + iOS APNs credentials are set up once with `eas credentials`) |
| Better voice-task parsing | optional `ai.anthropic_api_key` (rule-based Hindi/Hinglish parser works without it) |

## 2. Admin panel

```bash
cd admin
cp .env.example .env.local         # VITE_API_URL=https://yourdomain.com/api
npm install && npm run build
```
Upload everything inside `admin/dist/` to `public_html/` (or a subdomain like `app.yourdomain.com`).
The included `.htaccess` makes page refreshes work. Login: company code + owner/manager mobile or email + password.

## 3. Mobile app (Android + iOS)

```bash
cd mobile
npm install --legacy-peer-deps
cp .env.example .env               # EXPO_PUBLIC_API_URL=https://yourdomain.com/api
npx expo start                     # scan with Expo Go for a quick look
```
Background location, maps and biometrics need a development/production build:
```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview      # installable APK for testing
npx eas-cli@latest build -p all --profile production       # Play Store AAB + App Store IPA
npx eas-cli@latest submit -p android   /   -p ios
```
Set your API URL in `eas.json` (`EXPO_PUBLIC_API_URL`) and the `bundleIdentifier` / `package` in `app.json` before the first store build.
For Android maps add a Google Maps API key under `android.config.googleMaps.apiKey` in `app.json`.

## Local development

```bash
# API (needs MySQL/MariaDB)
cd backend && cp config/config.example.php config/config.php   # edit DB + jwt_secret, base_path '' , debug true
php database/seed.php
php -S 0.0.0.0:8080 -t public public/index.php

# Admin
cd admin && echo "VITE_API_URL=http://127.0.0.1:8080" > .env.local && npm run dev

# App
cd mobile && echo "EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8080" > .env && npx expo start
```
Demo logins (company `KESHAV`): owner 9800011220 / admin123 · employees 9800011221–26 (OTP from `storage/logs/otp.log`).

## What's in each screen (from the design)

**Mobile:** splash · OTP login · 9 languages · home (punch card, counters, today's tasks) · my tasks (to me / by me / team) ·
task detail (checklist, attachments, voice notes, comments, extension request) · delegate task (voice note, file, checklist,
WhatsApp, reminder, repeat with rotation) · speak a task (Hindi/Hinglish) · complete with photo/location/file/link proof ·
punch in/out with selfie + geofence · attendance calendar · apply leave with handover · manager approvals · timesheet timer ·
calendar · chat with voice messages & shared tasks · notifications · goals · performance & leaderboard · team map ·
AI suggested tasks · profile & settings (language, App/WhatsApp alerts, location consent, biometric lock).

**Admin:** dashboard · tasks (list / board / calendar + delegate drawer) · recurring tasks · goals · campaigns board ·
employees & departments · attendance register + payroll export · leave approvals & policy · live location map ·
performance & Star of the Month · reports with Excel export · settings & integrations.

## API overview
All routes are JSON, `Authorization: Bearer <token>`. See `backend/src/routes.php` for the full list
(≈90 endpoints: `/auth/*`, `/home`, `/tasks/*`, `/recurring/*`, `/attendance/*`, `/location/*`, `/requests/*`,
`/leave/*`, `/timesheet/*`, `/calendar`, `/chat/*`, `/notifications`, `/goals`, `/campaigns`, `/performance`,
`/ai/suggestions`, `/dashboard`, `/reports/*`, `/employees`, `/departments`, `/settings`, `/files/{id}`, `/webhooks/whatsapp`).
