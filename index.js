require('dotenv').config()

process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('❌ UNHANDLED REJECTION:', err)
})

const config = require('./src/config')
const { loadProcessed, saveProcessed } = require('./processedStore')
const buildMessage = require('./src/templates/altarTemplate')
const fs = require('fs')
const pathLib = require('path')

const sessionPath = pathLib.resolve(
    config.TOKEN_FOLDER,
    config.SESSION_NAME
)

const puppeteer = require('puppeteer')
process.env.PUPPETEER_EXECUTABLE_PATH = require('puppeteer').executablePath()
const groupLocks = new Map()

async function withGroupLock(jid, fn) {
    const current = groupLocks.get(jid) || Promise.resolve()

    let resolveNext
    const next = new Promise(resolve => (resolveNext = resolve))

    groupLocks.set(jid, current.then(() => next))

    try {
        await current
        return await fn()
    } finally {
        resolveNext()
    }
}

try {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path, { recursive: true })
    }

    fs.readdirSync(path)
        .filter(f => f.startsWith('Singleton'))
        .forEach(f => fs.unlinkSync(`${path}/${f}`))
} catch (e) {
    console.log('[ALTAR BOT] erro limpando sessão:', e.message)
}

const wppconnect = require('@wppconnect-team/wppconnect')

const { load, save } = require('./storage')
const {
    generateContributionMessage,
    generateProgressMessage
} = require('./openai')

// 🔐 OWNER (número da igreja)
const OWNER = '5519971798148'

// 📦 Estado em memória
const lists = load()

let clientGlobal = null

function log(...args) {
    console.log('[ALTAR BOT]', ...args)
}

function extractNumber(id) {
    if (!id) return null
    return id.split('@')[0]
}

function botMessage(text) {
    return `🤖 *#bot*\n${text}`
}

async function sendMessage(to, text) {
    if (!clientGlobal) {
        console.log('❌ CLIENT NÃO DISPONÍVEL')
        console.log('🚨 exit bloqueado para estabilização')
    }

    try {
        await clientGlobal.sendText(to, text)
    } catch (error) {
        console.log('❌ ERRO AO ENVIAR MENSAGEM - RESTARTANDO')
        console.error(error)
        console.log('🚨 exit bloqueado para estabilização')
    }
}

function formatCurrency(value) {
    return value.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })
}

function capitalizeName(text) {
    return text
        .toLowerCase()
        .split(' ')
        .map(word => {
            if (!word) return ''
            return word.charAt(0).toUpperCase() + word.slice(1)
        })
        .join(' ')
}

let lastActivityAt = Date.now()
let lastHeartbeatOk = Date.now()

const processedMessages = loadProcessed()

const repliedMessages = new Set()

// 🚀 START
async function start() {

    const executablePath = puppeteer.executablePath()

    const client = await wppconnect.create({
        session: config.SESSION_NAME,
        folderNameToken: config.TOKEN_FOLDER,

        puppeteerOptions: {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process',
                '--no-zygote'
            ]
        }
    })

    clientGlobal = client

    client.onStateChange((state) => {
        console.log('📡 STATE CHANGE:', state)

        const invalidStates = ['CONFLICT', 'UNPAIRED', 'UNPAIRED_IDLE']

        if (invalidStates.includes(state)) {
            console.log('❌ ESTADO INVÁLIDO - RESTARTANDO')
            console.log('🚨 exit bloqueado para estabilização')
        }
    })

    let streamFailures = 0

    client.onStreamChange((state) => {
        console.log('🌐 STREAM:', state)

        if (state === 'DISCONNECTED') {
            streamFailures++

            console.log(`⚠️ STREAM FAIL (${streamFailures})`)

            // reduz falhas ao longo do tempo (evita falso positivo)
            setTimeout(() => {
                streamFailures = Math.max(0, streamFailures - 1)
            }, 10000)

            if (streamFailures >= 5) {
                console.log('❌ STREAM INSTÁVEL - RESTARTANDO')
                console.log('🚨 exit bloqueado para estabilização')
            }
        } else {
            streamFailures = 0
        }
    })

    log('✅ Bot conectado')

    setInterval(async () => {
        try {
            if (!clientGlobal) {
                console.log('❌ CLIENT NULO - RESTARTANDO')
                console.log('🚨 exit bloqueado para estabilização')
            }

            const state = await clientGlobal.getConnectionState()

            console.log('💓 HEARTBEAT:', state)

            if (state === 'CONNECTED') {
                lastHeartbeatOk = Date.now()
            }

            const invalid = ['UNPAIRED', 'UNPAIRED_IDLE']

            if (invalid.includes(state)) {
                console.log('⚠️ estado crítico detectado no heartbeat')
                console.log('🚨 exit bloqueado para estabilização')
            }

        } catch (err) {
            console.log('❌ ERRO NO HEARTBEAT - RESTARTANDO')
            console.error(err)
            console.log('🚨 exit bloqueado para estabilização')
        }
    }, 2 * 60 * 1000)

    setInterval(() => {
        const diff = Date.now() - lastHeartbeatOk

        if (diff > 10 * 60 * 1000) {
            console.log('🚨 BOT ZUMBI DETECTADO - RESTARTANDO')
            process.exit(1)
        }
    }, 60 * 1000)

    client.onAnyMessage(async (message) => {

        try {

            if (!message.isGroupMsg) return
            if (message.type !== 'chat') return

            const jid = message.chatId

            await withGroupLock(jid, async () => {

                if (processedMessages.has(message.id)) {
                    return
                }

                processedMessages.add(message.id)
                saveProcessed(processedMessages)

                // evita crescimento infinito
                if (processedMessages.size > 1000) {
                    processedMessages.clear()
                }

                lastActivityAt = Date.now()
                console.log('MSG RECEBIDA:', message.body)

                const text = message.body?.trim().toLowerCase()
                if (!text) return

                const rawSender = message.author || message.from || ''
                const sender = rawSender.replace(/\D/g, '')

                const ownerNumber = config.OWNER.replace(/\D/g, '')

                console.log('RAW SENDER:', rawSender)
                console.log('SENDER LIMPO:', sender)
                console.log('OWNER:', ownerNumber)
                console.log('FROM:', message.from)
                console.log('AUTHOR:', message.author)
                console.log('FROM_ME:', message.fromMe)
                console.log('CHAT_ID:', message.chatId)

                const normalizedAuthor = (message.author || '')
                    .split(':')[0]
                    .replace('@lid', '')

                const isOwner = normalizedAuthor === '72422258655250'

                if (!lists[jid]) {
                    lists[jid] = {
                        open: false,
                        contributions: [],
                        goal: 30000,
                        goalReached: false,
                        steps: []
                    }
                }

                const group = lists[jid]

                if (!group.steps) {
                    group.steps = []
                }

                // 🔒 BLOQUEIO GLOBAL
                if (!group.open && !text.startsWith('/altar')) {
                    return
                }

                // 🚀 INICIAR CAMPANHA
                if (text.startsWith('/altar')) {
                    console.log('🔥 ENTROU NO /ALTAR')

                    if (!isOwner) {
                        console.log('❌ NÃO É OWNER')
                        return
                    }

                    console.log('✅ É OWNER')

                    group.open = true
                    group.contributions = []
                    group.steps = []
                    group.goal = 30000
                    group.goalReached = false

                    save(lists)

                    const aiMessage = await generateContributionMessage()

                    if (repliedMessages.has(message.id)) return
                    repliedMessages.add(message.id)

                    if (repliedMessages.size > 1000) {
                        repliedMessages.clear()
                    }

                    await sendMessage(
                        jid,
                        botMessage(buildMessage(group, aiMessage, formatCurrency))
                    )

                    console.log('🚀 MENSAGEM ENVIADA')

                    return
                }

                // 🔒 ENCERRAR CAMPANHA
                if (text === '/finalizar') {
                    if (!isOwner) return

                    group.open = false

                    save(lists)

                    await sendMessage(
                        jid,
                        botMessage(`Contribuições encerradas! Agradecemos a todos pelo coração generoso de cada um de vocês`)
                    )

                    // 🔥 envia lista final
                    await sendMessage(
                        jid,
                        botMessage(buildMessage(group, formatCurrency))
                    )

                    return
                }

                // 🎯 AJUSTAR META
                if (text.startsWith('/meta')) {
                    if (!isOwner) return

                    const valueRaw = text.replace('/meta', '').trim()

                    if (!valueRaw) {
                        await sendMessage(
                            jid,
                            botMessage(`Use: /meta 30000`)
                        )
                        return
                    }

                    // 🔧 parse robusto (mesmo padrão que você já usa)
                    const normalized = valueRaw
                        .replace(/R\$/i, '')
                        .replace(/\s/g, '')

                    let value

                    if (normalized.includes(',')) {
                        value = parseFloat(
                            normalized
                                .replace(/\./g, '')
                                .replace(',', '.')
                        )
                    } else {
                        value = parseFloat(normalized)
                    }

                    if (isNaN(value) || value <= 0) {
                        await sendMessage(
                            jid,
                            botMessage(`Valor inválido.`)
                        )
                        return
                    }

                    // ❌ não permite meta menor que o arrecadado
                    const total = group.contributions.reduce((s, c) => s + c.amount, 0)

                    if (value < total) {
                        await sendMessage(
                            jid,
                            botMessage(`A meta não pode ser menor que o valor já arrecadado.`)
                        )
                        return
                    }

                    group.goal = value

                    save(lists)

                    await sendMessage(
                        jid,
                        botMessage(`Meta ajustada.`)
                    )

                    await sendMessage(
                        jid,
                        botMessage(buildMessage(group, formatCurrency))
                    )

                    return
                }

                // 👀 VER LISTA (LEMBRETE)
                if (text === '/ver') {
                    if (!isOwner) return
                    if (!group.open) return

                    const total = group.contributions.reduce((sum, c) => sum + c.amount, 0)

                    const restante = group.goal - total

                    const percentual = group.goal > 0
                        ? Math.max(0, (restante / group.goal) * 100)
                        : 0

                    const percentualFormatado = percentual.toFixed(0)

                    const message = `💛 _Lembre-se: estamos juntos na reconstrução do altar._\n*Faltam ${percentualFormatado}%* para alcançarmos esse propósito.`

                    await sendMessage(
                        jid,
                        botMessage(buildMessage(group, message, formatCurrency))
                    )

                    return
                }

                // 🏗️ GERENCIAR ETAPAS (ADICIONAR)
                if (text.startsWith('/etapas')) {
                    if (!isOwner) return

                    const content = text.replace('/etapas', '').trim()

                    // ❌ REMOVER ETAPA
                    if (content.startsWith('-')) {
                        const index = parseInt(content)

                        if (isNaN(index)) {
                            await sendMessage(
                                jid,
                                botMessage(`Use: /etapas -2`)
                            )
                            return
                        }

                        const position = Math.abs(index) - 1

                        if (position < 0 || position >= group.steps.length) {
                            await sendMessage(
                                jid,
                                botMessage(`Índice inválido.`)
                            )
                            return
                        }

                        group.steps.splice(position, 1)

                        save(lists)

                        await sendMessage(
                            jid,
                            botMessage(`Etapas ajustadas.`)
                        )

                        await sendMessage(
                            jid,
                            botMessage(buildMessage(group, formatCurrency))
                        )

                        return
                    }

                    // ✏️ EDITAR ETAPA
                    const editMatch = content.match(/^(\d+)\s+(.+?):\s*(.+)$/)

                    if (editMatch) {
                        const index = parseInt(editMatch[1])
                        const label = editMatch[2].trim()
                        const amountRaw = editMatch[3].trim()

                        const position = index - 1

                        const current = group.steps[position]

                        // ❌ não permite editar etapa concluída
                        if (current.done) {
                            await sendMessage(
                                jid,
                                botMessage(`Não é possível editar uma etapa já concluída.`)
                            )
                            return
                        }

                        // valida nome (case insensitive)
                        if (!current.label.toLowerCase().includes(label.toLowerCase())) {
                            await sendMessage(
                                jid,
                                botMessage(`A etapa no índice ${index} não corresponde a esse nome.`)
                            )
                            return
                        }

                        if (position < 0 || position >= group.steps.length) {
                            await sendMessage(
                                jid,
                                botMessage(`Índice inválido.`)
                            )
                            return
                        }

                        // 🔧 parse robusto (mesmo padrão que você já corrigiu)
                        const normalized = amountRaw
                            .replace(/R\$/i, '')
                            .replace(/\s/g, '')

                        let amount

                        if (normalized.includes(',')) {
                            amount = parseFloat(
                                normalized
                                    .replace(/\./g, '')
                                    .replace(',', '.')
                            )
                        } else {
                            amount = parseFloat(normalized)
                        }

                        if (!label || isNaN(amount)) {
                            await sendMessage(
                                jid,
                                botMessage(`Use: /etapas 2 Nome: Valor`)
                            )
                            return
                        }

                        // mantém status done
                        group.steps[position].label = label
                        group.steps[position].amount = amount

                        save(lists)

                        await sendMessage(
                            jid,
                            botMessage(`Etapas ajustadas.`)
                        )

                        await sendMessage(
                            jid,
                            botMessage(buildMessage(group, formatCurrency))
                        )

                        return
                    }

                    // formato: Nome: Valor
                    const parts = content.split(':')

                    if (parts.length !== 2) {
                        await sendMessage(
                            jid,
                            botMessage(`Use: /etapas Nome: Valor`)
                        )
                        return
                    }

                    const label = parts[0].trim()
                    const amountRaw = parts[1].trim()

                    const normalized = amountRaw
                        .replace(/R\$/i, '')
                        .replace(/\s/g, '')

                    let amount

                    if (normalized.includes(',')) {
                        amount = parseFloat(
                            normalized
                                .replace(/\./g, '')
                                .replace(',', '.')
                        )
                    } else {
                        amount = parseFloat(normalized)
                    }

                    if (!label || isNaN(amount)) {
                        await sendMessage(
                            jid,
                            botMessage(`Use: /etapas Nome: Valor`)
                        )
                        return
                    }

                    group.steps.push({
                        label,
                        amount,
                        done: false
                    })

                    save(lists)

                    await sendMessage(
                        jid,
                        botMessage(`Etapas ajustadas.`)
                    )

                    await sendMessage(
                        jid,
                        botMessage(buildMessage(group, formatCurrency))
                    )

                    return
                }

                // ✅ MARCAR ETAPA COMO CONCLUÍDA
                if (text.startsWith('/feito')) {
                    if (!isOwner) return

                    const parts = text.split(' ')
                    const index = parseInt(parts[1])

                    if (isNaN(index)) {
                        await sendMessage(
                            jid,
                            botMessage(`Use: /feito 1`)
                        )
                        return
                    }

                    const position = index - 1

                    if (position < 0 || position >= group.steps.length) {
                        await sendMessage(
                            jid,
                            botMessage(`Índice inválido.`)
                        )
                        return
                    }

                    const step = group.steps[position]

                    // já concluída
                    if (step.done) {
                        await sendMessage(
                            jid,
                            botMessage(`Essa etapa já foi concluída.`)
                        )
                        return
                    }

                    // 💰 total arrecadado
                    const totalArrecadado = group.contributions.reduce(
                        (sum, c) => sum + c.amount,
                        0
                    )

                    // 💰 total já concluído
                    const totalConcluido = group.steps
                        .filter(s => s.done)
                        .reduce((sum, s) => sum + s.amount, 0)

                    // 🔥 VALIDAÇÃO
                    if (totalConcluido + step.amount > totalArrecadado) {
                        await sendMessage(
                            jid,
                            botMessage(`Valor arrecadado ainda não cobre essa etapa.`)
                        )
                        return
                    }

                    // ✅ marca como concluída
                    step.done = true

                    save(lists)

                    await sendMessage(
                        jid,
                        botMessage(`Etapa marcada como concluída.`)
                    )

                    await sendMessage(
                        jid,
                        botMessage(buildMessage(group, formatCurrency))
                    )

                    return
                }

                // 💰 CONTRIBUIÇÃO (robusto)
                let name, date, amountRaw

                // 🔵 Formato B (começa com data): 12/04, Nome, R$ 100,00
                let match = text.match(/^(\d{1,2}\/\d{1,2})[,\s]+(.+?)[,\s]+(.+)$/)

                if (match) {
                    date = match[1].trim()
                    name = match[2].trim()
                    amountRaw = match[3].trim()
                } else {
                    // 🟢 Formato A: Nome 12/04 100
                    match = text.match(/^(.+?)\s+(\d{1,2}\/\d{1,2})[,\s]+(.+)$/)

                    if (match) {
                        name = match[1].trim()
                        date = match[2].trim()
                        amountRaw = match[3].trim()
                    }
                }

                if (name && date && amountRaw) {
                    if (!group.open) return

                    // 🔧 Normaliza valor
                    const normalized = amountRaw
                        .replace(/R\$/i, '')
                        .replace(/\s/g, '')

                    let amount

                    if (normalized.includes(',')) {
                        amount = parseFloat(
                            normalized
                                .replace(/\./g, '')
                                .replace(',', '.')
                        )
                    } else {
                        amount = parseFloat(normalized)
                    }

                    const finalName = capitalizeName(name)

                    // 📅 valida data futura
                    const [day, month] = date.split('/').map(Number)

                    const today = new Date()
                    const currentYear = today.getFullYear()

                    const inputDate = new Date(currentYear, month - 1, day)

                    // zera hora pra comparar só data
                    today.setHours(0, 0, 0, 0)

                    if (inputDate > today) {
                        await sendMessage(
                            jid,
                            botMessage(`Não é permitido inserir uma data futura.`)
                        )
                        return
                    }

                    if (!finalName || !date || isNaN(amount)) {
                        await sendMessage(
                            jid,
                            botMessage(`Formato inválido.
        Use: Nome Dia/Mês Valor
        Ex: João 12/04 100`)
                        )
                        return
                    }

                    group.contributions.push({ name: finalName, date, amount })

                    save(lists)

                    const aiMessage = await generateContributionMessage()

                    await sendMessage(
                        jid,
                        botMessage(buildMessage(group, aiMessage, formatCurrency))
                    )

                    return
                }

                // ❌ REMOVER CONTRIBUIÇÃO (OWNER)
                if (text.startsWith('! remover')) {
                    if (!isOwner) return

                    const parts = text.split(' ')
                    const index = parseInt(parts[2])

                    if (isNaN(index)) {
                        await sendMessage(
                            jid,
                            botMessage(`Use: ! remover 2`)
                        )
                        return
                    }

                    const sorted = [...group.contributions].sort((a, b) => {
                        const [dayA, monthA] = a.date.split('/').map(Number)
                        const [dayB, monthB] = b.date.split('/').map(Number)

                        const dateA = new Date(2024, monthA - 1, dayA)
                        const dateB = new Date(2024, monthB - 1, dayB)

                        return dateA - dateB
                    })

                    if (index < 1 || index > sorted.length) {
                        await sendMessage(
                            jid,
                            botMessage(`Número inválido.`)
                        )
                        return
                    }

                    const itemToRemove = sorted[index - 1]

                    group.contributions = group.contributions.filter(
                        c =>
                            !(
                                c.name === itemToRemove.name &&
                                c.date === itemToRemove.date &&
                                c.amount === itemToRemove.amount
                            )
                    )

                    save(lists)

                    const aiMessage = await generateContributionMessage()

                    await sendMessage(
                        jid,
                        botMessage(buildMessage(group, aiMessage, formatCurrency))
                    )

                    return
                }
            })

        } catch (err) {
            console.error('❌ ERRO NO HANDLER:', err)
        }
    })
}


start()