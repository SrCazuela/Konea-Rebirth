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
