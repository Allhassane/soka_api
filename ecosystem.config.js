module.exports = {
  apps: [
    {
      name: 'soka-api',
      script: 'dist/main.js',
      cwd: '/var/www/projects/soka/api',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/var/log/pm2/soka-api-error.log',
      out_file: '/var/log/pm2/soka-api-out.log',
      time: true,
      autorestart: true,
    },
  ],
};
