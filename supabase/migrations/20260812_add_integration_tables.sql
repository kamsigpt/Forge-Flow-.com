-- ForgeFlow integration tables + support functions
-- Mirrors the INTEGRATIONS section of supabase/schema.sql but is safe to run
-- against an existing database that already has the business tables.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- SUPPORT FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT u.company_id
  FROM public.users u
  WHERE u.auth_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(target_company UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_id = auth.uid()
      AND u.company_id = target_company
  )
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- INTEGRATION TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS integration_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE DEFAULT public.current_company_id(),
    provider TEXT NOT NULL CHECK (provider IN ('zoho', 'shopify', 'quickbooks', 'xero', 'gsheets', 'slack', 'amazon', 'zapier')),
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    token_type TEXT DEFAULT 'Bearer',
    scope TEXT,
    settings JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, provider)
);

-- ============================================
-- INTEGRATION LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS integration_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE DEFAULT public.current_company_id(),
    integration_id UUID REFERENCES integration_tokens(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('connect', 'disconnect', 'sync', 'error', 'webhook', 'test')),
    status TEXT NOT NULL CHECK (status IN ('success', 'error', 'pending')),
    request_data JSONB,
    response_data JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- WEBHOOK CONFIG
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE DEFAULT public.current_company_id(),
    webhook_url TEXT NOT NULL,
    webhook_secret TEXT,
    events JSONB DEFAULT '[]',
    headers JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id)
);

-- ============================================
-- MODULE RECORDS (generic persistence used by the app)
-- ============================================
CREATE TABLE IF NOT EXISTS module_records (
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE DEFAULT public.current_company_id(),
    module_key TEXT NOT NULL,
    record_id TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (company_id, module_key, record_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integration_tokens_company ON integration_tokens(company_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_company ON integration_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created ON integration_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_company ON webhook_configs(company_id);
CREATE INDEX IF NOT EXISTS idx_module_records_company_module ON module_records(company_id, module_key);

-- RLS
ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_tokens_company ON integration_tokens;
CREATE POLICY integration_tokens_company
ON integration_tokens FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS integration_logs_company ON integration_logs;
CREATE POLICY integration_logs_company
ON integration_logs FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS webhook_configs_company ON webhook_configs;
CREATE POLICY webhook_configs_company
ON webhook_configs FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

DROP POLICY IF EXISTS module_records_company ON module_records;
CREATE POLICY module_records_company
ON module_records FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

-- Triggers
DROP TRIGGER IF EXISTS update_integration_tokens_updated_at ON integration_tokens;
CREATE TRIGGER update_integration_tokens_updated_at BEFORE UPDATE ON integration_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_webhook_configs_updated_at ON webhook_configs;
CREATE TRIGGER update_webhook_configs_updated_at BEFORE UPDATE ON webhook_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_module_records_updated_at ON module_records;
CREATE TRIGGER update_module_records_updated_at BEFORE UPDATE ON module_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
