module.exports = {
  apps: [
    {
      name: "altar-bot",
      script: "./index.js",
      cwd: "/home/bot/projects/whatsapp-bot-altar",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        SESSION_NAME: "altar-bot-2",
        TOKEN_FOLDER: "tokens-altar"
      }
    }
  ]
}