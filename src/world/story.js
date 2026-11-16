// The storyboard: one list of camera keys drives everything. Positions in the
// flight are measured in "key index" space f (0 = first key, 1 = second, …):
// text beats and mood keys are both placed on that same axis, so re-timing a
// shot never desynchronises the text from the picture.
//
// Content mirrors timurbelyaev.github.io block for block: every block of that
// page has its own island here, a short caption in flight and the full text in
// a «Подробнее» sheet.

export const TELEGRAM = 'https://t.me/tmbelyaev'
export const EMAIL = 't.belyaev@proton.me'

// World anchors (island cap tops) shared with the world builder.
export const PLACES = {
  gallery: [0, 74.6, 100], // centre of the painting on the hero wall
  vista: [15, 68, -24], // the temple seen inside the painting
  beacon: [30, 12, -250],
  oracle: [-34, 20, -340],
  gate: [8, 9, -430],
  armillary: [28, 15, -520],
  stack: [0, 17, -598], // centre of the field of tablets
  colonnade: [0, 8, -672], // deck start; runs 176 units along -Z
  stairs: [0, 8, -852],
  court: [0, 32, -980],
  treasury: [-44, 30, -1026],
  garden: [44, 31, -1042],
  temple: [0, 34, -1096], // front edge of the temple steps
}

// Bays of the colonnade (local z, side) that open into a balcony with the
// symbol of a case. Multiples of the column spacing (11).
export const CASE_STATIONS = [
  { z: -44, side: 1, symbol: 'key' },
  { z: -88, side: -1, symbol: 'scissors' },
  { z: -132, side: 1, symbol: 'cake' },
  { z: -165, side: -1, symbol: 'amphora' },
]

// pos / look / fov, plus `w`: scroll length (in viewport heights) of the
// segment that LEAVES this key.
export const KEYS = [
  /* 0  hero: the painting on the wall   */ { pos: [0, 73.2, 129], look: [0, 73.2, 0], fov: 50, w: 1.0 },
  /* 1  through the frame                */ { pos: [0, 74.6, 97], look: [4, 73, 0], fov: 54, w: 1.0 },
  /* 2  past the temple, into the cloud  */ { pos: [-14, 73, 40], look: [-2, 60, -70], fov: 56, w: 1.1 },
  /* 3  the dive                         */ { pos: [-8, 48, -78], look: [6, 24, -210], fov: 56, w: 1.2 },
  /* 4  reveal: sea, islands, sun        */ { pos: [-12, 33, -150], look: [22, 14, -262], fov: 58, w: 1.2 },
  /* 5  beacon, from the left            */ { pos: [-16, 25, -198], look: [27, 25, -250], fov: 46, w: 1.1 },
  /* 6  beacon, passing on its left      */ { pos: [6, 23, -236], look: [32, 24, -264], fov: 46, w: 1.3 },
  /* 7  oracle, high three-quarter       */ { pos: [-11, 31, -302], look: [-34, 25, -340], fov: 46, w: 1.0 },
  /* 8  oracle, close and low            */ { pos: [-18, 24, -326], look: [-34, 26, -342], fov: 40, w: 1.3 },
  /* 9  arch, dead ahead                 */ { pos: [7, 17, -388], look: [8, 16.5, -430], fov: 52, w: 1.0 },
  /* 10 through the arch                 */ { pos: [8, 15.5, -436], look: [14, 16, -500], fov: 58, w: 1.1 },
  /* 11 armillary, sun behind the rings  */ { pos: [6, 21, -494], look: [28, 25, -520], fov: 42, w: 1.3 },
  /* 12 entering the field of tablets    */ { pos: [2, 19, -546], look: [0, 18, -600], fov: 50, w: 1.2 },
  /* 13 among the tablets                */ { pos: [0, 18, -596], look: [0, 17.5, -650], fov: 50, w: 1.1 },
  /* 14 lining up on the colonnade       */ { pos: [2, 15, -658], look: [0, 13, -730], fov: 54, w: 1.0 },
  /* 15 colonnade, case 1 (right)        */ { pos: [-2, 12.6, -696], look: [5, 12.4, -724], fov: 54, w: 1.0 },
  /* 16 colonnade, case 2 (left)         */ { pos: [2, 12.4, -740], look: [-5, 12.4, -768], fov: 54, w: 1.0 },
  /* 17 colonnade, case 3 (right)        */ { pos: [-2, 12.6, -784], look: [5, 12.4, -812], fov: 54, w: 1.0 },
  /* 18 colonnade, case 4 (left)         */ { pos: [2, 12.6, -817], look: [-5, 12.6, -845], fov: 54, w: 0.9 },
  /* 19 colonnade end, stair ahead       */ { pos: [0, 13, -843], look: [0, 21, -920], fov: 54, w: 1.0 },
  /* 20 stair, crane from the left       */ { pos: [-13, 16, -868], look: [3, 20, -914], fov: 50, w: 1.1 },
  /* 21 stair, climbing                  */ { pos: [-15, 27, -902], look: [3, 31, -962], fov: 50, w: 1.1 },
  /* 22 over the top: the court          */ { pos: [-7, 41, -934], look: [0, 36, -990], fov: 52, w: 1.1 },
  /* 23 court of guarantees              */ { pos: [0, 38, -951], look: [0, 36, -1000], fov: 50, w: 1.2 },
  // 24/25 are seen from a little in front, so the pan between them is ~76°, not ~98°.
  /* 24 treasury, to the left            */ { pos: [-19.5, 42, -994.5], look: [-44, 35, -1026], fov: 44, w: 1.2 },
  /* 25 garden, to the right             */ { pos: [20.5, 37, -1012], look: [44, 35, -1042], fov: 44, w: 1.2 },
  // Looks straight ahead and keeps the final lens: no swing past the axis, no zoom out and back.
  /* 26 the temple revealed              */ { pos: [7, 45, -1042], look: [7, 45, -1116], fov: 46, w: 1.1 },
  /* 27 facade, sun in the doorway       */ { pos: [0, 39, -1048], look: [0, 41.5, -1124], fov: 46, w: 0 },
]

// Atmosphere keyframes on the f axis. Colours are what you see on screen.
export const MOOD = [
  // Hero: warm, to sit with the sunlit hall photo around the picture.
  // Palette of the reference painting: muted Olympus blue only overhead,
  // ivory / peach toward the horizon, dusty rose inside the cloud, and a
  // peach-rose (not ochre) finale.
  { f: 0, top: '#8eaacb', bottom: '#f6e2d6', sun: '#ffe1bd', glow: 0.8, fog: 0.0032, ink: '#48373a' },
  { f: 2.1, top: '#d7bbb2', bottom: '#f5e7de', sun: '#ffdcc0', glow: 0.9, fog: 0.012, ink: '#48373a' },
  { f: 4, top: '#a9b3c3', bottom: '#f1dccf', sun: '#ffdcb8', glow: 1.0, fog: 0.0056, ink: '#48373a' },
  { f: 9, top: '#90adcd', bottom: '#f5e5da', sun: '#ffe1bd', glow: 1.0, fog: 0.0052, ink: '#48373a' },
  { f: 14, top: '#b2b4c4', bottom: '#f2dccc', sun: '#ffdcb4', glow: 1.15, fog: 0.0058, ink: '#48373a' },
  { f: 21, top: '#d7bbb2', bottom: '#f6dfcb', sun: '#ffd9b0', glow: 1.3, fog: 0.005, ink: '#48373a' },
  { f: 27, top: '#dcb4a2', bottom: '#fde0c4', sun: '#ffd6aa', glow: 1.55, fog: 0.0044, ink: '#48373a' },
]

// Chapters = the blocks of the original page, in its order. `f` is where a
// click scrolls to, `from` is where the chapter becomes the current one.
export const CHAPTERS = [
  { id: 'services', label: 'Услуги', f: 5.3, from: 3.6 },
  { id: 'stack', label: 'Стек', f: 12.25, from: 11.8 },
  { id: 'cases', label: 'Кейсы', f: 15.1, from: 14 },
  { id: 'process', label: 'Процесс', f: 19.3, from: 18.6 },
  { id: 'terms', label: 'Гарантии', f: 23, from: 22.2 },
  { id: 'prices', label: 'Оплата', f: 24.1, from: 23.6 },
  { id: 'about', label: 'Обо мне', f: 25.1, from: 24.6 },
  { id: 'contact', label: 'Контакт', f: 27, from: 25.8 },
]

// Text beats. `at` = [from, to] on the f axis; `side` picks the screen layout;
// `stop` overrides where the step buttons hold the beat (default: mid-range).
export const BEATS = [
  { at: [1.1, 1.85], side: 'center', title: 'Любая идея начинается в облаках.' },
  { at: [3.15, 4.3], side: 'center', title: 'Моя работа: спустить её на землю.', text: 'И заставить зарабатывать.' },

  {
    at: [4.75, 6.3], side: 'left', eyebrow: 'Услуги · 1 из 4', title: 'Telegram-боты с оплатой',
    text: 'Принимают заказы и платежи 24/7 без менеджера.', sheet: 'bots',
  },
  {
    at: [6.7, 8.3], side: 'right', eyebrow: 'Услуги · 2 из 4', title: 'AI-консультанты',
    text: 'Отвечают на 70% запросов сами, лиды не уходят к конкурентам.', sheet: 'ai',
  },
  {
    at: [8.65, 9.75], side: 'bottom', eyebrow: 'Услуги · 3 из 4', title: 'Сайты и лендинги',
    text: 'Вход, через который к вам приходят клиенты. Загрузка быстрее двух секунд.', sheet: 'sites',
  },
  {
    at: [10.5, 11.6], side: 'left', eyebrow: 'Услуги · 4 из 4', title: 'Автоматизация и парсинг',
    text: 'Механизм, который работает сам и освобождает 10+ часов сотрудника в неделю.', sheet: 'automation',
  },

  {
    // Held early, while all six tablets are still in view.
    at: [11.95, 13.75], stop: 12.25, side: 'bottom-center', eyebrow: 'Стек', title: 'Инструменты под задачу',
    text: 'Шесть плит, шесть слоёв: от интерфейса до сервера.', sheet: 'stack',
  },

  { at: [14.05, 14.6], side: 'center', eyebrow: 'Кейсы', title: 'Проблема, решение и результат в цифрах' },
  {
    at: [14.75, 15.5], side: 'left', eyebrow: 'Кейс № 01', title: 'Бот подписок на каналы',
    stats: [['0 ч', 'ручной работы'], ['+22%', 'продлений']],
    text: 'Оплата, выдача и отзыв доступа идут без участия владельца.', sheet: 'case1',
  },
  {
    at: [15.7, 16.45], side: 'right', eyebrow: 'Кейс № 02', title: 'AI-консультант для барбершопа',
    stats: [['24/7', 'ответ на каждую заявку'], ['38%', 'записей через бота']],
    text: 'Клиенты получают ответ вечером и в выходные, без администратора.', sheet: 'case2',
  },
  {
    at: [16.65, 17.4], side: 'left', eyebrow: 'Кейс № 03', title: 'Бот для кондитерской',
    stats: [['1,5 мин', 'на заказ вместо 8'], ['0', 'потерянных заказов']],
    text: 'Фото-меню, корзина и оформление заказа прямо в Telegram.', sheet: 'case3',
  },
  {
    // Non-breaking space keeps «5 000+» in one reveal word.
    at: [17.55, 18.3], side: 'right', eyebrow: 'Кейс № 04', title: 'Интернет-магазин на 5\u00a0000+ товаров',
    stats: [['1,2 с', 'загрузка вместо 6 с'], ['×3,4', 'органический трафик']],
    text: 'Переезд с Tilda на Next.js и PostgreSQL.', sheet: 'case4',
  },

  { at: [18.75, 19.5], side: 'left', eyebrow: 'Процесс · шаг I', title: 'Бесплатный разбор', text: '10 минут в Telegram. Пойму задачу, назову цену и срок.', sheet: 'process' },
  { at: [19.65, 20.3], side: 'left', eyebrow: 'Процесс · шаг II', title: 'ТЗ и договор', text: 'Короткое ТЗ, этапы, цена. Предоплата 30–50%.', sheet: 'process' },
  { at: [20.45, 21.1], side: 'left', eyebrow: 'Процесс · шаг III', title: 'Разработка', text: 'Показываю прогресс в Telegram. Не пропадаю на три недели.', sheet: 'process' },
  { at: [21.25, 21.95], side: 'bottom', eyebrow: 'Процесс · шаг IV', title: 'Запуск и обучение', text: 'Передаю код с документацией. 7 дней правок бесплатно.', sheet: 'process' },

  {
    at: [22.6, 23.5], side: 'bottom-center', eyebrow: 'Гарантии', title: 'Высечено в камне',
    text: 'Исходный код ваш. 7 дней правок. Прогресс на каждом этапе. Сроки соблюдаю.', sheet: 'terms',
  },
  {
    at: [23.8, 24.5], side: 'right', eyebrow: 'Оплата', title: 'Часть до, остальное после',
    text: 'Предоплата 30–50%, остаток после сдачи. Карта или СБП, USDT, по договору.', sheet: 'prices',
  },
  {
    at: [24.75, 25.5], side: 'left', eyebrow: 'Обо мне', title: 'Делаю продукты, а не «вёрстку»',
    text: 'Беру максимум три проекта одновременно. Если задача не по мне, скажу честно.', sheet: 'about',
  },

  {
    at: [26.5, 27.2], side: 'final', eyebrow: 'Есть задача?', title: 'Обсудим ваш проект',
    text: 'Напишите в Telegram: отвечаю в течение 10 минут в рабочее время. ТЗ не нужно, помогу сформулировать.',
    cta: { label: 'Написать в Telegram', href: TELEGRAM },
    links: [
      { label: EMAIL, href: `mailto:${EMAIL}` },
      { label: 'Kwork', href: 'https://kwork.ru/user/aetra' },
      { label: 'Цены', sheet: 'prices' },
    ],
  },
]

export const HERO = {
  status: 'Доступен для заказов',
  first: 'Тимур',
  last: 'Беляев',
  role: 'Разработчик Telegram-ботов, AI-консультантов и сайтов',
  lead: 'Создаю IT-решения, которые экономят часы сотрудников и приносят деньги бизнесу.',
  cta: { label: 'Обсудить задачу', href: TELEGRAM },
  more: { label: 'Посмотреть кейсы', f: 15.1 },
  facts: [
    ['7 дней', 'правок'],
    ['Старт проекта', 'от 1 500 ₽'],
    ['Направления', '4+'],
  ],
  // Museum plate under the painting, with the scroll cue.
  plate: { title: 'Рассвет над облаками', meta: 'Холст, three.js, 2026' },
  cue: 'Нажмите',
}

// The hall photo of the hero, in its own pixels. The canvas of the picture is
// transparent in the PNG, so the 3D world shows through; `hole` is its centre
// and size (drives the camera projection), `frame` is the gilded frame's outer
// box, `plate` the lowest point of the plate under it, `bust` the left edge of
// the bust on its plinth (the hero copy must end before it).
export const HALL = {
  src: `${import.meta.env.BASE_URL}hero/hall.png`,
  // Same photo without the frame, blurred (scripts/bake-hall-blur.py).
  blur: `${import.meta.env.BASE_URL}hero/hall-blur.webp`,
  w: 1672,
  h: 941,
  hole: { cx: 1233, cy: 431, w: 655, h: 478 },
  frame: { l: 855, r: 1615, t: 155, b: 728, plate: 890 },
  bust: 690,
}

// Chapters listed in the top bar.
export const NAV = ['services', 'cases', 'process', 'prices', 'about', 'contact']

// The stack, one tablet per layer (engraved in the world and listed in the sheet).
export const STACK = [
  { title: 'Frontend', items: ['React', 'Next.js', 'TypeScript', 'Tailwind', 'HTML / CSS'] },
  { title: 'Backend', items: ['Python', 'FastAPI', 'aiogram', 'Node.js'] },
  { title: 'Базы данных', items: ['PostgreSQL', 'SQLite', 'Redis'] },
  { title: 'Интеграции', items: ['Telegram Bot API', 'OpenAI API', 'ЮKassa', 'Google Sheets'] },
  { title: 'CMS', items: ['WordPress', 'Bitrix24'] },
  { title: 'Деплой', items: ['Docker', 'nginx', 'VPS Ubuntu'] },
]

export const GUARANTEES = [
  // `carve` is the same title broken into lines for the stone stele.
  { h: 'Исходный код ваш', carve: ['Исходный', 'код ваш'], p: 'Передаю полный исходник без скрытых зависимостей и SaaS-локов.' },
  { h: '7 дней правок', carve: ['7 дней', 'правок'], p: '7 дней после сдачи: правки по задаче без доплаты.' },
  { h: 'Прогресс на каждом этапе', carve: ['Прогресс', 'на каждом', 'этапе'], p: 'Видите промежуточный результат, а не «сюрприз» в конце.' },
  { h: 'Сроки соблюдаю', carve: ['Сроки', 'соблюдаю'], p: 'Оговорённые сроки соблюдаю. Беру максимум три проекта одновременно.' },
]

const PRICE_NOTE = 'Точную цену называю после 10-минутного разбора в Telegram.'

// Repository links of the cases. Empty string = the button is not shown.
const REPO = {
  case1: 'https://github.com/timurbelyaev/subscription-bot',
  case2: '',
  case3: 'https://github.com/timurbelyaev/la-douceur-bot',
  case4: 'https://github.com/timurbelyaev/cyberpart-shop',
}

const caseSheet = (n, title, problem, solution, result, stack, repo) => ({
  eyebrow: `Кейс № 0${n}`,
  title,
  items: [
    { h: 'Проблема', p: problem },
    { h: 'Решение', p: solution },
    { h: 'Результат', p: result, strong: true },
  ],
  tags: stack,
  link: repo ? { label: 'Репозиторий', href: repo } : null,
})

// Detail sheets opened by «Подробнее».
export const SHEETS = {
  bots: {
    eyebrow: 'Что делаю',
    title: 'Telegram-боты с оплатой',
    lead: 'Принимают заказы и платежи 24/7 без менеджера.',
    list: ['Приём заявок, корзина, оплата (ЮKassa, СБП, крипта)', 'Подписки с авто-доступом и продлением', 'Web Apps, мини-CRM, выгрузка в Google Sheets'],
    note: 'Бот с приёмом заявок: от 1 500 ₽. Бот с оплатой и подписками: от 7 000 ₽.',
  },
  ai: {
    eyebrow: 'Что делаю',
    title: 'AI-консультанты',
    lead: 'Отвечают на 70% запросов сами, лиды не уходят к конкурентам.',
    list: ['Искусственный интеллект с доступом к базе знаний', 'Квалификация лида и передача менеджеру', 'Защита от prompt injection, ограничение тематики'],
    note: 'AI-консультант: от 10 000 ₽.',
  },
  sites: {
    eyebrow: 'Что делаю',
    title: 'Сайты и лендинги',
    lead: 'Загрузка быстрее двух секунд, готовы с первого дня.',
    list: ['Лендинги под трафик и связку с ботом', 'Интернет-магазины: каталог, корзина, заказ', 'Next.js / React или WordPress / Bitrix24'],
    note: PRICE_NOTE,
  },
  automation: {
    eyebrow: 'Что делаю',
    title: 'Автоматизация и парсинг',
    lead: 'Освобождает 10+ часов сотрудника в неделю.',
    list: ['Сбор данных с сайтов и маркетплейсов', 'Связки через n8n, синхронизация с CRM', 'Регулярные отчёты и уведомления в Telegram'],
    note: PRICE_NOTE,
  },
  stack: {
    eyebrow: 'Стек',
    title: 'Чем я работаю',
    lead: 'Подбираю инструменты под задачу, а не задачу под инструменты.',
    items: STACK.map((g) => ({ h: g.title, p: g.items.join(' · ') })),
  },
  case1: caseSheet(
    1, 'Бот подписок на каналы',
    'Владелец канала тратил до 3 часов в день на проверку оплат и ручное добавление подписчиков.',
    'Бот с ЮKassa и Web App для оплаты, авто-выдача и отзыв доступа, напоминание о продлении за 3 дня.',
    'Ручная работа: 0 часов. Конверсия в продление выросла на 22%.',
    ['Python', 'aiogram', 'ЮKassa', 'PostgreSQL'], REPO.case1,
  ),
  case2: caseSheet(
    2, 'AI-консультант для барбершопа',
    'Клиенты уходили к конкурентам, не дождавшись ответа администратора вечером и в выходные.',
    'Консультант на GPT-4 с базой по услугам, ценам и расписанию мастеров; защита от выхода за тему и prompt injection.',
    '100% охват заявок 24/7. Конверсия в запись через бота: 38%.',
    ['Python', 'OpenAI API', 'aiogram'], REPO.case2,
  ),
  case3: caseSheet(
    3, 'Бот для кондитерской',
    'Заказы принимались в директ Instagram, терялись, повторялись, путались адреса доставки.',
    'Бот с фото-меню, корзиной и оформлением заказа; уведомления в общий чат сотрудников.',
    'Потерянные заказы: 0. Время приёма заказа сократилось с 8 до 1,5 минут.',
    ['Python', 'aiogram', 'SQLite'], REPO.case3,
  ),
  case4: caseSheet(
    4, 'Интернет-магазин',
    'Готовый магазин на Tilda не тянул 5 000+ SKU и грузился по 6 секунд; SEO падало.',
    'Next.js + PostgreSQL; SSG для категорий, ISR для товаров; админка для контент-менеджера.',
    'Время загрузки: 1,2 с. Органический трафик вырос в 3,4 раза за 4 месяца.',
    ['Next.js', 'PostgreSQL', 'Node.js'], REPO.case4,
  ),
  process: {
    eyebrow: 'Как идёт работа',
    title: 'Прозрачные этапы',
    lead: 'Видите прогресс и не платите вслепую.',
    items: [
      { h: 'I. Бесплатный разбор', p: '10 минут в Telegram. Пойму задачу, назову цену и срок.' },
      { h: 'II. ТЗ и договор', p: 'Короткое ТЗ, этапы, цена. Предоплата 30–50%.' },
      { h: 'III. Разработка', p: 'Показываю прогресс в Telegram. Не пропадаю на 3 недели.' },
      { h: 'IV. Запуск и обучение', p: 'Передаю код с документацией. 7 дней правок бесплатно.' },
    ],
  },
  terms: {
    eyebrow: 'Гарантии',
    title: 'Что вы получаете',
    items: GUARANTEES,
  },
  prices: {
    eyebrow: 'Оплата',
    title: 'Предоплата 30–50%, остальное после сдачи',
    items: [
      { h: 'Карта / СБП', p: 'Любой российский банк.' },
      { h: 'USDT, любая сеть', p: 'Без посредников.' },
      { h: 'По договору', p: 'ИП или самозанятый.' },
    ],
    list: ['Бот с приёмом заявок: от 1 500 ₽', 'Бот с оплатой и подписками: от 7 000 ₽', 'AI-консультант: от 10 000 ₽'],
    note: `${PRICE_NOTE} Работаю с первыми заказчиками: место для вашего отзыва уже зарезервировано.`,
  },
  about: {
    eyebrow: 'Обо мне',
    title: 'Делаю продукты, а не «вёрстку»',
    lead: 'Я не «верстальщик» и не «эникейщик». Делаю продукты, которые решают конкретные проблемы бизнеса: принять оплату, обработать заявку, освободить сотрудника от рутины. Если задача не по мне, скажу честно и посоветую, к кому обратиться.',
    list: [
      'Беру максимум 3 проекта в работу одновременно: каждому достаточно внимания',
      'Если стек или подход не подходят под задачу, скажу об этом до договора, а не после',
      'Код сдаю с README и инструкцией по запуску. Не «коробка с проводами»',
    ],
  },
}
