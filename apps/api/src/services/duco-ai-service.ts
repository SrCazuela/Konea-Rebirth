import { z } from 'zod'
import { env } from '../config/env.js'
import type {
  AssistantMessageAction,
  DucoRequestDraft,
  DucoTaskDraft,
} from '../db/schema.js'

const requestCategories = [
  'section_change',
  'missing_course',
  'enrollment',
  'schedule_conflict',
  'harassment',
  'technical',
  'financial',
  'wellbeing',
  'other',
] as const
const urgencyLevels = ['low', 'medium', 'high'] as const
const taskPriorities = ['low', 'medium', 'high'] as const

const ducoAiOutputSchema = z.strictObject({
  reply: z.string().trim().min(1).max(1_200),
  action: z.enum(['none', 'manage_request', 'create_task']),
  category: z.enum(requestCategories),
  subject: z.string().trim().max(160),
  description: z.string().trim().max(2_000),
  desiredOutcome: z.string().trim().max(1_000),
  urgency: z.enum(urgencyLevels),
  taskTitle: z.string().trim().max(160),
  taskDescription: z.string().trim().max(1_000),
  taskCourseName: z.string().trim().max(300),
  taskDueAt: z.string().trim().max(80),
  taskPriority: z.enum(taskPriorities),
})

const ducoOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    action: {
      type: 'string',
      enum: ['none', 'manage_request', 'create_task'],
    },
    category: { type: 'string', enum: requestCategories },
    subject: { type: 'string' },
    description: { type: 'string' },
    desiredOutcome: { type: 'string' },
    urgency: { type: 'string', enum: urgencyLevels },
    taskTitle: { type: 'string' },
    taskDescription: { type: 'string' },
    taskCourseName: { type: 'string' },
    taskDueAt: { type: 'string' },
    taskPriority: { type: 'string', enum: taskPriorities },
  },
  required: [
    'reply',
    'action',
    'category',
    'subject',
    'description',
    'desiredOutcome',
    'urgency',
    'taskTitle',
    'taskDescription',
    'taskCourseName',
    'taskDueAt',
    'taskPriority',
  ],
} as const

const systemInstructions = `Eres DUCO, el asistente de organización académica de una plataforma universitaria chilena.
Responde en español claro, empático y breve. Puedes explicar conceptos, proponer un plan de estudio y orientar al estudiante, pero no debes hacer una evaluación o entrega completa por él.
Las acciones visibles son sugerencias: nunca afirmes que una tarea fue creada, una solicitud fue enviada o una persona fue contactada. El estudiante siempre revisa y confirma.
Usa create_task cuando el estudiante mencione una tarea, guía, informe, proyecto, evaluación u otra entrega que quiera organizar. Prepara solo datos expresamente aportados; lo desconocido queda vacío.
Usa manage_request únicamente si una gestión institucional ya contiene información suficiente. Si faltan datos, action=none y pregunta uno o dos datos concretos antes de ofrecer el formulario.
Ante acoso, autolesión, amenazas o daño a terceros, prioriza la seguridad, no diagnostiques ni acuses y no inventes hechos. Aclara que DUCO no contactó automáticamente a nadie.
En cualquier acción, los hechos del borrador deben provenir exclusivamente de mensajes del estudiante, nunca de una respuesta anterior de DUCO.`

export type DucoConversationMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type DucoTaskContext = {
  title: string
  description: string | null
  dueDate: string | null
  priority: 'low' | 'medium' | 'high'
  status: 'pending' | 'in_progress' | 'completed'
}

export type DucoAiResult = {
  reply: string
  action: AssistantMessageAction | null
  provider: 'local' | 'ollama' | 'openai'
}

type BuildDucoReplyInput = {
  prompt: string
  localReply: string
  conversation: DucoConversationMessage[]
  pendingTasks: DucoTaskContext[]
}

type RequestReadiness = {
  category: DucoRequestDraft['category']
  missing: string[]
}

const safetyQuestionMarker =
  'Antes de preparar una solicitud de apoyo necesito confirmar'
const requestQuestionMarker =
  'Antes de mostrar el botón “Gestionar solicitud” necesito'

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function userMessages(input: BuildDucoReplyInput) {
  return [
    ...input.conversation
      .filter((message) => message.role === 'user')
      .map((message) => message.content),
    input.prompt,
  ].slice(-6)
}

function lastAssistantMessage(input: BuildDucoReplyInput) {
  return [...input.conversation]
    .reverse()
    .find((message) => message.role === 'assistant')?.content
}

function hasSafetyRisk(value: string) {
  const normalized = normalizeText(value)
  return {
    selfHarm:
      /\b(suicid\w*|matarme|quitarme la vida|hacerme dano|autoles\w*|no quiero vivir|terminar con mi vida)\b/.test(
        normalized,
      ),
    harmToOthers:
      /\b(atentar|matar a|hacerle dano|hacer dano a|atacar|llevar un arma|usar un arma|amenaza contra)\b/.test(
        normalized,
      ),
  }
}

function hasImmediateSafetyAnswer(value: string) {
  const normalized = normalizeText(value)
  return /\b(estoy a salvo|no estoy en peligro|si estoy en peligro|estoy en peligro|no tengo (?:un )?plan|tengo (?:un )?plan|no voy a actuar|voy a actuar|no pienso hacerlo|pienso hacerlo|no es inmediato|es inmediato|hay peligro inmediato|no hay peligro inmediato|no hare dano|si podria hacer dano)\b/.test(
    normalized,
  )
}

function safetyDecision(input: BuildDucoReplyInput): DucoAiResult | null {
  const currentRisk = hasSafetyRisk(input.prompt)
  const continuingSafety = normalizeText(
    lastAssistantMessage(input) ?? '',
  ).includes(normalizeText(safetyQuestionMarker))
  if (!currentRisk.selfHarm && !currentRisk.harmToOthers && !continuingSafety) {
    return null
  }

  const messages = userMessages(input)
  const facts = messages.join('\n').trim().slice(0, 2_000)
  const answered = hasImmediateSafetyAnswer(input.prompt)
  if (!answered) {
    return {
      reply: `${safetyQuestionMarker}: ¿estás en peligro inmediato o tienes un plan o intención de hacerte daño o dañar a alguien ahora? Cuéntame también, de forma general, dónde y cuándo ocurre el problema; no necesitas dar nombres ni aportar pruebas. DUCO no ha contactado automáticamente a nadie. Si hay peligro inmediato, aléjate de cualquier medio de daño y busca ahora mismo a una persona de confianza o a los servicios de emergencia de tu zona.`,
      action: null,
      provider: 'local',
    }
  }

  return {
    reply:
      'Gracias por confirmarlo. Con la información que compartiste puedo preparar una solicitud urgente de bienestar y seguridad para revisión humana. El formulario aún no se ha enviado: revísalo y confírmalo tú. Si el peligro es inmediato, no esperes la respuesta de la plataforma y busca apoyo presencial o de emergencias ahora.',
    action: {
      type: 'manage_request',
      label: 'Gestionar solicitud',
      draft: {
        category: 'wellbeing',
        subject: 'Solicitud urgente de apoyo y seguridad',
        description: facts,
        desiredOutcome:
          'Solicito contacto y revisión humana prioritaria para recibir apoyo y acordar medidas de seguridad.',
        urgency: 'high',
      },
    },
    provider: 'local',
  }
}

function inferCategory(value: string): DucoRequestDraft['category'] {
  const normalized = normalizeText(value)
  const risk = hasSafetyRisk(value)
  if (risk.selfHarm || risk.harmToOthers) return 'wellbeing'
  if (/cambio.*seccion|cambiar.*seccion|otra seccion/.test(normalized))
    return 'section_change'
  if (/falta.*(ramo|asignatura)|asignatura.*falt|ramo.*falt/.test(normalized))
    return 'missing_course'
  if (/inscrib|inscripcion|tomar.*(ramo|asignatura)/.test(normalized))
    return 'enrollment'
  if (/horario|tope|choque.*(ramo|asignatura)/.test(normalized))
    return 'schedule_conflict'
  if (
    /acoso|amenaz|hostig|insult|foto privada|bullying|companeros.*problem/.test(
      normalized,
    )
  )
    return 'harassment'
  if (
    /clave|acceso|ava|blackboard|portal|plataforma|error|tecnico|tecnica/.test(
      normalized,
    )
  )
    return 'technical'
  if (/pago|arancel|beca|financ|cuota|cobro/.test(normalized))
    return 'financial'
  if (/ansiedad|bienestar|apoyo|salud mental|psicolog/.test(normalized))
    return 'wellbeing'
  return 'other'
}

function needsInstitutionalRequest(value: string) {
  const normalized = normalizeText(value)
  return /\b(solicitud|solicitar|gestionar|tramite|cambio de seccion|cambiar.*seccion|inscrib|inscripcion|asignatura.*falt|ramo.*falt|problema.*horario|tope.*horario|acoso|amenaz|hostig|bienestar|apoyo psicolog|salud mental|problema tecnico|no puedo.*(ava|blackboard|portal|plataforma)|problema financiero|cobro|arancel|beca|hablar con.*(administrador|coordinador)|contactar.*(administrador|coordinador))\b/.test(
    normalized,
  )
}

function hasCourseDetails(value: string) {
  const normalized = normalizeText(value)
  return /\b(asignatura|ramo|materia|curso)\s+(?:es|se llama|llamad[oa]|de)\s+[a-z0-9]/.test(
    normalized,
  )
}

function hasCurrentSection(value: string) {
  const normalized = normalizeText(value)
  return /\bseccion(?:\s+actual)?\s*(?:es|numero|nro\.?|:)\s*[a-z0-9][a-z0-9-]{0,15}\b/.test(
    normalized,
  )
}

function analyzeRequest(value: string): RequestReadiness {
  const normalized = normalizeText(value)
  const category = inferCategory(value)
  const missing: string[] = []
  const hasCourse = hasCourseDetails(value)

  if (category === 'section_change') {
    if (!hasCourse) missing.push('la asignatura')
    if (!hasCurrentSection(value)) missing.push('tu sección actual')
    if (
      !/\b(porque|motivo|debido|ya que|se superpone|cerro|conflicto|incompatible)\b/.test(
        normalized,
      )
    )
      missing.push('el motivo del cambio')
  } else if (category === 'missing_course' || category === 'enrollment') {
    if (!hasCourse) missing.push('la asignatura')
    if (
      !/\b(no aparece|falta|no puedo|rechaz|cerr|error|problema|bloque)\b/.test(
        normalized,
      )
    )
      missing.push('el problema concreto de inscripción')
  } else if (category === 'schedule_conflict') {
    if (!hasCourse) missing.push('las asignaturas involucradas')
    if (
      !/\b\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs?|horas?)\b|\b(lunes|martes|miercoles|jueves|viernes|sabado)\b/.test(
        normalized,
      )
    )
      missing.push('los horarios o días que se superponen')
  } else if (category === 'technical') {
    if (
      !/\b(ava|blackboard|konea|portal|correo|app|aplicacion|plataforma)\b/.test(
        normalized,
      )
    )
      missing.push('la plataforma afectada')
    if (
      !/\b(error|no puedo|no carga|no abre|bloque|clave|acceso|mensaje|codigo)\b/.test(
        normalized,
      )
    )
      missing.push('el error o comportamiento observado')
  } else if (category === 'financial') {
    if (
      !/\b(pago|arancel|beca|cuota|cobro|gratuidad|beneficio)\b/.test(
        normalized,
      )
    )
      missing.push('el trámite, beneficio o cobro involucrado')
    if (!/\b(semestre|mes|ano|periodo|20\d{2}|actual)\b/.test(normalized))
      missing.push('el período al que corresponde')
  } else if (category === 'harassment') {
    if (
      !/\b(insult|amenaz|hostig|burla|golpe|mensaje|difund|excluy|acosa|intimid)\b/.test(
        normalized,
      )
    )
      missing.push('qué conducta ocurrió')
    if (
      !/\b(clase|chat|campus|sede|pasillo|redes|hoy|ayer|semana|fecha|cuando)\b/.test(
        normalized,
      )
    )
      missing.push('un contexto aproximado de dónde o cuándo ocurrió')
  } else if (category === 'wellbeing') {
    if (normalized.length < 25) missing.push('qué situación necesitas abordar')
    if (!hasImmediateSafetyAnswer(value))
      missing.push('si existe peligro inmediato')
  } else if (
    normalized.length < 80 ||
    !/\b(porque|debido|ocurrio|sucedio|necesito que|solicito que|problema con)\b/.test(
      normalized,
    )
  ) {
    missing.push('qué ocurrió y qué solución necesitas')
  }

  return { category, missing }
}

function categorySubject(category: DucoRequestDraft['category']) {
  const subjects: Record<DucoRequestDraft['category'], string> = {
    section_change: 'Solicitud de cambio de sección',
    missing_course: 'Asignatura faltante en mi carga académica',
    enrollment: 'Solicitud relacionada con inscripción de asignaturas',
    schedule_conflict: 'Solicitud por conflicto de horario',
    harassment: 'Solicitud de apoyo y revisión de convivencia',
    technical: 'Solicitud de soporte técnico',
    financial: 'Solicitud de orientación financiera',
    wellbeing: 'Solicitud de apoyo estudiantil',
    other: 'Solicitud de atención estudiantil',
  }
  return subjects[category]
}

function categoryOutcome(category: DucoRequestDraft['category']) {
  const outcomes: Record<DucoRequestDraft['category'], string> = {
    section_change: 'Solicito revisar las alternativas de sección disponibles.',
    missing_course: 'Solicito revisar y regularizar mi carga académica.',
    enrollment: 'Solicito orientación y apoyo para completar la inscripción.',
    schedule_conflict:
      'Solicito una alternativa que evite el conflicto de horario.',
    harassment:
      'Solicito revisión humana y orientación sobre medidas de apoyo.',
    technical: 'Solicito recuperar el acceso o resolver el error informado.',
    financial:
      'Solicito revisión del caso y orientación sobre los siguientes pasos.',
    wellbeing:
      'Solicito contacto y orientación del equipo de bienestar estudiantil.',
    other:
      'Solicito revisión del caso y orientación sobre los siguientes pasos.',
  }
  return outcomes[category]
}

function requestDecision(input: BuildDucoReplyInput): DucoAiResult | null {
  const lastAssistant = lastAssistantMessage(input) ?? ''
  const continuingRequest = normalizeText(lastAssistant).includes(
    normalizeText(requestQuestionMarker),
  )
  if (!needsInstitutionalRequest(input.prompt) && !continuingRequest)
    return null

  const messages = userMessages(input)
  const facts = messages.join('\n').trim().slice(0, 2_000)
  const analysis = analyzeRequest(facts)
  if (analysis.missing.length > 0) {
    const missingText = new Intl.ListFormat('es', {
      style: 'long',
      type: 'conjunction',
    }).format(analysis.missing.slice(0, 2))
    return {
      reply: `Puedo ayudarte a gestionar esta solicitud. ${requestQuestionMarker} que me indiques ${missingText}. No necesitas compartir nombres ni pruebas para pedir apoyo.`,
      action: null,
      provider: 'local',
    }
  }

  const urgency =
    analysis.category === 'wellbeing' ||
    /\b(urgente|amenaza|peligro|agresion|hoy vence)\b/.test(
      normalizeText(facts),
    )
      ? 'high'
      : 'medium'
  return {
    reply:
      'Ya tengo la información mínima para gestionar la solicitud. Preparé un formulario editable con tus datos; todavía no se ha enviado y podrás revisarlo antes de confirmar.',
    action: {
      type: 'manage_request',
      label: 'Gestionar solicitud',
      draft: {
        category: analysis.category,
        subject: categorySubject(analysis.category),
        description: facts,
        desiredOutcome: categoryOutcome(analysis.category),
        urgency,
      },
    },
    provider: 'local',
  }
}

function isTaskIntent(value: string) {
  const normalized = normalizeText(value)
  const deliverable =
    /\b(tarea|guia|informe|proyecto|evaluacion|trabajo|presentacion|ensayo|laboratorio|entrega|actividad)\b/.test(
      normalized,
    )
  const pendingWork =
    /\b(tengo que|debo|necesito|me pidieron|hay que|quiero organizar|ayudame a organizar|ayudarme a organizar)\b/.test(
      normalized,
    )
  const asksExisting =
    /\b(que|cuales|ver|dime)\b.*\b(tareas|pendientes|entregas)\b/.test(
      normalized,
    )
  return deliverable && pendingWork && !asksExisting
}

function taskTitle(value: string) {
  const cleaned = value
    .trim()
    .replace(
      /^.*?\b(?:tengo que|debo|necesito|me pidieron)\s+(?:hacer|realizar|entregar|preparar|completar)?\s*/iu,
      '',
    )
    .replace(/^(?:una?|el|la)\s+/iu, '')
  const title = cleaned
    .split(
      /\b(?:para (?:la )?(?:asignatura|materia|clase)?|antes de|que vence|el d[ií]a)\b/iu,
    )[0]
    ?.split(/[,.!?]/u)[0]
    ?.trim()
  const fallback = 'Pendiente académico'
  const result = title && title.length >= 2 ? title : fallback
  return `${result.charAt(0).toUpperCase()}${result.slice(1)}`.slice(0, 160)
}

function taskCourseName(value: string) {
  const explicit = value.match(
    /\b(?:asignatura|materia|ramo|curso)\s+(?:es|se llama|llamad[oa]|de)\s+([^,.!?]+)/iu,
  )?.[1]
  const afterFor = value.match(
    /\bpara\s+(?:la\s+)?(?:asignatura|materia|clase)\s+([^,.!?]+)/iu,
  )?.[1]
  const generalAfterFor = value.match(/\bpara\s+([^,.!?]+)/iu)?.[1]?.trim()
  const safeGeneralAfterFor =
    generalAfterFor &&
    !/^(?:que|poder|terminar|entregar|hoy|mañana|manana|el\s+\d|la\s+próxima|la\s+proxima)\b/iu.test(
      generalAfterFor,
    )
      ? generalAfterFor
      : undefined
  const result = (explicit ?? afterFor ?? safeGeneralAfterFor)?.trim()
  return result ? result.slice(0, 300) : null
}

function taskDecision(input: BuildDucoReplyInput): DucoAiResult | null {
  if (!isTaskIntent(input.prompt)) return null
  const normalized = normalizeText(input.prompt)
  const draft: DucoTaskDraft = {
    title: taskTitle(input.prompt),
    description: input.prompt.trim().slice(0, 1_000),
    courseName: taskCourseName(input.prompt),
    dueAt: null,
    priority: /\b(urgente|hoy|manana|vence pronto)\b/.test(normalized)
      ? 'high'
      : 'medium',
  }
  return {
    reply:
      'Puedo ayudarte a entender los contenidos y a dividir el trabajo en pasos, pero no realizar una entrega completa por ti. También puedo registrar este trabajo en “Próximas tareas” para que lo organices; revisa y completa el borrador antes de crearlo.',
    action: {
      type: 'create_task',
      label: 'Crear pendiente',
      draft,
      task: null,
    },
    provider: 'local',
  }
}

function deterministicWorkflow(input: BuildDucoReplyInput) {
  return safetyDecision(input) ?? requestDecision(input) ?? taskDecision(input)
}

function buildModelInput(input: BuildDucoReplyInput) {
  const conversation = input.conversation
    .slice(-10)
    .map(
      (message) =>
        `${message.role === 'user' ? 'Estudiante' : 'DUCO'}: ${message.content}`,
    )
    .join('\n')
  const tasks = input.pendingTasks
    .slice(0, 8)
    .map(
      (task) =>
        `- ${task.title}; prioridad=${task.priority}; estado=${task.status}; vence=${task.dueDate ?? 'sin fecha'}`,
    )
    .join('\n')

  return `Contexto reciente:\n${conversation || '(sin mensajes anteriores)'}\n\nTareas pendientes:\n${tasks || '(sin tareas pendientes)'}\n\nMensaje actual del estudiante:\n${input.prompt}`
}

function parseModelOutput(value: unknown, provider: 'ollama' | 'openai') {
  if (typeof value !== 'string') throw new Error('DUCO AI returned no text')
  const output = ducoAiOutputSchema.parse(JSON.parse(value))

  if (output.action === 'none') {
    return {
      reply: output.reply,
      action: null,
      provider,
    } satisfies DucoAiResult
  }

  if (output.action === 'create_task') {
    if (output.taskTitle.length < 2)
      throw new Error('DUCO AI returned an incomplete task draft')
    return {
      reply: output.reply,
      action: {
        type: 'create_task',
        label: 'Crear pendiente',
        draft: {
          title: output.taskTitle,
          description: output.taskDescription,
          courseName: output.taskCourseName || null,
          dueAt: output.taskDueAt || null,
          priority: output.taskPriority,
        },
        task: null,
      },
      provider,
    } satisfies DucoAiResult
  }

  if (output.subject.length < 3 || output.description.length < 10) {
    throw new Error('DUCO AI returned an incomplete request draft')
  }
  return {
    reply: output.reply,
    action: {
      type: 'manage_request',
      label: 'Gestionar solicitud',
      draft: {
        category: output.category,
        subject: output.subject,
        description: output.description,
        desiredOutcome: output.desiredOutcome,
        urgency: output.urgency,
      },
    },
    provider,
  } satisfies DucoAiResult
}

async function queryOllama(input: BuildDucoReplyInput) {
  const response = await fetch(
    `${env.OLLAMA_BASE_URL.replace(/\/$/, '')}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(env.DUCO_AI_TIMEOUT_MS),
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        stream: false,
        think: false,
        keep_alive: env.OLLAMA_KEEP_ALIVE,
        messages: [
          { role: 'system', content: systemInstructions },
          { role: 'user', content: buildModelInput(input) },
        ],
        format: ducoOutputJsonSchema,
        options: { temperature: 0, num_ctx: 4_096, num_predict: 600 },
      }),
    },
  )

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300)
    throw new Error(
      `Ollama responded with HTTP ${response.status}${details ? `: ${details}` : ''}`,
    )
  }

  const body = (await response.json()) as { message?: { content?: unknown } }
  return parseModelOutput(body.message?.content, 'ollama')
}

async function queryOpenAi(input: BuildDucoReplyInput) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured')

  const response = await fetch(
    `${env.OPENAI_BASE_URL.replace(/\/$/, '')}/responses`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(env.DUCO_AI_TIMEOUT_MS),
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        instructions: systemInstructions,
        input: buildModelInput(input),
        store: false,
        reasoning: { effort: 'low' },
        max_output_tokens: 900,
        text: {
          format: {
            type: 'json_schema',
            name: 'duco_action_decision',
            strict: true,
            schema: ducoOutputJsonSchema,
          },
        },
      }),
    },
  )

  if (!response.ok)
    throw new Error(`OpenAI responded with HTTP ${response.status}`)

  const body = (await response.json()) as {
    output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>
  }
  const outputText = body.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === 'output_text')?.text
  return parseModelOutput(outputText, 'openai')
}

function stripUnvalidatedAction(result: DucoAiResult): DucoAiResult {
  // Los botones se habilitan únicamente por las reglas deterministas anteriores.
  // El modelo conserva libertad para conversar, pero no para saltarse requisitos.
  return result.action ? { ...result, action: null } : result
}

export async function buildDucoAiReply(
  input: BuildDucoReplyInput,
): Promise<DucoAiResult> {
  const workflow = deterministicWorkflow(input)
  if (workflow) return workflow

  if (env.DUCO_AI_PROVIDER === 'local') {
    return { reply: input.localReply, action: null, provider: 'local' }
  }

  try {
    const result =
      env.DUCO_AI_PROVIDER === 'openai'
        ? await queryOpenAi(input)
        : await queryOllama(input)
    return stripUnvalidatedAction(result)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error'
    console.warn(
      `[DUCO] ${env.DUCO_AI_PROVIDER} unavailable; using local fallback: ${reason}`,
    )
    return { reply: input.localReply, action: null, provider: 'local' }
  }
}
