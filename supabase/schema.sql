CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    timezone TEXT DEFAULT 'UTC',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'operator' CHECK (role IN ('admin', 'manager', 'operator', 'viewer')),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(auth_id)
);

CREATE TABLE warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, code)
);

-- ============================================
-- BIN LOCATIONS (Within Warehouses)
-- ============================================
CREATE TABLE bin_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(warehouse_id, name)
);

-- ============================================
-- UNIT OF MEASURE (UOM)
-- ============================================
CREATE TABLE uoms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL,
    is_base BOOLEAN DEFAULT false,
    conversion_factor DECIMAL(12,4) DEFAULT 1,
    category TEXT DEFAULT 'count' CHECK (category IN ('count', 'weight', 'volume', 'length', 'time')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, abbreviation)
);

-- ============================================
-- PRODUCT CATEGORIES
-- ============================================
CREATE TABLE product_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES product_categories(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, name)
);

-- ============================================
-- PRODUCTS / ITEMS
-- ============================================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES product_categories(id),
    type TEXT DEFAULT 'finished_good' CHECK (type IN ('raw_material', 'component', 'finished_good', 'service')),
    uom_id UUID REFERENCES uoms(id),
    weight DECIMAL(10,2),
    dimensions JSONB,
    min_stock_level DECIMAL(12,4) DEFAULT 0,
    reorder_quantity DECIMAL(12,4),
    unit_cost DECIMAL(12,2),
    unit_price DECIMAL(12,2),
    is_active BOOLEAN DEFAULT true,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, sku)
);

-- ============================================
-- INVENTORY STOCK
-- ============================================
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
    bin_location_id UUID REFERENCES bin_locations(id),
    quantity DECIMAL(12,4) DEFAULT 0,
    reserved_quantity DECIMAL(12,4) DEFAULT 0,
    available_quantity GENERATED ALWAYS AS (quantity - reserved_quantity) STORED,
    lot_number TEXT,
    expiry_date DATE,
    last_counted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, product_id, warehouse_id, bin_location_id)
);

-- ============================================
-- BILL OF MATERIALS (BOM)
-- ============================================
CREATE TABLE bills_of_materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    wastage_percentage DECIMAL(5,2) DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, product_id, version)
);

-- ============================================
-- BOM LINE ITEMS (Materials)
-- ============================================
CREATE TABLE bom_line_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bom_id UUID REFERENCES bills_of_materials(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity DECIMAL(12,4) NOT NULL,
    uom_id UUID REFERENCES uoms(id),
    sequence_number INTEGER,
    is_sub_assembly BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SUPPLIERS / VENDORS
-- ============================================
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    payment_terms TEXT,
    lead_time_days INTEGER,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, code)
);

-- ============================================
-- PURCHASE REQUESTS
-- ============================================
CREATE TABLE purchase_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    pr_number TEXT NOT NULL,
    requested_by UUID REFERENCES users(id),
    department TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'ordered', 'partial', 'received', 'cancelled')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    required_date DATE,
    notes TEXT,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, pr_number)
);

-- ============================================
-- PURCHASE REQUEST LINE ITEMS
-- ============================================
CREATE TABLE purchase_request_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_request_id UUID REFERENCES purchase_requests(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity DECIMAL(12,4) NOT NULL,
    uom_id UUID REFERENCES uoms(id),
    estimated_unit_cost DECIMAL(12,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PURCHASE ORDERS
-- ============================================
CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    po_number TEXT NOT NULL,
    supplier_id UUID REFERENCES suppliers(id),
    purchase_request_id UUID REFERENCES purchase_requests(id),
    ordered_by UUID REFERENCES users(id),
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled', 'closed')),
    order_date DATE,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    subtotal DECIMAL(12,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    terms TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, po_number)
);

-- ============================================
-- PURCHASE ORDER LINE ITEMS
-- ============================================
CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
    purchase_request_item_id UUID REFERENCES purchase_request_items(id),
    product_id UUID REFERENCES products(id),
    quantity_ordered DECIMAL(12,4) NOT NULL,
    quantity_received DECIMAL(12,4) DEFAULT 0,
    unit_cost DECIMAL(12,2),
    line_total DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SALES ORDERS
-- ============================================
CREATE TABLE sales_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    so_number TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    ordered_by UUID REFERENCES users(id),
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'in_production', 'shipped', 'delivered', 'cancelled', 'on_hold')),
    order_date DATE,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    subtotal DECIMAL(12,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, so_number)
);

-- ============================================
-- SALES ORDER LINE ITEMS
-- ============================================
CREATE TABLE sales_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sales_order_id UUID REFERENCES sales_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity_ordered DECIMAL(12,4) NOT NULL,
    quantity_shipped DECIMAL(12,4) DEFAULT 0,
    unit_price DECIMAL(12,2),
    line_total DECIMAL(12,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MANUFACTURING ORDERS
-- ============================================
CREATE TABLE manufacturing_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    mo_number TEXT NOT NULL,
    sales_order_id UUID REFERENCES sales_orders(id),
    product_id UUID REFERENCES products(id),
    bom_id UUID REFERENCES bills_of_materials(id),
    quantity DECIMAL(12,4) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'released', 'in_progress', 'on_hold', 'quality_check', 'completed', 'cancelled')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    planned_start_date DATE,
    planned_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, mo_number)
);

-- ============================================
-- MO OPERATIONS (Production Stages)
-- ============================================
CREATE TABLE mo_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manufacturing_order_id UUID REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    estimated_minutes INTEGER,
    actual_minutes INTEGER,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
    operator_id UUID REFERENCES users(id),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MATERIAL CONSUMPTION (Production Tracking)
-- ============================================
CREATE TABLE material_consumptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manufacturing_order_id UUID REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    from_warehouse_id UUID REFERENCES warehouses(id),
    bin_location_id UUID REFERENCES bin_locations(id),
    quantity_used DECIMAL(12,4) NOT NULL,
    uom_id UUID REFERENCES uoms(id),
    wastage_quantity DECIMAL(12,4) DEFAULT 0,
    operation_id UUID REFERENCES mo_operations(id),
    consumed_by UUID REFERENCES users(id),
    consumed_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);

-- ============================================
-- FINISHED GOODS RECEIPT
-- ============================================
CREATE TABLE finished_goods_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manufacturing_order_id UUID REFERENCES manufacturing_orders(id),
    product_id UUID REFERENCES products(id),
    to_warehouse_id UUID REFERENCES warehouses(id),
    bin_location_id UUID REFERENCES bin_locations(id),
    quantity_produced DECIMAL(12,4) NOT NULL,
    quantity_rejected DECIMAL(12,4) DEFAULT 0,
    inspected_by UUID REFERENCES users(id),
    inspected_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MACHINES / EQUIPMENT
-- ============================================
CREATE TABLE machines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    machine_type TEXT,
    location TEXT,
    status TEXT DEFAULT 'operational' CHECK (status IN ('operational', 'maintenance', 'repair', 'offline')),
    hourly_rate DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, code)
);

-- ============================================
-- MAINTENANCE REQUESTS
-- ============================================
CREATE TABLE maintenance_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    machine_id UUID REFERENCES machines(id),
    request_number TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
    requested_by UUID REFERENCES users(id),
    assigned_to UUID REFERENCES users(id),
    scheduled_date DATE,
    completed_date DATE,
    estimated_cost DECIMAL(12,2),
    actual_cost DECIMAL(12,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, request_number)
);

-- ============================================
-- AUDIT LOG (Transaction History)
-- ============================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX idx_products_company ON products(company_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_warehouse ON inventory(warehouse_id);
CREATE INDEX idx_sales_orders_company ON sales_orders(company_id);
CREATE INDEX idx_purchase_orders_company ON purchase_orders(company_id);
CREATE INDEX idx_manufacturing_orders_company ON manufacturing_orders(company_id);
CREATE INDEX idx_manufacturing_orders_status ON manufacturing_orders(status);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
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

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bin_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE uoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills_of_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE manufacturing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE mo_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finished_goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_select
ON companies FOR SELECT
USING (
  id = public.current_company_id()
  OR owner_auth_id = auth.uid()
);

CREATE POLICY companies_insert_owner
ON companies FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND owner_auth_id = auth.uid()
);

CREATE POLICY companies_update_owner_or_member
ON companies FOR UPDATE
USING (
  id = public.current_company_id()
  OR owner_auth_id = auth.uid()
)
WITH CHECK (
  id = public.current_company_id()
  OR owner_auth_id = auth.uid()
);

CREATE POLICY users_select_company
ON users FOR SELECT
USING (company_id = public.current_company_id());

CREATE POLICY users_insert_self
ON users FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND auth_id = auth.uid()
  AND (
    company_id = public.current_company_id()
    OR EXISTS (
      SELECT 1
      FROM companies c
      WHERE c.id = company_id
        AND c.owner_auth_id = auth.uid()
    )
  )
);

CREATE POLICY users_update_company
ON users FOR UPDATE
USING (
  company_id = public.current_company_id()
)
WITH CHECK (
  company_id = public.current_company_id()
);

CREATE POLICY warehouses_company
ON warehouses FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY bin_locations_company
ON bin_locations FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM warehouses w
    WHERE w.id = warehouse_id
      AND w.company_id = public.current_company_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM warehouses w
    WHERE w.id = warehouse_id
      AND w.company_id = public.current_company_id()
  )
);

CREATE POLICY uoms_company
ON uoms FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY product_categories_company
ON product_categories FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY products_company
ON products FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY inventory_company
ON inventory FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY bills_of_materials_company
ON bills_of_materials FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY bom_line_items_company
ON bom_line_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM bills_of_materials b
    WHERE b.id = bom_id
      AND b.company_id = public.current_company_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM bills_of_materials b
    WHERE b.id = bom_id
      AND b.company_id = public.current_company_id()
  )
);

CREATE POLICY suppliers_company
ON suppliers FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY purchase_requests_company
ON purchase_requests FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY purchase_request_items_company
ON purchase_request_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM purchase_requests pr
    WHERE pr.id = purchase_request_id
      AND pr.company_id = public.current_company_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM purchase_requests pr
    WHERE pr.id = purchase_request_id
      AND pr.company_id = public.current_company_id()
  )
);

CREATE POLICY purchase_orders_company
ON purchase_orders FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY purchase_order_items_company
ON purchase_order_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE po.id = purchase_order_id
      AND po.company_id = public.current_company_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE po.id = purchase_order_id
      AND po.company_id = public.current_company_id()
  )
);

CREATE POLICY sales_orders_company
ON sales_orders FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY sales_order_items_company
ON sales_order_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM sales_orders so
    WHERE so.id = sales_order_id
      AND so.company_id = public.current_company_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM sales_orders so
    WHERE so.id = sales_order_id
      AND so.company_id = public.current_company_id()
  )
);

CREATE POLICY manufacturing_orders_company
ON manufacturing_orders FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY mo_operations_company
ON mo_operations FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM manufacturing_orders mo
    WHERE mo.id = manufacturing_order_id
      AND mo.company_id = public.current_company_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM manufacturing_orders mo
    WHERE mo.id = manufacturing_order_id
      AND mo.company_id = public.current_company_id()
  )
);

CREATE POLICY material_consumptions_company
ON material_consumptions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM manufacturing_orders mo
    WHERE mo.id = manufacturing_order_id
      AND mo.company_id = public.current_company_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM manufacturing_orders mo
    WHERE mo.id = manufacturing_order_id
      AND mo.company_id = public.current_company_id()
  )
);

CREATE POLICY finished_goods_receipts_company
ON finished_goods_receipts FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM manufacturing_orders mo
    WHERE mo.id = manufacturing_order_id
      AND mo.company_id = public.current_company_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM manufacturing_orders mo
    WHERE mo.id = manufacturing_order_id
      AND mo.company_id = public.current_company_id()
  )
);

CREATE POLICY machines_company
ON machines FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY maintenance_requests_company
ON maintenance_requests FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY audit_logs_company
ON audit_logs FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

-- ============================================
-- INTEGRATIONS
-- ============================================
CREATE TABLE integration_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
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

CREATE TABLE integration_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    integration_id UUID REFERENCES integration_tokens(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('connect', 'disconnect', 'sync', 'error', 'webhook', 'test')),
    status TEXT NOT NULL CHECK (status IN ('success', 'error', 'pending')),
    request_data JSONB,
    response_data JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE webhook_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
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
-- MODULE RECORD STORAGE (Generic module engine persistence)
-- ============================================
CREATE TABLE module_records (
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    record_id TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (company_id, module_key, record_id)
);

-- Indexes
CREATE INDEX idx_integration_tokens_company ON integration_tokens(company_id);
CREATE INDEX idx_integration_logs_company ON integration_logs(company_id);
CREATE INDEX idx_integration_logs_created ON integration_logs(created_at DESC);
CREATE INDEX idx_webhook_configs_company ON webhook_configs(company_id);
CREATE INDEX idx_module_records_company_module ON module_records(company_id, module_key);

-- RLS for integrations
ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_tokens_company
ON integration_tokens FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY integration_logs_company
ON integration_logs FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY webhook_configs_company
ON webhook_configs FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY module_records_company
ON module_records FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

-- Enable RLS
ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_records ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_integration_tokens_updated_at BEFORE UPDATE ON integration_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_configs_updated_at BEFORE UPDATE ON webhook_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_module_records_updated_at BEFORE UPDATE ON module_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON warehouses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_orders_updated_at BEFORE UPDATE ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_manufacturing_orders_updated_at BEFORE UPDATE ON manufacturing_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_machines_updated_at BEFORE UPDATE ON machines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_maintenance_requests_updated_at BEFORE UPDATE ON maintenance_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
