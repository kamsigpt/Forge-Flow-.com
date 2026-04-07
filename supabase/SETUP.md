# Supabase Setup Guide for ForgeFlow

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Fill in the details:
   - **Name**: forgeflow
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose one closest to your users
4. Wait for the project to be created (2-3 minutes)

## Step 2: Run the Schema

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `supabase/schema.sql` that was created
4. Copy all the SQL and paste into the SQL Editor
5. Click **Run** to execute

## Step 3: Get Your API Credentials

1. Go to **Project Settings** (gear icon) → **API**
2. Copy these values:
   - **Project URL**: Save this for your app
   - **anon public key**: Save this for your app

## Step 4: Configure Your App

1. Copy `.env.example` to `.env`:
```
cp .env.example .env
```

2. Edit `.env` and add your Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Step 5: Using Supabase in Your App

The Supabase client is already set up in `js/supabase.js`.

In your JavaScript code, you can now use:

```javascript
import { supabase, signIn, signUp, signOut } from './js/supabase.js'

// Sign up
const { data, error } = await signUp('user@email.com', 'password')

// Sign in
const { data, error } = await signIn('user@email.com', 'password')

// Sign out
await signOut()
```

## Database Overview

| Table | Purpose |
|-------|---------|
| `companies` | Multi-tenant organizations |
| `users` | User accounts linked to auth |
| `warehouses` | Warehouse locations |
| `products` | Items (raw materials, components, finished goods) |
| `inventory` | Stock levels per warehouse |
| `bills_of_materials` | BOM definitions with versions |
| `suppliers` | Vendor/supplier records |
| `purchase_orders` | PO from suppliers |
| `sales_orders` | Customer orders |
| `manufacturing_orders` | Production orders |
| `mo_operations` | Production stages/steps |
| `material_consumptions` | Materials used in production |
| `machines` | Equipment registry |
| `maintenance_requests` | Equipment maintenance |
| `audit_logs` | Full transaction history |

## Next Steps

- Set up Supabase Authentication (email/password login)
- Connect your app to Supabase
- Start building CRUD operations for each entity

---

# Integration Setup Guide

ForgeFlow supports real-time integration with popular business apps via OAuth 2.0.

## Supported Integrations

| Provider | Features |
|----------|----------|
| **Shopify** | Sync products, orders, and inventory |
| **Google Sheets** | Export data to spreadsheets |
| **Zoho Suite** | CRM, Books, Projects sync |
| **QuickBooks** | Accounting sync |
| **Xero** | Cloud accounting sync |
| **Webhooks** | Custom HTTP integrations |

## Step 1: Enable Edge Functions

1. Go to Supabase Dashboard → **Edge Functions**
2. Enable Edge Functions for your project
3. Deploy the integration functions from `supabase/functions/integrations/`

```bash
supabase functions deploy integrations/auth-callback
supabase functions deploy integrations/auth-url
supabase functions deploy integrations/shopify-sync
supabase functions deploy integrations/gsheets-sync
supabase functions deploy integrations/webhook-sender
```

## Step 2: Configure API Credentials

Set these environment variables in your Supabase project (Settings → Edge Functions → Secrets):

### Google Sheets

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google Sheets API** and **Google Drive API**
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URI: `https://your-project.supabase.co/functions/v1/integrations/auth-callback`

```bash
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=https://your-project.supabase.co/functions/v1/integrations/auth-callback
```

### Shopify

1. Create a Shopify Partner account at [partners.shopify.com](https://partners.shopify.com)
2. Create a new app
3. Configure OAuth redirect: `https://your-app.com/functions/v1/integrations/auth-callback`
4. Install the app on your development store

```bash
SHOPIFY_API_KEY=your-api-key
SHOPIFY_API_SECRET=your-api-secret
SHOPIFY_CALLBACK_URL=https://your-app.com/functions/v1/integrations/auth-callback
```

### Zoho

1. Go to [Zoho Developer Console](https://console.zoho.com/)
2. Create a new client application
3. Set redirect URI: `https://your-project.supabase.co/functions/v1/integrations/auth-callback`

```bash
ZOHO_CLIENT_ID=your-client-id
ZOHO_CLIENT_SECRET=your-client-secret
ZOHO_REDIRECT_URI=https://your-project.supabase.co/functions/v1/integrations/auth-callback
```

### QuickBooks

1. Go to [Intuit Developer](https://developer.intuit.com/)
2. Create a new app (QuickBooks Online)
3. Configure redirect URI

```bash
QUICKBOOKS_CLIENT_ID=your-client-id
QUICKBOOKS_CLIENT_SECRET=your-client-secret
QUICKBOOKS_CALLBACK_URL=https://your-project.supabase.co/functions/v1/integrations/auth-callback
```

### Xero

1. Go to [Xero Developer Center](https://developer.xero.com/)
2. Create a new app
3. Set redirect URI

```bash
XERO_CLIENT_ID=your-client-id
XERO_CLIENT_SECRET=your-client-secret
XERO_REDIRECT_URI=https://your-project.supabase.co/functions/v1/integrations/auth-callback
```

## Step 3: Update Database Schema

Run the SQL commands in `supabase/schema.sql` to create the integration tables:

```sql
-- This is already included in the schema.sql file:
-- - integration_tokens (OAuth tokens storage)
-- - integration_logs (Sync history)
-- - webhook_configs (Webhook settings)
```

## Step 4: Configure Your App

Add the integration module to your app:

```html
<script type="module" src="js/integrations.js"></script>
```

## Webhooks (No OAuth Required)

Webhooks work differently - they send HTTP POST requests to your server when events occur.

### Setting Up Webhooks

1. In ForgeFlow, go to **Integrations** → **Webhooks**
2. Enter your webhook URL (e.g., `https://your-server.com/webhook`)
3. Select events to send:
   - Manufacturing events (order created, completed)
   - Inventory events (low stock, updates)
   - Order events (created, shipped)
4. Save

### Webhook Payload Format

```json
{
  "event": "inventory_low",
  "timestamp": "2024-01-15T10:30:00Z",
  "company_id": "uuid",
  "data": {
    "product_id": "uuid",
    "product_name": "Aluminium Sheet",
    "current_stock": 12,
    "min_stock": 50
  }
}
```

### Webhook Verification

If you set a webhook secret, ForgeFlow will sign payloads:

```
X-ForgeFlow-Signature: sha256=abc123...
X-ForgeFlow-Timestamp: 2024-01-15T10:30:00Z
```

Verify in your server:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, timestamp, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp + '.' + payload)
    .digest('hex');
  return signature === expected;
}
```

## Testing Integrations

1. Start your local development server
2. Open browser DevTools → Console
3. Click "Connect" on any integration
4. Check console for OAuth redirect or error messages

## Integration Status

Integrations store their state in:
- `localStorage.forgeflow_integrations` (frontend backup)
- `integration_tokens` table (Supabase - primary)
