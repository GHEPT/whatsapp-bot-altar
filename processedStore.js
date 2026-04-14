const fs = require('fs')

const FILE = './processed.json'

// Carrega do disco
function loadProcessed() {
  try {
    if (!fs.existsSync(FILE)) return new Set()
    const data = JSON.parse(fs.readFileSync(FILE))
    return new Set(data)
  } catch (e) {
    console.log('[STORE] erro ao carregar:', e.message)
    return new Set()
  }
}

// Salva no disco
function saveProcessed(set) {
  try {
    fs.writeFileSync(FILE, JSON.stringify([...set]))
  } catch (e) {
    console.log('[STORE] erro ao salvar:', e.message)
  }
}

module.exports = {
  loadProcessed,
  saveProcessed
}