-- Manual publisher (tenant) subscriptions to the platform.
--
-- The Razorpay e-mandate cannot represent a publication that pays by cheque, bank
-- transfer or enterprise contract, nor a pilot given a fixed free window. Those
-- publications still need their plan active, so a superadmin grants it directly with an
-- explicit end date. `manual_until` is the authority for such a grant: while it is in
-- the future the tenant keeps its plan without a Razorpay subscription, and the admin
-- worker's sweep downgrades it once the window closes.
--
-- Reader subscriptions are a separate concern and live in each tenant's own DB, granted
-- by publisher staff (workers/billing-tenant/src/admin-grants.ts).
ALTER TABLE tenants ADD COLUMN manual_until DATETIME;
ALTER TABLE tenants ADD COLUMN manual_since DATETIME;
ALTER TABLE tenants ADD COLUMN manual_granted_by TEXT;
ALTER TABLE tenants ADD COLUMN manual_note TEXT;

-- The expiry sweep scans for grants whose window has closed.
CREATE INDEX IF NOT EXISTS idx_tenants_manual_until ON tenants(manual_until);
