const { Telegraf, Markup } = require('telegraf')
const http = require('http')
const fs = require('fs')

const bot = new Telegraf(process.env.BOT_TOKEN)
const API = 'https://edu.donstu.ru/api'
const DB_FILE = 'users.json'

// --- База данных (JSON) ---
function loadDB() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '{}')
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}

function getUser(userId) {
  const db = loadDB()
  if (!db[userId]) db[userId] = { favorite: null, notify: null }
  return db[userId]
}

function saveUser(userId, data) {
  const db = loadDB()
  db[userId] = data
  saveDB(db)
}

// --- Состояния ---
const userState = {}

// --- API ---
async function getCurrentYear() {
  const res = await fetch(`${API}/Rasp/ListYears`)
  const data = await res.json()
  const years = data.data.years
  return years[years.length - 1]
}

function getDate(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}
// Безопасный ответ на callback
async function safeAnswer(ctx, text = '') {
  try {
    await ctx.answerCbQuery(text)
  } catch {}
}
// --- Меню ---
const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('👥 По группе', 'by_group')],
  [Markup.button.callback('👨‍🏫 По преподавателю', 'by_teacher')],
  [Markup.button.callback('🏫 По аудитории', 'by_aud')],
  [Markup.button.callback('⭐️ Избранное', 'favorite')],
  [Markup.button.callback('🔔 Уведомления', 'notify_menu')]
])

function navMenu(type, id, offset) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('◀️ Пред. день', `rasp_${type}_${id}_${offset - 1}`),
      Markup.button.callback('След. день ▶️', `rasp_${type}_${id}_${offset + 1}`)
    ],
    [Markup.button.callback('📅 Сегодня', `rasp_${type}_${id}_0`)],
    [
      Markup.button.callback('⭐️ Сохранить', `save_${type}_${id}`),
      Markup.button.callback('🔙 В меню', 'back')
    ]
  ])
}

function formatLesson(l) {
  return (
    `⏰ ${l.начало} - ${l.конец}\n` +
    `📚 ${l.дисциплина}\n` +
    `👨‍🏫 ${l.преподаватель}\n` +
    `🏫 ${l.аудитория}\n`
  )
}

// --- Показ расписания ---
async function showRasp(ctx, type, id, offset = 0) {
  const date = getDate(offset)
  const paramMap = { group: 'idGroup', teacher: 'idTeacher', aud: 'idAudLine' }
  const param = paramMap[type]

  const dayLabel =
    offset === 0 ? 'Сегодня' :
    offset === 1 ? 'Завтра' :
    offset === -1 ? 'Вчера' : date

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

    try {
      await ctx.editMessageText(text, { ...navMenu(type, id, offset) })
    } catch {
      await ctx.reply(text, navMenu(type, id, offset))
    }
  } catch (e) {
    ctx.reply('Ошибка загрузки расписания 😢', mainMenu)
  }
}

// --- /start ---
bot.start((ctx) => {
  ctx.reply('📅 Расписание ДГТУ\n\nВыбери тип поиска 👇', mainMenu)
})

// --- Поиск ---
bot.action('by_group', async (ctx) => {
  await safeAnswer(ctx)
  userState[ctx.from.id] = 'waiting_group'
  ctx.reply('🔍 Введи название группы (например: ИВТ-11):')
})

bot.action('by_teacher', async (ctx) => {
  await safeAnswer(ctx)
  userState[ctx.from.id] = 'waiting_teacher'
  ctx.reply('🔍 Введи фамилию преподавателя (например: Иванов):')
})

bot.action('by_aud', async (ctx) => {
  await safeAnswer(ctx)
  userState[ctx.from.id] = 'waiting_aud'
  ctx.reply('🔍 Введи номер аудитории (например: 304):')
})

// --- Избранное ---
bot.action('favorite', async (ctx) => {
  await safeAnswer(ctx)
  const user = getUser(ctx.from.id)

  if (!user.favorite) {
    return ctx.reply('⭐️ У тебя нет избранного!\n\nНайди группу и нажми кнопку "⭐️ Сохранить"', mainMenu)
  }

  const { type, id, name } = user.favorite
  await ctx.reply(`⭐️ Избранное: ${name}`)
  await showRasp(ctx, type, id, 0)
})

// Сохранить в избранное
bot.action(/^save_(group|teacher|aud)_(\d+)$/, async (ctx) => {
  await safeAnswer(ctx, '⭐️ Сохранено в избранное!')
  const type = ctx.match[1]
  const id = ctx.match[2]

  // Получаем название
  let name = id
  try {
    const year = await getCurrentYear()
    const urlMap = {
      group: `${API}/raspGrouplist?year=${year}`,
      teacher: `${API}/raspTeacherlist?year=${year}`,
      aud: `${API}/raspAudlist?year=${year}`
    }
    const res = await fetch(urlMap[type])
    const data = await res.json()
    const item = data.data.find(i => String(i.id) === String(id))
    if (item) name = item.name
  } catch {}

  const user = getUser(ctx.from.id)
  user.favorite = { type, id, name }
  saveUser(ctx.from.id, user)

  ctx.reply(`⭐️ Сохранено: ${name}\n\nТеперь можешь быстро открыть через "⭐️ Избранное" в меню!`, mainMenu)
})

// --- Уведомления ---
bot.action('notify_menu', async (ctx) => {
  await safeAnswer(ctx)
  const user = getUser(ctx.from.id)
  const status = user.notify ? `✅ Включены (${user.notify})` : '❌ Выключены'

  ctx.reply(
    `🔔 Уведомления\nСтатус: ${status}\n\nВыбери время отправки расписания:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('7:00', 'set_notify_07:00'), Markup.button.callback('8:00', 'set_notify_08:00')],
      [Markup.button.callback('9:00', 'set_notify_09:00'), Markup.button.callback('10:00', 'set_notify_10:00')],
      [Markup.button.callback('❌ Отключить', 'disable_notify')],
      [Markup.button.callback('🔙 В меню', 'back')]
    ])
  )
})

bot.action(/^set_notify_(.+)$/, async (ctx) => {
  await safeAnswer(ctx)
  const time = ctx.match[1]
  const user = getUser(ctx.from.id)

  if (!user.favorite) {
    return ctx.reply('⚠️ Сначала сохрани группу в избранное!', mainMenu)
  }

  user.notify = time
  saveUser(ctx.from.id, user)
  ctx.reply(`✅ Уведомления включены!\n\nКаждый день в ${time} буду присылать расписание для: ${user.favorite.name}`, mainMenu)
})

bot.action('disable_notify', (ctx) => {
  await safeAnswer(ctx)
  const user = getUser(ctx.from.id)
  user.notify = null
  saveUser(ctx.from.id, user)
  ctx.reply('🔕 Уведомления отключены', mainMenu)
})

// --- Навигация ---
bot.action(/^rasp_(group|teacher|aud)_(\d+)_(-?\d+)$/, async (ctx) => {
  await safeAnswer(ctx)
  await showRasp(ctx, ctx.match[1], ctx.match[2], parseInt(ctx.match[3]))
})

bot.action(/^group_(\d+)$/, async (ctx) => {
  await safeAnswer(ctx)
  await showRasp(ctx, 'group', ctx.match[1], 0)
})

bot.action(/^teacher_(\d+)$/, async (ctx) => {
  await safeAnswer(ctx)
  await showRasp(ctx, 'teacher', ctx.match[1], 0)
})

bot.action(/^aud_(\d+)$/, async (ctx) => {
  await safeAnswer(ctx)
  await showRasp(ctx, 'aud', ctx.match[1], 0)
})

bot.action('back', (ctx) => {
  await safeAnswer(ctx)
  userState[ctx.from.id] = null
  ctx.reply('Выбери тип поиска 👇', mainMenu)
})

// --- Текстовый ввод ---
bot.on('text', async (ctx) => {
  const state = userState[ctx.from.id]
  const query = ctx.message.text.toLowerCase()

  const searchConfig = {
    waiting_group: { url: 'raspGrouplist', action: 'group' },
    waiting_teacher: { url: 'raspTeacherlist', action: 'teacher' },
    waiting_aud: { url: 'raspAudlist', action: 'aud' }
  }

  const config = searchConfig[state]
  if (config) {
    try {
      const year = await getCurrentYear()
      const res = await fetch(`${API}/${config.url}?year=${year}`)
      const data = await res.json()
      const found = data.data.filter(i =>
        i.name.toLowerCase().includes(query)
      ).slice(0, 20)

      if (!found.length) {
        return ctx.reply('Не найдено 😢 Попробуй ещё раз:')
      }

      const buttons = found.map(i => [
        Markup.button.callback(i.name, `${config.action}_${i.id}`)
      ])
      buttons.push([Markup.button.callback('🔙 Назад', 'back')])
      userState[ctx.from.id] = null
      ctx.reply('Выбери:', Markup.inlineKeyboard(buttons))
    } catch (e) {
      ctx.reply('Ошибка 😢', mainMenu)
    }
    return
  }

  ctx.reply('Выбери тип поиска 👇', mainMenu)
})

// --- Рассылка уведомлений ---
async function sendNotifications() {
  const db = loadDB()
  const now = new Date()
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  for (const [userId, user] of Object.entries(db)) {
    if (user.notify === currentTime && user.favorite) {
      try {
        const { type, id, name } = user.favorite
        const date = getDate(0)
        const paramMap = { group: 'idGroup', teacher: 'idTeacher', aud: 'idAudLine' }
        const param = paramMap[type]

        const res = await fetch(`${API}/Rasp?${param}=${id}&sdate=${date}`)
        const data = await res.json()
        const allLessons = data.data?.rasp

        const [day, month, year] = date.split('.')
        const dateISO = `${year}-${month}-${day}`
        const lessons = allLessons?.filter(l => l.дата.startsWith(dateISO))

        let text = `🔔 Расписание на сегодня (${date})\n⭐️ ${name}\n\n`
        if (!lessons?.length) {
          text += 'Пар нет 🎉'
        } else {
          lessons.forEach(l => { text += formatLesson(l) + '\n' })
        }

        await bot.telegram.sendMessage(userId, text, mainMenu)
      } catch (e) {
        console.log(`Ошибка уведомления для ${userId}:`, e.message)
      }
    }
  }
}

// Проверяем каждую минуту
setInterval(sendNotifications, 60 * 1000)

// --- HTTP сервер ---
const PORT = process.env.PORT || 3000
http.createServer((req, res) => res.end('Bot is running')).listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
// В самый конец перед bot.launch()
bot.catch((err, ctx) => {
  console.log('Ошибка:', err.message)
})
bot.launch()
console.log('Бот запущен!')

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))