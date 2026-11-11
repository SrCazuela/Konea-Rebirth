const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { describe, it } = require('node:test')

const source = readFileSync(path.join(__dirname, 'desktop.js'), 'utf8')
function rendererFunction(name) {
  const match = source.match(
    new RegExp(
      `(?:async )?function ${name}\\([^]*?(?=\\n(?:async )?function \\w|\\nwindow\\.setInterval)`,
    ),
  )
  assert.ok(match, `Renderer function missing: ${name}`)
  return match[0]
}

function rendererWithEnvelope(envelope) {
  const context = vm.createContext({
    api: { test: async () => structuredClone(envelope) },
  })
  vm.runInContext(
    [
      'callApi',
      'errorStatus',
      'errorCode',
      'isUnauthorized',
      'isConnectionError',
    ]
      .map(rendererFunction)
      .join('\n'),
    context,
  )
  return context
}

describe('FocusBuddy renderer API envelopes', () => {
  it('unwraps serializable successful data and preserves an empty logout result', async () => {
    const context = rendererWithEnvelope({
      ok: true,
      data: { user: { id: 'account-test' } },
    })
    assert.deepEqual(await context.callApi('test'), {
      user: { id: 'account-test' },
    })
    const logout = rendererWithEnvelope({ ok: true, data: null })
    assert.equal(await logout.callApi('test'), null)
  })

  it('reconstructs a local renderer Error with a recognized 401 after contextBridge serialization', async () => {
    const oldError = Object.assign(new Error('Sesión vencida.'), {
      status: 401,
      code: 'INVALID_SESSION',
    })
    assert.equal(structuredClone(oldError).status, undefined)
    const context = rendererWithEnvelope({
      ok: false,
      error: {
        message: 'Sesión vencida.',
        status: 401,
        code: 'INVALID_SESSION',
      },
    })
    await assert.rejects(context.callApi('test'), (error) => {
      assert.equal(error.message, 'Sesión vencida.')
      assert.equal(error.status, 401)
      assert.equal(error.code, 'INVALID_SESSION')
      assert.equal(context.isUnauthorized(error), true)
      assert.equal(context.isConnectionError(error), false)
      return true
    })
  })

  it('preserves 409 conflicts and validation fields instead of confusing them with outages', async () => {
    const context = rendererWithEnvelope({
      ok: false,
      error: {
        message: 'El bloque cambió.',
        status: 409,
        code: 'STUDY_SESSION_ALREADY_CURRENT',
        fields: { title: ['Revisa el título.'] },
      },
    })
    await assert.rejects(context.callApi('test'), (error) => {
      assert.equal(context.errorStatus(error), 409)
      assert.equal(context.isConnectionError(error), false)
      assert.deepEqual(error.fields, { title: ['Revisa el título.'] })
      return true
    })
  })
})
