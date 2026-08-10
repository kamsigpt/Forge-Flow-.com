-- ============================================
-- PAYMENTS + SUBSCRIPTIONS (Paystack)
-- Apply this in the Supabase SQL editor.
-- ============================================

CREATE TABLE IF NOT EXISTS payments (
    reference TEXT PRIMARY KEY,
    email TEXT NOT NULL DEFAULT '',
    plan TEXT,
    billing TEXT NOT NULL DEFAULT 'monthly',
    amount BIGINT NOT NULL DEFAULT 0,
    usd_amount BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'pending',
    channel TEXT,
    customer_code TEXT,
    paid_at TIMESTAMPTZ,
    paystack_response JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    plan TEXT NOT NULL,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly',
    amount BIGINT NOT NULL DEFAULT 0,
    usd_amount BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'inactive',
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    last_payment_reference TEXT,
    last_payment_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_payments_email ON payments(email);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_email ON subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own payment history / subscription.
CREATE POLICY payments_own_read
ON payments FOR SELECT
USING (LOWER(email) = LOWER(auth.jwt() ->> 'email'));

CREATE POLICY subscriptions_own_read
ON subscriptions FOR SELECT
USING (LOWER(email) = LOWER(auth.jwt() ->> 'email'));

-- Edge functions use the service role key (bypasses RLS), so no write
-- policies are needed for anon/authenticated roles.
REVOKE ALL ON payments FROM anon;
REVOKE ALL ON subscriptions FROM anon;
