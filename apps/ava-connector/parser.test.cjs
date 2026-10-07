const test = require('node:test')
const assert = require('node:assert/strict')
const {
  cleanText,
  collectActivities,
  collectCourses,
  collectRecentActivities,
  courseDetailsFromText,
  courseTitleFromText,
  parseDate,
  safeCampusUrl,
  scanDocument,
  stableId,
} = require('./parser.js')
const blackboardCourseCards = require('./fixtures/blackboard-ultra-course-cards.json')

function fakeElement({
  attributes = {},
  text = '',
  innerText = text,
  queries = {},
  queryLists = {},
  matches = [],
  matchIncludes = [],
  closest = null,
}) {
  const element = {
    hidden: false,
    textContent: text,
    innerText,
    parentElement: null,
    getAttribute(name) {
      return attributes[name] ?? null
    },
    matches(selector) {
      return (
        matches.includes(selector) ||
        matchIncludes.some((fragment) => selector.includes(fragment))
      )
    },
    closest(selector) {
      return typeof closest === 'function' ? closest(selector, element) : null
    },
    querySelector(selector) {
      return queries[selector] ?? null
    },
    querySelectorAll(selector) {
      if (queryLists[selector]) return queryLists[selector]
      return queries[selector] ? [queries[selector]] : []
    },
  }
  return element
}

test('normaliza texto visible sin conservar espacios o variantes Unicode', () => {
  assert.equal(
    cleanText('  Programacio\u0301n   distribuida  '),
    'Programación distribuida',
  )
})

test('solo acepta enlaces HTTPS del Campus Virtual', () => {
  assert.equal(
    safeCampusUrl('/ultra/courses/123', 'https://campusvirtual.duoc.cl/'),
    'https://campusvirtual.duoc.cl/ultra/courses/123',
  )
  assert.equal(
    safeCampusUrl(
      'https://student:secret@campusvirtual.duoc.cl/ultra/activity?token=private#today',
      'https://campusvirtual.duoc.cl/',
    ),
    'https://campusvirtual.duoc.cl/ultra/activity',
  )
  assert.equal(
    safeCampusUrl(
      'https://campusvirtual.duoc.cl.evil.test/',
      'https://campusvirtual.duoc.cl/',
    ),
    null,
  )
  assert.equal(
    safeCampusUrl('javascript:alert(1)', 'https://campusvirtual.duoc.cl/'),
    null,
  )
})

test('interpreta fechas ISO y fechas locales visibles', () => {
  assert.equal(
    parseDate('2030-05-10T15:30:00-03:00'),
    '2030-05-10T18:30:00.000Z',
  )
  assert.equal(
    parseDate('10/05/2030 15:30'),
    new Date(2030, 4, 10, 15, 30).toISOString(),
  )
  assert.equal(
    parseDate('10 de sept. de 2026'),
    new Date(2026, 8, 10, 23, 59).toISOString(),
  )
  assert.equal(
    parseDate('10 de septiembre de 2026'),
    new Date(2026, 8, 10, 23, 59).toISOString(),
  )
  assert.equal(parseDate('31/02/2030'), null)
})

test('extrae código, sección y semestre desde texto de una tarjeta', () => {
  assert.deepEqual(
    courseDetailsFromText(
      'MAT100 · Sección 001D · Segundo semestre 2030 · Código MAT100',
    ),
    { code: 'MAT100', section: '001D', term: 'Segundo semestre 2030' },
  )
})

test('crea identificadores deterministas sin exponer el texto original', () => {
  const first = stableId('activity', 'Evaluación 1|2030-05-10')
  assert.equal(first, stableId('activity', 'Evaluación 1|2030-05-10'))
  assert.match(first, /^activity_[a-z0-9]+$/)
  assert.equal(first.includes('Evaluación'), false)
})

test('deduplica tarjetas de materia detectadas por distintos selectores', () => {
  const first = fakeElement({
    attributes: {
      'data-course-id': 'course-native-1',
      'data-course-name': 'Programación Web',
    },
    text: 'Programación Web · Código PGY4121 · Sección 002D',
  })
  const duplicate = fakeElement({
    attributes: { 'data-course-name': '  Programación   Web ' },
    text: 'Programación Web',
  })
  const root = {
    querySelectorAll() {
      return [first, duplicate]
    },
  }
  const courses = collectCourses(root)
  assert.equal(courses.length, 1)
  assert.deepEqual(courses[0], {
    clientId: stableId('course', 'course-native-1'),
    name: 'Programación Web',
    code: 'PGY4121',
    section: '002D',
    term: null,
  })
})

test('extrae solo el tÃ­tulo semÃ¡ntico de tarjetas reales de Blackboard Ultra', () => {
  const cards = blackboardCourseCards.map((fixture) =>
    fakeElement({
      attributes: { href: fixture.href },
      text: fixture.textContent,
      innerText: fixture.innerText,
      matches: ['a[href]'],
      matchIncludes: ['course-title'],
    }),
  )
  const root = { querySelectorAll: () => cards }

  assert.deepEqual(
    collectCourses(root).map(({ name, section }) => ({ name, section })),
    blackboardCourseCards.map((fixture) => ({
      name: fixture.expectedName,
      section: fixture.expectedSection,
    })),
  )
})

test('recorta metadatos aunque Blackboard compacte la tarjeta en una lÃ­nea', () => {
  for (const fixture of blackboardCourseCards) {
    assert.equal(courseTitleFromText(fixture.textContent), fixture.expectedName)
  }
})

test('deduplica por id nativo al repetir una tarjeta real de Ultra', () => {
  const fixture = blackboardCourseCards[0]
  const makeCard = () =>
    fakeElement({
      attributes: { href: fixture.href },
      text: fixture.textContent,
      innerText: fixture.innerText,
      matches: ['a[href]'],
      matchIncludes: ['course-title'],
    })
  const root = { querySelectorAll: () => [makeCard(), makeCard()] }

  const courses = collectCourses(root)
  assert.equal(courses.length, 1)
  assert.equal(courses[0].clientId, stableId('course', fixture.courseId))
  assert.equal(courses[0].name, fixture.expectedName)
})

test('extrae actividades fechadas y descarta duplicados con el mismo id nativo', () => {
  const time = fakeElement({
    attributes: { datetime: '2030-06-15T23:59:00-03:00' },
  })
  const title = fakeElement({ text: 'Evaluación de arquitectura' })
  const course = fakeElement({ text: 'Arquitectura de Software' })
  const link = fakeElement({
    attributes: { href: '/ultra/courses/123/assessment/456' },
  })
  const activity = fakeElement({
    attributes: { 'data-activity-id': 'activity-native-1' },
    text: 'Evaluación de arquitectura',
    queries: {
      'time[datetime]': time,
      '[class*="title" i]': title,
      '[class*="course-title" i]': course,
      'a[href]': link,
    },
  })
  const duplicate = fakeElement({
    attributes: { 'data-activity-id': 'activity-native-1' },
    text: 'Evaluación de arquitectura',
    queries: {
      'time[datetime]': time,
      '[class*="title" i]': title,
      '[class*="course-title" i]': course,
      'a[href]': link,
    },
  })
  const root = {
    querySelectorAll() {
      return [activity, duplicate]
    },
  }
  const activities = collectActivities(
    root,
    'https://campusvirtual.duoc.cl/ultra/activity',
  )
  assert.equal(activities.length, 1)
  assert.equal(activities[0].title, 'Evaluación de arquitectura')
  assert.equal(activities[0].courseName, 'Arquitectura de Software')
  assert.equal(
    activities[0].sourceUrl,
    'https://campusvirtual.duoc.cl/ultra/courses/123/assessment/456',
  )
})

test('deduplica materias del flujo real y no convierte avisos publicados en vencimientos', () => {
  const activityFeed = {}
  const makeRow = (dateText, courseId, courseText, detailText) => {
    const date = fakeElement({ text: dateText })
    const detail = fakeElement({ text: detailText })
    const row = fakeElement({
      text: `${dateText} ${courseText} ${detailText}`,
      queries: {
        '[class*="date" i]': date,
        '[class*="activity-detail" i]': detail,
      },
      closest: (_selector, element) => element,
    })
    const course = fakeElement({
      attributes: { href: `/ultra/courses/${courseId}` },
      text: courseText,
      matches: ['a[href]'],
      matchIncludes: ['course-title'],
      closest: (selector) =>
        selector.includes('activity-stream') ? activityFeed : row,
    })
    row.querySelector = (selector) => {
      if (selector === '[class*="course-title" i]') return course
      if (selector === '[class*="date" i]') return date
      if (selector === '[class*="activity-detail" i]') return detail
      return null
    }
    row.querySelectorAll = (selector) => {
      const result = row.querySelector(selector)
      return result ? [result] : []
    }
    return { row, course }
  }

  const templates = [
    [
      '10 de sept. de 2026',
      'course-machine-learning',
      'MACHINE LEARNING_005D_OLS',
      'Añadido: dataset',
    ],
    [
      '21 de jul. de 2026',
      'course-english',
      'INTEGRATED ENGLISH PRACTICE_002D',
      'Nuevo curso disponible: INTEGRATED ENGLISH PRACTICE_002D',
    ],
    [
      '21 de jul. de 2026',
      'course-capstone',
      'CAPSTONE_002D',
      'Nuevo curso disponible: CAPSTONE_002D',
    ],
  ]
  const rows = Array.from({ length: 40 }, (_, index) => {
    const [dateText, courseId, courseText, detailText] =
      templates[index % templates.length]
    return makeRow(
      dateText,
      courseId,
      courseText,
      index < templates.length ? detailText : `Añadido: recurso ${index}`,
    )
  })
  const root = {
    title: 'Actividad',
    querySelectorAll(selector) {
      return selector.includes('[data-course-id]')
        ? rows.map(({ course }) => course)
        : rows.map(({ row }) => row)
    },
  }

  const payload = scanDocument(
    root,
    'https://campusvirtual.duoc.cl/ultra/stream',
    '2026-10-07T12:00:00.000Z',
  )
  assert.deepEqual(
    payload.courses.map((course) => course.name),
    [
      'MACHINE LEARNING_005D_OLS',
      'INTEGRATED ENGLISH PRACTICE_002D',
      'CAPSTONE_002D',
    ],
  )
  assert.deepEqual(
    payload.courses.map((course) => course.section),
    ['005D', '002D', '002D'],
  )
  assert.equal(payload.activities.length, 0)
})

test('extrae las novedades visibles del flujo sin confundir publicación con vencimiento', () => {
  const makeStreamRow = ({
    dateText,
    courseName,
    titleText,
    summaryText = '',
    href,
  }) => {
    const date = fakeElement({ text: dateText })
    const course = fakeElement({ text: courseName })
    const detail = fakeElement({ text: titleText })
    const summary = summaryText ? fakeElement({ text: summaryText }) : null
    const link = fakeElement({ attributes: { href }, matches: ['a[href]'] })
    const row = fakeElement({
      text: [dateText, courseName, titleText, summaryText]
        .filter(Boolean)
        .join('\n'),
      queryLists: {
        '[class*="date" i]': [date],
        '[class*="course-title" i]': [course],
        '[class*="activity-detail" i]': [detail],
        'a[href]': [link],
        ...(summary ? { p: [summary] } : {}),
      },
      closest: (_selector, element) => element,
    })
    return row
  }

  const rows = [
    makeStreamRow({
      dateText: '5 de oct. de 2026',
      courseName: 'CAPSTONE_002D',
      titleText: 'Segunda Evaluación Parcial (semana 9)',
      summaryText:
        'Hola a todos/as: Esta semana nos corresponde la segunda evaluación parcial de la asignatura.',
      href: '/ultra/courses/capstone/outline/edit/document/announcement-1',
    }),
    makeStreamRow({
      dateText: '5 de oct. de 2026',
      courseName: 'CAPSTONE_002D',
      titleText: 'Añadido: Fase 2 (20%) Informe avance Proyecto APT',
      href: '/ultra/courses/capstone/outline/assessment/task-1',
    }),
    makeStreamRow({
      dateText: '5 de oct. de 2026',
      courseName: 'CAPSTONE_002D',
      titleText: 'Añadido: Instrucciones Informe de Avance Proyecto APT',
      href: '/ultra/courses/capstone/outline/document/resource-1',
    }),
    makeStreamRow({
      dateText: '2 de oct. de 2026',
      courseName: 'INTEGRATED ENGLISH PRACTICE_002D',
      titleText: 'Añadido: Rubrica_Written Project.docx',
      href: '/ultra/courses/english/outline/document/resource-2',
    }),
    makeStreamRow({
      dateText: '2 de oct. de 2026',
      courseName: 'INTEGRATED ENGLISH PRACTICE_002D',
      titleText: 'Añadido: Written Project',
      summaryText: 'Direct access to your project — keep AI to a minimum',
      href: '/ultra/courses/english/outline/link/project-1',
    }),
  ]
  const root = { querySelectorAll: () => rows }

  const recent = collectRecentActivities(
    root,
    'https://campusvirtual.duoc.cl/ultra/stream',
  )

  assert.equal(recent.length, 5)
  assert.deepEqual(
    recent.map(({ title, courseName }) => ({ title, courseName })),
    [
      {
        title: 'Segunda Evaluación Parcial (semana 9)',
        courseName: 'CAPSTONE_002D',
      },
      {
        title: 'Añadido: Fase 2 (20%) Informe avance Proyecto APT',
        courseName: 'CAPSTONE_002D',
      },
      {
        title: 'Añadido: Instrucciones Informe de Avance Proyecto APT',
        courseName: 'CAPSTONE_002D',
      },
      {
        title: 'Añadido: Rubrica_Written Project.docx',
        courseName: 'INTEGRATED ENGLISH PRACTICE_002D',
      },
      {
        title: 'Añadido: Written Project',
        courseName: 'INTEGRATED ENGLISH PRACTICE_002D',
      },
    ],
  )
  assert.equal(
    recent[0].publishedAt,
    new Date(2026, 9, 5, 23, 59).toISOString(),
  )
  assert.equal(
    recent[0].description,
    'Hola a todos/as: Esta semana nos corresponde la segunda evaluación parcial de la asignatura.',
  )
  assert.equal(
    recent[0].sourceUrl,
    'https://campusvirtual.duoc.cl/ultra/courses/capstone/outline/edit/document/announcement-1',
  )
  assert.equal(recent[1].description, null)
})

test('solo expone novedades recientes en la ruta del flujo de actividades', () => {
  const root = { querySelectorAll: () => [] }
  assert.deepEqual(
    collectRecentActivities(
      root,
      'https://campusvirtual.duoc.cl/ultra/courses',
    ),
    [],
  )
})

test('acepta una tarea del flujo solo cuando contiene vencimiento explícito', () => {
  const date = fakeElement({ text: '15 de sept. de 2026' })
  const course = fakeElement({ text: 'CAPSTONE_002D' })
  const detail = fakeElement({
    text: 'Entrega: Informe final · Fecha de entrega: 15 de sept. de 2026',
  })
  const row = fakeElement({
    text: 'CAPSTONE_002D Entrega: Informe final Fecha de entrega: 15 de sept. de 2026',
    queries: {
      '[class*="course-title" i]': course,
      '[class*="activity-detail" i]': detail,
      '[class*="date" i]': date,
    },
    closest: (_selector, element) => element,
  })
  const root = { querySelectorAll: () => [row] }
  const activities = collectActivities(
    root,
    'https://campusvirtual.duoc.cl/ultra/stream',
  )
  assert.equal(activities.length, 1)
  assert.equal(activities[0].courseName, 'CAPSTONE_002D')
  assert.match(activities[0].title, /^Entrega:/u)
  assert.equal(new Date(activities[0].dueAt).getDate(), 15)
  assert.deepEqual(
    collectRecentActivities(root, 'https://campusvirtual.duoc.cl/ultra/stream'),
    [],
  )
})
