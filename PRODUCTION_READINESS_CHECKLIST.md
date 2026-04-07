# ForgeFlow Production Readiness Checklist (Execution Order)

## Gate 0 - Freeze and Baseline
- [ ] Create a release branch and tag the current commit.
- [ ] Take full database backup (schema + data snapshot).
- [ ] Enable error tracking and log retention policy.
- [ ] Define rollback trigger and rollback owner.

## Gate 1 - Environment and Secrets
- [ ] Set production env vars for frontend (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- [ ] Set edge-function secrets (`SUPABASE_SERVICE_ROLE_KEY`, `OAUTH_STATE_SECRET`, provider client secrets).
- [ ] Rotate any previously exposed keys and invalidate old values.
- [ ] Enforce separate dev/staging/prod Supabase projects.

## Gate 2 - Database Security and Tenant Isolation
- [x] Add tenant-scoped helpers (`current_company_id`, `is_company_member`).
- [x] Replace permissive RLS with company-scoped policies across core tables.
- [x] Add `users.auth_id` uniqueness.
- [x] Add `companies.owner_auth_id` ownership model.
- [x] Add `module_records` table for module engine persistence.
- [x] Add integration RLS policies and indexing.
- [x] Add `webhook_configs(company_id)` uniqueness for safe upserts.
- [x] Add `module_records` `updated_at` trigger.
- [ ] Run schema migration in staging, then production with migration logs.
- [ ] Validate RLS with cross-tenant access tests (must fail by default).

## Gate 3 - Auth and Session Hardening
- [x] Remove demo bypass from `login.html`, `signup.html`, and `js/landing.js`.
- [x] Require real Supabase session and user profile context.
- [x] Bootstrap user/company workspace if missing during auth onboarding.
- [x] Redirect signed-out users to login.
- [ ] Enforce email verification policy in Supabase Auth settings.
- [ ] Add rate-limiting / bot protection for login/signup.

## Gate 4 - Module Engine and Storage Reliability
- [x] Add backend hydration cache for module records.
- [x] Persist record edits to `module_records` via upsert.
- [x] Add server fetch fallback for missing local record data.
- [x] Make pane open flow async-aware for backend fetch.
- [x] Stop writing record overrides on view-open (prevents accidental data mutation).
- [x] Add capture-phase action binding for View/Edit across modules.
- [ ] Add server-side validation for module payload shape per module type.
- [ ] Add optimistic concurrency/version checks on record updates.

## Gate 5 - Integrations Security
- [x] Harden OAuth URL endpoint with authenticated user lookup and signed state.
- [x] Harden OAuth callback with state signature/expiry validation.
- [x] Resolve provider naming mismatch (`gsheets`).
- [x] Restrict integration token writes by tenant context.
- [ ] Add token encryption-at-rest strategy (if not using managed encryption controls).
- [ ] Add provider-specific webhook signature verification.

## Gate 6 - Frontend Stability and UX Correctness
- [x] Consolidate app init into a single bootstrap path.
- [x] Remove duplicate/demo DOMContentLoaded session initializer.
- [x] Stabilize dashboard chart rendering (fixed wrappers + resize handling).
- [x] Ensure View/Edit buttons resolve full entry records in all modules.
- [ ] Run full manual regression checklist on each module (create/view/edit/status/update/export/import).

## Gate 7 - Observability and Operations
- [ ] Add centralized frontend error monitoring (Sentry or equivalent).
- [ ] Add edge-function structured logging and alerting thresholds.
- [ ] Create runbook for auth outage, DB outage, and integration provider outage.
- [ ] Define on-call and incident communication process.

## Gate 8 - Pre-Launch Validation
- [ ] Run staging smoke tests with production-like data volume.
- [ ] Run security checks (auth bypass, broken access control, secret leakage).
- [ ] Execute backup restore drill and verify recovery time objective.
- [ ] Perform final stakeholder sign-off (engineering + product + ops).

## Gate 9 - Launch and Post-Launch
- [ ] Deploy during approved change window.
- [ ] Monitor errors, auth success rate, API latency, and DB performance for first 24 hours.
- [ ] Keep rollback plan armed until stability window closes.

## Current Status Summary (as of 2026-04-03)
- Build status: `PASS` (`npm run build` completed successfully).
- Critical auth/demo bypass removal: `DONE`.
- Tenant isolation and module storage backend foundation: `DONE`.
- Remaining blockers before true live launch: production env/secret rollout, staged migration execution, RLS verification tests, monitoring/incident readiness, and final regression/security sign-off.
