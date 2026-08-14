#!/usr/bin/env node
// ========================================================
// 数据迁移脚本：从 db.json 导入到 SQLite
// 使用方式: npm run db:migrate [--force]
// ========================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data/clinic.db');
const JSON_PATH = path.join(ROOT, 'db.json');

// 独立的数据库连接
let db: Database.Database;

function initDatabase(dbPath: string) {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // 关闭已有连接（如果存在）
  if (db) {
    db.close();
  }

  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = FULL');

  // 读取并执行 schema
  const schemaPath = path.join(ROOT, 'src/db/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  console.log(`[DB 初始化] 数据库连接成功: ${dbPath}`);
  return db;
}

async function migrate() {
  console.log('═══════════════════════════════════════════════');
  console.log('  数据库迁移工具: JSON → SQLite');
  console.log('═══════════════════════════════════════════════\n');

  // 1. 检查源文件
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`❌ 源文件不存在: ${JSON_PATH}`);
    process.exit(1);
  }

  // 2. 检查目标数据库
  const force = process.argv.includes('--force');
  if (fs.existsSync(DB_PATH)) {
    if (!force) {
      console.error(`❌ 目标数据库 ${DB_PATH} 已存在`);
      console.error('   使用 --force 参数强制覆盖，或手动删除后重试');
      console.error('   示例: npm run db:migrate -- --force');
      process.exit(1);
    }
    // 备份现有数据库
    const backupPath = `${DB_PATH}.backup.${Date.now()}`;
    try {
      fs.copyFileSync(DB_PATH, backupPath);
      console.log(`📦 现有数据库已备份: ${backupPath}`);
    } catch {
      console.log('📦 跳过备份（无法读取）');
    }
    // 删除旧数据库
    try { fs.unlinkSync(DB_PATH); } catch {}
    try { if (fs.existsSync(`${DB_PATH}-wal`)) fs.unlinkSync(`${DB_PATH}-wal`); } catch {}
    try { if (fs.existsSync(`${DB_PATH}-shm`)) fs.unlinkSync(`${DB_PATH}-shm`); } catch {}
  }

  // 3. 读取 JSON 数据
  console.log(`\n📖 读取源数据: ${JSON_PATH}`);
  const jsonData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  
  // 4. 初始化数据库连接
  console.log(`🔌 连接数据库: ${DB_PATH}`);
  initDatabase(DB_PATH);

  // 5. 创建初始管理员
  const INIT_ADMIN_USERNAME = process.env.INIT_ADMIN_USERNAME || 'admin';
  const INIT_ADMIN_PASSWORD = process.env.INIT_ADMIN_PASSWORD || 'Admin@2026';
  
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get()!.count;
  if (userCount === 0) {
    const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;
    const hash = await bcrypt.hash(INIT_ADMIN_PASSWORD, BCRYPT_ROUNDS);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(INIT_ADMIN_USERNAME, hash);
    console.log(`[DB 初始化] 初始管理员 ${INIT_ADMIN_USERNAME} 创建成功`);
  }

  // 6. 迁移数据
  console.log('\n📝 开始数据迁移...');

  const insertDrug = db.prepare(`INSERT OR REPLACE INTO drugs (code, name, manufacturer, cat, spec, unit, pos, min_quantity, max_quantity, opening_stock, price)
    VALUES (@code, @name, @manufacturer, @cat, @spec, @unit, @pos, @min, @max, @opening, @price)`);

  const insertInbound = db.prepare(`INSERT INTO inbound (date, code, name, manufacturer, cat, spec, unit, pos, qty, price, handler, remark, batch_no, prod_date, exp_date, remaining, discarded)
    VALUES (@date, @code, @name, @manufacturer, @cat, @spec, @unit, @pos, @qty, @price, @handler, @remark, @batch_no, @prod_date, @exp_date, @remaining, @discarded)`);

  const insertOutbound = db.prepare(`INSERT INTO outbound (date, code, name, manufacturer, cat, spec, unit, pos, qty, price, handler, remark, dept, recipient, batch_no)
    VALUES (@date, @code, @name, @manufacturer, @cat, @spec, @unit, @pos, @qty, @price, @handler, @remark, @dept, @recipient, @batch_no)`);

  const insertParam = db.prepare('INSERT OR REPLACE INTO params (key, value) VALUES (?, ?)');

  // 使用事务加速
  const transaction = db.transaction(() => {
    // 迁移药品
    if (jsonData.drugs && jsonData.drugs.length > 0) {
      console.log(`  药品: ${jsonData.drugs.length} 条`);
      for (const drug of jsonData.drugs) {
        insertDrug.run({
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
      }
    }

    // 迁移入库记录
    if (jsonData.inbound && jsonData.inbound.length > 0) {
      console.log(`  入库: ${jsonData.inbound.length} 条`);
      for (const rec of jsonData.inbound) {
        insertInbound.run({
          date: rec.date,
          code: rec.code,
          name: rec.name || '',
          manufacturer: rec.manufacturer || '',
          cat: rec.cat || '',
          spec: rec.spec || '',
          unit: rec.unit || '',
          pos: rec.pos || '',
          qty: rec.qty,
          price: rec.price,
          handler: rec.handler || '',
          remark: rec.remark || '',
          batch_no: rec.batchNo || '',
          prod_date: rec.prodDate || '',
          exp_date: rec.expDate || '',
          remaining: rec.remaining ?? rec.qty,
          discarded: rec.discarded ? 1 : 0
        });
      }
    }

    // 迁移出库记录
    if (jsonData.outbound && jsonData.outbound.length > 0) {
      console.log(`  出库: ${jsonData.outbound.length} 条`);
      for (const rec of jsonData.outbound) {
        insertOutbound.run({
          date: rec.date,
          code: rec.code,
          name: rec.name || '',
          manufacturer: rec.manufacturer || '',
          cat: rec.cat || '',
          spec: rec.spec || '',
          unit: rec.unit || '',
          pos: rec.pos || '',
          qty: rec.qty,
          price: rec.price,
          handler: rec.handler || '',
          remark: rec.remark || '',
          dept: rec.dept || '',
          recipient: rec.recipient || '',
          batch_no: rec.batchNo || ''
        });
      }
    }

    // 迁移参数配置
    if (jsonData.params && jsonData.params.length > 0) {
      console.log(`  参数: ${jsonData.params.length} 条`);
      for (const param of jsonData.params) {
        const value = typeof param.value === 'string' ? param.value : JSON.stringify(param.value);
        insertParam.run(param.key, value);
      }
    }

    // 迁移用户（如果存在且不是默认admin）
    if (jsonData.users && jsonData.users.length > 0) {
      console.log(`  用户: ${jsonData.users.length} 条`);
      for (const user of jsonData.users) {
        // 检查是否已存在
        const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(user.username);
        if (!exists) {
          // 如果原密码已是 bcrypt 哈希，直接存储
          if (/^\$2[aby]\$\d{2}\$/.test(user.password)) {
            db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(user.username, user.password);
          } else {
            // 明文密码重新哈希
            const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;
            const hash = bcrypt.hashSync(user.password, BCRYPT_ROUNDS);
            db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(user.username, hash);
          }
        }
      }
    }
  });

  transaction();

  // 7. 验证
  console.log('\n✅ 迁移完成！验证数据...');
  const drugCount = db.prepare('SELECT COUNT(*) as count FROM drugs').get()!.count;
  const inboundCount = db.prepare('SELECT COUNT(*) as count FROM inbound').get()!.count;
  const outboundCount = db.prepare('SELECT COUNT(*) as count FROM outbound').get()!.count;
  const paramCount = db.prepare('SELECT COUNT(*) as count FROM params').get()!.count;
  const userCountFinal = db.prepare('SELECT COUNT(*) as count FROM users').get()!.count;

  console.log(`  药品: ${drugCount} 条`);
  console.log(`  入库: ${inboundCount} 条`);
  console.log(`  出库: ${outboundCount} 条`);
  console.log(`  参数: ${paramCount} 条`);
  console.log(`  用户: ${userCountFinal} 个`);

  // 关闭连接
  db.close();

  console.log('\n═══════════════════════════════════════════════');
  console.log('  🎉 数据迁移成功！');
  console.log('═══════════════════════════════════════════════\n');
}

migrate().catch(console.error);
