;(function initializeKoneaAvaParser(globalScope) {
  'use strict'

  const CAMPUS_HOST = 'campusvirtual.duoc.cl'
  const COURSE_SELECTORS = [
    '[data-course-id]',
    '[data-course-name]',
    '[class*="course-title" i]',
    'a[href*="/ultra/courses/"]',
    'a[href*="listContent.jsp"][href*="course_id"]',
  ]
  const ACTIVITY_SELECTORS = [
    '[data-activity-id]',
    '[data-testid*="activity" i]',
    '[class*="activity-stream" i] li',
    '[class*="activity-item" i]',
    '[class*="calendar-item" i]',
    'time[datetime]',
  ]
  const TITLE_SELECTORS = [
    '[data-title]',
    '[class*="title" i]',
    'h1',
    'h2',
    'h3',
    'h4',
    'a[href]',
  ]

  function cleanText(value, maximum = 300) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/\s+/gu, ' ')
      .trim()
      .slice(0, maximum)
  }

  function stableId(prefix, value) {
    let hashA = 2166136261
    let hashB = 2246822507
    for (const character of String(value)) {
      const code = character.codePointAt(0) || 0
      hashA = Math.imul(hashA ^ code, 16777619)
      hashB = Math.imul(hashB ^ code, 3266489917)
    }
    return `${prefix}_${(hashA >>> 0).toString(36)}${(hashB >>> 0).toString(36)}`
  }

  function safeCampusUrl(value, baseUrl) {
    try {
      const url = new URL(value || baseUrl, baseUrl)
      if (url.protocol !== 'https:' || url.hostname !== CAMPUS_HOST) return null
      url.username = ''
      url.password = ''
      url.search = ''
      url.hash = ''
      return url.toString()
    } catch {
      return null
    }
  }

  function parseDate(value) {
    const text = cleanText(value, 100)
    if (!text) return null
    const direct = new Date(text)
    if (!Number.isNaN(direct.getTime())) return direct.toISOString()

    const localMatch = text.match(
      /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/u,
    )
    if (!localMatch) return null
    const [, day, month, year, hour = '23', minute = '59'] = localMatch
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    )
    if (
      parsed.getFullYear() !== Number(year) ||
      parsed.getMonth() !== Number(month) - 1 ||
      parsed.getDate() !== Number(day)
    ) {
      return null
    }
    return parsed.toISOString()
  }

  function courseDetailsFromText(value) {
    const text = cleanText(value, 600)
    const codeMatch = text.match(
      /(?:c[oó]digo|sigla)\s*[:#-]?\s*([A-ZÁÉÍÓÚÑ]{2,10}[- ]?\d{2,6})/iu,
    )
    const sectionMatch = text.match(/secci[oó]n\s*[:#-]?\s*([A-Z0-9-]{2,20})/iu)
    const termMatch = text.match(
      /((?:primer|segundo)\s+semestre\s+\d{4}|\d{4}[-/]\d)/iu,
    )
    return {
      code: codeMatch ? cleanText(codeMatch[1], 80) : null,
      section: sectionMatch ? cleanText(sectionMatch[1], 80) : null,
      term: termMatch ? cleanText(termMatch[1], 100) : null,
    }
  }

  function isVisible(element) {
    if (
      !element ||
      element.hidden ||
      element.getAttribute?.('aria-hidden') === 'true'
    ) {
      return false
    }
    const style = globalScope.getComputedStyle?.(element)
    if (style && (style.display === 'none' || style.visibility === 'hidden')) {
      return false
    }
    if (typeof element.getClientRects === 'function') {
      const rectangles = element.getClientRects()
      if (rectangles.length === 0 && element !== globalScope.document?.body) {
        return false
      }
    }
    return true
  }

  function firstText(element, selectors, maximum = 300) {
    for (const selector of selectors) {
      const candidate = element.matches?.(selector)
        ? element
        : element.querySelector?.(selector)
      const value = cleanText(
        candidate?.getAttribute?.('data-title') ||
          candidate?.getAttribute?.('aria-label') ||
          candidate?.textContent,
        maximum,
      )
      if (value) return value
    }
    return ''
  }

  function nearestContainer(element) {
    return (
      element.closest?.(
        '[data-activity-id], [data-testid*="activity" i], [class*="activity-item" i], [class*="calendar-item" i], li, article',
      ) ||
      element.parentElement ||
      element
    )
  }

  function collectCourses(documentRoot) {
    const candidates = documentRoot.querySelectorAll(COURSE_SELECTORS.join(','))
    const byName = new Map()
    for (const element of candidates) {
      if (!isVisible(element)) continue
      const container =
        element.closest?.('article, li, [role="listitem"]') || element
      const name = cleanText(
        element.getAttribute?.('data-course-name') ||
          firstText(container, TITLE_SELECTORS),
        300,
      )
      if (name.length < 2 || /^(cursos?|course content)$/iu.test(name)) continue
      const normalizedName = name.toLocaleLowerCase('es-CL')
      if (byName.has(normalizedName)) continue
      const details = courseDetailsFromText(container.textContent)
      const nativeId = cleanText(
        element.getAttribute?.('data-course-id') ||
          container.getAttribute?.('data-course-id'),
        100,
      )
      byName.set(normalizedName, {
        clientId: stableId('course', nativeId || normalizedName),
        name,
        ...details,
      })
      if (byName.size >= 100) break
    }
    return [...byName.values()]
  }

  function collectActivities(documentRoot, pageUrl) {
    const candidates = documentRoot.querySelectorAll(
      ACTIVITY_SELECTORS.join(','),
    )
    const byId = new Map()
    for (const rawElement of candidates) {
      const container = nearestContainer(rawElement)
      if (!isVisible(container)) continue
      const timeElement = container.querySelector?.('time[datetime]')
      const dueAt = parseDate(
        timeElement?.getAttribute?.('datetime') ||
          container.getAttribute?.('data-due-date') ||
          container.getAttribute?.('data-date') ||
          timeElement?.textContent,
      )
      if (!dueAt) continue
      const title = firstText(container, TITLE_SELECTORS, 160)
      if (title.length < 2) continue
      const courseName = cleanText(
        container.getAttribute?.('data-course-name') ||
          firstText(container, ['[class*="course" i]']),
        300,
      )
      const description = cleanText(
        firstText(container, ['[class*="description" i]', 'p'], 1_000),
        1_000,
      )
      const link = container.matches?.('a[href]')
        ? container
        : container.querySelector?.('a[href]')
      const sourceUrl = safeCampusUrl(link?.getAttribute?.('href'), pageUrl)
      const nativeId = cleanText(
        container.getAttribute?.('data-activity-id') ||
          container.getAttribute?.('data-content-id') ||
          container.getAttribute?.('data-id'),
        100,
      )
      const clientId = stableId(
        'activity',
        nativeId || `${title}\0${courseName}\0${dueAt}\0${sourceUrl || ''}`,
      )
      if (byId.has(clientId)) continue
      byId.set(clientId, {
        clientId,
        title,
        description: description && description !== title ? description : null,
        courseName: courseName || null,
        dueAt,
        sourceUrl,
      })
      if (byId.size >= 250) break
    }
    return [...byId.values()]
  }

  function scanDocument(
    documentRoot,
    pageUrl,
    capturedAt = new Date().toISOString(),
  ) {
    const safePageUrl = safeCampusUrl(pageUrl, pageUrl)
    if (!safePageUrl)
      throw new Error('Esta página no pertenece al Campus Virtual de Duoc UC.')
    return {
      version: 1,
      source: {
        pageUrl: safePageUrl,
        pageTitle: cleanText(documentRoot.title || 'Campus Virtual', 300),
        capturedAt,
      },
      courses: collectCourses(documentRoot),
      activities: collectActivities(documentRoot, safePageUrl),
    }
  }

  const api = {
    cleanText,
    stableId,
    safeCampusUrl,
    parseDate,
    courseDetailsFromText,
    collectCourses,
    collectActivities,
    scanDocument,
  }
  globalScope.KoneaAvaParser = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
