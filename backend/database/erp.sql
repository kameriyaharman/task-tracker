-- ============================================================
-- Hardware showroom ERP (purchase, stock, sales, delivery, accounts,
-- recovery, returns, expenses, complaints, approvals, workflows, Tally)
-- Applied after schema.sql on every start; all statements idempotent.
-- Money: DECIMAL(14,2). Quantity: DECIMAL(14,3).
-- ============================================================

CREATE TABLE IF NOT EXISTS erp_roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  perms TEXT NOT NULL,                       -- JSON {"purchase":"edit","inventory":"view",...}
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_erp_role (company_id, name),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS doc_counters (
  company_id INT UNSIGNED NOT NULL,
  prefix VARCHAR(10) NOT NULL,
  fy VARCHAR(9) NOT NULL,
  last_no INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, prefix, fy)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Masters ----------
CREATE TABLE IF NOT EXISTS warehouses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  type ENUM('showroom','godown') NOT NULL DEFAULT 'godown',
  address VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS brands (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS units (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(30) NOT NULL,                 -- Bag, Piece, Box, Kg, Ltr, Ft, Sq.Ft, MT
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  sku VARCHAR(40) NULL,
  barcode VARCHAR(60) NULL,
  name VARCHAR(160) NOT NULL,
  category_id INT UNSIGNED NULL,
  brand_id INT UNSIGNED NULL,
  unit VARCHAR(30) NOT NULL DEFAULT 'Piece',
  alt_unit VARCHAR(30) NULL,                 -- e.g. Box
  alt_factor DECIMAL(14,4) NULL,             -- 1 alt_unit = alt_factor × unit
  hsn VARCHAR(12) NULL,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 18,
  purchase_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  retail_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  wholesale_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  contractor_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  min_stock DECIMAL(14,3) NOT NULL DEFAULT 0,
  rack VARCHAR(40) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_prod_name (company_id, name),
  KEY idx_prod_barcode (company_id, barcode),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vendors (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  contact_person VARCHAR(100) NULL,
  mobile VARCHAR(15) NULL,
  email VARCHAR(150) NULL,
  gstin VARCHAR(20) NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(80) NULL,
  credit_days SMALLINT NOT NULL DEFAULT 30,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,   -- we owe them
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  type ENUM('retail','wholesale','contractor') NOT NULL DEFAULT 'retail',
  mobile VARCHAR(15) NULL,
  email VARCHAR(150) NULL,
  gstin VARCHAR(20) NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(80) NULL,
  credit_limit DECIMAL(14,2) NOT NULL DEFAULT 0,
  credit_days SMALLINT NOT NULL DEFAULT 0,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,   -- they owe us
  recovery_user_id INT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cust_mobile (company_id, mobile),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Stock ----------
CREATE TABLE IF NOT EXISTS stock_ledger (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  warehouse_id INT UNSIGNED NOT NULL,
  qty DECIMAL(14,3) NOT NULL,                -- + in, − out
  rate DECIMAL(14,2) NOT NULL DEFAULT 0,
  ref_type VARCHAR(30) NOT NULL,             -- grn, sale, sales_return, purchase_return, adjustment, transfer, opening
  ref_id INT UNSIGNED NULL,
  note VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_stock_prod (company_id, product_id, warehouse_id),
  KEY idx_stock_ref (ref_type, ref_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Purchase ----------
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  po_no VARCHAR(30) NOT NULL,
  vendor_id INT UNSIGNED NOT NULL,
  warehouse_id INT UNSIGNED NULL,
  status ENUM('draft','pending_approval','approved','rejected','ordered','partial','received','closed','cancelled') NOT NULL DEFAULT 'draft',
  order_date DATE NOT NULL,
  expected_date DATE NULL,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_po_no (company_id, po_no),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  po_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  qty DECIMAL(14,3) NOT NULL,
  received_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  rate DECIMAL(14,2) NOT NULL,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS grns (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  grn_no VARCHAR(30) NOT NULL,
  po_id INT UNSIGNED NULL,
  vendor_id INT UNSIGNED NOT NULL,
  warehouse_id INT UNSIGNED NOT NULL,
  bill_no VARCHAR(40) NULL,
  bill_date DATE NULL,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,      -- vendor bill amount
  paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  due_date DATE NULL,
  status ENUM('pending_approval','approved','rejected') NOT NULL DEFAULT 'pending_approval',
  notes TEXT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME NULL,
  UNIQUE KEY uq_grn_no (company_id, grn_no),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS grn_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  grn_id INT UNSIGNED NOT NULL,
  po_item_id INT UNSIGNED NULL,
  product_id INT UNSIGNED NOT NULL,
  qty DECIMAL(14,3) NOT NULL,                  -- accepted into stock
  damaged_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  rate DECIMAL(14,2) NOT NULL,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL,
  FOREIGN KEY (grn_id) REFERENCES grns(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Sales ----------
CREATE TABLE IF NOT EXISTS sales_docs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  doc_type ENUM('quotation','invoice') NOT NULL,
  doc_no VARCHAR(30) NOT NULL,
  customer_id INT UNSIGNED NULL,
  customer_name VARCHAR(160) NULL,             -- walk-in
  customer_mobile VARCHAR(15) NULL,
  price_type ENUM('retail','wholesale','contractor') NOT NULL DEFAULT 'retail',
  warehouse_id INT UNSIGNED NOT NULL,
  status ENUM('draft','pending_approval','final','rejected','converted','cancelled') NOT NULL DEFAULT 'draft',
  payment_mode ENUM('cash','upi','bank','card','credit') NOT NULL DEFAULT 'cash',
  doc_date DATE NOT NULL,
  due_date DATE NULL,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  max_discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  needs_delivery TINYINT(1) NOT NULL DEFAULT 0,
  delivery_address VARCHAR(255) NULL,
  source_id INT UNSIGNED NULL,                 -- quotation → invoice
  notes TEXT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sales_no (company_id, doc_type, doc_no),
  KEY idx_sales_cust (company_id, customer_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sales_doc_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doc_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  qty DECIMAL(14,3) NOT NULL,
  delivered_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  returned_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  rate DECIMAL(14,2) NOT NULL,
  discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL,
  FOREIGN KEY (doc_id) REFERENCES sales_docs(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Delivery ----------
CREATE TABLE IF NOT EXISTS deliveries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  delivery_no VARCHAR(30) NOT NULL,
  invoice_id INT UNSIGNED NOT NULL,
  customer_name VARCHAR(160) NULL,
  customer_mobile VARCHAR(15) NULL,
  address VARCHAR(255) NULL,
  assigned_to INT UNSIGNED NULL,
  vehicle VARCHAR(40) NULL,
  scheduled_at DATETIME NULL,
  status ENUM('pending','packed','dispatched','delivered','partial','failed','cancelled') NOT NULL DEFAULT 'pending',
  otp_code VARCHAR(6) NULL,
  otp_verified TINYINT(1) NOT NULL DEFAULT 0,
  receiver_name VARCHAR(100) NULL,
  failure_reason VARCHAR(255) NULL,
  lat DECIMAL(10,7) NULL,
  lng DECIMAL(10,7) NULL,
  delivered_at DATETIME NULL,
  task_id INT UNSIGNED NULL,
  notes TEXT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_delivery_no (company_id, delivery_no),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES sales_docs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Money ----------
CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  pay_no VARCHAR(30) NOT NULL,
  direction ENUM('in','out') NOT NULL,         -- in = customer receipt, out = vendor payment
  party_type ENUM('customer','vendor') NOT NULL,
  party_id INT UNSIGNED NULL,
  invoice_id INT UNSIGNED NULL,                -- direct link (cash sale) else FIFO allocation
  amount DECIMAL(14,2) NOT NULL,
  mode ENUM('cash','upi','bank','card','cheque') NOT NULL DEFAULT 'cash',
  reference VARCHAR(80) NULL,
  pay_date DATE NOT NULL,
  status ENUM('pending_approval','approved','rejected') NOT NULL DEFAULT 'approved',
  notes VARCHAR(255) NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pay_no (company_id, pay_no),
  KEY idx_pay_party (company_id, party_type, party_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recovery_followups (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  assigned_to INT UNSIGNED NULL,
  outcome ENUM('called','promise','paid','dispute','no_response','note') NOT NULL DEFAULT 'note',
  promise_date DATE NULL,
  promise_amount DECIMAL(14,2) NULL,
  note VARCHAR(500) NULL,
  task_id INT UNSIGNED NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rec_cust (company_id, customer_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS returns_docs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  return_no VARCHAR(30) NOT NULL,
  type ENUM('sales','purchase') NOT NULL,
  ref_id INT UNSIGNED NULL,                    -- sales_docs.id or grns.id
  party_id INT UNSIGNED NULL,
  warehouse_id INT UNSIGNED NOT NULL,
  status ENUM('pending_approval','approved','rejected') NOT NULL DEFAULT 'pending_approval',
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  reason VARCHAR(255) NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_return_no (company_id, return_no),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS return_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  return_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  ref_item_id INT UNSIGNED NULL,
  qty DECIMAL(14,3) NOT NULL,
  rate DECIMAL(14,2) NOT NULL,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL,
  restock TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (return_id) REFERENCES returns_docs(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS expenses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  exp_no VARCHAR(30) NOT NULL,
  exp_date DATE NOT NULL,
  category VARCHAR(60) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  mode ENUM('cash','upi','bank','card','cheque') NOT NULL DEFAULT 'cash',
  paid_to VARCHAR(120) NULL,
  notes VARCHAR(255) NULL,
  status ENUM('pending_approval','approved','rejected') NOT NULL DEFAULT 'pending_approval',
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_exp_no (company_id, exp_no),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS complaints (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  ticket_no VARCHAR(30) NOT NULL,
  type ENUM('customer','maintenance') NOT NULL DEFAULT 'customer',
  customer_id INT UNSIGNED NULL,
  invoice_id INT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  assigned_to INT UNSIGNED NULL,
  status ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  resolution TEXT NULL,
  task_id INT UNSIGNED NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  UNIQUE KEY uq_ticket_no (company_id, ticket_no),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Approvals ----------
CREATE TABLE IF NOT EXISTS approval_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  doc_type VARCHAR(30) NOT NULL,             -- purchase_order, grn, vendor_payment, expense, sales_return, purchase_return, sales_discount, credit_limit, stock_adjustment
  min_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  levels ENUM('manager','owner','manager_owner') NOT NULL DEFAULT 'manager',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS approvals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  doc_type VARCHAR(30) NOT NULL,
  doc_id INT UNSIGNED NOT NULL,
  level TINYINT NOT NULL,
  approver_role ENUM('manager','owner') NOT NULL,
  status ENUM('waiting','pending','approved','rejected','skipped') NOT NULL DEFAULT 'pending',
  summary VARCHAR(255) NULL,
  amount DECIMAL(14,2) NULL,
  requested_by INT UNSIGNED NULL,
  acted_by INT UNSIGNED NULL,
  acted_at DATETIME NULL,
  remarks VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_appr_doc (company_id, doc_type, doc_id),
  KEY idx_appr_status (company_id, status),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Workflows ----------
CREATE TABLE IF NOT EXISTS workflows (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  trigger_event VARCHAR(40) NOT NULL,        -- purchase_order.approved, grn.approved, invoice.final, delivery.created, complaint.created, payment.promise, manual
  min_amount DECIMAL(14,2) NULL,
  max_amount DECIMAL(14,2) NULL,
  steps MEDIUMTEXT NOT NULL,                 -- JSON array of steps
  version INT NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workflow_runs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  workflow_id INT UNSIGNED NOT NULL,
  version INT NOT NULL DEFAULT 1,
  steps MEDIUMTEXT NOT NULL,                 -- snapshot: running workflows keep their old rules
  ref_type VARCHAR(30) NULL,
  ref_id INT UNSIGNED NULL,
  title VARCHAR(200) NULL,
  context TEXT NULL,                         -- JSON {amount, creator_id, ...}
  current_step INT NOT NULL DEFAULT -1,
  status ENUM('running','completed','cancelled','paused') NOT NULL DEFAULT 'running',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  KEY idx_wfr_ref (company_id, ref_type, ref_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Tally & audit ----------
CREATE TABLE IF NOT EXISTS tally_queue (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  ref_type VARCHAR(30) NOT NULL,
  ref_id INT UNSIGNED NOT NULL,
  voucher_type VARCHAR(20) NOT NULL,         -- Sales, Purchase, Receipt, Payment, Credit Note, Debit Note
  status ENUM('pending','synced','failed') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  error VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME NULL,
  UNIQUE KEY uq_tally_ref (company_id, ref_type, ref_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  entity VARCHAR(30) NOT NULL,
  entity_id INT UNSIGNED NULL,
  action VARCHAR(40) NOT NULL,
  data TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_entity (company_id, entity, entity_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
