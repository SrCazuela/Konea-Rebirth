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
  const COURSE_NAME_SELECTORS = [
    '[data-course-name]',
    '[class*="course-title" i]',
    '[class*="course-name" i]',
    '[data-testid*="course-title" i]',
    '[data-testid*="course-name" i]',
    '.js-course-title-element',
    '[role="heading"]',
    'h1',
    'h2',
    'h3',
    'h4',
  ]
  const ACTIVITY_FEED_SELECTOR = [
    '[data-testid*="activity-stream" i]',
    '[id*="activity-stream" i]',
    '[class*="activity-stream" i]',
  ].join(',')
  const ACTIVITY_SELECTORS = [
    '[data-activity-id]',
    '[data-testid*="activity" i]',
    '[id*="activity-stream" i] li',
    '[id*="activity-stream" i] [role="listitem"]',
    '[class*="activity-stream" i] li',
    '[class*="activity-stream" i] [role="listitem"]',
    '[class*="activity-item" i]',
    '[class*="stream-item" i]',
    '[class*="stream-entry" i]',
    '[class*="calendar-item" i]',
    'time[datetime]',
  ]
  const RECENT_ACTIVITY_SELECTORS = [
    ...ACTIVITY_SELECTORS,
    '[class*="activity" i] [class*="item" i]',
    '[class*="stream" i] [class*="item" i]',
    '[class*="timeline" i] [class*="item" i]',
    '[class*="date" i]',
    'a[href*="/ultra/courses/"]',
  ]
  const ACTIVITY_CONTAINER_SELECTOR = [
    '[data-activity-id]',
    '[data-testid*="activity-item" i]',
    '[class*="activity-item" i]',
    '[class*="stream-item" i]',
    '[class*="stream-entry" i]',
    '[class*="calendar-item" i]',
    '[role="listitem"]',
    'li',
    'article',
  ].join(',')
  const ACTIVITY_DETAIL_SELECTORS = [
    '[data-activity-title]',
    '[class*="activity-title" i]',
    '[class*="activity-detail" i]',
    '[class*="stream-detail" i]',
    '[class*="content-title" i]',
    '[class*="description" i]',
    'p',
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
    const text = cleanText(value, 500)
    if (!text) return null
    if (/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/u.test(text)) {
      const isoDate = new Date(text)
      if (!Number.isNaN(isoDate.getTime())) return isoDate.toISOString()
    }

    const spanishMonthMatch = text.match(
      /\b(\d{1,2})\s+de\s+([a-záéíóúüñ.]+)\s+(?:de\s+)?(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/iu,
    )
    if (spanishMonthMatch) {
      const months = new Map([
        ['ene', 0],
        ['enero', 0],
        ['feb', 1],
        ['febrero', 1],
        ['mar', 2],
        ['marzo', 2],
        ['abr', 3],
        ['abril', 3],
        ['may', 4],
        ['mayo', 4],
        ['jun', 5],
        ['junio', 5],
        ['jul', 6],
        ['julio', 6],
        ['ago', 7],
        ['agosto', 7],
        ['sep', 8],
        ['sept', 8],
        ['septiembre', 8],
        ['set', 8],
        ['setiembre', 8],
        ['oct', 9],
        ['octubre', 9],
        ['nov', 10],
        ['noviembre', 10],
        ['dic', 11],
        ['diciembre', 11],
      ])
      const monthName = spanishMonthMatch[2]
        .normalize('NFD')
        .replace(/[\u0300-\u036f.]/gu, '')
        .toLocaleLowerCase('es-CL')
      const month = months.get(monthName)
      if (month !== undefined) {
        const [, day, , year, hour = '23', minute = '59'] = spanishMonthMatch
        const parsed = new Date(
          Number(year),
          month,
          Number(day),
          Number(hour),
          Number(minute),
        )
        if (
          parsed.getFullYear() === Number(year) &&
          parsed.getMonth() === month &&
          parsed.getDate() === Number(day)
        ) {
          return parsed.toISOString()
        }
      }
    }

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
    const sectionMatch =
      text.match(/secci[oó]n\s*[:#-]?\s*([A-Z0-9-]{2,20})/iu) ||
      text.match(/(?:^|[_\s-])(\d{3}[A-Z])(?:[_\s-]|$)/iu)
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

  function matchingElements(element, selectors) {
    const matches = []
    const seen = new Set()
    for (const selector of selectors) {
      const candidates = []
      if (element.matches?.(selector)) candidates.push(element)
      if (typeof element.querySelectorAll === 'function') {
        candidates.push(...element.querySelectorAll(selector))
      } else {
        const candidate = element.querySelector?.(selector)
        if (candidate) candidates.push(candidate)
      }
      for (const candidate of candidates) {
        if (!candidate || seen.has(candidate)) continue
        seen.add(candidate)
        matches.push(candidate)
      }
    }
    return matches
  }

  function elementText(element, maximum = 300) {
    return cleanText(
      element?.getAttribute?.('data-title') ||
        element?.getAttribute?.('aria-label') ||
        element?.textContent,
      maximum,
    )
  }

  function courseTitleFromText(value) {
    const rawText = String(value || '').normalize('NFKC')
    const lines = rawText
      .split(/[\r\n]+/u)
      .map((line) => cleanText(line, 300))
      .filter(Boolean)
    if (!lines.length) return ''

    const sectionPattern =
      /(?:^|[_\s-])\d{3}[A-Z](?:_[A-Z0-9]{2,12})*(?:$|\s)/iu
    const metadataPattern =
      /^(?:20\d{2}[_/-]\d\b|abierto\b|cerrado\b|privado\b|tiene\s+excepciones\b|m(?:a|á)s\s+informaci(?:o|ó)n\b)/iu
    const semanticLine =
      lines.length > 1
        ? lines.find(
            (line) => sectionPattern.test(line) && !metadataPattern.test(line),
          )
        : null
    const text = cleanText(
      semanticLine ||
        (lines.length > 1 && !metadataPattern.test(lines[0])
          ? lines[0]
          : rawText),
      1_000,
    )
    let cutoff = text.length
    for (const marker of [
      /\s+20\d{2}[_/-]\d(?:[_\s-][A-Z0-9]+){2,}\b/iu,
      /\s+(?:abierto|cerrado|privado)(?:\s+(?:abierto|cerrado|privado))?\b/iu,
      /\s+tiene\s+excepciones\b/iu,
      /\s+m(?:a|á)s\s+informaci(?:o|ó)n\b/iu,
    ]) {
      const match = marker.exec(text)
      if (match && match.index < cutoff) cutoff = match.index
    }
    return cleanText(text.slice(0, cutoff), 300)
  }

  function courseNameFromElement(element) {
    const dataName = courseTitleFromText(
      element?.getAttribute?.('data-course-name'),
    )
    if (dataName) return dataName

    const candidates = []
    const seen = new Set()
    const addCandidate = (candidate) => {
      const name = courseTitleFromText(
        candidate?.getAttribute?.('data-course-name') ||
          candidate?.getAttribute?.('data-title') ||
          candidate?.getAttribute?.('aria-label') ||
          candidate?.innerText ||
          candidate?.textContent,
      )
      const normalized = name.toLocaleLowerCase('es-CL')
      if (!name || seen.has(normalized)) return
      seen.add(normalized)
      candidates.push(name)
    }

    addCandidate(element)
    for (const candidate of matchingElements(element, COURSE_NAME_SELECTORS)) {
      addCandidate(candidate)
    }

    const sectionPattern = /(?:^|[_\s-])\d{3}[A-Z](?:_[A-Z0-9]{2,12})*$/iu
    return (
      candidates.find((name) => sectionPattern.test(name)) ||
      candidates.sort((left, right) => left.length - right.length)[0] ||
      ''
    )
  }

  function nearestContainer(element) {
    return (
      element.closest?.(ACTIVITY_CONTAINER_SELECTOR) ||
      element.parentElement ||
      element
    )
  }

  function streamContainer(element) {
    const semanticContainer = element?.closest?.(ACTIVITY_CONTAINER_SELECTOR)
    if (semanticContainer) return semanticContainer

    // Some versions of Ultra render the feed with anonymous nested divs. In
    // that case, walk only a few levels and select the smallest ancestor that
    // contains both a visible date and enough text to represent one entry.
    let ancestor = element?.parentElement
    for (let depth = 0; ancestor && depth < 7; depth += 1) {
      const text = cleanText(ancestor.innerText || ancestor.textContent, 2_000)
      if (parseDate(text) && text.length >= 12) return ancestor
      ancestor = ancestor.parentElement
    }
    return element
  }

  function explicitCourseName(container) {
    const dataName = courseTitleFromText(
      container.getAttribute?.('data-course-name'),
    )
    if (dataName) return dataName
    for (const element of matchingElements(container, COURSE_NAME_SELECTORS)) {
      const name = courseNameFromElement(element)
      if (name) return name
    }
    return ''
  }

  function activityDate(container) {
    const attributeDate =
      container.getAttribute?.('data-due-date') ||
      container.getAttribute?.('data-date')
    const parsedAttribute = parseDate(attributeDate)
    if (parsedAttribute) return parsedAttribute

    const datedElements = matchingElements(container, [
      'time[datetime]',
      '[datetime]',
      '[class*="date" i]',
      '[class*="time" i]',
    ])
    for (const element of datedElements) {
      const parsed = parseDate(
        element.getAttribute?.('datetime') || element.textContent,
      )
      if (parsed) return parsed
    }
    return parseDate(container.textContent)
  }

  function explicitDueDate(container) {
    const attributeDate = container.getAttribute?.('data-due-date')
    const parsedAttribute = parseDate(attributeDate)
    if (parsedAttribute) return parsedAttribute

    for (const element of matchingElements(container, [
      '[data-due-date]',
      '[data-testid*="due" i]',
      '[class*="due-date" i]',
      '[class*="dueDate" i]',
      '[class*="fecha-entrega" i]',
    ])) {
      const parsed = parseDate(
        element.getAttribute?.('data-due-date') ||
          element.getAttribute?.('datetime') ||
          element.textContent,
      )
      if (parsed) return parsed
    }

    const text = cleanText(container.textContent, 1_000)
    if (
      !/(?:vence|vencimiento|fecha\s+de\s+entrega|entregar\s+(?:antes|hasta))/iu.test(
        text,
      )
    ) {
      return null
    }
    return parseDate(text)
  }

  function visibleLines(element) {
    return String(element?.innerText || element?.textContent || '')
      .normalize('NFKC')
      .split(/[\r\n]+/u)
      .map((line) => cleanText(line, 1_000))
      .filter(Boolean)
  }

  function meaningfulActivityLines(container, courseName) {
    const ignored = new Set(
      [courseName, 'Reciente', 'Hoy', 'Actividad', 'Flujo de actividades']
        .filter(Boolean)
        .map((value) => cleanText(value).toLocaleLowerCase('es-CL')),
    )
    const seen = new Set()
    return visibleLines(container).filter((line) => {
      const normalized = line.toLocaleLowerCase('es-CL')
      if (
        ignored.has(normalized) ||
        isOnlyDate(line) ||
        /^(?:mostrar todo|filtrar)$/iu.test(line) ||
        seen.has(normalized)
      ) {
        return false
      }
      seen.add(normalized)
      return true
    })
  }

  function streamCourseName(container) {
    const semanticName = explicitCourseName(container)
    const sectionPattern =
      /(?:^|[_\s-])\d{3}[A-Z](?:_[A-Z0-9]{2,12})*(?:$|\s)/iu
    if (semanticName && sectionPattern.test(semanticName)) return semanticName

    const visibleName = visibleLines(container).find((line) =>
      sectionPattern.test(line),
    )
    return visibleName ? courseTitleFromText(visibleName) : semanticName
  }

  function recentActivityContent(container, courseName) {
    const lines = meaningfulActivityLines(container, courseName)
    const detailCandidates = []
    const seen = new Set()
    for (const element of matchingElements(container, [
      '[data-activity-title]',
      '[class*="activity-title" i]',
      '[class*="activity-detail" i]',
      '[class*="stream-detail" i]',
      '[class*="content-title" i]',
      '[class*="item-title" i]',
      '[class*="name" i]',
      'h1',
      'h2',
      'h3',
      'h4',
      'a[href]',
    ])) {
      for (const line of visibleLines(element)) {
        const normalized = line.toLocaleLowerCase('es-CL')
        if (
          line.length < 2 ||
          line === courseName ||
          isOnlyDate(line) ||
          /^(?:reciente|hoy|actividad)$/iu.test(line) ||
          seen.has(normalized)
        ) {
          continue
        }
        seen.add(normalized)
        detailCandidates.push(line)
      }
    }

    const candidates = [...detailCandidates, ...lines]
    const title =
      candidates.find((line) =>
        /^(?:añadido|agregado|actualizado|publicado|nuevo curso disponible|vence|fecha de entrega|entrega)\s*:/iu.test(
          line,
        ),
      ) ||
      candidates.find(
        (line) =>
          line !== courseName &&
          !/^(?:hola(?:\s+a\s+todos(?:\/as)?)?|estimados(?:\/as)?)[,:!]?$/iu.test(
            line,
          ),
      ) ||
      ''

    const descriptionElements = matchingElements(container, [
      '[class*="description" i]',
      '[class*="summary" i]',
      '[class*="snippet" i]',
      'p',
    ])
    const descriptions = descriptionElements
      .flatMap((element) => visibleLines(element))
      .filter(
        (line) =>
          line !== title &&
          line !== courseName &&
          !isOnlyDate(line) &&
          line.length > 2,
      )
    const fallbackDescription = lines.filter(
      (line) => line !== title && line !== courseName && line.length > 2,
    )
    const description = cleanText(
      (descriptions.length ? descriptions : fallbackDescription).join(' '),
      1_000,
    )

    return {
      title: cleanText(title, 160),
      description: description && description !== title ? description : null,
    }
  }

  function activitySourceUrl(container, pageUrl) {
    const links = matchingElements(container, ['a[href]'])
    const preferred =
      links.find((link) => {
        const href = cleanText(link.getAttribute?.('href'), 2_000)
        return href && !/^\/ultra\/courses\/[^/]+\/?$/iu.test(href)
      }) || links[0]
    const href = preferred?.getAttribute?.('href')
    return href ? safeCampusUrl(href, pageUrl) : null
  }

  function collectRecentActivities(documentRoot, pageUrl) {
    const parsedPageUrl = new URL(pageUrl)
    if (!parsedPageUrl.pathname.startsWith('/ultra/stream')) return []

    const rawCandidates = documentRoot.querySelectorAll(
      RECENT_ACTIVITY_SELECTORS.join(','),
    )
    const containers = []
    const seenContainers = new Set()
    for (const element of rawCandidates) {
      const container = streamContainer(element)
      if (
        !container ||
        seenContainers.has(container) ||
        !isVisible(container)
      ) {
        continue
      }
      seenContainers.add(container)
      containers.push(container)
    }

    const byId = new Map()
    for (const container of containers) {
      // A row with an explicit due date belongs to the importable task list,
      // not to the informational publication feed.
      if (explicitDueDate(container)) continue
      const publishedAt = activityDate(container)
      if (!publishedAt) continue
      const courseName = streamCourseName(container)
      if (!courseName) continue
      const { title, description } = recentActivityContent(
        container,
        courseName,
      )
      if (title.length < 2) continue
      const sourceUrl = activitySourceUrl(container, pageUrl)
      const nativeId = cleanText(
        container.getAttribute?.('data-activity-id') ||
          container.getAttribute?.('data-content-id') ||
          container.getAttribute?.('data-id'),
        100,
      )
      const clientId = stableId(
        'recent',
        nativeId ||
          `${title}\0${courseName}\0${publishedAt}\0${sourceUrl || ''}`,
      )
      if (byId.has(clientId)) continue
      byId.set(clientId, {
        clientId,
        title,
        description,
        courseName,
        publishedAt,
        sourceUrl,
      })
      if (byId.size >= 250) break
    }
    return [...byId.values()]
  }

  function isOnlyDate(value) {
    const text = cleanText(value, 200)
    if (!text || !parseDate(text)) return false
    return (
      /^\d{1,2}[/-]\d{1,2}[/-]\d{4}(?:\s+\d{1,2}:\d{2})?$/u.test(text) ||
      /^\d{1,2}\s+de\s+[a-záéíóúüñ.]+\s+(?:de\s+)?\d{4}(?:\s+\d{1,2}:\d{2})?$/iu.test(
        text,
      )
    )
  }

  function activityTitle(container, courseName) {
    const validTitles = []
    const seen = new Set()
    const addCandidates = (selectors) => {
      for (const element of matchingElements(container, selectors)) {
        const title = elementText(element, 160)
        const normalized = title.toLocaleLowerCase('es-CL')
        if (
          title.length < 2 ||
          title === courseName ||
          isOnlyDate(title) ||
          /^(actividad|activity|hoy|reciente)$/iu.test(title) ||
          seen.has(normalized)
        ) {
          continue
        }
        seen.add(normalized)
        validTitles.push(title)
      }
    }

    addCandidates(ACTIVITY_DETAIL_SELECTORS)
    addCandidates(TITLE_SELECTORS)
    return (
      validTitles.find((title) =>
        /^(añadido|agregado|actualizado|publicado|nuevo curso disponible|vence|fecha de entrega|entrega)\b/iu.test(
          title,
        ),
      ) ||
      validTitles[0] ||
      ''
    )
  }

  function nativeCourseId(element, container) {
    const attributeId = cleanText(
      element.getAttribute?.('data-course-id') ||
        container.getAttribute?.('data-course-id'),
      100,
    )
    if (attributeId) return attributeId

    const link = element.matches?.('a[href]')
      ? element
      : element.querySelector?.('a[href*="/ultra/courses/"]') ||
        container.querySelector?.('a[href*="/ultra/courses/"]')
    const href = cleanText(link?.getAttribute?.('href'), 2_000)
    const idMatch = href.match(/\/ultra\/courses\/([^/?#]+)/iu)
    return idMatch ? cleanText(idMatch[1], 100) : ''
  }

  function collectCourses(documentRoot) {
    const candidates = documentRoot.querySelectorAll(COURSE_SELECTORS.join(','))
    const byIdentity = new Map()
    const fallbackNames = new Set()
    for (const element of candidates) {
      if (!isVisible(element)) continue
      const insideActivityFeed = Boolean(
        element.closest?.(ACTIVITY_FEED_SELECTOR),
      )
      if (
        insideActivityFeed &&
        !element.matches?.(COURSE_NAME_SELECTORS.join(','))
      ) {
        continue
      }
      const container =
        element.closest?.('article, li, [role="listitem"]') || element
      const name = courseNameFromElement(element)
      if (name.length < 2 || /^(cursos?|course content)$/iu.test(name)) continue
      const normalizedName = name.toLocaleLowerCase('es-CL')
      const details = courseDetailsFromText(container.textContent)
      const nativeId = nativeCourseId(element, container)
      const identity = nativeId ? `id:${nativeId}` : `name:${normalizedName}`
      if (byIdentity.has(identity)) continue
      if (!nativeId && fallbackNames.has(normalizedName)) continue
      fallbackNames.add(normalizedName)
      byIdentity.set(identity, {
        clientId: stableId('course', nativeId || normalizedName),
        name,
        ...details,
      })
      if (byIdentity.size >= 100) break
    }
    return [...byIdentity.values()]
  }

  function collectActivities(documentRoot, pageUrl) {
    const candidates = documentRoot.querySelectorAll(
      ACTIVITY_SELECTORS.join(','),
    )
    const byId = new Map()
    const isActivityStream = new URL(pageUrl).pathname.startsWith(
      '/ultra/stream',
    )
    for (const rawElement of candidates) {
      const container = nearestContainer(rawElement)
      if (!isVisible(container)) continue
      const dueAt = isActivityStream
        ? explicitDueDate(container)
        : activityDate(container)
      if (!dueAt) continue
      const courseName = explicitCourseName(container)
      const title = activityTitle(container, courseName)
      if (title.length < 2) continue
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
        description:
          description && description !== title && description !== courseName
            ? description
            : null,
        courseName: courseName || null,
        dueAt,
        sourceUrl,
      })
      if (byId.size >= 250) break
    }
    return [...byId.values()]
  }

  function coursesFromActivities(courses, activities) {
    const byName = new Map(
      courses.map((course) => [course.name.toLocaleLowerCase('es-CL'), course]),
    )
    for (const activity of activities) {
      const name = cleanText(activity.courseName, 300)
      const normalizedName = name.toLocaleLowerCase('es-CL')
      if (!name || byName.has(normalizedName) || byName.size >= 100) continue
      byName.set(normalizedName, {
        clientId: stableId('course', normalizedName),
        name,
        ...courseDetailsFromText(name),
      })
    }
    return [...byName.values()]
  }

  function scanDocument(
    documentRoot,
    pageUrl,
    capturedAt = new Date().toISOString(),
  ) {
    const safePageUrl = safeCampusUrl(pageUrl, pageUrl)
    if (!safePageUrl)
      throw new Error('Esta página no pertenece al Campus Virtual de Duoc UC.')
    const activities = collectActivities(documentRoot, safePageUrl)
    const recentActivities = collectRecentActivities(documentRoot, safePageUrl)
    const courses = coursesFromActivities(
      collectCourses(documentRoot),
      activities,
    )
    return {
      version: 1,
      source: {
        pageUrl: safePageUrl,
        pageTitle: cleanText(documentRoot.title || 'Campus Virtual', 300),
        capturedAt,
      },
      courses,
      activities,
      recentActivities,
    }
  }

  const api = {
    cleanText,
    stableId,
    safeCampusUrl,
    parseDate,
    courseDetailsFromText,
    courseTitleFromText,
    courseNameFromElement,
    collectCourses,
    collectActivities,
    collectRecentActivities,
    scanDocument,
  }
  globalScope.KoneaAvaParser = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
