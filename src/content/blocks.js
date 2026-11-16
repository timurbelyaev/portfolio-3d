// Single source of truth for all block copy, transcribed from the reference
// portfolio (timurbelyaev.github.io) and grouped by block. Text is a draft —
// numbers marked TODO await confirmation (e.g. the free-revisions period, which
// appears as 7 / 14 / 77 days across the reference).

// Opening screen: name + role.
export const hero = {
  eyebrow: 'Разработчик · Telegram-боты · AI · веб',
  title: 'Тимур Беляев',
}

// Surfaces once the camera has dived into the cloud bank.
export const heroTagline = {
  lead: 'Создаю IT-решения, которые экономят часы сотрудников и приносят деньги бизнесу.',
  note: 'Telegram-боты с оплатой, AI-консультанты и автоматизация рутины. Под задачу — не «по шаблону».',
}

export const services = [
  {
    eyebrow: 'Что делаю',
    title: 'Telegram-боты с оплатой',
    lead: 'Принимают заказы и платежи 24/7 без менеджера — корзина, СБП/крипта, подписки с авто-доступом, выгрузка в Google Sheets.',
  },
  {
    eyebrow: 'Что делаю',
    title: 'AI-консультанты',
    lead: 'Отвечают на 70% запросов сами — доступ к базе знаний, квалификация лидов, защита от prompt injection.',
  },
  {
    eyebrow: 'Что делаю',
    title: 'Сайты и лендинги',
    lead: 'Загрузка < 2 с, готовы с первого дня — лендинги под трафик, магазины, Next.js/React или WordPress/Bitrix24.',
  },
  {
    eyebrow: 'Что делаю',
    title: 'Автоматизация и парсинг',
    lead: 'Освобождает 10+ часов сотрудника в неделю — сбор данных, синхронизация через n8n, регулярные отчёты.',
  },
]

export const stack = {
  eyebrow: 'Стек',
  groups: [
    { label: 'Frontend', items: ['React', 'Next.js', 'TypeScript', 'Tailwind', 'HTML/CSS'] },
    { label: 'Backend', items: ['Python', 'FastAPI', 'aiogram', 'Node.js'] },
    { label: 'Данные', items: ['PostgreSQL', 'SQLite', 'Redis'] },
    { label: 'Инфра', items: ['Docker', 'nginx', 'VPS Ubuntu'] },
  ],
}

export const cases = [
  {
    eyebrow: 'Кейс',
    title: 'Бот подписок на каналы',
    lead: 'Владелец тратил 3 ч/день на проверку оплат. Бот с Яндекс.Кассой и авто-выдачей доступа.',
    result: 'Ручная работа — 0 ч · продления +22%',
  },
  {
    eyebrow: 'Кейс',
    title: 'AI-консультант барбершопа',
    lead: 'Клиенты уходили без ответа администратора. GPT-консультант с базой услуг, цен и расписания.',
    result: 'Охват заявок 24/7 · запись 38%',
  },
  {
    eyebrow: 'Кейс',
    title: 'Бот кондитерской',
    lead: 'Заказы терялись в директе Instagram. Бот с фото-меню, корзиной и уведомлениями.',
    result: 'Потерянные заказы — 0 · приём 8→1.5 мин',
  },
  {
    eyebrow: 'Кейс',
    title: 'Интернет-магазин на Next.js',
    lead: 'Tilda не тянула 5000+ SKU, грузилась 6 с. Next.js + PostgreSQL с SSG/ISR.',
    result: 'Загрузка 1.2 с · органика ×3.4',
  },
]

export const process = [
  { eyebrow: 'Как идёт работа', title: 'Бесплатный разбор', lead: '10 минут в Telegram — разбираем задачу, называю цену и срок.' },
  { eyebrow: 'Как идёт работа', title: 'ТЗ и договор', lead: 'Короткое ТЗ, этапы, предоплата 30–50%.' },
  { eyebrow: 'Как идёт работа', title: 'Разработка', lead: 'Прогресс в Telegram, регулярные обновления.' },
  { eyebrow: 'Как идёт работа', title: 'Запуск и обучение', lead: 'Код с документацией, 7 дней бесплатных правок.' },
]

export const guarantees = [
  { eyebrow: 'Гарантии', title: 'Исходный код ваш', lead: 'Полный исходник без скрытых зависимостей.' },
  { eyebrow: 'Гарантии', title: '7 дней правок', lead: 'Исправления по согласованному ТЗ 7 дней без доплаты.' },
  { eyebrow: 'Гарантии', title: 'Прогресс на каждом этапе', lead: 'Видите промежуточные результаты, не «чёрный ящик».' },
  { eyebrow: 'Гарантии', title: 'Сроки соблюдаю', lead: 'Оговоренные сроки соблюдаются.' },
]

export const payment = {
  eyebrow: 'Оплата',
  title: 'Прозрачно и по этапам',
  lead: 'Предоплата 30–50%, остальное после сдачи. Карта/СБП, USDT (любая сеть), по договору (ИП/самозанятый).',
  prices: ['Бот с приёмом заявок — от 1 500 ₽', 'Бот с оплатой/подписками — от 7 000 ₽', 'AI-консультант — от 10 000 ₽'],
}

export const faq = {
  eyebrow: 'FAQ',
  title: 'Частые вопросы',
  items: [
    { q: 'Сколько стоит?', a: 'От 1 500 ₽ за простого бота. Точную цену называю после бесплатного разбора.' },
    { q: 'Сроки?', a: 'От нескольких дней до пары недель — зависит от объёма. Называю на разборе.' },
    { q: 'Код останется у меня?', a: 'Да, передаю полный исходник с README и инструкцией по запуску.' },
  ],
}

export const about = {
  eyebrow: 'Обо мне',
  title: 'Делаю продукты, а не «вёрстку»',
  lead: 'Решаю конкретные проблемы бизнеса: принять оплату, обработать заявку, освободить сотрудника от рутины. Максимум 3 проекта одновременно, честно о стеке до договора.',
}

export const contact = {
  eyebrow: 'Контакт',
  title: 'Обсудим задачу?',
  lead: 'Напишите в Telegram — отвечу и предложу решение.',
  telegram: 'https://t.me/tmbelyaev',
  telegramLabel: '@tmbelyaev',
}
