require('dotenv').config()

const OpenAI = require('openai')

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// 🔹 Mensagem após contribuição (altar / sacrifício)
async function generateContributionMessage() {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: `
Gere uma frase curta, espiritual e impactante sobre "altar e reforma".

A frase deve:
- ser curta (máximo 20 palavras)
- ter linguagem cristã profética
- conectar entrega (altar) com restauração (reforma)
- soar natural, não robótica
- não repetir sempre a mesma estrutura
- Insira uma referência bíblica abreviada. Exemplo: Mt 7:7

Evite:
- frases longas
- explicações
- emojis
- repetir exatamente a mesma construção

Retorne apenas a frase.
`
        }
      ]
    })

    const text = response.choices[0].message.content.trim()

    return `💛 *_${text}_*`
  } catch (error) {
    console.error('Erro OpenAI (contribution):', error)

    // 🔥 fallback padrão (com base bíblica)
    return `💛 *_O altar fala de entrega e memorial diante de Deus. Quando há sacrifício, o céu responde com favor. (Gênesis 8:20-21)_*`
  }
}

// 🔹 Mensagem de incentivo (cron)
async function generateProgressMessage(total, goal) {
  try {
    const percent = ((total / goal) * 100).toFixed(1)

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: `
Estamos em uma campanha de arrecadação.

Meta: R$ ${goal}
Arrecadado: R$ ${total}
Percentual: ${percent}%

Gere uma mensagem curta (máx 2 linhas), encorajadora, pastoral e motivacional, incentivando a igreja a continuar contribuindo.

Não use emojis.
`
        }
      ]
    })

    const text = response.choices[0].message.content.trim()

    return `💛 *_${text}_*`
  } catch (error) {
    console.error('Erro OpenAI (progress):', error)

    return `💛 *_Estamos avançando! Seguimos firmes, crendo que alcançaremos o propósito. Vamos juntos!_*`
  }
}

module.exports = {
  generateContributionMessage,
  generateProgressMessage
}