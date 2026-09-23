import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '../config/env.js'
import { buildDucoAiReply } from './duco-ai-service.js'

const originalProvider = env.DUCO_AI_PROVIDER
const originalApiKey = env.OPENAI_API_KEY

function stubOpenAiOutput(modelOutput: Record<string, unknown>) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      output: [
        {
          content: [{ type: 'output_text', text: JSON.stringify(modelOutput) }],
        },
      ],
    }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function expectDueInCalendarDays(
  dueAt: string | null,
  requestedAt: Date,
  days: number,
) {
  expect(dueAt).toEqual(expect.any(String))
  const actual = new Date(dueAt!)
  const expected = new Date(requestedAt)
  expected.setDate(expected.getDate() + days)
  expect([actual.getFullYear(), actual.getMonth(), actual.getDate()]).toEqual([
    expected.getFullYear(),
    expected.getMonth(),
    expected.getDate(),
  ])
}

function semanticText(value: string) {
  return value
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-CL')
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

afterEach(() => {
  env.DUCO_AI_PROVIDER = originalProvider
  env.OPENAI_API_KEY = originalApiKey
  vi.unstubAllGlobals()
})

describe('DUCO AI action invariants', () => {
  it('prioritizes verified Chilean crisis resources before any form', async () => {
    env.DUCO_AI_PROVIDER = 'openai'
    env.OPENAI_API_KEY = 'test-key'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await buildDucoAiReply({
      prompt: 'Tengo pensamientos suicidas y temo hacerme daño.',
      localReply: 'Cuéntame qué necesitas.',
      conversation: [],
      pendingTasks: [],
      activeTaskDraft: null,
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.action).toBeNull()
    expect(result.reply).toContain('*4141')
    expect(result.reply).toContain('131')
    expect(result.reply).toContain('133')
    expect(result.reply).toContain('DUCO no ha contactado')
  })

  it('treats a confirmed immediate danger as an emergency', async () => {
    env.DUCO_AI_PROVIDER = 'local'
    const initialPrompt = 'Estoy pensando en quitarme la vida.'
    const initial = await buildDucoAiReply({
      prompt: initialPrompt,
      localReply: 'Cuéntame qué necesitas.',
      conversation: [],
      pendingTasks: [],
      activeTaskDraft: null,
    })

    const result = await buildDucoAiReply({
      prompt: 'Sí, estoy en peligro y tengo un plan.',
      localReply: 'Cuéntame qué necesitas.',
      conversation: [
        { role: 'user', content: initialPrompt },
        { role: 'assistant', content: initial.reply },
      ],
      pendingTasks: [],
      activeTaskDraft: null,
    })

    expect(result.reply).toContain('no esperes una respuesta de Konea')
    expect(result.reply).toContain('*4141')
    expect(result.action).toMatchObject({
      type: 'manage_request',
      draft: { category: 'wellbeing', urgency: 'high' },
    })
  })

  it('keeps a non-immediate safety answer distinct from an emergency', async () => {
    env.DUCO_AI_PROVIDER = 'local'
    const initialPrompt = 'He pensado en hacerme daño.'
    const initial = await buildDucoAiReply({
      prompt: initialPrompt,
      localReply: 'Cuéntame qué necesitas.',
      conversation: [],
      pendingTasks: [],
      activeTaskDraft: null,
    })

    const result = await buildDucoAiReply({
      prompt: 'No estoy en peligro, no tengo un plan y estoy a salvo.',
      localReply: 'Cuéntame qué necesitas.',
      conversation: [
        { role: 'user', content: initialPrompt },
        { role: 'assistant', content: initial.reply },
      ],
      pendingTasks: [],
      activeTaskDraft: null,
    })

    expect(result.reply).toContain('Gracias por aclararlo')
    expect(result.reply).not.toContain('Esto puede ser una emergencia')
    expect(result.action).toMatchObject({
      type: 'manage_request',
      draft: { category: 'wellbeing', urgency: 'high' },
    })
  })

  it('keeps the newest request details when prior context exceeds the draft limit', async () => {
    env.DUCO_AI_PROVIDER = 'local'
    const latestDetails =
      'Para la solicitud de cambio de sección, la asignatura es Capstone, mi sección actual es 001D y el motivo es que se superpone con otra clase.'
    const result = await buildDucoAiReply({
      prompt: latestDetails,
      localReply: 'Puedo ayudarte con la solicitud.',
      conversation: [
        {
          role: 'user',
          content:
            'Necesito solicitar un cambio de sección porque tengo un problema de horario.',
        },
        { role: 'user', content: 'contexto '.repeat(260) },
        {
          role: 'assistant',
          content:
            'Antes de mostrar el botón “Gestionar solicitud” necesito más información.',
        },
      ],
      pendingTasks: [],
      activeTaskDraft: null,
    })

    expect(result.action).toMatchObject({
      type: 'manage_request',
      draft: { category: 'section_change' },
    })
    if (result.action?.type !== 'manage_request')
      throw new Error('DUCO did not return a request draft')
    expect(result.action.draft.description).toContain(latestDetails)
    expect(Array.from(result.action.draft.description)).toHaveLength(2_000)
  })

  it('does not expose an OpenAI claim that a draft was saved when action is null', async () => {
    env.DUCO_AI_PROVIDER = 'openai'
    env.OPENAI_API_KEY = 'test-key'
    const modelOutput = JSON.stringify({
      reply: 'Guardé un borrador para que lo revises.',
      action: 'none',
      category: 'other',
      subject: '',
      description: '',
      desiredOutcome: '',
      urgency: 'medium',
      taskTitle: '',
      taskDescription: '',
      taskCourseName: '',
      taskDueAt: '',
      taskPriority: 'medium',
    })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        output: [
          {
            content: [{ type: 'output_text', text: modelOutput }],
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await buildDucoAiReply({
      prompt: 'Hola',
      localReply: 'Hola, ¿en qué puedo ayudarte?',
      conversation: [],
      pendingTasks: [],
      activeTaskDraft: null,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(result.provider).toBe('openai')
    expect(result.action).toBeNull()
    expect(result.reply).not.toContain('Guardé un borrador')
    expect(result.reply).toContain('Todavía no existe un borrador listo')
  })

  it('polishes a weak Luna task draft with facts and a relative deadline from the user', async () => {
    env.DUCO_AI_PROVIDER = 'openai'
    env.OPENAI_API_KEY = 'test-key'
    const rawDescription = [
      'Tengo un examen en 4 días.',
      'Es de ingles y tengo que estudiar el verbo tobe.',
    ].join('\n')
    stubOpenAiOutput({
      reply: 'Guardé un borrador para que lo revises.',
      action: 'create_task',
      category: 'other',
      subject: '',
      description: '',
      desiredOutcome: '',
      urgency: 'medium',
      taskTitle: 'tobe',
      taskDescription: rawDescription,
      taskCourseName: 'ingles',
      taskDueAt: '',
      taskPriority: 'medium',
    })

    const requestedAt = new Date()
    const result = await buildDucoAiReply({
      prompt: 'Sí, me gustaría guardarlo como tarea.',
      localReply: 'Puedo ayudarte a organizarla.',
      conversation: [
        { role: 'user', content: 'Tengo un examen en 4 días.' },
        {
          role: 'assistant',
          content: 'Cuéntame la asignatura y qué necesitas estudiar.',
        },
        {
          role: 'user',
          content: 'Es de ingles y tengo que estudiar el verbo tobe.',
        },
      ],
      pendingTasks: [],
      activeTaskDraft: null,
    })

    expect(result.provider).toBe('openai')
    expect(result.action).toMatchObject({
      type: 'create_task',
      draft: {
        title: 'Estudiar el verbo to be',
        courseName: 'Inglés',
        priority: 'medium',
      },
    })
    if (result.action?.type !== 'create_task')
      throw new Error('DUCO did not return a task draft')
    expect(result.action.draft.description).toMatch(
      /^Estudiar el verbo to be para el examen de Inglés\.$/u,
    )
    expect(result.action.draft.description).not.toContain('\n')
    expect(result.action.draft.description).not.toContain(rawDescription)
    expectDueInCalendarDays(result.action.draft.dueAt, requestedAt, 4)
  })

  it('preserves a natural factual description returned by Luna', async () => {
    env.DUCO_AI_PROVIDER = 'openai'
    env.OPENAI_API_KEY = 'test-key'
    const modelDescription = 'Estudiar para el examen de Matemáticas.'
    stubOpenAiOutput({
      reply: 'Preparé un borrador para revisión.',
      action: 'create_task',
      category: 'other',
      subject: '',
      description: '',
      desiredOutcome: '',
      urgency: 'medium',
      taskTitle: 'Estudiar para el examen de Matemáticas',
      taskDescription: `  ${modelDescription}  `,
      taskCourseName: 'Matemáticas',
      taskDueAt: '',
      taskPriority: 'medium',
    })

    const result = await buildDucoAiReply({
      prompt: 'Tengo que estudiar para un examen de Matemáticas.',
      localReply: 'Puedo ayudarte a organizarla.',
      conversation: [],
      pendingTasks: [],
      activeTaskDraft: null,
    })

    expect(result.action?.type).toBe('create_task')
    if (result.action?.type !== 'create_task')
      throw new Error('DUCO did not return a task draft')
    expect(semanticText(result.action.draft.description)).toBe(
      semanticText(modelDescription),
    )
  })
})
