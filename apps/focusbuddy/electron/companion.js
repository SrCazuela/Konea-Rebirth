const bridge = window.focusBuddyDesktop
const root = document.querySelector('.companion')
const title = document.querySelector('#session-title')
const course = document.querySelector('#session-course')
const timer = document.querySelector('#session-timer')
const avatar = document.querySelector('#companion-avatar')
const chibi = document.querySelector('#companion-chibi')

const AVATAR_ROOT = 'assets/avatar-cutout'
const CHIBI_FRAME_SETS = Object.freeze({
  idle: ['idle-1.png', 'idle-2.png', 'idle-3.png'],
  active: [
    'typing-1.png',
    'typing-2.png',
    'typing-3.png',
    'typing-concentrated-1.png',
    'typing-concentrated-2.png',
    'typing-concentrated-3.png',
    'typing-blink.png',
  ],
  paused: ['idle-2.png', 'idle-3.png', 'idle-1.png'],
  completed: ['idle-2.png', 'idle-3.png'],
  offline: ['idle-1.png'],
})
const FRAME_INTERVALS = Object.freeze({
  idle: 1_450,
  active: 620,
  paused: 1_900,
  completed: 760,
  offline: 0,
})
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
const KUCO_FRAME_COUNT = 4

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
let currentStatus = 'idle'
let currentCharacter = 'kuco'
let reducedMotionPreference = false
let frameIndex = 0
let frameTimer = null

function supportedStatus(value) {
  return Object.hasOwn(CHIBI_FRAME_SETS, value) ? value : 'idle'
}

function stopFrameTimer() {
  if (frameTimer !== null) window.clearInterval(frameTimer)
  frameTimer = null
}

function showFrame() {
  if (!avatar) return
  const mood = STATUS_MOODS[currentStatus]
  avatar.dataset.character = currentCharacter
  avatar.dataset.mood = mood
  avatar.dataset.frame = String(frameIndex % KUCO_FRAME_COUNT)
  avatar.setAttribute(
    'aria-label',
    `${currentCharacter === 'kuco' ? 'Kuco' : 'FocusBuddy'} ${STATUS_LABELS[currentStatus]}`,
  )

  if (currentCharacter === 'chibi' && chibi) {
    const frames = CHIBI_FRAME_SETS[currentStatus]
    const frame = frames[frameIndex % frames.length]
    chibi.setAttribute('src', `${AVATAR_ROOT}/${frame}`)
  }
}

function restartFrameAnimation() {
  stopFrameTimer()
  frameIndex = 0
  showFrame()
  const frameCount =
    currentCharacter === 'kuco'
      ? KUCO_FRAME_COUNT
      : CHIBI_FRAME_SETS[currentStatus].length
  const interval = FRAME_INTERVALS[currentStatus]
  if (
    frameCount < 2 ||
    interval === 0 ||
    reducedMotionPreference ||
    motionQuery.matches
  ) {
    return
  }
  frameTimer = window.setInterval(() => {
    frameIndex = (frameIndex + 1) % frameCount
    showFrame()
  }, interval)
}

function renderSession(state) {
  if (!state || !root || !title || !course || !timer) return
  const nextStatus = supportedStatus(state.status)
  root.dataset.status = nextStatus
  title.textContent = state.title
  course.textContent = state.course ?? ''
  course.hidden = !state.course
  timer.textContent = state.timerLabel
  if (nextStatus !== currentStatus) {
    currentStatus = nextStatus
    restartFrameAnimation()
  }
}

function renderPreferences(preferences) {
  reducedMotionPreference = Boolean(preferences?.reducedMotion)
  currentCharacter =
    preferences?.companionCharacter === 'chibi' ? 'chibi' : 'kuco'
  document.documentElement.classList.toggle(
    'reduce-motion',
    reducedMotionPreference,
  )
  restartFrameAnimation()
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

motionQuery.addEventListener('change', restartFrameAnimation)
window.addEventListener('beforeunload', stopFrameTimer, { once: true })
restartFrameAnimation()
