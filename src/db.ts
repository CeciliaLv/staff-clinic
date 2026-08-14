import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const dbPath = path.join(process.cwd(), 'db.json');

let dbState: any = {
  users: [],
  drugs: [],
  inbound: [],
  outbound: [],
  params: []
};

try {
  if (fs.existsSync(dbPath)) {
    dbState = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  }
} catch (e) {
  console.error('Failed to load db.json', e);
}

function saveDb() {
  fs.writeFileSync(dbPath, JSON.stringify(dbState, null, 2));
}

/**
 * 判断字符串是否为有效的 bcrypt 哈希
 * bcrypt 哈希格式: $2a$|$2b$|$2y$ + 2位成本 + 22位salt + 31位hash = 共60字符
 */
export function isBcryptHash(pwd: string): boolean {
  if (!pwd || typeof pwd !== 'string') return false;
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(pwd);
}

// Dummy db object to mimic sqlite serialize/run/prepare APIs 
export const db = {
  serialize: (cb: any) => cb(),
  run: (sql: string) => {}, // mock
  prepare: (sql: string) => ({
    run: (params: any[]) => {},
    finalize: () => {}
  })
};

// Implement simple run/get/all for our specific queries
export const run = async (sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> => {
  if (sql.includes('INSERT INTO users')) {
    const id = dbState.users.length + 1;
    dbState.users.push({ id, username: params[0], password: params[1] });
    saveDb();
    return { lastID: id, changes: 1 };
  }
  return { lastID: 0, changes: 0 };
};

export const get = async <T>(sql: string, params: any[] = []): Promise<T | undefined> => {
  if (sql.includes('FROM users WHERE username')) {
    return dbState.users.find((u: any) => u.username === params[0]) as any;
  }
  return undefined;
};

export const all = async <T>(sql: string, params: any[] = []): Promise<T[]> => {
  if (sql.includes('FROM drugs')) return dbState.drugs;
  if (sql.includes('FROM inbound')) return dbState.inbound;
  if (sql.includes('FROM outbound')) return dbState.outbound;
  if (sql.includes('FROM params')) return dbState.params;
  return [];
};

export async function initDb() {
  // 读取初始管理员配置
  const INIT_ADMIN_USERNAME = process.env.INIT_ADMIN_USERNAME || 'admin';
  const INIT_ADMIN_PASSWORD = process.env.INIT_ADMIN_PASSWORD || '123456';
  const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;

  // 检查是否存在明文密码用户 - 统一在 initDb 时进行全量迁移（不影响运行，仅优化存储）
  let migratedCount = 0;
  for (const u of dbState.users) {
    if (u.password && !isBcryptHash(u.password)) {
      console.warn(`[初始化] 检测到用户 ${u.username} 的密码为明文，启动登录后将自动迁移为 bcrypt 哈希`);
      migratedCount++;
    }
  }
  if (migratedCount > 0) {
    console.warn(`[初始化] 共发现 ${migratedCount} 个明文密码用户，登录时自动完成迁移升级`);
  }

  // 创建初始管理员（如不存在）
  const admin = dbState.users.find((u: any) => u.username === INIT_ADMIN_USERNAME);
  if (!admin) {
    try {
      const hashedPassword = await bcrypt.hash(INIT_ADMIN_PASSWORD, BCRYPT_ROUNDS);
      dbState.users.push({ 
        id: dbState.users.length + 1, 
        username: INIT_ADMIN_USERNAME, 
        password: hashedPassword 
      });
      saveDb();
      console.log(`[初始化] 初始管理员创建成功: ${INIT_ADMIN_USERNAME}（密码已 bcrypt 加密）`);
    } catch (hashErr: any) {
      console.error(`[初始化] 管理员密码哈希失败，将使用明文（请尽快手动修复）`, hashErr?.message || hashErr);
      dbState.users.push({ 
        id: dbState.users.length + 1, 
        username: INIT_ADMIN_USERNAME, 
        password: INIT_ADMIN_PASSWORD 
      });
      saveDb();
    }
  } else {
    console.log(`[初始化] 管理员 ${INIT_ADMIN_USERNAME} 已存在: ${isBcryptHash(admin.password) ? '✅ 密码已加密' : '⚠️  密码明文（登录后自动升级）'}`);
  }
}

export { dbState, saveDb };
