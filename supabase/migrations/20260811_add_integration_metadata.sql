-- Add integration sync metadata columns
-- The Shopify / Zoho sync functions store the external record id (and other
-- sync state) on products and sales orders via a metadata JSONB column.

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
