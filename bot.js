const { Telegraf, Markup } = require('telegraf')
const http = require('http')

const bot = new Telegraf(process.env.BOT_TOKEN)
const API = 'https://edu.donstu.ru/api'

// Хранилище состояний пользователей
const userState = {}

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

// Форматирование пары
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
  userState[ctx.from.id] = 'waiting_group'
  ctx.reply('🔍 Введи название группы (например: ИВТ-11):')
})

// --- ПРЕПОДАВАТЕЛИ ---
bot.action('by_teacher', async (ctx) => {
  ctx.answerCbQuery()
  userState[ctx.from.id] = 'waiting_teacher'
  ctx.reply('🔍 Введи фамилию преподавателя (например: Иванов):')
})

// --- АУДИТОРИИ ---
bot.action('by_aud', async (ctx) => {
  ctx.answerCbQuery()
  userState[ctx.from.id] = 'waiting_aud'
  ctx.reply('🔍 Введи номер аудитории (например: 304):')
})

// --- Расписание группы ---
bot.action(/^group_(\d+)$/, async (ctx) => {
  ctx.answerCbQuery()
  const groupId = ctx.match[1]
  try {
    const res = await fetch(`${API}/Rasp?idGroup=${groupId}`)
    const data = await res.json()
    const lessons = data.data?.rasp?.slice(0, 5)

    if (!lessons?.length) {
      return ctx.reply('Расписание не найдено 😢', mainMenu)
    }

    let text = '📅 Расписание группы (ближайшие пары):\n\n'
    lessons.forEach(l => { text += formatLesson(l) + '\n' })
    ctx.reply(text, mainMenu)
  } catch (e) {
    ctx.reply('Ошибка загрузки расписания 😢', mainMenu)
  }
})

// --- Расписание преподавателя ---
bot.action(/^teacher_(\d+)$/, async (ctx) => {
  ctx.answerCbQuery()
  const teacherId = ctx.match[1]
  try {
    const res = await fetch(`${API}/Rasp?idTeacher=${teacherId}`)
    const data = await res.json()
    const lessons = data.data?.rasp?.slice(0, 5)

    if (!lessons?.length) {
      return ctx.reply('Расписание не найдено 😢', mainMenu)
    }

    let text = '📅 Расписание преподавателя (ближайшие пары):\n\n'
    lessons.forEach(l => { text += formatLesson(l) + '\n' })
    ctx.reply(text, mainMenu)
  } catch (e) {
    ctx.reply('Ошибка загрузки расписания 😢', mainMenu)
  }
})

// --- Расписание аудитории ---
bot.action(/^aud_(\d+)$/, async (ctx) => {
  ctx.answerCbQuery()
  const audId = ctx.match[1]
  try {
    const res = await fetch(`${API}/Rasp?idAudLine=${audId}`)
    const data = await res.json()
    const lessons = data.data?.rasp?.slice(0, 5)

    if (!lessons?.length) {
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
  userState[ctx.from.id] = null
  ctx.reply('Выбери тип поиска 👇', mainMenu)
})

// --- Обработка текстового ввода ---
bot.on('text', async (ctx) => {
  const state = userState[ctx.from.id]
  const query = ctx.message.text.toLowerCase()

  // Поиск группы
  if (state === 'waiting_group') {
    try {
      const year = await getCurrentYear()
      const res = await fetch(`${API}/raspGrouplist?year=${year}`)
      const data = await res.json()
      const found = data.data.filter(g =>
        g.name.toLowerCase().includes(query)
      ).slice(0, 20)

      if (!found.length) {
        return ctx.reply('Группа не найдена 😢 Попробуй ещё раз:')
      }

      const buttons = found.map(g => [
        Markup.button.callback(g.name, `group_${g.id}`)
      ])
      buttons.push([Markup.button.callback('🔙 Назад', 'back')])
      userState[ctx.from.id] = null
      ctx.reply('Выбери группу:', Markup.inlineKeyboard(buttons))
    } catch (e) {
      ctx.reply('Ошибка 😢', mainMenu)
    }
    return
  }

  // Поиск преподавателя
  if (state === 'waiting_teacher') {
    try {
      const year = await getCurrentYear()
      const res = await fetch(`${API}/raspTeacherlist?year=${year}`)
      const data = await res.json()
      const found = data.data.filter(t =>
        t.name.toLowerCase().includes(query)
      ).slice(0, 20)

      if (!found.length) {
        return ctx.reply('Преподаватель не найден 😢 Попробуй ещё раз:')
      }

      const buttons = found.map(t => [
        Markup.button.callback(t.name, `teacher_${t.id}`)
      ])
      buttons.push([Markup.button.callback('🔙 Назад', 'back')])
      userState[ctx.from.id] = null
      ctx.reply('Выбери преподавателя:', Markup.inlineKeyboard(buttons))
    } catch (e) {
      ctx.reply('Ошибка 😢', mainMenu)
    }
    return
  }

  // Поиск аудитории
  if (state === 'waiting_aud') {
    try {
      const year = await getCurrentYear()
      const res = await fetch(`${API}/raspAudlist?year=${year}`)
      const data = await res.json()
      const found = data.data.filter(a =>
        a.name.toLowerCase().includes(query)
      ).slice(0, 20)

      if (!found.length) {
        return ctx.reply('Аудитория не найдена 😢 Попробуй ещё раз:')
      }

      const buttons = found.map(a => [
        Markup.button.callback(a.name, `aud_${a.id}`)
      ])
      buttons.push([Markup.button.callback('🔙 Назад', 'back')])
      userState[ctx.from.id] = null
      ctx.reply('Выбери аудиторию:', Markup.inlineKeyboard(buttons))
    } catch (e) {
      ctx.reply('Ошибка 😢', mainMenu)
    }
    return
  }

  // Если не ждём ввода
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