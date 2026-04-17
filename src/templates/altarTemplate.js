function buildMessage(group, extraMessage = '', formatCurrency) {
    const total = group.contributions.reduce((sum, c) => sum + c.amount, 0)

    let list = ''

    const sorted = [...group.contributions].sort((a, b) => {
        const [dayA, monthA] = a.date.split('/').map(Number)
        const [dayB, monthB] = b.date.split('/').map(Number)

        const dateA = new Date(2024, monthA - 1, dayA)
        const dateB = new Date(2024, monthB - 1, dayB)

        return dateA - dateB
    })

    if (sorted.length === 0) {
        list = '_Ainda não há contribuições_'
    } else {
        sorted.forEach((c, i) => {
            list += `\`${i + 1}. ${c.date}, ${c.name}, R$ ${formatCurrency(c.amount)}\`\n`
        })
    }

    let stepsText = ''

    if (group.steps && group.steps.length > 0) {
        group.steps.forEach((step) => {
            const icon = step.done ? '☑' : '☐'
            if (step.done) {
                stepsText += `${icon} ~${step.label} - R$ ${formatCurrency(step.amount)}~\n`
            } else {
                stepsText += `${icon} ${step.label} - R$ ${formatCurrency(step.amount)}\n`
            }
        })
    }

    return `*========================*
*ALTAR & REFORMA*
*META | R$ ${formatCurrency(group.goal)}* 
*========================*
${stepsText ? stepsText + '\n' : ''}
_No altar, entregamos. Na reforma, somos restaurados._

Contribuições recebidas:
*\`R$ ${formatCurrency(total)}\`* 💴

${list}
---
${extraMessage}`
}

module.exports = buildMessage