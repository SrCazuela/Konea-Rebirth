const test = require('node:test')
const assert = require('node:assert/strict')
const {
  cleanText,
  collectActivities,
  collectCourses,
  courseDetailsFromText,
  parseDate,
  safeCampusUrl,
  stableId,
} = require('./parser.js')

function fakeElement({
  attributes = {},
  text = '',
  queries = {},
  matches = [],
}) {
  const element = {
    hidden: false,
    textContent: text,
    parentElement: null,
    getAttribute(name) {
      return attributes[name] ?? null
    },
    matches(selector) {
      return matches.includes(selector)
    },
    closest() {
      return element
    },
    querySelector(selector) {
      return queries[selector] ?? null
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
  assert.ok(parseDate('10/05/2030 15:30'))
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
      '[class*="course" i]': course,
      'a[href]': link,
    },
  })
  const duplicate = fakeElement({
    attributes: { 'data-activity-id': 'activity-native-1' },
    text: 'Evaluación de arquitectura',
    queries: {
      'time[datetime]': time,
      '[class*="title" i]': title,
      '[class*="course" i]': course,
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
