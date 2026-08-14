# PM2 进程管理器配置
# 生产部署使用: pm2 start pm2.config.json

module.exports = {
  apps: [
    {
      name: 'staff-clinic',
      script: 'dist/server.cjs',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/error.log',
      out_file: './logs/output.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ],
};
