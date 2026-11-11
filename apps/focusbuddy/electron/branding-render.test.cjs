const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { isReadyBrandingFrame } = require('../scripts/sync-branding.cjs')

describe('FocusBuddy branding frame readiness', () => {
  const opaqueInitialSurface = Buffer.from([
    255, 255, 255, 255, 255, 255, 255, 255,
  ])
  const emptyTransparentSurface = Buffer.alloc(8)
  const decodedMonogram = Buffer.from([0, 0, 0, 0, 120, 55, 195, 255])

  it('waits through the initial opaque paint and empty frame for the decoded transparent icon', () => {
    const sequence = [
      { bitmap: opaqueInitialSurface, decoded: false },
      { bitmap: decodedMonogram, decoded: false },
      { bitmap: opaqueInitialSurface, decoded: true },
      { bitmap: emptyTransparentSurface, decoded: true },
      { bitmap: decodedMonogram, decoded: true },
    ]
    const accepted = sequence.filter(({ bitmap, decoded }) =>
      isReadyBrandingFrame(bitmap, decoded),
    )
    assert.deepEqual(accepted, [sequence[4]])
  })

  it('requires a transparent corner even if an opaque frame contains pixels', () => {
    assert.equal(isReadyBrandingFrame(opaqueInitialSurface, true), false)
    const oneAlphaCorner = Buffer.from(decodedMonogram)
    oneAlphaCorner[3] = 1
    assert.equal(isReadyBrandingFrame(oneAlphaCorner, true), false)
  })

  it('rejects an entirely transparent capture after decoding', () => {
    assert.equal(isReadyBrandingFrame(emptyTransparentSurface, true), false)
  })

  it('requires explicit decoding and a complete BGRA bitmap', () => {
    assert.equal(isReadyBrandingFrame(decodedMonogram, undefined), false)
    assert.equal(isReadyBrandingFrame(Buffer.alloc(0), true), false)
    assert.equal(isReadyBrandingFrame(Buffer.from([0, 0, 0]), true), false)
    assert.equal(
      isReadyBrandingFrame(Buffer.from([0, 0, 0, 0, 255]), true),
      false,
    )
  })
})
