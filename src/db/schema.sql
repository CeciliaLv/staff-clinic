-- ========================================================
-- 集团医务室药品进销存管理系统 - 数据库 Schema
-- SQLite 3
-- ========================================================

-- ---------- 用户表 ----------
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- ---------- 药品主表 ----------
CREATE TABLE IF NOT EXISTS drugs (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  manufacturer TEXT DEFAULT '',
  cat TEXT DEFAULT '',
  spec TEXT DEFAULT '',
  unit TEXT DEFAULT '',
  pos TEXT DEFAULT '',
  min_quantity INTEGER DEFAULT 0,
  max_quantity INTEGER DEFAULT 9999,
  opening_stock INTEGER DEFAULT 0,
  price REAL DEFAULT 0
);

-- ---------- 入库记录表 ----------
CREATE TABLE IF NOT EXISTS inbound (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT DEFAULT '',
  manufacturer TEXT DEFAULT '',
  cat TEXT DEFAULT '',
  spec TEXT DEFAULT '',
  unit TEXT DEFAULT '',
  pos TEXT DEFAULT '',
  qty INTEGER NOT NULL,
  price REAL NOT NULL,
  handler TEXT DEFAULT '',
  remark TEXT DEFAULT '',
  batch_no TEXT DEFAULT '',
  prod_date TEXT DEFAULT '',
  exp_date TEXT DEFAULT '',
  remaining INTEGER DEFAULT 0,
  discarded INTEGER DEFAULT 0,
  FOREIGN KEY (code) REFERENCES drugs(code) ON DELETE CASCADE
);

-- ---------- 出库记录表 ----------
CREATE TABLE IF NOT EXISTS outbound (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT DEFAULT '',
  manufacturer TEXT DEFAULT '',
  cat TEXT DEFAULT '',
  spec TEXT DEFAULT '',
  unit TEXT DEFAULT '',
  pos TEXT DEFAULT '',
  qty INTEGER NOT NULL,
  price REAL NOT NULL,
  handler TEXT DEFAULT '',
  remark TEXT DEFAULT '',
  dept TEXT DEFAULT '',
  recipient TEXT DEFAULT '',
  batch_no TEXT DEFAULT '',
  FOREIGN KEY (code) REFERENCES drugs(code) ON DELETE CASCADE
);

-- ---------- 报废记录表 ----------
CREATE TABLE IF NOT EXISTS discards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT DEFAULT '',
  batch_no TEXT DEFAULT '',
  exp_date TEXT DEFAULT '',
  qty INTEGER NOT NULL,
  date TEXT NOT NULL
);

-- ---------- 参数配置表 ----------
CREATE TABLE IF NOT EXISTS params (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------- 数据迁移版本表 ----------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- ---------- 索引 ----------
CREATE INDEX IF NOT EXISTS idx_inbound_code ON inbound(code);
CREATE INDEX IF NOT EXISTS idx_inbound_exp_date ON inbound(exp_date);
CREATE INDEX IF NOT EXISTS idx_inbound_date ON inbound(date);
CREATE INDEX IF NOT EXISTS idx_inbound_batch ON inbound(batch_no);
CREATE INDEX IF NOT EXISTS idx_outbound_code ON outbound(code);
CREATE INDEX IF NOT EXISTS idx_outbound_date ON outbound(date);
CREATE INDEX IF NOT EXISTS idx_outbound_batch ON outbound(batch_no);
CREATE INDEX IF NOT EXISTS idx_discards_code ON discards(code);
