const bridge = window.focusBuddyDesktop
const root = document.querySelector('.companion')
const title = document.querySelector('#session-title')
const course = document.querySelector('#session-course')
const timer = document.querySelector('#session-timer')

function renderSession(state) {
  if (!state || !root || !title || !course || !timer) return
  root.dataset.status = state.status
  title.textContent = state.title
  course.textContent = state.course ?? ''
  course.hidden = !state.course
  timer.textContent = state.timerLabel
}

function renderPreferences(preferences) {
  document.documentElement.classList.toggle(
    'reduce-motion',
    Boolean(preferences?.reducedMotion),
  )
}

document.querySelector('#open-button')?.addEventListener('click', () => {
  void bridge?.openMain()
})
document.querySelector('#compact-button')?.addEventListener('click', () => {
  void bridge?.toggleCompact()
})
document.querySelector('#hide-button')?.addEventListener('click', () => {
  void bridge?.hideCompanion()
})

void bridge?.getSessionState().then(renderSession)
void bridge?.getPreferences().then(renderPreferences)
bridge?.onSessionState(renderSession)
bridge?.onPreferences(renderPreferences)
