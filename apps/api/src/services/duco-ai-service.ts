import { z } from 'zod'
import { env } from '../config/env.js'
import type {
  AssistantMessageAction,
  DucoDraftStatus,
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
Usa create_task cuando el estudiante mencione una tarea, guía, informe, proyecto, evaluación, examen u otra actividad que quiera organizar, guardar o revisar como pendiente. Interpreta continuaciones como “guardarlo”, “anótalo”, “sí, esa tarea” o “déjalo para el viernes” usando el contexto reciente y el borrador activo. Prepara solo datos expresamente aportados; lo desconocido queda vacío.
Usa manage_request únicamente si una gestión institucional ya contiene información suficiente. Si faltan datos, action=none y pregunta uno o dos datos concretos antes de ofrecer el formulario.
Ante acoso, autolesión, amenazas o daño a terceros, prioriza la seguridad, no diagnostiques ni acuses y no inventes hechos. Aclara que DUCO no contactó automáticamente a nadie.
En cualquier acción, los hechos del borrador deben provenir exclusivamente de mensajes del estudiante o del borrador activo validado, nunca de una respuesta anterior de DUCO.
Tu texto debe coincidir con action: si action=none no digas que preparaste, guardaste o dejaste listo un borrador. Si action=create_task, aclara que el borrador quedó guardado para revisión y que la tarea todavía no fue creada.`

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

export type DucoActiveTaskDraft = {
  id: string
  status: Extract<
    DucoDraftStatus,
    'collecting_information' | 'ready_for_review'
  >
  draft: DucoTaskDraft
  expiresAt?: string | null
}

type BuildDucoReplyInput = {
  prompt: string
  localReply: string
  conversation: DucoConversationMessage[]
  pendingTasks: DucoTaskContext[]
  activeTaskDraft?: DucoActiveTaskDraft | null
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
    /\b(tarea|guia|informe|proyecto|evaluacion|examen|prueba|certamen|control|trabajo|presentacion|ensayo|laboratorio|entrega|actividad|estudiar|repasar)\b/.test(
      normalized,
    )
  const pendingWork =
    /\b(tengo que|debo|necesito|me pidieron|hay que|quiero organizar|ayudame a organizar|ayudarme a organizar)\b/.test(
      normalized,
    )
  const explicitlyCreatesTask =
    /\b(crear(?:lo|la)?|crea(?:lo|la)?|agendar(?:lo|la)?|agenda(?:lo|la)?|anadir(?:lo|la)?|anade(?:lo|la)?|agregar(?:lo|la)?|agrega(?:lo|la)?|registrar(?:lo|la)?|registra(?:lo|la)?|programar(?:lo|la)?|programa(?:lo|la)?|guardar(?:lo|la)?|guarda(?:lo|la)?|incorporar(?:lo|la)?|incorpora(?:lo|la)?|anotar(?:lo|la)?|anota(?:lo|la)?)\b.{0,100}\b(tarea|pendiente|guia|informe|proyecto|evaluacion|examen|prueba|trabajo|presentacion|ensayo|laboratorio|entrega|actividad)\b/.test(
      normalized,
    )
  const asksExisting =
    /\b(que|cuales|ver|dime)\b.*\b(tareas|pendientes|entregas)\b/.test(
      normalized,
    )
  return deliverable && (pendingWork || explicitlyCreatesTask) && !asksExisting
}

function referencesActiveTaskDraft(value: string) {
  const normalized = normalizeText(value)
  return (
    /\b(guardarlo|guardarla|guardalo|guardala|anotarlo|anotarla|anotalo|anotala|registrarlo|registrarla|registralo|registrala|agendarlo|agendarla|agendalo|agendala|crearlo|crearla|crealo|creala)\b/.test(
      normalized,
    ) ||
    /\b(esa|esta|la)\s+(tarea|actividad|entrega)\b/.test(normalized) ||
    /\b(el|ese|este)\s+(pendiente|borrador|trabajo|examen)\b/.test(
      normalized,
    ) ||
    /\b(si|dale|perfecto|bien|de acuerdo)\b.{0,40}\b(guard|cre|agend|anot|registr|borrador|tarea|pendiente)\w*/.test(
      normalized,
    )
  )
}

function isSimpleDraftAffirmation(value: string) {
  return /^(si|sí|dale|perfecto|bien|de acuerdo|ok|okay|hazlo|hagamoslo)[.!\s]*$/iu.test(
    value.trim(),
  )
}

function isTaskPreparationOffer(value: string) {
  const normalized = normalizeText(value)
  const mentionsTaskDraft =
    /\b(borrador|tarea|pendiente|sugerencia|actividad|examen|entrega)\b/.test(
      normalized,
    )
  const offersPreparation =
    /\b(quieres|deseas|puedo)\b.{0,100}\b(prepar|recre|cre|guard|registr|agend)\w*/.test(
      normalized,
    )
  const requestsReview =
    /\b(borrador|sugerencia|tarea|pendiente)\b.{0,120}\b(revis|confirm|guard|cre)\w*/.test(
      normalized,
    )
  return mentionsTaskDraft && (offersPreparation || requestsReview)
}

function isSubstantiveTaskFact(value: string) {
  const normalized = normalizeText(value)
  const mentionsTask =
    /\b(tarea|guia|informe|proyecto|evaluacion|examen|prueba|certamen|control|trabajo|presentacion|ensayo|laboratorio|entrega|actividad|estudiar|repasar)\b/.test(
      normalized,
    )
  const asksExisting =
    /\b(que|cuales|cuantas|ver|dime|mostrar)\b.*\b(tareas|pendientes|entregas)\b/.test(
      normalized,
    )
  return (
    mentionsTask &&
    !asksExisting &&
    !referencesActiveTaskDraft(value) &&
    !isSimpleDraftAffirmation(value)
  )
}

function isSupportingTaskFact(value: string) {
  const normalized = normalizeText(value)
  return (
    isSubstantiveTaskFact(value) ||
    hasCourseDetails(value) ||
    /\b(?:es|examen|prueba|certamen|control)\s+de\s+[a-z0-9]/.test(
      normalized,
    ) ||
    /\b(?:en\s+\d{1,3}\s+dias?|vence|fecha|plazo|hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(
      normalized,
    )
  )
}

function recoverableTaskContext(input: BuildDucoReplyInput) {
  const userConversation = input.conversation
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
  const anchorIndex = userConversation.findLastIndex(isSubstantiveTaskFact)
  if (anchorIndex < 0) return null

  const facts = userConversation
    .slice(Math.max(0, anchorIndex - 2))
    .filter(isSupportingTaskFact)
  if (facts.length === 0) return null

  return {
    source: userConversation[anchorIndex]!,
    facts: facts.join('\n').trim().slice(-1_000),
  }
}

function wantsRecoveredTaskDraft(input: BuildDucoReplyInput) {
  return (
    referencesActiveTaskDraft(input.prompt) ||
    (isSimpleDraftAffirmation(input.prompt) &&
      isTaskPreparationOffer(lastAssistantMessage(input) ?? ''))
  )
}

function taskSourceText(input: BuildDucoReplyInput) {
  const candidates = [
    ...input.conversation
      .filter((message) => message.role === 'user')
      .map((message) => message.content),
    input.prompt,
  ]
  const useful = candidates.filter(
    (message) =>
      !referencesActiveTaskDraft(message) &&
      !isSimpleDraftAffirmation(message) &&
      /\b(tarea|guia|informe|proyecto|evaluacion|examen|prueba|certamen|control|trabajo|presentacion|ensayo|laboratorio|entrega|actividad|estudiar|repasar|tengo que|debo|necesito)\b/iu.test(
        normalizeText(message),
      ),
  )
  return useful.at(-1) ?? input.prompt
}

function normalizeTaskWording(value: string) {
  return value
    .replaceAll(/\bto\s*-?\s*be\b/giu, 'to be')
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/\s+([,.;:!?])/g, '$1')
    .trim()
}

function stripRelativeDeadline(value: string) {
  return value
    .replace(/\s+(?:en|dentro de)\s+\d{1,3}\s+d[ií]as?\b[\s\S]*$/iu, '')
    .replace(
      /\s+(?:para|antes de)\s+(?:hoy|ma[nñ]ana|pasado ma[nñ]ana)\b[\s\S]*$/iu,
      '',
    )
    .trim()
}

function taskTitle(value: string) {
  const normalized = normalizeText(value)
  const isBareCreationRequest =
    /\b(crear|agendar|anadir|agregar|registrar|programar|guardar|incorporar)\b\s+(?:una?\s+)?(?:nueva?\s+)?(?:tarea|pendiente|actividad|entrega)\s*[.!?]*$/.test(
      normalized,
    )
  if (isBareCreationRequest) return 'Nueva tarea académica'

  const cleaned = normalizeTaskWording(value)
    .replace(/^.*?\b(?:tengo que|debo|necesito|me pidieron)\s+/iu, '')
    .replace(/^(?:una?|el|la)\s+/iu, '')
  const title = cleaned
    .split(
      /\b(?:para (?:la )?(?:asignatura|materia|clase|ramo)|antes de|que vence|el d[ií]a|(?:en|dentro de) \d{1,3} d[ií]as?)\b/iu,
    )[0]
    ?.split(/[,.!?]/u)[0]
    ?.trim()
  const fallback = 'Pendiente académico'
  const result = normalizeTaskWording(
    stripRelativeDeadline(title && title.length >= 2 ? title : fallback),
  )
  return `${result.charAt(0).toUpperCase()}${result.slice(1)}`.slice(0, 160)
}

const courseWordCorrections: Record<string, string> = {
  administracion: 'Administración',
  algebra: 'Álgebra',
  analisis: 'Análisis',
  biologia: 'Biología',
  calculo: 'Cálculo',
  comunicacion: 'Comunicación',
  computacion: 'Computación',
  economia: 'Economía',
  estadistica: 'Estadística',
  etica: 'Ética',
  fisica: 'Física',
  ingles: 'Inglés',
  matematica: 'Matemática',
  matematicas: 'Matemáticas',
  programacion: 'Programación',
  quimica: 'Química',
  tecnologia: 'Tecnología',
  ia: 'IA',
  ti: 'TI',
  tic: 'TIC',
}

const lowercaseCourseWords = new Set([
  'de',
  'del',
  'el',
  'en',
  'la',
  'las',
  'los',
  'para',
  'y',
])

function formatCourseName(value: string | null | undefined) {
  if (!value) return null
  const cleaned = normalizeTaskWording(stripRelativeDeadline(value))
    .replace(/[,.!?;:]+$/u, '')
    .trim()
  if (!cleaned) return null

  const words = cleaned.split(' ')
  const formatted = words.map((word, index) => {
    const normalized = normalizeText(word)
    const corrected = courseWordCorrections[normalized]
    if (corrected) return corrected
    if (index > 0 && lowercaseCourseWords.has(normalized)) return normalized
    if (/^(?:i{1,3}|iv|v|vi{0,3}|ix|x)$/iu.test(word)) return word.toUpperCase()
    if (/^[A-ZÁÉÍÓÚÜÑ\d]{2,}$/u.test(word)) return word
    const lowered = word.toLocaleLowerCase('es-CL')
    return `${lowered.charAt(0).toLocaleUpperCase('es-CL')}${lowered.slice(1)}`
  })

  return formatted.join(' ').slice(0, 300)
}

function taskCourseName(value: string) {
  const explicit = value.match(
    /\b(?:asignatura|materia|ramo|curso)\s+(?:es|se llama|llamad[oa]|de)\s+([^,.!?]+)/iu,
  )?.[1]
  const afterFor = value.match(
    /\bpara\s+(?:la\s+)?(?:asignatura|materia|clase)\s+([^,.!?]+)/iu,
  )?.[1]
  const generalAfterFor = value.match(/\bpara\s+([^,.!?]+)/iu)?.[1]?.trim()
  const simpleSubject = value.match(
    /\b(?:es|examen|prueba|certamen|control)\s+de\s+([\p{L}\d][^,.!?\n]{1,80}?)(?=\s+(?:y\s+)?(?:tengo que|debo|necesito|para\s+(?:el|la|un|una))\b|[,.!?\n]|$)/iu,
  )?.[1]
  const safeGeneralAfterFor =
    generalAfterFor &&
    !/^(?:que|poder|terminar|entregar|hoy|mañana|manana|el|la|los|las|un|una)\b/iu.test(
      generalAfterFor,
    )
      ? generalAfterFor
      : undefined
  const result = (
    explicit ??
    afterFor ??
    simpleSubject ??
    safeGeneralAfterFor
  )?.trim()
  return formatCourseName(result)
}

function validTaskDueAt(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function relativeTaskDueAt(value: string, now = new Date()) {
  const normalized = normalizeText(value)
  const numericDeadline = [
    ...normalized.matchAll(
      /\b(?:(?:en|dentro de)\s+|(?:durante\s+)?(?:los\s+)?proximos\s+)(\d{1,3})\s+dias?\b/g,
    ),
  ].at(-1)?.[1]
  let days: number | null = null

  if (numericDeadline) {
    days = Number(numericDeadline)
  } else if (/\bpasado manana\b/.test(normalized)) {
    days = 2
  } else if (/\bmanana\b/.test(normalized)) {
    days = 1
  } else if (/\bhoy\b/.test(normalized)) {
    days = 0
  }

  if (days === null || !Number.isInteger(days) || days < 0 || days > 365)
    return null

  const dueAt = new Date(now)
  dueAt.setDate(dueAt.getDate() + days)
  dueAt.setHours(23, 59, 0, 0)
  return dueAt.toISOString()
}

function taskDescriptionLooksLikeTranscript(
  description: string,
  facts: string,
) {
  const normalizedDescription = normalizeText(description)
  const normalizedFacts = normalizeText(facts)
  if (!normalizedDescription) return true
  if (/\r|\n/u.test(description)) return true
  if (normalizedDescription === normalizedFacts) return true
  const normalizedFactLines = facts
    .split(/\r?\n/u)
    .map(normalizeText)
    .filter(Boolean)
  if (normalizedFactLines.includes(normalizedDescription)) return true
  return /^(?:podrias|puedes|me ayudas|ayudame|me gustaria|quiero|tengo que|debo|necesito)\b/.test(
    normalizedDescription,
  )
}

function finishTaskSentence(value: string, maxLength = 240) {
  const cleaned = normalizeTaskWording(value).replace(/[.!?]+$/u, '')
  if (cleaned.length + 1 <= maxLength) return `${cleaned}.`
  const shortened = cleaned.slice(0, maxLength - 2)
  const lastSpace = shortened.lastIndexOf(' ')
  return `${shortened.slice(0, Math.max(lastSpace, 1)).trim()}…`
}

function naturalTaskDescription(
  title: string,
  courseName: string | null,
  facts: string,
) {
  const normalizedTitle = normalizeText(title)
  const normalizedFacts = normalizeText(facts)
  const courseAlreadyInTitle = Boolean(
    courseName && normalizedTitle.includes(normalizeText(courseName)),
  )
  const assessment = [
    ['examen', 'el examen'],
    ['prueba', 'la prueba'],
    ['certamen', 'el certamen'],
    ['control', 'el control'],
    ['evaluacion', 'la evaluación'],
  ].find(([keyword]) =>
    new RegExp(`\\b${keyword}\\b`).test(normalizedFacts),
  )?.[1]

  let description = title
  if (assessment && !normalizedTitle.includes(normalizeText(assessment))) {
    description += ` para ${assessment}`
    if (courseName) description += ` de ${courseName}`
  } else if (courseName && !courseAlreadyInTitle) {
    description += ` para ${courseName}`
  }

  return finishTaskSentence(description)
}

type PolishTaskDraftOptions = {
  currentPrompt?: string
  fallbackTitle?: string
  previousDraft?: DucoTaskDraft | null
}

function preferFallbackTaskTitle(candidate: string, fallback: string) {
  const normalizedCandidate = normalizeText(normalizeTaskWording(candidate))
  const normalizedFallback = normalizeText(normalizeTaskWording(fallback))
  const isGeneric = new Set([
    'nueva tarea academica',
    'pendiente academico',
    'tarea',
    'pendiente',
    'actividad',
  ]).has(normalizedCandidate)
  return (
    isGeneric ||
    normalizedCandidate.length < 3 ||
    (normalizedFallback.includes(normalizedCandidate) &&
      normalizedFallback.length >= normalizedCandidate.length + 6)
  )
}

function polishTaskDraft(
  draft: DucoTaskDraft,
  facts: string,
  options: PolishTaskDraftOptions = {},
): DucoTaskDraft {
  const inferredTitle = options.fallbackTitle || taskTitle(facts)
  const titleSource =
    !draft.title || preferFallbackTaskTitle(draft.title, inferredTitle)
      ? inferredTitle
      : draft.title
  const normalizedTitle = normalizeTaskWording(
    stripRelativeDeadline(titleSource),
  )
  const title =
    `${normalizedTitle.charAt(0).toUpperCase()}${normalizedTitle.slice(1)}`.slice(
      0,
      160,
    )
  const promptCourse = options.currentPrompt
    ? taskCourseName(options.currentPrompt)
    : null
  const courseName = formatCourseName(
    promptCourse ??
      options.previousDraft?.courseName ??
      taskCourseName(facts) ??
      draft.courseName,
  )
  const dueAt =
    relativeTaskDueAt(options.currentPrompt ?? '') ??
    (options.currentPrompt &&
    /\b(?:vence|entrega|para|antes de|fecha|plazo)\b/i.test(
      normalizeText(options.currentPrompt),
    )
      ? validTaskDueAt(draft.dueAt)
      : null) ??
    validTaskDueAt(options.previousDraft?.dueAt) ??
    relativeTaskDueAt(facts) ??
    validTaskDueAt(draft.dueAt)
  const description = taskDescriptionLooksLikeTranscript(
    draft.description,
    facts,
  )
    ? naturalTaskDescription(title, courseName, facts)
    : finishTaskSentence(draft.description, 500)

  return {
    ...draft,
    title,
    description,
    courseName,
    dueAt,
  }
}

function taskDecision(input: BuildDucoReplyInput): DucoAiResult | null {
  const activeDraft = input.activeTaskDraft
  if (
    activeDraft &&
    (referencesActiveTaskDraft(input.prompt) ||
      isSimpleDraftAffirmation(input.prompt))
  ) {
    const facts = userMessages(input).join('\n').trim().slice(-1_000)
    return {
      reply:
        'El borrador quedó guardado para que lo revises. La tarea todavía no se ha creado; puedes modificar sus datos antes de confirmar.',
      action: {
        type: 'create_task',
        label: 'Revisar y crear',
        draft: polishTaskDraft(activeDraft.draft, facts, {
          currentPrompt: input.prompt,
          previousDraft: activeDraft.draft,
        }),
        draftId: activeDraft.id,
        draftStatus: 'ready_for_review',
        task: null,
      },
      provider: 'local',
    }
  }

  const recoveredContext = wantsRecoveredTaskDraft(input)
    ? recoverableTaskContext(input)
    : null
  if (recoveredContext) {
    const normalizedFacts = normalizeText(recoveredContext.facts)
    const draft = polishTaskDraft(
      {
        title: taskTitle(recoveredContext.source),
        description: recoveredContext.facts,
        courseName: taskCourseName(recoveredContext.facts),
        dueAt: null,
        priority: /\b(urgente|hoy|manana|vence pronto)\b/.test(normalizedFacts)
          ? 'high'
          : 'medium',
      },
      recoveredContext.facts,
      { currentPrompt: input.prompt },
    )
    return {
      reply:
        'El borrador quedó guardado para que lo revises. La tarea todavía no se ha creado; puedes modificar sus datos antes de confirmar.',
      action: {
        type: 'create_task',
        label: 'Revisar y crear',
        draft,
        draftId: null,
        draftStatus: 'ready_for_review',
        task: null,
      },
      provider: 'local',
    }
  }

  if (!isTaskIntent(input.prompt)) return null
  const normalized = normalizeText(input.prompt)
  const source = taskSourceText(input)
  const facts = userMessages(input).join('\n').trim().slice(-1_000)
  const draft = polishTaskDraft(
    {
      title: taskTitle(source),
      description: facts,
      courseName: taskCourseName(facts),
      dueAt: null,
      priority: /\b(urgente|hoy|manana|vence pronto)\b/.test(normalized)
        ? 'high'
        : 'medium',
    },
    facts,
    { currentPrompt: input.prompt },
  )
  return {
    reply:
      'Puedo ayudarte a entender los contenidos y a dividir el trabajo en pasos, pero no realizar una entrega completa por ti. También puedo registrar este trabajo en “Próximas tareas” para que lo organices; revisa y completa el borrador antes de crearlo.',
    action: {
      type: 'create_task',
      label: 'Revisar y crear',
      draft,
      draftId: null,
      draftStatus: 'ready_for_review',
      task: null,
    },
    provider: 'local',
  }
}

function deterministicWorkflow(input: BuildDucoReplyInput) {
  return safetyDecision(input) ?? requestDecision(input)
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
  const activeDraft = input.activeTaskDraft
    ? [
        `id=${input.activeTaskDraft.id}`,
        `estado=${input.activeTaskDraft.status}`,
        `titulo=${input.activeTaskDraft.draft.title}`,
        `descripcion=${input.activeTaskDraft.draft.description}`,
        `asignatura=${input.activeTaskDraft.draft.courseName ?? 'sin asignatura'}`,
        `vence=${input.activeTaskDraft.draft.dueAt ?? 'sin fecha'}`,
        `prioridad=${input.activeTaskDraft.draft.priority}`,
      ].join('; ')
    : '(sin borrador activo)'

  return `Contexto reciente:\n${conversation || '(sin mensajes anteriores)'}\n\nBorrador de tarea activo validado:\n${activeDraft}\n\nTareas pendientes:\n${tasks || '(sin tareas pendientes)'}\n\nMensaje actual del estudiante:\n${input.prompt}`
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
    const parsedDueAt = output.taskDueAt ? new Date(output.taskDueAt) : null
    return {
      reply: output.reply,
      action: {
        type: 'create_task',
        label: 'Revisar y crear',
        draft: {
          title: output.taskTitle,
          description: output.taskDescription,
          courseName: output.taskCourseName || null,
          dueAt:
            parsedDueAt && !Number.isNaN(parsedDueAt.getTime())
              ? parsedDueAt.toISOString()
              : null,
          priority: output.taskPriority,
        },
        draftId: null,
        draftStatus: 'ready_for_review',
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

function falselyClaimsDraft(reply: string) {
  const normalized = normalizeText(reply)
  const mutationBeforeResource =
    /\b(?:prepare|preparado|deje|dejado|guarde|guardado|registre|registrado|agende|agendado|quedo|esta|listo|lista)\b.{0,80}\b(?:borrador|pendiente|tarea|actividad)\b/.test(
      normalized,
    )
  const resourceBeforeMutation =
    /\b(?:borrador|pendiente|tarea|actividad)\b.{0,80}\b(?:quedo|esta|fue)\b.{0,40}\b(?:guardad|preparad|registrad|agendad|list|cread)\w*/.test(
      normalized,
    )
  return mutationBeforeResource || resourceBeforeMutation
}

function safeReplyWithoutAction(result: DucoAiResult) {
  return falselyClaimsDraft(result.reply)
    ? {
        ...result,
        reply:
          'Todavía no existe un borrador listo para revisión porque falta confirmar la acción o identificar la tarea. Dime “guardar como tarea” junto con lo que debes hacer, o continúa con los datos que faltan.',
        action: null,
      }
    : { ...result, action: null }
}

function mergeTaskDraft(
  current: DucoTaskDraft,
  proposed: DucoTaskDraft,
  prompt: string,
): DucoTaskDraft {
  const normalized = normalizeText(prompt)
  const changesCourse =
    hasCourseDetails(prompt) ||
    /\b(?:es|examen|prueba|certamen|control)\s+de\s+[a-z0-9]/.test(normalized)
  const changesDueAt =
    /\b(?:vence|entrega|para|antes de|fecha|plazo)\b.{0,30}\b(?:hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2}(?:[/-]\d{1,2})?)\b/.test(
      normalized,
    ) || /\ben\s+\d{1,3}\s+dias?\b/.test(normalized)
  const changesPriority =
    /\b(?:urgente|prioridad\s+(?:alta|media|baja)|poco urgente)\b/.test(
      normalized,
    )
  const genericTitles = new Set([
    'Nueva tarea académica',
    'Pendiente académico',
  ])

  return {
    title:
      genericTitles.has(current.title) && proposed.title
        ? proposed.title
        : current.title,
    description: current.description || proposed.description,
    courseName:
      changesCourse && proposed.courseName
        ? proposed.courseName
        : current.courseName,
    dueAt: changesDueAt && proposed.dueAt ? proposed.dueAt : current.dueAt,
    priority: changesPriority ? proposed.priority : current.priority,
  }
}

function validatesTaskAction(input: BuildDucoReplyInput) {
  return (
    isTaskIntent(input.prompt) ||
    Boolean(
      input.activeTaskDraft &&
      (referencesActiveTaskDraft(input.prompt) ||
        isSimpleDraftAffirmation(input.prompt)),
    )
  )
}

function validateModelResult(
  input: BuildDucoReplyInput,
  result: DucoAiResult,
): DucoAiResult {
  if (result.action?.type === 'create_task' && validatesTaskAction(input)) {
    const continuesActiveDraft = Boolean(
      input.activeTaskDraft &&
      (referencesActiveTaskDraft(input.prompt) ||
        isSimpleDraftAffirmation(input.prompt)),
    )
    const proposedDraft =
      continuesActiveDraft && input.activeTaskDraft
        ? mergeTaskDraft(
            input.activeTaskDraft.draft,
            result.action.draft,
            input.prompt,
          )
        : result.action.draft
    const facts = userMessages(input).join('\n').trim().slice(-1_000)
    const draft = polishTaskDraft(proposedDraft, facts, {
      currentPrompt: input.prompt,
      fallbackTitle: continuesActiveDraft
        ? undefined
        : taskTitle(taskSourceText(input)),
      previousDraft: continuesActiveDraft ? input.activeTaskDraft?.draft : null,
    })
    return {
      ...result,
      reply:
        'El borrador quedó guardado para que lo revises. La tarea todavía no se ha creado; puedes modificar sus datos antes de confirmar.',
      action: {
        ...result.action,
        label: 'Revisar y crear',
        draft,
        draftId: continuesActiveDraft ? input.activeTaskDraft?.id : null,
        draftStatus: 'ready_for_review',
        task: null,
      },
    }
  }

  if (result.action) {
    const fallback = taskDecision(input)
    return fallback
      ? { ...fallback, provider: result.provider }
      : safeReplyWithoutAction(result)
  }

  const fallback = taskDecision(input)
  return fallback
    ? { ...fallback, provider: result.provider }
    : safeReplyWithoutAction(result)
}

function enforceActionReplyInvariant(result: DucoAiResult) {
  return result.action ? result : safeReplyWithoutAction(result)
}

export async function buildDucoAiReply(
  input: BuildDucoReplyInput,
): Promise<DucoAiResult> {
  const workflow = deterministicWorkflow(input)
  if (workflow) return enforceActionReplyInvariant(workflow)

  if (env.DUCO_AI_PROVIDER === 'local') {
    return enforceActionReplyInvariant(
      taskDecision(input) ?? {
        reply: input.localReply,
        action: null,
        provider: 'local',
      },
    )
  }

  try {
    const result =
      env.DUCO_AI_PROVIDER === 'openai'
        ? await queryOpenAi(input)
        : await queryOllama(input)
    return enforceActionReplyInvariant(validateModelResult(input, result))
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error'
    console.warn(
      `[DUCO] ${env.DUCO_AI_PROVIDER} unavailable; using local fallback: ${reason}`,
    )
    return enforceActionReplyInvariant(
      taskDecision(input) ?? {
        reply: input.localReply,
        action: null,
        provider: 'local',
      },
    )
  }
}
