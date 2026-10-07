;(function initializePopup() {
  'use strict'

  const statusElement = document.querySelector('#status')
  const previewForm = document.querySelector('#preview')
  const retryButton = document.querySelector('#retry')
  const openKoneaButton = document.querySelector('#open-konea')
  const courseContainer = document.querySelector('#courses')
  const activityContainer = document.querySelector('#activities')
  const recentActivityContainer = document.querySelector('#recent-activities')
  const recentActivitySection = document.querySelector(
    '#recent-activity-section',
  )
  const courseCount = document.querySelector('#course-count')
  const activityCount = document.querySelector('#activity-count')
  const recentActivityCount = document.querySelector('#recent-activity-count')
  const streamWarning = document.querySelector('#stream-warning')
  const selectionHint = document.querySelector('#selection-hint')
  const exportButton = document.querySelector('#export')
  let currentPayload = null

  function showError(message) {
    statusElement.textContent = message
    statusElement.classList.add('error')
    streamWarning.hidden = true
    previewForm.hidden = true
    retryButton.hidden = false
  }

  function createChoice(type, item, detail) {
    const label = document.createElement('label')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.name = type
    checkbox.value = item.clientId
    checkbox.checked = true
    const text = document.createElement('span')
    const title = document.createElement('strong')
    title.textContent = item.name || item.title
    const description = document.createElement('small')
    description.textContent = detail
    text.append(title, description)
    label.append(checkbox, text)
    return label
  }

  function formatDate(value) {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? 'Fecha de publicación no disponible'
      : date.toLocaleDateString('es-CL', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
  }

  function createRecentActivity(item) {
    const article = document.createElement('article')
    article.className = 'read-only-item'

    const title = document.createElement('strong')
    title.textContent = item.title

    const detail = document.createElement('small')
    detail.textContent = `${item.courseName || 'Sin materia visible'} · Publicado el ${formatDate(item.publishedAt)}`

    article.append(title, detail)
    return article
  }

  function render(payload) {
    currentPayload = payload
    const recentActivities = Array.isArray(payload.recentActivities)
      ? payload.recentActivities
      : []
    const isActivityStream = new URL(
      payload.source.pageUrl,
    ).pathname.startsWith('/ultra/stream')
    streamWarning.hidden = !isActivityStream
    courseContainer.replaceChildren(
      ...payload.courses.map((course) =>
        createChoice(
          'course',
          course,
          [course.code, course.section && `Sección ${course.section}`]
            .filter(Boolean)
            .join(' · ') || 'Sin código o sección visible',
        ),
      ),
    )
    activityContainer.replaceChildren(
      ...payload.activities.map((activity) =>
        createChoice(
          'activity',
          activity,
          `${activity.courseName || 'Sin materia visible'} · ${new Date(
            activity.dueAt,
          ).toLocaleString('es-CL')}`,
        ),
      ),
    )
    recentActivityContainer.replaceChildren(
      ...recentActivities.map(createRecentActivity),
    )
    recentActivitySection.hidden = recentActivities.length === 0
    courseCount.textContent = String(payload.courses.length)
    activityCount.textContent = String(payload.activities.length)
    recentActivityCount.textContent = String(recentActivities.length)
    const detected = [
      `${payload.courses.length} materias`,
      `${payload.activities.length} tareas con vencimiento`,
      ...(recentActivities.length > 0
        ? [`${recentActivities.length} publicaciones recientes`]
        : []),
    ]
    statusElement.textContent = `${detected.join(', ')} encontradas en esta página.`
    statusElement.classList.remove('error')
    exportButton.disabled =
      payload.courses.length === 0 && payload.activities.length === 0
    selectionHint.textContent = exportButton.disabled
      ? 'Las novedades recientes son informativas. Abre Calendario en AVA para obtener tareas con fechas de entrega.'
      : 'Revisa la selección. Konea volverá a pedir tu confirmación antes de guardar cualquier dato.'
    exportButton.textContent = exportButton.disabled
      ? 'No hay datos importables'
      : 'Exportar para Konea'
    previewForm.hidden = false
    retryButton.hidden = true
  }

  async function scan() {
    statusElement.textContent = 'Revisando la pestaña activa…'
    statusElement.classList.remove('error')
    streamWarning.hidden = true
    previewForm.hidden = true
    retryButton.hidden = true
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url?.startsWith('https://campusvirtual.duoc.cl/')) {
      showError(
        'Abre una página de Cursos, Actividad o Calendario en AVA y vuelve a intentarlo.',
      )
      return
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['parser.js'],
      })
      const [scanResult] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () =>
          globalThis.KoneaAvaParser.scanDocument(
            document,
            globalThis.location.href,
          ),
      })
      const payload = scanResult?.result
      if (!payload) throw new Error('La pestaña no devolvió resultados.')
      const recentActivities = Array.isArray(payload.recentActivities)
        ? payload.recentActivities
        : []
      if (
        payload.courses.length === 0 &&
        payload.activities.length === 0 &&
        recentActivities.length === 0
      ) {
        showError(
          'No encontramos información visible aquí. Abre Cursos, Actividad o Calendario y espera a que AVA termine de cargar.',
        )
        return
      }
      render(payload)
    } catch {
      showError(
        'No pudimos leer esta pestaña. Recárgala y comprueba que la extensión esté habilitada para campusvirtual.duoc.cl.',
      )
    }
  }

  previewForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!currentPayload) return
    const selectedCourses = new Set(
      [...document.querySelectorAll('input[name="course"]:checked')].map(
        (input) => input.value,
      ),
    )
    const selectedActivities = new Set(
      [...document.querySelectorAll('input[name="activity"]:checked')].map(
        (input) => input.value,
      ),
    )
    // La API de Konea acepta el contrato v1 estricto. La actividad reciente es
    // solo una vista informativa del popup y nunca se incluye en el archivo.
    const payload = {
      version: 1,
      source: currentPayload.source,
      courses: currentPayload.courses.filter((course) =>
        selectedCourses.has(course.clientId),
      ),
      activities: currentPayload.activities.filter((activity) =>
        selectedActivities.has(activity.clientId),
      ),
    }
    if (payload.courses.length === 0 && payload.activities.length === 0) {
      showError('Selecciona al menos una materia o actividad para exportar.')
      return
    }
    const objectUrl = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      }),
    )
    try {
      await chrome.downloads.download({
        url: objectUrl,
        filename: `konea-ava-${new Date().toISOString().slice(0, 10)}.json`,
        saveAs: true,
      })
      statusElement.textContent =
        'Archivo preparado. Regresa a Konea, elige “Importar captura” y revísalo antes de confirmar.'
      openKoneaButton.hidden = false
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000)
    }
  })

  retryButton.addEventListener('click', () => void scan())
  openKoneaButton.addEventListener('click', () => {
    void chrome.tabs.create({ url: 'http://localhost:5173/#academic' })
  })
  void scan()
})()
