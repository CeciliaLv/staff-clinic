# 集团医务室 - 药品进销存管理系统

基于 React + TypeScript + Express + SQLite 构建的药品进销存管理系统，适用于集团医务室的日常药品管理工作。

## 功能特性

- **药品档案管理**：药品信息的增删改查、批量导入导出
- **入库管理**：药品入库登记、批号管理、生产日期/有效期追踪
- **出库管理**：药品领用出库、按 FEFO（先进先出）原则扣减库存
- **库存结存**：实时结存报表、月度结存、库存预警
- **批次台账**：批次级别的库存追踪、近效期预警
- **参数设置**：药品分类、仓库仓位等基础参数配置
- **用户管理**：支持新用户注册、密码加密存储

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | SQLite (better-sqlite3) |
| 认证 | JWT + bcrypt |
| 安全 | Helmet, CORS, Rate Limiting, Input Validation |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装与配置

```bash
# 1. 克隆项目
git clone <repository-url>
cd staff-clinic

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，修改以下配置：
#   - JWT_SECRET: 必填，密钥长度 ≥ 32 字符
#   - INIT_ADMIN_PASSWORD: 初始管理员密码
#   - CORS_ORIGIN: 允许的前端域名

# 4. 启动开发服务器
npm run dev
# 访问 http://localhost:3000
```

### 常用命令

```bash
npm run dev          # 开发模式启动
npm run build        # 构建生产版本
npm run start        # 运行生产版本
npm run lint         # TypeScript 类型检查
npm run db:migrate   # 数据迁移（从 db.json 导入到 SQLite）
npm run db:backup    # 数据库备份
```

## 生产部署

### 服务器准备

```bash
# 安装 PM2 进程管理器
npm install -g pm2
```

### 部署步骤

```bash
# 1. 上传构建产物到服务器
# 2. 修改 .env 为生产配置
#    NODE_ENV=production
#    JWT_SECRET=<新生成的密钥>
#    CORS_ORIGIN=https://your-domain.com
# 3. 安装运行依赖
npm install --omit=dev
# 4. 启动服务
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd  # 设置开机自启
```

### Nginx 配置示例

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 数据库说明

系统使用 SQLite 数据库，数据文件存储在 `./data/clinic.db`。

### 数据表结构

| 表名 | 说明 |
|------|------|
| users | 用户表（username + password_hash） |
| drugs | 药品主表 |
| inbound | 入库记录 |
| outbound | 出库记录 |
| discards | 报废记录 |
| params | 参数配置 |
| schema_migrations | 版本迁移记录 |

### 数据备份

```bash
# 手动备份
npm run db:backup
# 自动备份建议：添加定时任务
# crontab -e
# 0 2 * * * cd /opt/staff-clinic && npm run db:backup
```

## 默认账号

- **用户名**: `admin`
- **密码**: 首次启动时通过 `INIT_ADMIN_PASSWORD` 环境变量设置

## 安全说明

- 密码使用 bcrypt 加密存储
- JWT 令牌签名密钥通过环境变量配置
- CORS 限制允许的来源域名
- 登录接口限流防暴力破解
- 输入校验防 SQL 注入

## 许可证

内部系统，未经授权不得分发。
