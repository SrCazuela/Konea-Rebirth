;(function (root, factory) {
  const library = factory()
  if (typeof module === 'object' && module.exports) module.exports = library
  if (typeof window === 'object' || typeof module === 'undefined')
    root.FocusBuddyAvatars = library
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict'

  const asset = (name) => `./assets/avatar-hq/${name}.png`
  const poses = (names, durationMs = 400) =>
    names.map((name) => ({ frame: asset(name), durationMs }))
  const blink = (names, durations = [110]) => ({
    frames: names.map((name, index) => ({
      frame: asset(name),
      durationMs: durations[index] ?? 60,
    })),
    minDelayMs: 3_200,
    maxDelayMs: 6_400,
    doubleBlinkChance: 0.12,
    betweenBlinksMs: 160,
  })
  const tiredTyping = [
    'typing-tired-1',
    'typing-tired-2',
    'typing-tired-3',
    'typing-tired-2',
  ]
  const chibi = Object.freeze({
    idle: {
      frames: poses(['idle-1']),
      blink: blink(['idle-2', 'idle-3', 'idle-2'], [45, 85, 45]),
    },
    typing: {
      frames: poses(['typing-1', 'typing-2', 'typing-3', 'typing-2'], 280),
      blink: blink(['typing-blink']),
    },
    typingConcentrated: {
      frames: poses(
        [
          'typing-concentrated-1',
          'typing-concentrated-2',
          'typing-concentrated-3',
          'typing-concentrated-2',
        ],
        340,
      ),
    },
    writing: { frames: poses(['writing-1', 'writing-2'], 480) },
    writingConcentrated: {
      frames: poses(['writing-concentrated-1', 'writing-concentrated-2'], 520),
    },
    studying: { frames: poses(['studying-1', 'studying-2'], 2_600) },
    typingTired: {
      frames: [
        ...poses(Array(4).fill(tiredTyping).flat(), 900),
        ...poses(['typing-tired-yawn'], 950),
      ],
      blink: blink(['typing-tired-blink'], [140]),
    },
    studyingTired: {
      frames: [
        ...poses(Array(4).fill('studying-tired-1'), 3_000),
        ...poses(['studying-tired-yawn'], 950),
      ],
      blink: blink(['studying-tired-blink'], [140]),
    },
    break: {
      frames: poses(
        ['break-1', 'break-2', 'break-3', 'break-4', 'break-3', 'break-2'],
        900,
      ),
    },
    celebrate: {
      frames: poses(
        ['celebrate-1', 'celebrate-2', 'celebrate-3', 'celebrate-2'],
        420,
      ),
    },
    clapping: { frames: poses(['clapping-1', 'clapping-2'], 260) },
    typingSleeping: { frames: poses(['typing-sleeping']) },
    studyingSleeping: { frames: poses(['studying-sleeping']) },
  })

  const labels = Object.freeze({
    idle: 'En espera y parpadeando',
    typing: 'Escribiendo en el teclado',
    typingConcentrated: 'Concentración en el teclado',
    writing: 'Escribiendo en el cuaderno',
    writingConcentrated: 'Concentración en el cuaderno',
    studying: 'Leyendo y estudiando',
    typingTired: 'Teclado: cansancio y bostezo',
    studyingTired: 'Lectura: cansancio y bostezo',
    break: 'Descansando',
    celebrate: 'Celebrando',
    clapping: 'Aplaudiendo',
    typingSleeping: 'Descanso largo en el teclado',
    studyingSleeping: 'Descanso largo con el libro',
  })

  const kuco = Object.freeze({
    idle: {
      frames: [{ frame: 0, durationMs: 1_000 }],
      blink: {
        frames: [{ frame: 1, durationMs: 115 }],
        minDelayMs: 3_200,
        maxDelayMs: 6_400,
        doubleBlinkChance: 0.16,
        betweenBlinksMs: 160,
      },
    },
    focus: {
      frames: [{ frame: 0, durationMs: 1_000 }],
      blink: {
        frames: [{ frame: 1, durationMs: 115 }],
        minDelayMs: 3_200,
        maxDelayMs: 6_400,
        doubleBlinkChance: 0.12,
        betweenBlinksMs: 160,
      },
    },
    paused: { frames: [{ frame: 2, durationMs: 1_000 }] },
    completed: {
      frames: [0, 1, 2, 3].map((frame) => ({ frame, durationMs: 600 })),
    },
    offline: { frames: [{ frame: 0, durationMs: 1_000 }] },
  })

  function sceneForSession({
    mood = 'idle',
    method = '',
    focusedSeconds = 0,
  } = {}) {
    if (mood === 'focus' || mood === 'active') {
      const elapsed = Number.isFinite(focusedSeconds)
        ? Math.max(0, focusedSeconds)
        : 0
      const phase = Math.floor(elapsed / 60) % 3
      if (elapsed >= 45 * 60)
        return phase === 1 ? 'studyingTired' : 'typingTired'
      if (method === 'deep_work' || method === 'pomodoro_extended') {
        return phase === 1 ? 'writingConcentrated' : 'typingConcentrated'
      }
      return ['typing', 'studying', 'writing'][phase]
    }
    if (mood === 'paused') return 'break'
    if (mood === 'completed') return 'celebrate'
    return 'idle'
  }

  function sourcesForScene(scene) {
    const animation = chibi[scene] ?? chibi.idle
    return [
      ...new Set([
        ...animation.frames.map(({ frame }) => frame),
        ...(animation.blink?.frames.map(({ frame }) => frame) ?? []),
      ]),
    ]
  }

  // Decode just the active scene. Keeping all 35 original images decoded at
  // startup would require almost 900 MB before the rest of Electron.
  function createScenePreloader(ImageConstructor) {
    let current = ''
    let images = []
    return (scene) => {
      if (scene === null) {
        current = null
        images = []
        return 0
      }
      if (current === scene) return
      current = scene
      images = sourcesForScene(scene).map((source) => {
        const image = new ImageConstructor()
        image.decoding = 'async'
        image.src = source
        return image
      })
      return images.length
    }
  }

  const animations = Object.freeze(
    Object.fromEntries([
      ...Object.entries(chibi).map(([scene, animation]) => [
        `chibi:${scene}`,
        animation,
      ]),
      ...Object.entries(kuco).map(([scene, animation]) => [
        `kuco:${scene}`,
        animation,
      ]),
    ]),
  )
  return Object.freeze({
    chibi,
    kuco,
    animations,
    labels,
    sceneForSession,
    sourcesForScene,
    createScenePreloader,
  })
})
