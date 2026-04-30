/**
 * PM2 example — adjust cwd / script path after `npm run build`.
 * Usage: pm2 start deploy/ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'artha-v4',
      cwd: '..',
      script: 'dist/api/server.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
}
