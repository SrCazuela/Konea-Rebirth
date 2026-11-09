const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const avatars = require('./avatar-library.js')

const assetDirectory = path.join(__dirname, 'assets', 'avatar-hq')
const manifest = JSON.parse(
  readFileSync(path.join(assetDirectory, 'source-manifest.json'), 'utf8'),
)

function animationSources(animation) {
  return [
    ...animation.frames.map(({ frame }) => frame),
    ...(animation.blink?.frames.map(({ frame }) => frame) ?? []),
  ]
}

test('every supplied normal sprite is reachable through a real named animation', () => {
  assert.equal(manifest.fileCount, 35)
  assert.equal(manifest.files.length, manifest.fileCount)
  const supplied = new Set(manifest.files.map(({ local }) => local))
  const referenced = new Set()
  for (const [scene, animation] of Object.entries(avatars.chibi)) {
    assert.equal(avatars.animations[`chibi:${scene}`], animation)
    assert.ok(
      avatars.labels[scene]?.length,
      `Missing visible scene name: ${scene}`,
    )
    assert.ok(animation.frames.length > 0, `Empty scene: ${scene}`)
    for (const source of animationSources(animation)) {
      assert.equal(typeof source, 'string')
      assert.equal(path.posix.dirname(source), './assets/avatar-hq')
      referenced.add(path.posix.basename(source))
    }
  }
  assert.deepEqual([...referenced].sort(), [...supplied].sort())
})

test('runtime sprite bytes and canvas dimensions match the artist source manifest', () => {
  for (const file of manifest.files) {
    const png = readFileSync(path.join(assetDirectory, file.local))
    assert.deepEqual(
      png.subarray(0, 8),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
    assert.equal(png.readUInt32BE(16), file.width, `${file.local} width`)
    assert.equal(png.readUInt32BE(20), file.height, `${file.local} height`)
    assert.equal(png.length, file.bytes, `${file.local} size`)
    assert.equal(
      createHash('sha256').update(png).digest('hex'),
      file.sha256,
      `${file.local} differs from the supplied PNG`,
    )
  }
})

test('idle keeps an open resting pose and closes/reopens the supplied eyelids briefly', () => {
  const idle = avatars.chibi.idle
  const artwork = manifest.animationGroups.idle
  const open = artwork.frames[artwork.eyeStates.indexOf('open')]
  const half = artwork.frames[artwork.eyeStates.indexOf('half')]
  const closed = artwork.frames[artwork.eyeStates.indexOf('closed')]
  assert.deepEqual(
    idle.frames.map(({ frame }) => path.posix.basename(frame)),
    [open],
  )
  assert.deepEqual(
    idle.blink.frames.map(({ frame }) => path.posix.basename(frame)),
    [half, closed, half],
  )
  const durations = idle.blink.frames.map(({ durationMs }) => durationMs)
  assert.ok(durations.every((value) => value >= 30 && value <= 160))
  assert.ok(durations[1] >= durations[0])
  assert.ok(durations.reduce((total, value) => total + value, 0) <= 300)
  assert.ok(idle.blink.minDelayMs >= 2_500)
  assert.ok(idle.blink.maxDelayMs <= 8_000)
  assert.ok(idle.blink.maxDelayMs >= idle.blink.minDelayMs)
})

test('normal movement never uses the dedicated closed-eye blink images as poses', () => {
  const closed = new Set([
    'idle-3.png',
    'typing-blink.png',
    'typing-tired-blink.png',
    'studying-tired-blink.png',
  ])
  for (const [scene, animation] of Object.entries(avatars.chibi)) {
    for (const { frame, durationMs } of animation.frames) {
      assert.ok(
        !closed.has(path.posix.basename(frame)),
        `${scene} holds a blink as a movement frame`,
      )
      assert.ok(Number.isFinite(durationMs) && durationMs > 0)
    }
    for (const { durationMs } of animation.blink?.frames ?? []) {
      assert.ok(
        durationMs > 0 && durationMs < 200,
        `${scene} blink is held too long`,
      )
    }
  }
})

test('active study alternates matching keyboard, reading and notebook poses at minute boundaries', () => {
  const cases = [
    [0, 'typing'],
    [59, 'typing'],
    [60, 'studying'],
    [119, 'studying'],
    [120, 'writing'],
    [179, 'writing'],
    [180, 'typing'],
  ]
  for (const mood of ['active', 'focus']) {
    for (const [focusedSeconds, expected] of cases) {
      assert.equal(
        avatars.sceneForSession({ mood, method: 'pomodoro', focusedSeconds }),
        expected,
      )
    }
  }
  assert.equal(
    avatars.sceneForSession({ mood: 'focus', focusedSeconds: -50 }),
    'typing',
  )
  for (const focusedSeconds of [NaN, Infinity, -Infinity, null, '60']) {
    assert.equal(
      avatars.sceneForSession({ mood: 'focus', focusedSeconds }),
      'typing',
    )
  }
})

test('deep study and elapsed fatigue choose the appropriate available art', () => {
  for (const method of ['deep_work', 'pomodoro_extended']) {
    assert.equal(
      avatars.sceneForSession({ mood: 'focus', method, focusedSeconds: 0 }),
      'typingConcentrated',
    )
    assert.equal(
      avatars.sceneForSession({ mood: 'focus', method, focusedSeconds: 60 }),
      'writingConcentrated',
    )
    assert.equal(
      avatars.sceneForSession({ mood: 'focus', method, focusedSeconds: 120 }),
      'typingConcentrated',
    )
  }
  assert.equal(
    avatars.sceneForSession({ mood: 'focus', focusedSeconds: 45 * 60 - 1 }),
    'writing',
  )
  for (const method of ['pomodoro', 'deep_work', 'flowtime']) {
    assert.equal(
      avatars.sceneForSession({
        mood: 'focus',
        method,
        focusedSeconds: 45 * 60,
      }),
      'typingTired',
    )
    assert.equal(
      avatars.sceneForSession({
        mood: 'focus',
        method,
        focusedSeconds: 46 * 60,
      }),
      'studyingTired',
    )
  }
})

test('rest, completion and disconnected states do not display an active study task', () => {
  assert.equal(
    avatars.sceneForSession({
      mood: 'paused',
      method: 'deep_work',
      focusedSeconds: 6_000,
    }),
    'break',
  )
  assert.equal(
    avatars.sceneForSession({ mood: 'completed', focusedSeconds: 6_000 }),
    'celebrate',
  )
  for (const mood of ['idle', 'offline', 'unknown']) {
    assert.equal(
      avatars.sceneForSession({ mood, focusedSeconds: 6_000 }),
      'idle',
    )
  }
  assert.equal(avatars.sceneForSession(), 'idle')
  assert.deepEqual(
    avatars.sourcesForScene('missing'),
    avatars.sourcesForScene('idle'),
  )
})

test('Kuco retains a forward resting frame and a brief independent blink', () => {
  assert.deepEqual(
    avatars.kuco.idle.frames.map(({ frame }) => frame),
    [0],
  )
  assert.deepEqual(
    avatars.kuco.idle.blink.frames.map(({ frame }) => frame),
    [1],
  )
  assert.ok(avatars.kuco.idle.blink.frames[0].durationMs < 200)
  for (const [scene, animation] of Object.entries(avatars.kuco)) {
    assert.equal(avatars.animations[`kuco:${scene}`], animation)
    assert.ok(
      animationSources(animation).every(
        (frame) => Number.isInteger(frame) && frame >= 0 && frame < 4,
      ),
    )
  }
})

test('preloader loads only the chosen scene, deduplicates frames, and ignores identical updates', () => {
  const loaded = []
  class FakeImage {
    set src(value) {
      loaded.push({ source: value, decoding: this.decoding })
    }
  }
  const preload = avatars.createScenePreloader(FakeImage)
  assert.equal(preload('idle'), 3)
  assert.deepEqual(
    loaded.map(({ source }) => source).sort(),
    avatars.sourcesForScene('idle').sort(),
  )
  assert.ok(loaded.every(({ decoding }) => decoding === 'async'))
  assert.ok(loaded.length < manifest.fileCount)
  for (let index = 0; index < 20; index += 1) preload('idle')
  assert.equal(loaded.length, 3)
  const typing = avatars.sourcesForScene('typing')
  assert.equal(preload('typing'), typing.length)
  assert.deepEqual(
    loaded
      .slice(3)
      .map(({ source }) => source)
      .sort(),
    typing.sort(),
  )
  const loadedCount = loaded.length
  preload('typing')
  assert.equal(loaded.length, loadedCount)
})

test('preloader clears an inactive scene without loading idle and reloads it when shown again', () => {
  const loaded = []
  class FakeImage {
    set src(value) {
      loaded.push(value)
    }
  }
  const preload = avatars.createScenePreloader(FakeImage)
  assert.equal(preload(null), 0)
  assert.equal(loaded.length, 0)
  const sources = avatars.sourcesForScene('typing')
  assert.equal(preload('typing'), sources.length)
  assert.equal(preload(null), 0)
  assert.equal(preload(null), 0)
  assert.equal(loaded.length, sources.length)
  assert.equal(preload('typing'), sources.length)
  assert.deepEqual(loaded, [...sources, ...sources])
  preload('typing')
  assert.equal(loaded.length, sources.length * 2)
})

test('preloader retains only the active scene and releases all references when cleared', () => {
  // Run in a separate process with explicit GC, so this memory-lifecycle check
  // remains deterministic without enabling GC for the rest of the test runner.
  const modulePath = path.join(__dirname, 'avatar-library.js')
  const script = `
    const assert = require('node:assert/strict');
    const { createScenePreloader } = require(${JSON.stringify(modulePath)});
    const weak = [];
    class FakeImage { constructor() { weak.push(new WeakRef(this)); } }
    const preload = createScenePreloader(FakeImage);
    preload('idle');
    const oldScene = weak.slice();
    preload('typing');
    const activeScene = weak.slice(oldScene.length);
    (async () => {
      for (let index = 0; index < 8; index += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        global.gc();
      }
      assert(oldScene.every((reference) => reference.deref() === undefined), 'previous scene images are retained');
      assert(activeScene.every((reference) => reference.deref() !== undefined), 'active scene images were released');
      assert.equal(preload(null), 0);
      for (let index = 0; index < 8; index += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        global.gc();
      }
      assert(activeScene.every((reference) => reference.deref() === undefined), 'hidden scene images are retained');
      assert.equal(weak.length, oldScene.length + activeScene.length, 'clearing loaded another scene');
      assert.equal(preload('typing'), activeScene.length);
    })().catch((error) => { console.error(error.message); process.exitCode = 1; });
  `
  execFileSync(process.execPath, ['--no-maglev', '--expose-gc', '-e', script], {
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
  })
})
