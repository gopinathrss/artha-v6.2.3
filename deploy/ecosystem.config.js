module.exports = {
  apps: [
    {
      name: 'artha-v4',
      script: 'npm',
      args: 'start',
      cwd: '/opt/artha',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: '/var/log/artha/error.log',
      out_file: '/var/log/artha/out.log',
      max_memory_restart: '500M'
    }
  ]
}
