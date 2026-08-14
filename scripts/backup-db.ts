#!/usr/bin/env node
// ========================================================
// 数据库备份脚本
// 使用方式: npm run db:backup
// ========================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data/clinic.db');
const BACKUP_DIR = path.join(ROOT, 'backups');

async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `clinic-backup-${timestamp}`;
  
  console.log('═══════════════════════════════════════════════');
  console.log('  数据库备份工具');
  console.log('═══════════════════════════════════════════════\n');

  // 检查数据库是否存在
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ 数据库文件不存在: ${DB_PATH}`);
    process.exit(1);
  }

  // 创建备份目录
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`📁 创建备份目录: ${BACKUP_DIR}`);
  }

  // 备份主数据库
  const mainBackup = path.join(BACKUP_DIR, `${backupName}.db`);
  fs.copyFileSync(DB_PATH, mainBackup);
  console.log(`✅ 主数据库已备份: ${mainBackup}`);

  // 备份 WAL 和 SHM 文件（如果存在）
  const walPath = `${DB_PATH}-wal`;
  const shmPath = `${DB_PATH}-shm`;
  
  if (fs.existsSync(walPath)) {
    fs.copyFileSync(walPath, `${mainBackup}-wal`);
    console.log(`✅ WAL 文件已备份`);
  }
  if (fs.existsSync(shmPath)) {
    fs.copyFileSync(shmPath, `${mainBackup}-shm`);
    console.log(`✅ SHM 文件已备份`);
  }

  // 清理旧备份（保留最近 30 天）
  const BACKUP_RETENTION_DAYS = 30;
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('clinic-backup-'));
  const now = Date.now();
  let cleanedCount = 0;

  for (const file of files) {
    const filePath = path.join(BACKUP_DIR, file);
    const stat = fs.statSync(filePath);
    const ageDays = (now - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays > BACKUP_RETENTION_DAYS) {
      fs.unlinkSync(filePath);
      // 删除关联的 WAL 和 SHM 文件
      if (fs.existsSync(`${filePath}-wal`)) fs.unlinkSync(`${filePath}-wal`);
      if (fs.existsSync(`${filePath}-shm`)) fs.unlinkSync(`${filePath}-shm`);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`🗑️  已清理 ${cleanedCount} 个过期备份（保留 ${BACKUP_RETENTION_DAYS} 天内的备份）`);
  }

  // 统计备份
  const backupFiles = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db'));
  const totalSize = backupFiles.reduce((sum, f) => {
    try { return sum + fs.statSync(path.join(BACKUP_DIR, f)).size; } catch { return sum; }
  }, 0);

  console.log(`\n📊 备份统计:`);
  console.log(`   备份数量: ${backupFiles.length} 个`);
  console.log(`   总大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

  console.log('\n✅ 备份完成！');
  console.log(`📁 备份路径: ${mainBackup}`);
}

backup().catch(console.error);
