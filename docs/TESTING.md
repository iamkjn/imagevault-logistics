# Verification and production acceptance

## Verified locally

- Production compilation and TypeScript checks.
- Automated unit/security tests for folders, naming/timezones, real EXIF fixture parsing, capture-source rules, order-label extraction, encryption, access rules, CSV safety and multipart size limits.
- Browser inspection of the populated demo dashboard, gallery search, image preview, upload screen, smart review, Misc filter and folder explorer; screenshots saved under `docs/screenshots`.
- Dependency audit after updating vulnerable dependencies reported zero known vulnerabilities at installation time. Re-run `npm audit` in release CI because advisories change.

No live Google OAuth client or PostgreSQL connection was supplied. Actual OAuth consent, database migrations against a running server, Drive writes, account approval end-to-end, mobile camera access, and reconnect uploads have **not** been verified against live services. Do not treat demo behavior or mocks as proof of those integrations.

## Phase 1 — Authentication and access

Built: Google OAuth, explicit Drive-consent explanation, AES-256-GCM token storage, first-admin bootstrap, pending/disabled states, JWT session and authoritative database checks.

Test: sign in as the first configured admin; sign in as a second user and verify pending access; approve that user; verify users cannot open admin pages/API endpoints or read others’ images; disable a signed-in user and verify the next API request fails. Confirm API responses contain no access/refresh tokens or encrypted token fields.

## Phase 2 — Drive upload and folder logic

Built: category/year/date folders plus Misc, cache/recovery lookup, PostgreSQL advisory locking, validated multipart uploads, Sharp normalization, encrypted owner credentials, quota retry/backoff, reserved file IDs and payload hashes for safe retries. Reviewed EXIF/OCR metadata is included in the idempotency hash.

Test: upload all four categories; upload concurrently into a new date folder and check that only one folder per path exists; simulate a timeout immediately after Drive creation and retry the same queue item; check that only one Drive file and metadata row exist. Retry with a different payload under the same UUID and expect a conflict. Test midnight/year boundaries and a non-UK timezone. Revoke Drive consent and verify the reconnect message. Validate actual invalid-image/oversize rejection, not only client-side errors.

## Phase 3 — Staff pages

Built: separate gallery and camera actions, drop zone, multiple files, browser-local EXIF parsing and OCR, review/edit cards, automatic date filing, Misc fallback, HEIC conversion, 1920px compression, per-file progress and retry, persistent account-bound queue, searchable upload history and previews.

Test on physical mobile devices: capture from the rear camera and confirm the camera action time is used; select gallery photos from iPhone, Android and common camera vendors and confirm `DateTimeOriginal` and timezone offsets; verify metadata-free and ambiguous images route to Misc. Compare OCR suggestions with printed, handwritten, blurred and low-light labels and always review before upload. Convert representative iPhone HEIC files, submit 15 MB originals, switch offline while the page is open, reconnect, and reopen a closed page with queued items. Sign out and sign in as a different user: old queued items must not be submitted under the new user’s account. Verify browser storage quota errors are understandable. Check 360px and 390px layouts, keyboard focus, dark mode and reduced motion.

## Phase 4 — Administration

Built: all-time and calendar KPI counts; range-filtered activity, category and user charts; daily table; date/Misc folder rollups; gallery filters/preview; order corrections; date-folder creation; CSV/ZIP; move-to-date, move-to-Misc and trash operations; account management and audit history.

Test: compare daily/category/user totals with database rows in the configured timezone; verify the Monday week boundary. Export CSV containing commas, quotes, newlines and formula-like notes. Download a ZIP within limits and check every image. Reject an oversized ZIP gracefully. Move images from Misc into new and existing date folders, move them back to Misc, and compare Drive parents, filenames and metadata. Correct order details and verify the Drive filename changes. Trash images and verify counts exclude them. Confirm every administrative mutation has an audit record.

## Phase 5 — Release

Built: responsive styles, dark mode, loading/error/empty states, accessible Radix dialogs, installable manifest/icon, explicit offline behavior, migration and setup guides, tests and screenshots.

Run `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, and `npm audit`. Deploy to an isolated staging project, then complete phases 1–4 with disposable Drive images and test accounts. Verify database backup restoration and handling of external Drive deletions. A durable cross-service reconciliation worker and high-volume load testing are not included; evaluate those requirements before large-scale rollout.
