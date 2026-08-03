-- ============================================
-- TEAM MEMBERS (admin invites loggable users; same-password team login)
-- Apply this in the Supabase SQL editor.
-- ============================================

CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    role_id TEXT,
    role_name TEXT DEFAULT 'Team Member',
    status TEXT DEFAULT 'Active',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, email)
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_members_company
ON team_members FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE INDEX IF NOT EXISTS idx_team_members_company ON team_members(company_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(LOWER(email));

-- Pre-auth lookup used by the login page to validate team member credentials.
-- SECURITY DEFINER so it works before a session exists; only returns the
-- admin email for the member's company, never any passwords.
CREATE OR REPLACE FUNCTION public.get_team_member_for_login(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'email', tm.email,
        'name', tm.name,
        'admin_email', (
            SELECT u.email
            FROM public.users u
            WHERE u.company_id = tm.company_id
              AND LOWER(COALESCE(u.role, '')) IN ('admin', 'superadmin', 'owner')
            LIMIT 1
        ),
        'role_name', tm.role_name
    ) INTO result
    FROM public.team_members tm
    WHERE LOWER(tm.email) = LOWER(p_email)
    LIMIT 1;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_member_for_login(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_team_members_updated_at ON team_members;
CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON team_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
