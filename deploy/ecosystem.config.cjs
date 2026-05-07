/** PM2 — single fork (in-memory scheduler). Adjust cwd for VPS. */
module.exports = {
  apps: [
    {
      name: 'artha',
      script: 'dist/api/server.js',
      cwd: '/var/www/artha',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '750M',
      env_file: '.env',
      error_file: '/var/log/artha/err.log',
      out_file: '/var/log/artha/out.log',
      merge_logs: true
    }
  ]
}
