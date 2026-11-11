const bridge = window.focusBuddyDesktop
const root = document.querySelector('.companion')
const title = document.querySelector('#session-title')
const course = document.querySelector('#session-course')
const timer = document.querySelector('#session-timer')
const avatar = document.querySelector('#companion-avatar')
const chibi = document.querySelector('#companion-chibi')
const library = window.FocusBuddyAvatars
const preloadScene = library.createScenePreloader(Image)
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const STATUS_MOODS = Object.freeze({
  idle: 'idle',
  active: 'focus',
  paused: 'paused',
  completed: 'completed',
  offline: 'offline',
})
const STATUS_LABELS = Object.freeze({
  idle: 'listo para estudiar',
  active: 'estudiando durante la sesión activa',
  paused: 'descansando durante la pausa',
  completed: 'celebrando la sesión completada',
  offline: 'esperando a que vuelva la conexión',
})
let currentStatus = 'idle'
let currentScene = 'idle'
let currentCharacter = 'chibi'
let motionPreferences = {}

const animator = window.FocusBuddyAnimation.createAnimator({
  animations: library.animations,
  initialState: 'chibi:idle',
  onFrame(snapshot) {
    if (!avatar) return
    const [character, scene] = snapshot.state.split(':')
    avatar.dataset.character = character
    avatar.dataset.mood =
      character === 'kuco' ? scene : STATUS_MOODS[currentStatus]
    avatar.dataset.frame = character === 'kuco' ? String(snapshot.frame) : '0'
    avatar.dataset.blinking = String(snapshot.blinking)
    avatar.setAttribute(
      'aria-label',
      (character === 'kuco' ? 'Kuco' : 'FocusBuddy') +
        ' ' +
        STATUS_LABELS[currentStatus],
    )
    if (
      character === 'chibi' &&
      chibi &&
      chibi.getAttribute('src') !== snapshot.frame
    )
      chibi.setAttribute('src', snapshot.frame)
  },
})
function syncAnimation() {
  const visible = document.visibilityState !== 'hidden'
  const reduced = window.FocusBuddyMotion.resolveMotionPolicy(
    motionPreferences,
    motionQuery.matches,
  )
  document.documentElement.dataset.motionPreference =
    window.FocusBuddyMotion.resolveMotionPreference(motionPreferences)
  document.documentElement.classList.toggle('reduce-motion', reduced)
  preloadScene(visible && currentCharacter === 'chibi' ? currentScene : null)
  animator.update({
    state:
      currentCharacter === 'kuco'
        ? 'kuco:' + STATUS_MOODS[currentStatus]
        : 'chibi:' + currentScene,
    visible,
    reducedMotion: reduced,
  })
}
function renderSession(state) {
  if (!state || !root || !title || !course || !timer) return
  currentStatus = Object.hasOwn(STATUS_MOODS, state.status)
    ? state.status
    : 'idle'
  currentScene = Object.hasOwn(library.chibi, state.avatarScene)
    ? state.avatarScene
    : library.sceneForSession({ mood: STATUS_MOODS[currentStatus] })
  root.dataset.status = currentStatus
  title.textContent = state.title
  course.textContent = state.course ?? ''
  course.hidden = !state.course
  timer.textContent = state.timerLabel
  syncAnimation()
}
function renderPreferences(preferences) {
  motionPreferences = preferences ?? {}
  currentCharacter =
    preferences?.companionCharacter === 'kuco' ? 'kuco' : 'chibi'
  syncAnimation()
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
motionQuery.addEventListener('change', syncAnimation)
document.addEventListener('visibilitychange', syncAnimation)
window.addEventListener('beforeunload', () => animator.dispose(), {
  once: true,
})
syncAnimation()
