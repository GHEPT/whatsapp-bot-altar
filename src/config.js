module.exports = {
  BOT_NAME: process.env.BOT_NAME || 'bot',
  SESSION_NAME: process.env.SESSION_NAME || 'bot-session',
  TOKEN_FOLDER: process.env.TOKEN_FOLDER || 'tokens',

  OWNER: process.env.OWNER || '',

  OPENAI_KEY: process.env.OPENAI_KEY,

  LIST_NAME: process.env.LIST_NAME || 'Lista',
  LIST_GOAL: process.env.LIST_GOAL || 'R$ 0,00'
}