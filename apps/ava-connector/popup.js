;(function initializePopup() {
  'use strict'

  const statusElement = document.querySelector('#status')
  const previewForm = document.querySelector('#preview')
  const retryButton = document.querySelector('#retry')
  const openKoneaButton = document.querySelector('#open-konea')
  const courseContainer = document.querySelector('#courses')
  const activityContainer = document.querySelector('#activities')
  const courseCount = document.querySelector('#course-count')
  const activityCount = document.querySelector('#activity-count')
  let currentPayload = null

  function showError(message) {
    statusElement.textContent = message
    statusElement.classList.add('error')
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

  function render(payload) {
    currentPayload = payload
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
    courseCount.textContent = String(payload.courses.length)
    activityCount.textContent = String(payload.activities.length)
    statusElement.textContent = `${payload.courses.length} materias y ${payload.activities.length} actividades encontradas en esta página.`
    statusElement.classList.remove('error')
    previewForm.hidden = false
    retryButton.hidden = true
  }

  async function scan() {
    statusElement.textContent = 'Revisando la pestaña activa…'
    statusElement.classList.remove('error')
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
      if (payload.courses.length === 0 && payload.activities.length === 0) {
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
    const payload = {
      ...currentPayload,
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
