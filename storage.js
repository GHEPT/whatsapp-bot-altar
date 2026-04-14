const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, 'lists.json')

function load() {
  try {
    if (!fs.existsSync(FILE)) return {}
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'))
  } catch (e) {
    console.error('Erro ao carregar storage', e)
    return {}
  }
}

function save(data) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Erro ao salvar storage', e)
  }
}

module.exports = { load, save }