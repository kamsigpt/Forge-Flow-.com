-- ============================================
-- NOTIFICATIONS (workspace activity feed synced to Supabase)
-- Apply this in the Supabase SQL editor.
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE DEFAULT public.current_company_id(),
    type TEXT NOT NULL DEFAULT 'system',
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon_type TEXT NOT NULL DEFAULT 'system',
    module_id TEXT,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_company
ON notifications FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE INDEX IF NOT EXISTS idx_notifications_company_created
ON notifications(company_id, created_at DESC);
