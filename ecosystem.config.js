module.exports = {
  apps: [
    {
      name: 'altar-bot',
      script: './index.js',

      autorestart: true,

      max_restarts: 10,
      min_uptime: 5000,

      restart_delay: 5000,
      exp_backoff_restart_delay: 100,

      watch: false,

      env: {
        NODE_ENV: 'production'
      }
    }
  ]
}