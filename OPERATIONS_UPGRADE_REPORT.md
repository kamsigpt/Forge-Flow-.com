# Forge Flow operations upgrade report

Updated: 26 October 2026

## Audit summary

Forge Flow is a Vite static application with browser-side JavaScript and Supabase Auth/Postgres. Its app pages use static HTML tables, browser-held sample records, and a generic `module_records` JSONB table for user changes. The SQL schema also defines normalized products, inventory, BOM, manufacturing orders, material consumption, finished-goods receipts, machines, maintenance requests, and audit logs. The authenticated screens currently do not use those normalized tables for their core workflows, so the normalized schema is not proof that transactions between modules are live.

Existing strengths include company-scoped row-level security for `module_records`, data-driven report helpers, explicit manufacturing/maintenance status maps, audit trail helpers, and a light internal topbar/sidebar treatment in the current working tree. The public landing page was left untouched.

## Findings and changes

- Production status dropdowns offered jumps that conflict with the lifecycle rules. Manufacturing changes now reject unknown current states and transitions outside the defined map.
- New and edited module records now run the existing field validators before saving. Manufacturing output cannot exceed planned quantity and rejected output cannot exceed produced output.
- Record saves now wait for the Supabase upsert when a company context exists. A failed backend write leaves the pane open and reports an error instead of showing a false success. A missing company context retains the existing local workspace behaviour.
- Successful record creation and updates retain a capped change history with actor, timestamp, summary, and changed fields. Status edits are also added to this client-side history.
- The dashboard now derives operational issue rows from the shared snapshot helper and shows open issue, delayed order, material shortage, and overdue maintenance counts. Unverified trend figures were removed from the KPI cards.
- The Zoho sample credentials in `.env.example` were replaced with placeholders. `.env` remains ignored by Git.
- The authenticated navigation/topbar visual treatment in the working tree is white with a faint blue divider and a restrained selected state. Landing page files were not changed.

## Operational rules represented in the app

- Manufacturing orders use the existing `Pending → Approved → In Production → Packed → Shipped → Delivered` map, with `On Hold` and `Cancelled` branches. Terminal states cannot be reopened by a direct status jump.
- Progress is based on accepted recorded output (`produced - rejected`) against planned quantity. Production output entry is not yet connected to a transaction-backed completion workflow.
- Inventory health distinguishes on-hand, reserved, available, and reorder threshold. Material shortage estimates compare open order BOM demand against available stock, matching material names and units from current browser records.
- Maintenance alerts are derived from open maintenance records and estimated end dates. Equipment assignments and maintenance windows are not checked against a normalized machine schedule.
- Dashboard issue rows are calculated from current module records; the issue list is a live view, not a persisted acknowledgement/resolution workflow.

## Data integrity and security limits

- User-authored generic module records are scoped by company through Supabase RLS and the app filters by the active company ID.
- The browser-only demo fixtures and local module data do not receive database transaction or server-side business-rule protection.
- Inventory stock can still be edited as a record rather than through a complete immutable movement ledger. Reservations, consumption, and finished goods are not updated atomically by the current screens.
- Permission controls for team roles are primarily client-side. They are not a substitute for server-side role authorization. Company RLS limits tenant access but does not enforce per-role operational capabilities.
- Client-side audit history is editable with the record; it is not a tamper-resistant security audit log.
- The prior Zoho values looked credential-like. If they were active credentials, rotate them in the provider and remove them from repository history through the team's secret-remediation process.
- Authentication and table RLS use Supabase. No new production database migrations were applied.

## Verification status

The baseline Node test suite and Vite build were initially blocked in the sandbox by Windows `spawn EPERM`. After running outside that restriction, the production build passed and all 11 operational helper tests passed. `node --check` passed for `js/app.js` and `js/operations.js`, and `git diff --check` reported no whitespace errors. No browser automation or safe development Supabase project is configured here, so authenticated end-to-end and persisted database workflow verification remains outstanding.

## Recommended next steps

1. Add database RPCs/transactions for order release, reservations, consumption, production receipts, stock adjustments, cancellation, and reversals.
2. Migrate the authenticated manufacturing and inventory screens from generic JSON records to normalized tables without discarding existing JSON records.
3. Enforce role capabilities in Postgres policies or authenticated server-side functions; stop treating local invited-user identities as authentication.
4. Persist operational issues with acknowledgement and resolution history, and connect each action to the source record.
5. Add integration and browser journey tests against a safe Supabase development project, then perform desktop/tablet/mobile visual verification.
