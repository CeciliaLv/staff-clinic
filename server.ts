import 'dotenv/config';
import express from 'express';
import path from 'path';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { 
  initDatabase, 
  Users, 
  Drugs, 
  Inbound as InboundModel, 
  Outbound as OutboundModel, 
  Params,
  Discards,
  Stats,
  db
} from './src/db/index.js';

// ---------- 环境变量读取与校验 ----------
const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim());
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// JWT_SECRET 强制环境变量 - 生产环境禁止使用默认值
const JWT_SECRET_RAW = process.env.JWT_SECRET || '';
const JWT_SECRET_VALID = JWT_SECRET_RAW.length >= 32;

if (!JWT_SECRET_VALID) {
  console.error('');
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('  [FATAL] JWT_SECRET 环境变量缺失或长度不足！');
  console.error('  ');
  console.error('  要求说明:');
  console.error('    - 必须通过 .env 或系统环境变量设置 JWT_SECRET');
  console.error('    - 密钥长度必须 ≥ 32 字符（建议 64 字符的随机十六进制）');
  console.error('  ');
  console.error('  生成命令:');
  console.error('    node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error('  ');
  if (NODE_ENV === 'production') {
    console.error('  生产环境启动已终止！请配置 JWT_SECRET 后重试。');
  } else {
    console.error('  非生产环境将自动生成临时密钥（仅用于开发，禁止上线！）。');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('');
  }
  if (NODE_ENV === 'production') {
    process.exit(1);
  }
}

// 实际使用的 JWT 密钥：有效则用配置的，无效则生成随机密钥（仅开发环境）
const ACTUAL_JWT_SECRET = JWT_SECRET_VALID
  ? JWT_SECRET_RAW
  : (NODE_ENV !== 'production' ? crypto.randomBytes(32).toString('hex') : '');

async function startServer() {
  const app = express();

  // ---------- 安全中间件 ----------
  // Helmet: 设置安全相关 HTTP 头
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'", 'http:', 'https:'],
        'font-src': ["'self'", 'data:'],
      },
    },
    hsts: NODE_ENV === 'production' ? true : false,
  }));

  // 请求速率限制（全局）
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: NODE_ENV === 'production' ? 300 : 1000, // 生产300次，开发1000次
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '请求过于频繁，请稍后重试' }
  });
  app.use('/api/', globalLimiter);

  // 登录接口专用限流（更严格）
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 10, // 最多10次登录尝试
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '登录尝试过于频繁，请15分钟后重试' }
  });

  // ---------- CORS 限制（仅允许配置的来源） ----------
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (CORS_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS 不允许来源: ${origin}`));
    },
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));

  // ---------- 初始化 SQLite 数据库 ----------
  await initDatabase();

  // ---------- 健康检查接口（无需认证） ----------
  app.get('/api/health', (req, res) => {
    const memUsage = process.memoryUsage();
    const dbPath = process.env.DB_PATH || './data/clinic.db';
    res.json({
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      env: NODE_ENV,
      database: 'SQLite',
      dbPath,
      stats: {
        users: Users.count(),
        drugs: Drugs.all().length,
        inbound: InboundModel.all().length,
        outbound: OutboundModel.all().length
      },
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      }
    });
  });

  // ---------- 认证中间件 ----------
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    jwt.verify(token, ACTUAL_JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  // ---------- 登录接口 ----------
  app.post('/api/auth/login', 
    loginLimiter,
    [
      body('username').isString().trim().isLength({ min: 1, max: 50 }).escape(),
      body('password').isString().isLength({ min: 1, max: 200 }),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: '输入参数格式错误' });
      }

      const { username, password } = req.body;
      
      const valid = await Users.verifyPassword(username, password);
      if (!valid) {
        console.log(`[登录失败] 账号: ${username}`);
        return res.status(401).json({ error: '账号或密码错误' });
      }

      const user = Users.findByUsername(username);
      if (!user) {
        return res.status(401).json({ error: '账号或密码错误' });
      }

      const token = jwt.sign(
        { username: user.username, id: user.id },
        ACTUAL_JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
      );
      console.log(`[登录成功] 账号: ${username}, token 过期: ${JWT_EXPIRES_IN}`);
      res.json({ token, username: user.username });
  });

  // ---------- 注册接口 ----------
  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1小时
    max: 5, // 最多5次注册尝试
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '注册尝试过于频繁，请1小时后重试' }
  });

  app.post('/api/auth/register',
    registerLimiter,
    [
      body('username').isString().trim().isLength({ min: 3, max: 30 }).withMessage('用户名长度需在 3-30 字符之间').matches(/^[a-zA-Z0-9_]+$/).withMessage('用户名只能包含字母、数字和下划线'),
      body('password').isString().isLength({ min: 6, max: 100 }).withMessage('密码长度需在 6-100 字符之间'),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { username, password } = req.body;

      // 检查用户名是否已存在
      if (Users.findByUsername(username)) {
        return res.status(409).json({ error: '该账号已存在，请使用其他用户名' });
      }

      try {
        await Users.create(username, password);
        console.log(`[注册成功] 新用户: ${username}`);
        res.json({ success: true, message: '注册成功，请登录' });
      } catch (err: any) {
        console.error(`[注册失败] ${err.message}`);
        res.status(500).json({ error: '注册失败，请稍后重试' });
      }
    }
  );
  
  // ---------- 获取完整数据 ----------
  app.get('/api/data', authenticateToken, async (req, res) => {
    try {
      res.json({ 
        drugs: Drugs.all(), 
        inbound: InboundModel.all(), 
        outbound: OutboundModel.all(), 
        params: Params.getAll()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- 出库接口（FEFO 先进先出） ----------
  app.post('/api/outbound', authenticateToken, async (req, res) => {
    const { date, code, qty, price, handler, remark, dept, recipient } = req.body;
    
    // 验证输入
    if (!code || !qty || qty <= 0) {
      return res.status(400).json({ error: '参数错误：药品编码和出库数量为必填项' });
    }

    // 使用事务确保数据一致性
    const transaction = db.transaction(() => {
      const drug = Drugs.findByCode(code);
      if (!drug) {
        throw new Error('药品编码不存在');
      }

      // 获取可用批次（FEFO 排序）
      const lots = InboundModel.getAvailableBatches(code);
      let left = qty;
      const totalAvailable = lots.reduce((sum: number, lot: any) => sum + lot.remaining, 0);
      
      if (totalAvailable < qty) {
        throw new Error(`库存不足，当前可用库存: ${totalAvailable}，请求: ${qty}`);
      }

      // 执行 FEFO 扣减
      let hitBatchNo = '';
      for (const lot of lots) {
        if (left <= 0) break;
        if (!hitBatchNo) hitBatchNo = lot.batchNo || '';
        const take = Math.min(lot.remaining, left);
        InboundModel.updateRemaining(lot.id, lot.remaining - take);
        left -= take;
      }

      // 插入出库记录
      const outboundId = OutboundModel.insert({
        date,
        code,
        qty,
        price,
        handler,
        remark,
        dept,
        recipient,
        batchNo: hitBatchNo,
        name: drug.name,
        manufacturer: drug.manufacturer || '',
        cat: drug.cat || '',
        spec: drug.spec || '',
        unit: drug.unit || '',
        pos: drug.pos || ''
      });

      return { success: true, batchNo: hitBatchNo, outboundId };
    });

    try {
      const result = transaction();
      res.json(result);
    } catch (err: any) {
      console.error(`[出库失败] ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  });

  // ---------- 入库接口 ----------
  app.post('/api/inbound', authenticateToken, async (req, res) => {
    const { date, code, qty, price, handler, remark, batchNo, prodDate, expDate } = req.body;
    
    if (!code || !qty || qty <= 0) {
      return res.status(400).json({ error: '参数错误：药品编码和入库数量为必填项' });
    }

    const transaction = db.transaction(() => {
      const drug = Drugs.findByCode(code);
      if (!drug) {
        throw new Error('药品编码不存在');
      }

      const inboundId = InboundModel.insert({
        date,
        code,
        name: drug.name,
        manufacturer: drug.manufacturer || '',
        cat: drug.cat || '',
        spec: drug.spec || '',
        unit: drug.unit || '',
        pos: drug.pos || '',
        qty,
        price,
        handler: handler || '',
        remark: remark || '',
        batchNo: batchNo || '',
        prodDate: prodDate || '',
        expDate: expDate || '',
        remaining: qty,
        discarded: false
      });

      return { success: true, inboundId };
    });

    try {
      const result = transaction();
      res.json(result);
    } catch (err: any) {
      console.error(`[入库失败] ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  });

  // ---------- 药品 CRUD ----------
  app.post('/api/drugs', authenticateToken, async (req, res) => {
    try {
      const { drug } = req.body;
      if (!drug || !drug.code || !drug.name) {
        return res.status(400).json({ error: '药品编码和名称为必填项' });
      }
      Drugs.upsert(drug);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/drugs/:code', authenticateToken, async (req, res) => {
    try {
      const code = req.params.code;
      Drugs.delete(code);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- 同步接口（兼容旧版） ----------
  app.post('/api/sync', authenticateToken, async (req, res) => {
    const { drugs, inbound, outbound, params } = req.body;
    try {
      const transaction = db.transaction(() => {
        // 清空旧数据并重新插入
        db.prepare('DELETE FROM drugs').run();
        db.prepare('DELETE FROM inbound').run();
        db.prepare('DELETE FROM outbound').run();
        db.prepare('DELETE FROM params').run();

        // 插入药品
        for (const drug of drugs || []) {
          Drugs.upsert(drug);
        }

        // 插入入库
        for (const rec of inbound || []) {
          InboundModel.insert({
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
            batchNo: rec.batchNo || '',
            prodDate: rec.prodDate || '',
            expDate: rec.expDate || '',
            remaining: rec.remaining ?? rec.qty,
            discarded: rec.discarded || false
          });
        }

        // 插入出库
        for (const rec of outbound || []) {
          OutboundModel.insert({
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
            batchNo: rec.batchNo || ''
          });
        }

        // 插入参数
        for (const [key, value] of Object.entries(params || {})) {
          Params.set(key, value);
        }
      });

      transaction();
      res.json({ success: true });
    } catch(err: any) {
      console.error(`[同步失败] ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- 参数配置接口 ----------
  app.post('/api/params', authenticateToken, async (req, res) => {
    try {
      const { params: newParams } = req.body;
      for (const [key, value] of Object.entries(newParams || {})) {
        Params.set(key, value);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- 报废记录接口 ----------
  app.post('/api/discard', authenticateToken, async (req, res) => {
    try {
      const { date, code, batchNo, expDate, qty } = req.body;
      if (!code || !qty) {
        return res.status(400).json({ error: '药品编码和数量为必填项' });
      }

      const drug = Drugs.findByCode(code);
      if (!drug) {
        return res.status(400).json({ error: '药品编码不存在' });
      }

      Discards.insert({
        date,
        code,
        name: drug.name,
        batchNo,
        expDate,
        qty
      });

      // 标记对应入库记录为报废
      if (batchNo) {
        const records = InboundModel.all().filter((r: any) => r.code === code && r.batchNo === batchNo);
        for (const rec of records) {
          InboundModel.updateRemaining(rec.id, Math.max(0, rec.remaining - qty));
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- 统计接口 ----------
  app.get('/api/stats/dashboard', authenticateToken, async (req, res) => {
    try {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().toISOString().slice(0, 7);
      
      const drugCount = Drugs.all().length;
      const inboundCount = InboundModel.all().length;
      const outboundCount = OutboundModel.all().length;
      
      const inboundTotal = InboundModel.all().reduce((sum: number, r: any) => sum + r.qty, 0);
      const outboundTotal = OutboundModel.all().reduce((sum: number, r: any) => sum + r.qty, 0);
      
      const monthlyInbound = InboundModel.all()
        .filter((r: any) => r.date && r.date.startsWith(currentMonth))
        .reduce((sum: number, r: any) => sum + r.qty, 0);
      const monthlyOutbound = OutboundModel.all()
        .filter((r: any) => r.date && r.date.startsWith(currentMonth))
        .reduce((sum: number, r: any) => sum + r.qty, 0);

      // 库存预警
      const lowStockDrugs = Stats.getLowStock();
      const expiringSoon = Stats.getExpiringSoon(90);
      const expired = Stats.getExpired();

      res.json({
        drugs: drugCount,
        inboundRecords: inboundCount,
        outboundRecords: outboundCount,
        inboundTotal,
        outboundTotal,
        monthlyInbound,
        monthlyOutbound,
        lowStockCount: lowStockDrugs.length,
        expiringCount: expiringSoon.length,
        expiredCount: expired.length
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- 错误处理中间件 ----------
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`[Server Error] ${req.method} ${req.path}:`, err.message);
    if (NODE_ENV !== 'production') {
      console.error(err.stack);
    }
    res.status(err.status || 500).json({
      error: NODE_ENV === 'production' ? '服务器内部错误' : err.message
    });
  });

  // ---------- 静态文件服务 ----------
  if (NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // ---------- 优雅关闭 ----------
  const shutdown = (signal: string) => {
    console.log(`[Shutdown] 收到 ${signal}，正在关闭服务器...`);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] 运行于 http://0.0.0.0:${PORT} | 环境: ${NODE_ENV} | 数据库: SQLite`);
    console.log(`[Server] 健康检查: http://localhost:${PORT}/api/health`);
  });
}

startServer().catch(console.error);
