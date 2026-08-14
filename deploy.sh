#!/bin/bash

# 集团医务室药品进销存管理系统 - 部署脚本
set -e

echo "========================================="
echo " 集团医务室药品进销存管理系统 - 部署脚本"
echo "========================================="
echo ""

# 配置区域
APP_NAME="staff-clinic"
APP_DIR=$(pwd)
PORT=${PORT:-3000}
NODE_ENV=${NODE_ENV:-production}

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检测命令
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 显示帮助
show_help() {
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  install     安装依赖并构建"
    echo "  dev         启动开发服务器"
    echo "  prod        启动生产服务器"
    echo "  stop        停止服务"
    echo "  status      查看服务状态"
    echo "  tunnel      启动内网穿透 (ngrok/localtunnel)"
    echo "  pm2         使用 PM2 部署"
    echo "  nginx       生成 Nginx 配置"
    echo "  all         完整部署 (install + prod + tunnel)"
    echo "  help        显示此帮助信息"
    echo ""
    echo "环境变量:"
    echo "  PORT        端口号 (默认: 3000)"
    echo "  NODE_ENV    环境 (默认: production)"
    echo "  JWT_SECRET  JWT密钥 (必须设置, 至少32字符)"
}

# 安装依赖并构建
do_install() {
    echo -e "${YELLOW}[1/3] 安装依赖...${NC}"
    npm install
    
    echo -e "${YELLOW}[2/3] 构建项目...${NC}"
    npm run build
    
    echo -e "${YELLOW}[3/3] 准备数据目录...${NC}"
    mkdir -p data
    mkdir -p logs
    
    echo -e "${GREEN}✓ 构建完成!${NC}"
}

# 启动开发服务器
do_dev() {
    echo -e "${GREEN}启动开发服务器...${NC}"
    echo "访问地址: http://localhost:5173"
    npm run dev
}

# 启动生产服务器
do_prod() {
    echo -e "${YELLOW}检查是否有旧进程...${NC}"
    pkill -f "node dist/server" 2>/dev/null || true
    sleep 1
    
    echo -e "${GREEN}启动生产服务器...${NC}"
    echo "访问地址: http://localhost:${PORT}"
    
    if [ -n "$JWT_SECRET" ]; then
        echo "JWT_SECRET 已设置"
    else
        echo -e "${YELLOW}警告: JWT_SECRET 未设置，建议设置以确保安全${NC}"
        echo "可使用: export JWT_SECRET='your-secret-key-at-least-32-chars'"
    fi
    
    NODE_ENV=$NODE_ENV PORT=$PORT JWT_SECRET=$JWT_SECRET \
        nohup node dist/server.cjs > logs/server.log 2>&1 &
    
    local PID=$!
    echo $PID > .server.pid
    
    sleep 2
    if kill -0 $PID 2>/dev/null; then
        echo -e "${GREEN}✓ 服务已启动! PID: $PID${NC}"
        echo "日志文件: logs/server.log"
    else
        echo -e "${RED}✗ 服务启动失败，请查看日志: logs/server.log${NC}"
        exit 1
    fi
}

# 停止服务
do_stop() {
    echo -e "${YELLOW}停止服务...${NC}"
    
    if [ -f .server.pid ]; then
        local PID=$(cat .server.pid)
        if kill -0 $PID 2>/dev/null; then
            kill $PID
            echo -e "${GREEN}✓ 服务已停止 (PID: $PID)${NC}"
        else
            echo -e "${YELLOW}服务未在运行${NC}"
        fi
        rm -f .server.pid
    else
        pkill -f "node dist/server" 2>/dev/null && echo -e "${GREEN}✓ 服务已停止${NC}" || echo -e "${YELLOW}没有找到运行中的服务${NC}"
    fi
    
    # 停止内网穿透
    pkill -f localtunnel 2>/dev/null || true
    pkill -f ngrok 2>/dev/null || true
    echo -e "${GREEN}✓ 内网穿透已停止${NC}"
}

# 查看状态
do_status() {
    echo -e "${YELLOW}服务状态检查${NC}"
    echo ""
    
    # 检查后端服务
    if [ -f .server.pid ]; then
        local PID=$(cat .server.pid)
        if kill -0 $PID 2>/dev/null; then
            echo -e "后端服务: ${GREEN}运行中${NC} (PID: $PID)"
            local HEALTH=$(curl -s http://localhost:${PORT}/api/health 2>/dev/null)
            if [ -n "$HEALTH" ]; then
                echo "健康检查: $HEALTH"
            fi
        else
            echo -e "后端服务: ${RED}已停止${NC}"
        fi
    else
        local RUNNING=$(pgrep -f "node dist/server" 2>/dev/null)
        if [ -n "$RUNNING" ]; then
            echo -e "后端服务: ${GREEN}运行中${NC} (PID: $RUNNING)"
        else
            echo -e "后端服务: ${RED}未运行${NC}"
        fi
    fi
    
    # 检查端口
    if command_exists lsof; then
        local PORT_CHECK=$(lsof -i :${PORT} 2>/dev/null | grep LISTEN)
        if [ -n "$PORT_CHECK" ]; then
            echo "端口 ${PORT}: ${GREEN}已监听${NC}"
        else
            echo "端口 ${PORT}: ${RED}未监听${NC}"
        fi
    fi
    
    echo ""
    echo "访问地址: http://localhost:${PORT}"
}

# 启动内网穿透
do_tunnel() {
    echo -e "${YELLOW}启动内网穿透...${NC}"
    echo ""
    
    # 检查后端服务
    if ! curl -s http://localhost:${PORT}/api/health > /dev/null 2>&1; then
        echo -e "${RED}✗ 后端服务未运行，请先执行 '$0 prod'${NC}"
        exit 1
    fi
    
    echo "选择内网穿透服务:"
    echo "  1) ngrok (需要账号认证)"
    echo "  2) localtunnel (免费，无需注册)"
    echo "  3) cloudflared (免费，无需注册)"
    echo "  4) localhost.run (免费，SSH隧道)"
    echo ""
    
    read -p "请输入选项 [1-4]: " CHOICE
    
    case $CHOICE in
        1)
            if command_exists ngrok; then
                echo -e "${GREEN}使用 ngrok...${NC}"
                ngrok http $PORT
            else
                echo -e "${YELLOW}正在通过 npm 安装 ngrok...${NC}"
                npx ngrok http $PORT
            fi
            ;;
        2)
            echo -e "${GREEN}使用 localtunnel...${NC}"
            echo "正在启动，等待公网地址..."
            npx localtunnel --port $PORT
            ;;
        3)
            if command_exists cloudflared; then
                echo -e "${GREEN}使用 cloudflared...${NC}"
                cloudflared tunnel --url http://localhost:$PORT
            else
                echo -e "${YELLOW}cloudflared 未安装，请先安装或使用其他选项${NC}"
                echo "安装方法: brew install cloudflared"
                exit 1
            fi
            ;;
        4)
            echo -e "${GREEN}使用 localhost.run...${NC}"
            # 生成SSH密钥（如果不存在）
            if [ ! -f ~/.ssh/tunnel_key ]; then
                ssh-keygen -t rsa -b 2048 -f ~/.ssh/tunnel_key -N "" -q
            fi
            ssh -o StrictHostKeyChecking=no \
                -o ServerAliveInterval=30 \
                -i ~/.ssh/tunnel_key \
                -R 80:localhost:$PORT \
                ssh.localhost.run
            ;;
        *)
            echo -e "${RED}无效选项${NC}"
            exit 1
            ;;
    esac
}

# PM2 部署
do_pm2() {
    echo -e "${YELLOW}使用 PM2 部署...${NC}"
    
    if ! command_exists pm2; then
        echo -e "${YELLOW}正在安装 PM2...${NC}"
        npm install -g pm2
    fi
    
    # 创建 PM2 配置
    cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'staff-clinic',
    script: 'dist/server.cjs',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production'
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '128M',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
EOF
    
    pm2 start ecosystem.config.js
    pm2 save
    
    echo -e "${GREEN}✓ PM2 部署完成!${NC}"
    echo "常用命令:"
    echo "  pm2 list        查看服务列表"
    echo "  pm2 logs        查看日志"
    echo "  pm2 restart     重启服务"
    echo "  pm2 stop        停止服务"
}

# 生成 Nginx 配置
do_nginx() {
    echo -e "${YELLOW}生成 Nginx 配置...${NC}"
    
    read -p "请输入域名 (例如: clinic.example.com): " DOMAIN
    
    cat > nginx.conf << EOF
server {
    listen 80;
    server_name ${DOMAIN};
    
    # 如果使用 HTTPS，请取消注释以下行并配置SSL证书
    # listen 443 ssl http2;
    # ssl_certificate /etc/nginx/ssl/${DOMAIN}.pem;
    # ssl_certificate_key /etc/nginx/ssl/${DOMAIN}.key;
    
    # 强制HTTPS（可选）
    # if (\$scheme != https) {
    #     return 301 https://\$host\$request_uri;
    # }
    
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:${PORT};
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 1024;
}
EOF
    
    echo -e "${GREEN}✓ Nginx 配置已生成: nginx.conf${NC}"
    echo ""
    echo "部署步骤:"
    echo "  1. 将 nginx.conf 复制到 /etc/nginx/conf.d/${DOMAIN}.conf"
    echo "  2. 测试配置: nginx -t"
    echo "  3. 重载 Nginx: nginx -s reload"
}

# 完整部署
do_all() {
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  完整部署流程${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    
    do_install
    echo ""
    do_prod
    echo ""
    do_tunnel
}

# 主逻辑
case "${1:-help}" in
    install)
        do_install
        ;;
    dev)
        do_dev
        ;;
    prod)
        do_prod
        ;;
    stop)
        do_stop
        ;;
    status)
        do_status
        ;;
    tunnel)
        do_tunnel
        ;;
    pm2)
        do_pm2
        ;;
    nginx)
        do_nginx
        ;;
    all)
        do_all
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}未知选项: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac