import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import 'dotenv/config';
import type { Drug, InboundRecord, OutboundRecord, DiscardRecord, AppParams } from '../types.js';

// ---------- 数据库路径 ----------
const ROOT = process.cwd();

const getDbPath = () => {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  return path.join(ROOT, 'data/clinic.db');
};

const DB_PATH = getDbPath();
const DB_DIR = path.dirname(DB_PATH);

try {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
} catch (err) {
  console.error('[DB] 无法创建数据目录:', DB_DIR, err instanceof Error ? err.message : err);
  throw err;
}

// ---------- 打开数据库 ----------
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('synchronous = FULL');

// ---------- 初始化 Schema ----------
// 尝试多个位置查找 schema.sql（适配开发和生产环境）
const findSchema = (): string => {
  const candidates = [
    path.join(ROOT, 'src/db/schema.sql'),
    path.join(ROOT, 'dist/src/db/schema.sql'),
    path.join(ROOT, 'schema.sql'),
    path.join(__dirname, 'schema.sql'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log(`[DB] 找到 schema: ${p}`);
      return fs.readFileSync(p, 'utf8');
    }
  }
  throw new Error('无法找到 schema.sql 文件');
};

const schema = findSchema();
db.exec(schema);

// ---------- 列别名映射（snake_case → camelCase） ----------
// 数据库存储用 snake_case，前端类型用 camelCase，通过 SELECT AS 别名统一转换
const DRUG_COLS = `code, name, manufacturer, cat, spec, unit, pos, min_quantity AS min, max_quantity AS max, opening_stock AS opening, price`;

const INBOUND_COLS = `id, date, code, name, manufacturer, cat, spec, unit, pos, qty, price, handler, remark, batch_no AS batchNo, prod_date AS prodDate, exp_date AS expDate, remaining, discarded`;

const OUTBOUND_COLS = `id, date, code, name, manufacturer, cat, spec, unit, pos, qty, price, handler, remark, dept, recipient, batch_no AS batchNo`;

const DISCARD_COLS = `id, code, name, batch_no AS batchNo, exp_date AS expDate, qty, date`;

// ---------- 工具函数 ----------
export function isBcryptHash(pwd: string): boolean {
  if (!pwd || typeof pwd !== 'string') return false;
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(pwd);
}

// ---------- 用户操作 ----------
export const Users = {
  findByUsername(username: string) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as { id: number; username: string; password_hash: string } | undefined;
  },

  async create(username: string, password: string) {
    const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    return info.lastInsertRowid;
  },

  async verifyPassword(username: string, password: string): Promise<boolean> {
    const user = this.findByUsername(username);
    if (!user) return false;

    if (isBcryptHash(user.password_hash)) {
      return bcrypt.compare(password, user.password_hash);
    }
    // 明文密码兼容（自动迁移）
    if (user.password_hash === password) {
      console.warn(`[密码迁移] 用户 ${username} 的密码为明文，正在升级为 bcrypt...`);
      const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
      console.log(`[密码迁移成功] ${username}`);
      return true;
    }
    return false;
  },

  count(): number {
    const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return result.count;
  }
};

// ---------- 药品操作 ----------
export const Drugs = {
  all(): Drug[] {
    return db.prepare(`SELECT ${DRUG_COLS} FROM drugs ORDER BY code`).all() as Drug[];
  },

  findByCode(code: string): Drug | undefined {
    return db.prepare(`SELECT ${DRUG_COLS} FROM drugs WHERE code = ?`).get(code) as Drug | undefined;
  },

  insert(drug: Drug) {
    db.prepare(`INSERT INTO drugs (code, name, manufacturer, cat, spec, unit, pos, min_quantity, max_quantity, opening_stock, price)
      VALUES (@code, @name, @manufacturer, @cat, @spec, @unit, @pos, @min, @max, @opening, @price)`)
      .run({
        code: drug.code,
        name: drug.name,
        manufacturer: drug.manufacturer || '',
        cat: drug.cat || '',
        spec: drug.spec || '',
        unit: drug.unit || '',
        pos: drug.pos || '',
        min: drug.min || 0,
        max: drug.max || 9999,
        opening: drug.opening || 0,
        price: drug.price || 0
      });
  },

  update(drug: Drug) {
    db.prepare(`UPDATE drugs SET name=?, manufacturer=?, cat=?, spec=?, unit=?, pos=?, min_quantity=?, max_quantity=?, opening_stock=?, price=?
      WHERE code=?`)
      .run(
        drug.name, drug.manufacturer || '', drug.cat || '', drug.spec || '',
        drug.unit || '', drug.pos || '', drug.min || 0, drug.max || 9999,
        drug.opening || 0, drug.price || 0, drug.code
      );
  },

  delete(code: string) {
    db.prepare('DELETE FROM drugs WHERE code = ?').run(code);
  },

  upsert(drug: Drug) {
    const existing = this.findByCode(drug.code);
    if (existing) {
      this.update(drug);
    } else {
      this.insert(drug);
    }
  }
};

// ---------- 入库操作 ----------
export const Inbound = {
  all(): InboundRecord[] {
    return db.prepare(`SELECT ${INBOUND_COLS} FROM inbound ORDER BY date DESC, id DESC`).all() as InboundRecord[];
  },

  findById(id: number): InboundRecord | undefined {
    return db.prepare(`SELECT ${INBOUND_COLS} FROM inbound WHERE id = ?`).get(id) as InboundRecord | undefined;
  },

  findByCode(code: string): InboundRecord[] {
    return db.prepare(`SELECT ${INBOUND_COLS} FROM inbound WHERE code = ? AND remaining > 0 ORDER BY exp_date ASC, date ASC`)
      .all(code) as InboundRecord[];
  },

  insert(record: Omit<InboundRecord, 'id'>): number {
    const info = db.prepare(`INSERT INTO inbound (date, code, name, manufacturer, cat, spec, unit, pos, qty, price, handler, remark, batch_no, prod_date, exp_date, remaining, discarded)
      VALUES (@date, @code, @name, @manufacturer, @cat, @spec, @unit, @pos, @qty, @price, @handler, @remark, @batch_no, @prod_date, @exp_date, @remaining, @discarded)`)
      .run({
        date: record.date,
        code: record.code,
        name: record.name || '',
        manufacturer: record.manufacturer || '',
        cat: record.cat || '',
        spec: record.spec || '',
        unit: record.unit || '',
        pos: record.pos || '',
        qty: record.qty,
        price: record.price,
        handler: record.handler || '',
        remark: record.remark || '',
        batch_no: record.batchNo || '',
        prod_date: record.prodDate || '',
        exp_date: record.expDate || '',
        remaining: record.remaining ?? record.qty,
        discarded: record.discarded ? 1 : 0
      });
    return info.lastInsertRowid as number;
  },

  updateRemaining(id: number, remaining: number) {
    db.prepare('UPDATE inbound SET remaining = ? WHERE id = ?').run(remaining, id);
  },

  delete(id: number) {
    db.prepare('DELETE FROM inbound WHERE id = ?').run(id);
  },

  /** 获取有效批次（有剩余库存），按效期排序（FEFO） */
  getAvailableBatches(code: string): InboundRecord[] {
    return db.prepare(`SELECT ${INBOUND_COLS} FROM inbound WHERE code = ? AND remaining > 0
      ORDER BY CASE WHEN exp_date = '' THEN '9999' ELSE exp_date END ASC, date ASC`)
      .all(code) as InboundRecord[];
  },

  /** 计算某药品的总可用库存 */
  getTotalAvailable(code: string): number {
    const result = db.prepare('SELECT COALESCE(SUM(remaining), 0) as total FROM inbound WHERE code = ? AND remaining > 0')
      .get(code) as { total: number };
    return result.total;
  },

  /** 计算某药品的总入库数量 */
  getTotalInbound(code: string): number {
    const result = db.prepare('SELECT COALESCE(SUM(qty), 0) as total FROM inbound WHERE code = ?')
      .get(code) as { total: number };
    return result.total;
  },

  /** 汇总查询：按药品分组 */
  getSummary(): Array<{ code: string; total_in: number; remaining: number }> {
    return db.prepare(`SELECT code, SUM(qty) as total_in, SUM(remaining) as remaining
      FROM inbound GROUP BY code`).all() as Array<{ code: string; total_in: number; remaining: number }>;
  }
};

// ---------- 出库操作 ----------
export const Outbound = {
  all(): OutboundRecord[] {
    return db.prepare(`SELECT ${OUTBOUND_COLS} FROM outbound ORDER BY date DESC, id DESC`).all() as OutboundRecord[];
  },

  findById(id: number): OutboundRecord | undefined {
    return db.prepare(`SELECT ${OUTBOUND_COLS} FROM outbound WHERE id = ?`).get(id) as OutboundRecord | undefined;
  },

  insert(record: Omit<OutboundRecord, 'id'>): number {
    const info = db.prepare(`INSERT INTO outbound (date, code, name, manufacturer, cat, spec, unit, pos, qty, price, handler, remark, dept, recipient, batch_no)
      VALUES (@date, @code, @name, @manufacturer, @cat, @spec, @unit, @pos, @qty, @price, @handler, @remark, @dept, @recipient, @batch_no)`)
      .run({
        date: record.date,
        code: record.code,
        name: record.name || '',
        manufacturer: record.manufacturer || '',
        cat: record.cat || '',
        spec: record.spec || '',
        unit: record.unit || '',
        pos: record.pos || '',
        qty: record.qty,
        price: record.price,
        handler: record.handler || '',
        remark: record.remark || '',
        dept: record.dept || '',
        recipient: record.recipient || '',
        batch_no: record.batchNo || ''
      });
    return info.lastInsertRowid as number;
  },

  delete(id: number) {
    db.prepare('DELETE FROM outbound WHERE id = ?').run(id);
  },

  /** 本月出库统计 */
  getMonthlyStats(month: string): number {
    const result = db.prepare("SELECT COALESCE(SUM(qty), 0) as total FROM outbound WHERE date LIKE ?")
      .get(`${month}%`) as { total: number };
    return result.total;
  }
};

// ---------- 报废操作 ----------
export const Discards = {
  all(): DiscardRecord[] {
    return db.prepare(`SELECT ${DISCARD_COLS} FROM discards ORDER BY date DESC`).all() as DiscardRecord[];
  },

  insert(record: Omit<DiscardRecord, 'id'>): number {
    const info = db.prepare(`INSERT INTO discards (code, name, batch_no, exp_date, qty, date)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(record.code, record.name || '', record.batchNo || '', record.expDate || '', record.qty, record.date);
    return info.lastInsertRowid as number;
  },

  delete(id: number) {
    db.prepare('DELETE FROM discards WHERE id = ?').run(id);
  }
};

// ---------- 参数配置操作 ----------
export const Params = {
  getAll(): AppParams {
    const rows = db.prepare('SELECT key, value FROM params').all() as Array<{ key: string; value: string }>;
    const result: Record<string, any> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = row.value;
      }
    }
    return result as AppParams;
  },

  set(key: string, value: any) {
    const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
    db.prepare('INSERT OR REPLACE INTO params (key, value) VALUES (?, ?)').run(key, jsonValue);
  },

  delete(key: string) {
    db.prepare('DELETE FROM params WHERE key = ?').run(key);
  },

  clearAll() {
    db.prepare('DELETE FROM params').run();
  }
};

// ---------- 统计查询 ----------
export const Stats = {
  /** 库存状态汇总 */
  getStockStatus() {
    return db.prepare(`
      SELECT d.code, d.name, d.pos,
        COALESCE(SUM(i.remaining), 0) as stock,
        d.min_quantity, d.max_quantity
      FROM drugs d
      LEFT JOIN inbound i ON d.code = i.code AND i.remaining > 0
      GROUP BY d.code
      ORDER BY d.code
    `).all();
  },

  /** 月度趋势 */
  getMonthlyTrend(year: number) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    return {
      inbound: db.prepare(`SELECT strftime('%m', date) as month, SUM(qty) as total
        FROM inbound WHERE date BETWEEN ? AND ? GROUP BY strftime('%m', date)`).all(startDate, endDate),
      outbound: db.prepare(`SELECT strftime('%m', date) as month, SUM(qty) as total
        FROM outbound WHERE date BETWEEN ? AND ? GROUP BY strftime('%m', date)`).all(startDate, endDate)
    };
  },

  /** 效期预警 */
  getExpiringSoon(daysThreshold: number = 90) {
    return db.prepare(`SELECT ${INBOUND_COLS} FROM inbound
      WHERE remaining > 0 AND exp_date != ''
      AND date(exp_date) <= date('now', ?)
      ORDER BY exp_date ASC`)
      .all(`${daysThreshold} days`) as InboundRecord[];
  },

  getExpired() {
    return db.prepare(`SELECT ${INBOUND_COLS} FROM inbound
      WHERE remaining > 0 AND exp_date != ''
      AND date(exp_date) < date('now')`)
      .all() as InboundRecord[];
  },

  /** 库存预警 */
  getLowStock() {
    return db.prepare(`SELECT d.*, COALESCE(SUM(i.remaining), 0) as stock
      FROM drugs d LEFT JOIN inbound i ON d.code = i.code
      GROUP BY d.code
      HAVING stock < d.min_quantity`).all();
  }
};

// ---------- 初始化 ----------
export async function initDatabase() {
  // 确保 Schema 已创建（幂等）
  db.exec(schema);

  // 创建初始管理员
  const INIT_ADMIN_USERNAME = process.env.INIT_ADMIN_USERNAME || 'admin';
  const INIT_ADMIN_PASSWORD = process.env.INIT_ADMIN_PASSWORD || 'Admin@2026';

  if (Users.count() === 0) {
    await Users.create(INIT_ADMIN_USERNAME, INIT_ADMIN_PASSWORD);
    console.log(`[DB 初始化] 初始管理员 ${INIT_ADMIN_USERNAME} 创建成功`);
  } else {
    console.log(`[DB 初始化] 用户表已有 ${Users.count()} 个用户`);
  }

  console.log(`[DB 初始化] 数据库连接成功: ${DB_PATH}`);
}

// ---------- 导出兼容接口 ----------
// 保持与旧代码兼容的便捷方法
export const DatabaseCompat = {
  async login(username: string, password: string): Promise<{ success: boolean; token?: string; username?: string }> {
    const valid = await Users.verifyPassword(username, password);
    if (!valid) return { success: false };
    return { success: true, username };
  },

  getFullData() {
    return {
      drugs: Drugs.all(),
      inbound: Inbound.all(),
      outbound: Outbound.all(),
      discards: Discards.all(),
      params: Params.getAll()
    };
  }
};

export { db, Database };
