const { Telegraf, Markup } = require('telegraf')
const http = require('http')

const bot = new Telegraf(process.env.BOT_TOKEN)
const API = 'https://edu.donstu.ru/api'

// Получить текущий год
async function getCurrentYear() {
  const res = await fetch(`${API}/Rasp/ListYears`)
  const data = await res.json()
  const years = data.data.years
  return years[years.length - 1]
}

// Главное меню
const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('👥 По группе', 'by_group')],
  [Markup.button.callback('👨‍🏫 По преподавателю', 'by_teacher')],
  [Markup.button.callback('🏫 По аудитории', 'by_aud')]
])

// Форматирование расписания
function formatLesson(l) {
  return (
    `📅 ${l.дата} | ⏰ ${l.начало} - ${l.конец}\n` +
    `📚 ${l.дисциплина}\n` +
    `👨‍🏫 ${l.преподаватель}\n` +
    `🏫 Аудитория: ${l.аудитория}\n` +
    `👥 Группа: ${l.группа}\n`
  )
}

// /start
bot.start((ctx) => {
  ctx.reply('📅 Расписание ДГТУ\n\nВыбери тип поиска 👇', mainMenu)
})

// --- ГРУППЫ ---
bot.action('by_group', async (ctx) => {
  ctx.answerCbQuery()
  try {
    const year = await getCurrentYear()
    const res = await fetch(`${API}/raspGrouplist?year=${year}`)
    const data = await res.json()
    const groups = data.data.slice(0, 30)

    const buttons = groups.map(g => [
      Markup.button.callback(g.name, `group_${g.id}`)
    ])
    buttons.push([Markup.button.callback('🔙 Назад', 'back')])

    ctx.reply('Выбери группу:', Markup.inlineKeyboard(buttons))
  } catch (e) {
    ctx.reply('Ошибка загрузки групп 😢', mainMenu)
  }
})

bot.action(/^group_(\d+)$/, async (ctx) => {
  ctx.answerCbQuery()
  const groupId = ctx.match[1]
  try {
    const res = await fetch(`${API}/Rasp?idGroup=${groupId}`)
    const data = await res.json()
    const lessons = data.data.rasp.slice(0, 5)

    if (!lessons.length) {
      return ctx.reply('Расписание не найдено 😢', mainMenu)
    }

    let text = '📅 Расписание группы (ближайшие пары):\n\n'
    lessons.forEach(l => { text += formatLesson(l) + '\n' })

    ctx.reply(text, mainMenu)
  } catch (e) {
    ctx.reply('Ошибка загрузки расписания 😢', mainMenu)
  }
})

// --- ПРЕПОДАВАТЕЛИ ---
bot.action('by_teacher', async (ctx) => {
  ctx.answerCbQuery()
  try {
    const year = await getCurrentYear()
    const res = await fetch(`${API}/raspTeacherlist?year=${year}`)
    const data = await res.json()
    const teachers = data.data.slice(0, 30)

    const buttons = teachers.map(t => [
      Markup.button.callback(t.name, `teacher_${t.id}`)
    ])
    buttons.push([Markup.button.callback('🔙 Назад', 'back')])

    ctx.reply('Выбери преподавателя:', Markup.inlineKeyboard(buttons))
  } catch (e) {
    ctx.reply('Ошибка загрузки преподавателей 😢', mainMenu)
  }
})

bot.action(/^teacher_(\d+)$/, async (ctx) => {
  ctx.answerCbQuery()
  const teacherId = ctx.match[1]
  try {
    const res = await fetch(`${API}/Rasp?idTeacher=${teacherId}`)
    const data = await res.json()
    const lessons = data.data.rasp.slice(0, 5)

    if (!lessons.length) {
      return ctx.reply('Расписание не найдено 😢', mainMenu)
    }

    let text = '📅 Расписание преподавателя (ближайшие пары):\n\n'
    lessons.forEach(l => { text += formatLesson(l) + '\n' })

    ctx.reply(text, mainMenu)
  } catch (e) {
    ctx.reply('Ошибка загрузки расписания 😢', mainMenu)
  }
})

// --- АУДИТОРИИ ---
bot.action('by_aud', async (ctx) => {
  ctx.answerCbQuery()
  try {
    const year = await getCurrentYear()
    const res = await fetch(`${API}/raspAudlist?year=${year}`)
    const data = await res.json()
    const auds = data.data.slice(0, 30)

    const buttons = auds.map(a => [
      Markup.button.callback(a.name, `aud_${a.id}`)
    ])
    buttons.push([Markup.button.callback('🔙 Назад', 'back')])

    ctx.reply('Выбери аудиторию:', Markup.inlineKeyboard(buttons))
  } catch (e) {
    ctx.reply('Ошибка загрузки аудиторий 😢', mainMenu)
  }
})

bot.action(/^aud_(\d+)$/, async (ctx) => {
  ctx.answerCbQuery()
  const audId = ctx.match[1]
  try {
    const res = await fetch(`${API}/Rasp?idAudLine=${audId}`)
    const data = await res.json()
    const lessons = data.data.rasp.slice(0, 5)

    if (!lessons.length) {
      return ctx.reply('Расписание не найдено 😢', mainMenu)
    }

    let text = '📅 Расписание аудитории (ближайшие пары):\n\n'
    lessons.forEach(l => { text += formatLesson(l) + '\n' })

    ctx.reply(text, mainMenu)
  } catch (e) {
    ctx.reply('Ошибка загрузки расписания 😢', mainMenu)
  }
})

// Назад
bot.action('back', (ctx) => {
  ctx.answerCbQuery()
  ctx.reply('Выбери тип поиска 👇', mainMenu)
})

// Если написали что-то непонятное
bot.on('text', (ctx) => {
  ctx.reply('Выбери тип поиска 👇', mainMenu)
})

// HTTP сервер для Render
const PORT = process.env.PORT || 3000
http.createServer((req, res) => res.end('Bot is running')).listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

bot.launch()
console.log('Бот запущен!')

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))