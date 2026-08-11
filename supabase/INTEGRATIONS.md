# ForgeFlow Integrations — Backend Setup Guide

This guide walks you through deploying the ForgeFlow integration backend (Supabase
Edge Functions) and connecting Zoho, Google Sheets, Shopify, QuickBooks, Xero and
custom webhooks.

## Architecture overview

| Piece | Location |
|-------|----------|
| OAuth auth URL generation | `supabase/functions/integrations/auth-url.ts` |
| OAuth callback / token storage | `supabase/functions/integrations/auth-callback.ts` |
| Google Sheets sync | `supabase/functions/integrations/gsheets-sync.ts` |
| Shopify sync | `supabase/functions/integrations/shopify-sync.ts` |
| Zoho sync | `supabase/functions/integrations/zoho-sync.ts` |
| Outgoing webhooks | `supabase/functions/integrations/webhook-sender.ts` |
| Token / log / webhook tables | `supabase/schema.sql` |
| Extra sync columns | `supabase/migrations/20260811_add_integration_metadata.sql` |

Flow:

1. User clicks **Connect** in the app.
2. The app calls `integrations/auth-url` (edge function) with the user's JWT.
3. The edge function builds the provider OAuth URL and signs an `OAuth state`
   containing `companyId`, `userId`, and the `redirectUrl` to return to.
4. User approves on the provider. The provider redirects the browser to
   `integrations/auth-callback` with `code` + `state`.
5. The callback exchanges the code for tokens, upserts them into
   `integration_tokens`, logs to `integration_logs`, then **redirects the browser
   back to the app** (`?integration=zoho&status=success`).
6. The app UI updates the card to "Connected".

## Prerequisites

- Supabase CLI installed: `supabase --version`
- The CLI logged in to your Supabase account: `supabase login`
- Your project linked: `supabase link --project-ref secaghvmfkujeciiapav`

> The project is already linked in `supabase/.temp/linked-project.json`. If you
> want to use a different project, run `supabase link` again.

## Step 1 — Apply the database schema

If you have not already:

1. Open **Supabase Dashboard → SQL Editor**.
2. Run the contents of `supabase/schema.sql`.
3. Run `supabase/migrations/20260811_add_integration_metadata.sql`
   (adds the `metadata` column to `products` and `sales_orders`, which the
   Shopify/Zoho sync functions write to).

## Step 2 — Configure the edge functions

`supabase/config.toml` already declares the project. The one setting that matters
is that `integrations/auth-callback` runs with `verify_jwt = false` — the OAuth
provider redirects the browser straight to it with no `Authorization` header.

Deploy all integration functions:

```bash
supabase functions deploy integrations/auth-url
supabase functions deploy integrations/auth-callback
supabase functions deploy integrations/gsheets-sync
supabase functions deploy integrations/shopify-sync
supabase functions deploy integrations/zoho-sync
supabase functions deploy integrations/webhook-sender
```

You can deploy them all with a single command:

```bash
supabase functions deploy
```

## Step 3 — Set the secrets

Create a developer app for each provider you want to use (see Step 4), then set
the secrets:

```bash
# Zoho
supabase secrets set ZOHO_CLIENT_ID=...
supabase secrets set ZOHO_CLIENT_SECRET=...
supabase secrets set ZOHO_REDIRECT_URI=https://secaghvmfkujeciiapav.supabase.co/functions/v1/integrations/auth-callback

# Google Sheets
supabase secrets set GOOGLE_CLIENT_ID=...
supabase secrets set GOOGLE_CLIENT_SECRET=...
supabase secrets set GOOGLE_CALLBACK_URL=https://secaghvmfkujeciiapav.supabase.co/functions/v1/integrations/auth-callback

# Shopify
supabase secrets set SHOPIFY_API_KEY=...
supabase secrets set SHOPIFY_API_SECRET=...
supabase secrets set SHOPIFY_CALLBACK_URL=https://secaghvmfkujeciiapav.supabase.co/functions/v1/integrations/auth-callback

# QuickBooks
supabase secrets set QUICKBOOKS_CLIENT_ID=...
supabase secrets set QUICKBOOKS_CLIENT_SECRET=...
supabase secrets set QUICKBOOKS_CALLBACK_URL=https://secaghvmfkujeciiapav.supabase.co/functions/v1/integrations/auth-callback

# Xero
supabase secrets set XERO_CLIENT_ID=...
supabase secrets set XERO_CLIENT_SECRET=...
supabase secrets set XERO_REDIRECT_URI=https://secaghvmfkujeciiapav.supabase.co/functions/v1/integrations/auth-callback

# OAuth state signing key (any long random string — protects against CSRF)
supabase secrets set OAUTH_STATE_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
```

Or paste the same values in the dashboard under
**Project Settings → Edge Functions → Secrets**.

## Step 4 — Create the provider apps

### Zoho

1. Go to the [Zoho API Console](https://api-console.zoho.com/).
2. **Create Client → Self Client** (or a Server-based app for web flow).
3. Add the redirect URI:
   `https://secaghvmfkujeciiapav.supabase.co/functions/v1/integrations/auth-callback`
4. Note the **Client ID** and **Client Secret**.
5. Scopes used by ForgeFlow:
   `ZohoCRM.users.ALL, ZohoCRM.org.ALL, ZohoCRM.contacts.READ, ZohoBooks.contacts.READ, ZohoBooks.contacts.CREATE, ZohoBooks.invoices.READ, ZohoBooks.invoices.CREATE, ZohoProjects.tasks.WRITE`

> Zoho Books operations need an **organization id**. The first Zoho sync call
> auto-detects it from your CRM org. If auto-detection fails, call the
> `get_organization` action from the sync function and it will save it.

### Google Sheets

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and enable the **Google Sheets API** and **Google Drive API**.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application**.
4. Add authorized redirect URI:
   `https://secaghvmfkujeciiapav.supabase.co/functions/v1/integrations/auth-callback`
5. Note the **Client ID** and **Client Secret**.

### Shopify

1. Create an app in [Shopify Partners](https://partners.shopify.com) (or your store's
   **Settings → Apps and sales channels → Develop apps**).
2. Scopes: `read_products, write_products, read_orders, write_orders`.
3. Add the OAuth redirect URL:
   `https://secaghvmfkujeciiapav.supabase.co/functions/v1/integrations/auth-callback`
4. Note the **API key** and **API secret key**.

### QuickBooks

1. Go to [Intuit Developer](https://developer.intuit.com/).
2. Create an app → **QuickBooks Online**.
3. Add redirect URI:
   `https://secaghvmfkujeciiapav.supabase.co/functions/v1/integrations/auth-callback`
4. Note the **Client ID** and **Client Secret**.

### Xero

1. Go to [Xero Developer Center](https://developer.xero.com/).
2. Create an app → **Web app**.
3. Add redirect URI:
   `https://secaghvmfkujeciiapav.supabase.co/functions/v1/integrations/auth-callback`
4. Note the **Client ID** and **Client Secret**.

## Step 5 — Verify the callback is reachable

After deploying, the callback must respond with a redirect (not a 401). Check it:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://secaghvmfkujeciiapav.supabase.co/functions/v1/integrations/auth-callback"
```

- `303` or `404` → JWT verification is correctly off (404 just means no state/code).
- `401` → the `verify_jwt = false` override did not apply. Fix `supabase/config.toml`
  under `[functions."integrations/auth-callback"]` and redeploy. There is a known
  CLI bug where the setting is ignored when a function is *updated*; if so, force it
  with the Management API:

  ```bash
  curl -X PATCH "https://api.supabase.com/v1/projects/secaghvmfkujeciiapav/functions/integrations%2Fauth-callback" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"verify_jwt": false}'
  ```

  You can also toggle it in the dashboard: **Edge Functions → integrations/auth-callback → Details → Verify JWT**.

## Step 6 — Connect from the app

1. Start the app (`npm run dev`) and sign in.
2. Go to **Integrations**.
3. Click **Connect** on a provider. You will be redirected to the provider, then
   back to the app with the card showing **Connected**.
4. Sync actions:
   - **Google Sheets**: use `list_spreadsheets`, `export_inventory`,
     `export_orders`, `export_mfg`.
   - **Zoho**: use `test`, `list_contacts`, `list_invoices`,
     `export_sales_orders` (creates Zoho Books invoices from confirmed+ sales orders).
   - **Shopify**: use `get_products`, `get_orders`, `update_inventory`,
     `sync_products`, `sync_orders`.

Sync actions are triggered through `js/integrations.js`:

```javascript
import { IntegrationService } from './js/integrations.js';

const result = await IntegrationService.sync('gsheets', 'export_inventory', {
  spreadsheetId: '...',
  sheetName: 'Inventory',
});
```

## Step 7 — Webhooks

Webhooks don't need OAuth. Configure them in the app at
**Integrations → Webhooks**:

1. Enter your endpoint URL (e.g. `https://your-server.com/webhook`).
2. Optionally set a secret (payloads get signed with HMAC-SHA256).
3. Tick the events to receive.
4. Save, then **Test**.

Your endpoint will receive:

```json
{
  "event": "inventory_low",
  "timestamp": "2026-08-11T10:30:00Z",
  "company_id": "uuid",
  "data": { "product_id": "uuid", "current_stock": 12, "min_stock": 50 }
}
```

with headers `X-ForgeFlow-Event`, `X-ForgeFlow-Timestamp`, and
`X-ForgeFlow-Signature` (hex HMAC-SHA256 of the raw body) when a secret is set.

Verify the signature:

```javascript
const crypto = require('crypto');
function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex');
  return signature === expected;
}
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Callback URL returns 401 | `verify_jwt` not disabled; check `[functions."integrations/auth-callback"]` in `config.toml` and redeploy. |
| `Invalid redirect_uri` from provider | The registered redirect URI in the provider console must exactly match the secret `*_CALLBACK_URL` / `*_REDIRECT_URI`. |
| `OAuth state expired` | Re-try the connect; state is valid for 10 minutes. |
| Sync fails with `Missing provider secret` | `supabase secrets set <PROVIDER>_...` then redeploy or retry (secrets apply at deploy time for local serve). |
| Zoho `no_valid_connection` / org error | Run the `get_organization` action to save the org id, or set `organization_id` in the Zoho integration settings. |
| Shopify `Missing shop domain` | Ensure the `SHOPIFY_DEFAULT_SHOP` secret is set or pass the store domain during connect. |

## Frontend wiring (already done)

- `js/integrations.js` — `IntegrationService` (auth URLs, connect/disconnect,
  status, sync, webhooks, OAuth callback parsing).
- `js/app.js` — `connectIntegration`, `disconnectIntegration`,
  `refreshIntegrationStatuses`, `handleIntegrationOAuthCallback`,
  `saveWebhookConfig`, `testWebhook`.
- `app.html` — Integrations module + Webhooks section.
