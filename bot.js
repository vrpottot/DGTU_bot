const { Telegraf, Markup } = require('telegraf')
const http = require('http')

const bot = new Telegraf(process.env.BOT_TOKEN)
const API = 'https://edu.donstu.ru/api'

const userState = {}

// Получить текущий год
async function getCurrentYear() {
  const res = await fetch(`${API}/Rasp/ListYears`)
  const data = await res.json()
  const years = data.data.years
  return years[years.length - 1]
}

// Дата со смещением
function getDate(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

// Главное меню
const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('👥 По группе', 'by_group')],
  [Markup.button.callback('👨‍🏫 По преподавателю', 'by_teacher')],
  [Markup.button.callback('🏫 По аудитории', 'by_aud')]
])

// Навигация по дням
function navMenu(type, id, offset) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('◀️ Пред. день', `rasp_${type}_${id}_${offset - 1}`),
      Markup.button.callback('След. день ▶️', `rasp_${type}_${id}_${offset + 1}`)
    ],
    [Markup.button.callback('📅 Сегодня', `rasp_${type}_${id}_0`)],
    [Markup.button.callback('🔙 В меню', 'back')]
  ])
}

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

// Универсальная функция показа расписания
async function showRasp(ctx, type, id, offset = 0) {
  const date = getDate(offset)
  const paramMap = {
    group: 'idGroup',
    teacher: 'idTeacher',
    aud: 'idAudLine'
  }
  const param = paramMap[type]

  const dayLabel =
    offset === 0 ? 'Сегодня' :
    offset === 1 ? 'Завтра' :
    offset === -1 ? 'Вчера' :
    date

  try {
    const res = await fetch(`${API}/Rasp?${param}=${id}&sdate=${date}`)
    const data = await res.json()
    const allLessons = data.data?.rasp

    const [day, month, year] = date.split('.')
    const dateISO = `${year}-${month}-${day}`
    const lessons = allLessons?.filter(l => l.дата.startsWith(dateISO))

    let text = ''
    if (!lessons?.length) {
      text = `${dayLabel} (${date}) — пар нет 🎉`
    } else {
      text = `📅 ${dayLabel} (${date}):\n\n`
      lessons.forEach(l => { text += formatLesson(l) + '\n' })
    }

    // Если вызвано кнопкой — редактируем, если первый раз — отправляем
    try {
      await ctx.editMessageText(text, {
        ...navMenu(type, id, offset)
      })
    } catch {
      await ctx.reply(text, navMenu(type, id, offset))
    }
  } catch (e) {
    ctx.reply('Ошибка загрузки расписания 😢', mainMenu)
  }
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

// --- Расписание по кнопкам выбора ---
bot.action(/^group_(\d+)$/, async (ctx) => {
  ctx.answerCbQuery()
  await showRasp(ctx, 'group', ctx.match[1], 0)
})

bot.action(/^teacher_(\d+)$/, async (ctx) => {
  ctx.answerCbQuery()
  await showRasp(ctx, 'teacher', ctx.match[1], 0)
})

bot.action(/^aud_(\d+)$/, async (ctx) => {
  ctx.answerCbQuery()
  await showRasp(ctx, 'aud', ctx.match[1], 0)
})

// --- Навигация по дням ---
bot.action(/^rasp_(group|teacher|aud)_(\d+)_(-?\d+)$/, async (ctx) => {
  ctx.answerCbQuery()
  const type = ctx.match[1]
  const id = ctx.match[2]
  const offset = parseInt(ctx.match[3])
  await showRasp(ctx, type, id, offset)
})

// --- Назад ---
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