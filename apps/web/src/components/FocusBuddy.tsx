import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import {
  createStudySession,
  getStudyOverview,
  updateStudySession,
  type StudyMethod,
  type StudyOverview,
  type StudySession,
} from '../api/study'
import {
  getAcademicDashboard,
  type AcademicCourse,
  type AcademicTask,
} from '../api/academic'
import { FocusAvatar, type AvatarMood } from './FocusAvatar'
import { FocusBuddyDesktopDownload } from './FocusBuddyDesktopDownload'
import './FocusBuddy.css'

type MethodDefinition = {
  id: StudyMethod
  name: string
  shortName: string
  description: string
  focusMinutes: number
  breakMinutes: number
}

type FocusBuddyDesktopBridge = {
  updateSessionState?: (state: {
    status: 'idle' | 'active' | 'paused' | 'completed'
    sessionId: string | null
    title: string
    course: string | null
    timerLabel: string
    timerFinished: boolean
  }) => void
}

const METHODS: MethodDefinition[] = [
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    shortName: '25 / 5',
    description: 'Un bloque breve para comenzar sin fricción.',
    focusMinutes: 25,
    breakMinutes: 5,
  },
  {
    id: 'pomodoro_extended',
    name: 'Pomodoro extendido',
    shortName: '50 / 10',
    description: 'Más tiempo de concentración y una pausa amplia.',
    focusMinutes: 50,
    breakMinutes: 10,
  },
  {
    id: 'deep_work',
    name: 'Trabajo profundo',
    shortName: '90 / 20',
    description: 'Para proyectos exigentes y sin interrupciones.',
    focusMinutes: 90,
    breakMinutes: 20,
  },
  {
    id: 'flowtime',
    name: 'Flowtime',
    shortName: 'Libre',
    description: 'Cronómetro abierto: detente al perder concentración.',
    focusMinutes: 0,
    breakMinutes: 0,
  },
  {
    id: 'custom',
    name: 'Personalizado',
    shortName: 'A tu ritmo',
    description: 'Define la duración que mejor se adapte a ti.',
    focusMinutes: 40,
    breakMinutes: 10,
  },
]

const STATUS_LABELS: Record<StudySession['status'], string> = {
  active: 'En curso',
  paused: 'En pausa',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

const METHOD_NAMES = Object.fromEntries(
  METHODS.map((method) => [method.id, method.name]),
) as Record<StudyMethod, string>

const dateTimeFormatter = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function readableError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'No pudimos completar la acción. Inténtalo nuevamente.'
}

function formatTimer(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.max(0, Math.round(totalSeconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`
}

function methodFor(method: StudyMethod): MethodDefinition {
  return METHODS.find((option) => option.id === method) ?? METHODS[0]!
}

function sessionCourseName(session: StudySession) {
  return session.course?.name ?? 'Sin asignatura'
}

function upsertRecentSession(
  overview: StudyOverview,
  session: StudySession,
): StudySession[] {
  return [
    session,
    ...overview.recentSessions.filter((item) => item.id !== session.id),
  ].slice(0, 8)
}

export function FocusBuddy() {
  const [overview, setOverview] = useState<StudyOverview | null>(null)
  const [courses, setCourses] = useState<AcademicCourse[]>([])
  const [tasks, setTasks] = useState<AcademicTask[]>([])
  const [selectedMethod, setSelectedMethod] = useState<StudyMethod>('pomodoro')
  const [courseId, setCourseId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [customFocusMinutes, setCustomFocusMinutes] = useState(40)
  const [customBreakMinutes, setCustomBreakMinutes] = useState(10)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [overviewLoadState, setOverviewLoadState] = useState<
    'loading' | 'ready' | 'error'
  >('loading')
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [sessionSnapshotAt, setSessionSnapshotAt] = useState(() => Date.now())
  const [justCompleted, setJustCompleted] = useState(false)
  const mountedRef = useRef(true)
  const loadRequestRef = useRef(0)
  const mutationInFlightRef = useRef(false)
  const heartbeatResponseVersionRef = useRef(0)

  const timeZone = useMemo(
    () =>
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago',
    [],
  )

  const load = useCallback(
    async (allowDuringMutation = false) => {
      if (mutationInFlightRef.current && !allowDuringMutation) return
      const requestId = ++loadRequestRef.current
      setLoading(true)
      setLoadError('')
      setOverviewLoadState('loading')
      const [studyResult, academicResult] = await Promise.allSettled([
        getStudyOverview(timeZone),
        getAcademicDashboard(),
      ])
      if (!mountedRef.current || requestId !== loadRequestRef.current) return

      const failures: string[] = []
      if (studyResult.status === 'fulfilled') {
        setOverview(studyResult.value)
        setSessionSnapshotAt(Date.now())
        setOverviewLoadState('ready')
      } else {
        setOverviewLoadState('error')
        failures.push(
          `No pudimos recuperar tu sesión: ${readableError(studyResult.reason)}`,
        )
      }

      if (academicResult.status === 'fulfilled') {
        const activeCourses = academicResult.value.courses.filter(
          (course) => course.active,
        )
        const activeCourseIds = new Set(
          activeCourses.map((course) => course.id),
        )
        setCourses(activeCourses)
        setTasks(
          academicResult.value.tasks.filter(
            (task) =>
              task.status !== 'completed' &&
              (!task.courseId || activeCourseIds.has(task.courseId)),
          ),
        )
      } else {
        failures.push(
          `No pudimos recuperar materias y tareas: ${readableError(academicResult.reason)}`,
        )
      }

      setLoadError(failures.join(' '))
      setLoading(false)
    },
    [timeZone],
  )

  useEffect(() => {
    mountedRef.current = true
    const initialLoad = window.setTimeout(() => void load(), 0)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.clearTimeout(initialLoad)
      mountedRef.current = false
      loadRequestRef.current += 1
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [load])

  const activeSession = overview?.activeSession ?? null

  useEffect(() => {
    if (activeSession?.status !== 'active') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [activeSession?.id, activeSession?.status])

  useEffect(() => {
    if (!justCompleted) return
    const timer = window.setTimeout(() => setJustCompleted(false), 6_000)
    return () => window.clearTimeout(timer)
  }, [justCompleted])

  useEffect(() => {
    if (activeSession?.status !== 'active') return
    const sessionId = activeSession.id
    let stopped = false

    const heartbeat = async () => {
      if (mutationInFlightRef.current) return
      const responseVersion = heartbeatResponseVersionRef.current
      try {
        const updated = await updateStudySession(sessionId, 'heartbeat')
        if (
          stopped ||
          !mountedRef.current ||
          responseVersion !== heartbeatResponseVersionRef.current
        )
          return
        setOverview((current) =>
          current
            ? {
                ...current,
                activeSession: updated,
                recentSessions: upsertRecentSession(current, updated),
              }
            : current,
        )
        setSessionSnapshotAt(Date.now())
        setNow(Date.now())
        setActionError('')
        setOverviewLoadState('ready')
        if (updated.status === 'paused') {
          setNotice(
            'La sesión se pausó automáticamente porque FocusBuddy perdió conexión. Puedes reanudarla cuando quieras.',
          )
        }
      } catch (heartbeatError) {
        if (
          !stopped &&
          mountedRef.current &&
          responseVersion === heartbeatResponseVersionRef.current
        ) {
          setActionError(readableError(heartbeatError))
          setOverviewLoadState('error')
        }
      }
    }

    const timer = window.setInterval(() => void heartbeat(), 30_000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [activeSession?.id, activeSession?.status])

  const elapsedSeconds = useMemo(() => {
    if (!activeSession) return 0
    const elapsedAtSnapshot = Math.max(
      0,
      activeSession.effectiveFocusedSeconds ??
        activeSession.focusedSeconds ??
        0,
    )
    if (activeSession.status !== 'active') return elapsedAtSnapshot
    return (
      elapsedAtSnapshot +
      Math.max(0, Math.floor((now - sessionSnapshotAt) / 1000))
    )
  }, [activeSession, now, sessionSnapshotAt])

  const isFlowtime = activeSession?.method === 'flowtime'
  const remainingSeconds = activeSession
    ? Math.max(0, activeSession.plannedDurationSeconds - elapsedSeconds)
    : 0
  const timerFinished = Boolean(
    activeSession && !isFlowtime && remainingSeconds === 0,
  )
  const timerValue = isFlowtime ? elapsedSeconds : remainingSeconds
  const selectedDefinition = methodFor(selectedMethod)
  const focusMinutes =
    selectedMethod === 'custom'
      ? customFocusMinutes
      : selectedDefinition.focusMinutes
  const breakMinutes =
    selectedMethod === 'custom'
      ? customBreakMinutes
      : selectedDefinition.breakMinutes

  const availableTasks = useMemo(
    () =>
      tasks.filter(
        (task) => !courseId || !task.courseId || task.courseId === courseId,
      ),
    [courseId, tasks],
  )

  const avatarMood: AvatarMood = justCompleted
    ? 'completed'
    : activeSession?.status === 'active'
      ? 'focus'
      : activeSession?.status === 'paused'
        ? 'paused'
        : 'idle'

  useEffect(() => {
    if (!overview) return
    const bridge = (
      window as Window & { focusBuddyDesktop?: FocusBuddyDesktopBridge }
    ).focusBuddyDesktop
    if (!bridge?.updateSessionState) return

    bridge.updateSessionState({
      status: justCompleted
        ? 'completed'
        : activeSession?.status === 'active'
          ? 'active'
          : activeSession?.status === 'paused'
            ? 'paused'
            : 'idle',
      sessionId: activeSession?.id ?? null,
      title:
        activeSession?.task?.title ??
        activeSession?.course?.name ??
        (justCompleted ? 'Sesión completada' : 'Listo para estudiar'),
      course: activeSession?.course?.name ?? null,
      timerLabel: activeSession ? formatTimer(timerValue) : '--:--',
      timerFinished,
    })
  }, [activeSession, justCompleted, overview, timerFinished, timerValue])

  const startSession = async (event: FormEvent) => {
    event.preventDefault()
    if (activeSession || mutationInFlightRef.current) return
    if (!overview || overviewLoadState !== 'ready') {
      setActionError(
        'Primero necesitamos comprobar tu sesión activa. Pulsa “Reintentar” antes de comenzar.',
      )
      return
    }
    if (
      selectedMethod !== 'flowtime' &&
      (focusMinutes < 1 || focusMinutes > 240)
    ) {
      setActionError(
        'El bloque de concentración debe durar entre 1 y 240 minutos.',
      )
      return
    }
    if (breakMinutes < 0 || breakMinutes > 120) {
      setActionError('La pausa debe durar entre 0 y 120 minutos.')
      return
    }

    mutationInFlightRef.current = true
    heartbeatResponseVersionRef.current += 1
    // Una recarga iniciada justo antes del clic no debe sobrescribir la sesión
    // recién creada con una fotografía anterior del servidor.
    loadRequestRef.current += 1
    setLoading(false)
    setOverviewLoadState('ready')
    setBusyAction('start')
    setActionError('')
    setNotice('')
    setJustCompleted(false)
    try {
      const result = await createStudySession({
        clientRequestId: crypto.randomUUID(),
        method: selectedMethod,
        courseId: courseId || null,
        taskId: taskId || null,
        plannedDurationSeconds:
          selectedMethod === 'flowtime' ? 0 : focusMinutes * 60,
        breakDurationSeconds: breakMinutes * 60,
      })
      if (!mountedRef.current) return
      setOverview((current) =>
        current
          ? {
              ...current,
              activeSession: result.session,
              recentSessions: upsertRecentSession(current, result.session),
            }
          : current,
      )
      setSessionSnapshotAt(Date.now())
      setNow(Date.now())
      setOverviewLoadState('ready')
      setNotice('Sesión iniciada. Tu avance quedará sincronizado en Konea.')
    } catch (startError) {
      if (mountedRef.current) setActionError(readableError(startError))
    } finally {
      mutationInFlightRef.current = false
      if (mountedRef.current) setBusyAction(null)
    }
  }

  const runAction = async (
    action: 'pause' | 'resume' | 'complete' | 'cancel',
  ) => {
    if (!activeSession || mutationInFlightRef.current) return
    if (
      action === 'cancel' &&
      !window.confirm(
        '¿Cancelar esta sesión? El tiempo acumulado no se sumará a tus estadísticas.',
      )
    ) {
      return
    }

    mutationInFlightRef.current = true
    heartbeatResponseVersionRef.current += 1
    // Invalida un overview concurrente; la respuesta de esta transición es la
    // fuente más reciente para el estado de la sesión.
    loadRequestRef.current += 1
    setLoading(false)
    setOverviewLoadState('ready')
    setBusyAction(action)
    setActionError('')
    setNotice('')
    try {
      const updated = await updateStudySession(activeSession.id, action)
      if (!mountedRef.current) return
      if (action === 'complete' || action === 'cancel') {
        setJustCompleted(action === 'complete')
        setOverview((current) =>
          current
            ? {
                ...current,
                activeSession: null,
                recentSessions: upsertRecentSession(current, updated),
              }
            : current,
        )
        setNotice(
          action === 'complete'
            ? `Sesión guardada: ${formatDuration(updated.effectiveFocusedSeconds)} de concentración.`
            : 'La sesión fue cancelada.',
        )
        await load(true)
      } else {
        setOverview((current) =>
          current
            ? {
                ...current,
                activeSession: updated,
                recentSessions: upsertRecentSession(current, updated),
              }
            : current,
        )
        setSessionSnapshotAt(Date.now())
        setNow(Date.now())
        setOverviewLoadState('ready')
        setNotice(action === 'pause' ? 'Sesión pausada.' : 'Sesión reanudada.')
      }
    } catch (actionError) {
      if (mountedRef.current) setActionError(readableError(actionError))
    } finally {
      mutationInFlightRef.current = false
      if (mountedRef.current) setBusyAction(null)
    }
  }

  const byDay = overview?.byDay ?? []
  const maxDaySeconds = Math.max(1, ...byDay.map((day) => day.focusedSeconds))
  const byCourse = overview?.byCourse ?? []
  const maxCourseSeconds = Math.max(
    1,
    ...byCourse.map((course) => course.focusedSeconds),
  )
  const syncState =
    overviewLoadState === 'loading'
      ? { label: 'Comprobando tu progreso…', tone: 'loading' }
      : overviewLoadState === 'ready'
        ? { label: 'Progreso sincronizado', tone: 'ready' }
        : overview
          ? { label: 'Progreso sin actualizar', tone: 'error' }
          : { label: 'Progreso no disponible', tone: 'error' }

  if (loading && !overview) {
    return (
      <section className="focus-buddy focus-buddy--loading" aria-busy="true">
        <div className="focus-loading-orbit" aria-hidden="true" />
        <p>Preparando tu espacio de concentración…</p>
      </section>
    )
  }

  return (
    <section className="focus-buddy" aria-labelledby="focus-buddy-title">
      <header className="focus-buddy__hero">
        <div>
          <span className="focus-eyebrow">Centro de estudio</span>
          <h2 id="focus-buddy-title">Tu espacio de concentración</h2>
          <p>
            Organiza una sesión, mantén el ritmo y revisa tu progreso sin salir
            de Konea.
          </p>
        </div>
        <span
          className={`focus-buddy__sync-state focus-buddy__sync-state--${syncState.tone}`}
          role="status"
        >
          <i aria-hidden="true" /> {syncState.label}
        </span>
      </header>

      <FocusBuddyDesktopDownload />

      {loadError && (
        <div className="focus-feedback focus-feedback--error" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}
      {actionError && (
        <p className="focus-feedback focus-feedback--error" role="alert">
          {actionError}
        </p>
      )}
      {notice && (
        <p className="focus-feedback focus-feedback--notice" role="status">
          {notice}
        </p>
      )}

      <div className="focus-buddy__workspace">
        <section
          className="focus-session-card"
          aria-labelledby="focus-session-title"
        >
          {activeSession ? (
            <div className="focus-session-active">
              <div className="focus-session-active__heading">
                <div>
                  <span className="focus-eyebrow">
                    {activeSession.status === 'paused'
                      ? 'Sesión en pausa'
                      : timerFinished
                        ? 'Bloque cumplido'
                        : 'Concentración en curso'}
                  </span>
                  <h2 id="focus-session-title">
                    {activeSession.task?.title ??
                      activeSession.course?.name ??
                      'Sesión libre'}
                  </h2>
                </div>
                <span
                  className={`focus-status focus-status--${activeSession.status}`}
                >
                  {STATUS_LABELS[activeSession.status]}
                </span>
              </div>

              <div
                className={`focus-timer ${timerFinished ? 'focus-timer--finished' : ''}`}
                role="timer"
                aria-label={
                  isFlowtime
                    ? `${formatDuration(timerValue)} transcurridos`
                    : `${formatDuration(timerValue)} restantes`
                }
              >
                <span>{formatTimer(timerValue)}</span>
                <small>
                  {isFlowtime
                    ? 'tiempo concentrado'
                    : timerFinished
                      ? 'objetivo alcanzado'
                      : 'tiempo restante'}
                </small>
              </div>

              <div className="focus-session-meta">
                <span>{METHOD_NAMES[activeSession.method]}</span>
                <span>{sessionCourseName(activeSession)}</span>
                {activeSession.breakDurationSeconds > 0 && (
                  <span>
                    Pausa sugerida:{' '}
                    {formatDuration(activeSession.breakDurationSeconds)}
                  </span>
                )}
              </div>

              {timerFinished && activeSession.status === 'active' && (
                <p className="focus-session-complete-hint" role="status">
                  Completaste el bloque planificado. Finaliza la sesión para
                  guardar tu progreso y tomar tu pausa.
                </p>
              )}

              <div className="focus-session-controls">
                {activeSession.status === 'active' ? (
                  <button
                    type="button"
                    className="focus-button focus-button--secondary"
                    disabled={busyAction !== null}
                    onClick={() => void runAction('pause')}
                  >
                    <span aria-hidden="true">Ⅱ</span>
                    {busyAction === 'pause' ? 'Pausando…' : 'Pausar'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="focus-button focus-button--primary"
                    disabled={busyAction !== null}
                    onClick={() => void runAction('resume')}
                  >
                    <span aria-hidden="true">▶</span>
                    {busyAction === 'resume' ? 'Reanudando…' : 'Reanudar'}
                  </button>
                )}
                <button
                  type="button"
                  className="focus-button focus-button--success"
                  disabled={busyAction !== null}
                  onClick={() => void runAction('complete')}
                >
                  <span aria-hidden="true">✓</span>
                  {busyAction === 'complete' ? 'Guardando…' : 'Finalizar'}
                </button>
                <button
                  type="button"
                  className="focus-button focus-button--quiet"
                  disabled={busyAction !== null}
                  onClick={() => void runAction('cancel')}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <form className="focus-session-setup" onSubmit={startSession}>
              <div>
                <span className="focus-eyebrow">Nueva sesión</span>
                <h2 id="focus-session-title">Elige cómo quieres estudiar</h2>
              </div>

              <fieldset className="focus-methods">
                <legend className="sr-only">Método de estudio</legend>
                {METHODS.map((method) => (
                  <label
                    key={method.id}
                    className={`focus-method ${selectedMethod === method.id ? 'focus-method--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="study-method"
                      value={method.id}
                      checked={selectedMethod === method.id}
                      onChange={() => setSelectedMethod(method.id)}
                    />
                    <span className="focus-method__check" aria-hidden="true" />
                    <strong>{method.name}</strong>
                    <b>{method.shortName}</b>
                    <small>{method.description}</small>
                  </label>
                ))}
              </fieldset>

              {selectedMethod === 'custom' && (
                <div className="focus-custom-times">
                  <label>
                    Concentración (minutos)
                    <input
                      type="number"
                      min="1"
                      max="240"
                      required
                      value={customFocusMinutes}
                      onChange={(event) =>
                        setCustomFocusMinutes(Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    Pausa (minutos)
                    <input
                      type="number"
                      min="0"
                      max="120"
                      required
                      value={customBreakMinutes}
                      onChange={(event) =>
                        setCustomBreakMinutes(Number(event.target.value))
                      }
                    />
                  </label>
                </div>
              )}

              <div className="focus-session-fields">
                <label>
                  Asignatura <small>(opcional)</small>
                  <select
                    value={courseId}
                    onChange={(event) => {
                      const nextCourseId = event.target.value
                      setCourseId(nextCourseId)
                      const selectedTask = tasks.find(
                        (task) => task.id === taskId,
                      )
                      if (
                        selectedTask?.courseId &&
                        selectedTask.courseId !== nextCourseId
                      ) {
                        setTaskId('')
                      }
                    }}
                  >
                    <option value="">Sesión libre</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                        {course.section ? ` · ${course.section}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tarea <small>(opcional)</small>
                  <select
                    value={taskId}
                    onChange={(event) => {
                      const value = event.target.value
                      setTaskId(value)
                      const task = tasks.find((item) => item.id === value)
                      if (task?.courseId) setCourseId(task.courseId)
                    }}
                  >
                    <option value="">Sin tarea vinculada</option>
                    {availableTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="focus-session-preview">
                <div>
                  <span aria-hidden="true">◷</span>
                  <p>
                    <strong>
                      {selectedMethod === 'flowtime'
                        ? 'Sin límite'
                        : `${focusMinutes} min de enfoque`}
                    </strong>
                    <small>
                      {breakMinutes > 0
                        ? `${breakMinutes} min de pausa sugerida`
                        : selectedMethod === 'flowtime'
                          ? 'Finaliza cuando pierdas el estado de flujo'
                          : 'Sin pausa programada'}
                    </small>
                  </p>
                </div>
                <button
                  type="submit"
                  className="focus-button focus-button--primary"
                  disabled={
                    busyAction !== null || overviewLoadState !== 'ready'
                  }
                >
                  <span aria-hidden="true">▶</span>
                  {busyAction === 'start'
                    ? 'Iniciando…'
                    : overviewLoadState !== 'ready'
                      ? 'Comprueba tu sesión para comenzar'
                      : 'Comenzar sesión'}
                </button>
              </div>
            </form>
          )}
        </section>

        <aside
          className="focus-buddy__companion"
          aria-label="Compañero de estudio"
        >
          <FocusAvatar mood={avatarMood} />
        </aside>
      </div>

      <section
        className="focus-dashboard"
        aria-labelledby="focus-dashboard-title"
      >
        <div className="focus-dashboard__heading">
          <div>
            <span className="focus-eyebrow">Tu progreso</span>
            <h2 id="focus-dashboard-title">Panel de concentración</h2>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || busyAction !== null}
          >
            {loading ? 'Actualizando…' : 'Actualizar datos'}
          </button>
        </div>

        {overview ? (
          <>
            <div className="focus-metrics">
              <article>
                <span>Hoy</span>
                <strong>
                  {formatDuration(overview.stats.todayFocusedSeconds)}
                </strong>
                <small>tiempo concentrado</small>
              </article>
              <article>
                <span>Esta semana</span>
                <strong>
                  {formatDuration(overview.stats.weekFocusedSeconds)}
                </strong>
                <small>en sesiones completadas</small>
              </article>
              <article>
                <span>Tiempo total</span>
                <strong>
                  {formatDuration(overview.stats.totalFocusedSeconds)}
                </strong>
                <small>concentración acumulada</small>
              </article>
              <article>
                <span>Sesiones</span>
                <strong>{overview.stats.totalSessions}</strong>
                <small>{overview.stats.completedSessions} completadas</small>
              </article>
              <article>
                <span>Racha actual</span>
                <strong>{overview.stats.currentStreakDays} días</strong>
                <small>
                  Mejor: {overview.stats.bestStreakDays}{' '}
                  {overview.stats.bestStreakDays === 1 ? 'día' : 'días'}
                </small>
              </article>
            </div>

            <div className="focus-dashboard__grid">
              <article className="focus-chart-card">
                <header>
                  <div>
                    <span>Últimos 7 días</span>
                    <h3>Ritmo semanal</h3>
                  </div>
                  <strong>
                    {formatDuration(overview.stats.weekFocusedSeconds)}
                  </strong>
                </header>
                {byDay.length ? (
                  <div className="focus-week-chart">
                    {byDay.map((day) => {
                      const height = Math.max(
                        day.focusedSeconds ? 8 : 2,
                        Math.round((day.focusedSeconds / maxDaySeconds) * 100),
                      )
                      const date = new Date(`${day.date}T12:00:00`)
                      return (
                        <div
                          key={day.date}
                          aria-label={`${date.toLocaleDateString('es-CL', { weekday: 'long' })}: ${formatDuration(day.focusedSeconds)}, ${day.sessions} sesiones`}
                        >
                          <span className="focus-week-chart__value">
                            {day.focusedSeconds
                              ? Math.round(day.focusedSeconds / 60)
                              : '–'}
                          </span>
                          <i
                            style={
                              { '--bar-height': `${height}%` } as CSSProperties
                            }
                            aria-hidden="true"
                          />
                          <small>
                            {date
                              .toLocaleDateString('es-CL', { weekday: 'short' })
                              .replace('.', '')}
                          </small>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="focus-empty-state">
                    Completa tu primera sesión para comenzar a visualizar tu
                    ritmo.
                  </p>
                )}
              </article>

              <article className="focus-chart-card">
                <header>
                  <div>
                    <span>Distribución</span>
                    <h3>Tiempo por asignatura</h3>
                  </div>
                </header>
                {byCourse.length ? (
                  <div className="focus-course-chart">
                    {byCourse.slice(0, 6).map((course) => {
                      const width = Math.max(
                        3,
                        Math.round(
                          (course.focusedSeconds / maxCourseSeconds) * 100,
                        ),
                      )
                      return (
                        <div key={course.courseId ?? 'without-course'}>
                          <p>
                            <strong>
                              {course.courseName || 'Sin asignatura'}
                            </strong>
                            <span>{formatDuration(course.focusedSeconds)}</span>
                          </p>
                          <span className="focus-course-chart__track">
                            <i
                              style={
                                { '--bar-width': `${width}%` } as CSSProperties
                              }
                            />
                          </span>
                          <small>
                            {course.sessions}{' '}
                            {course.sessions === 1 ? 'sesión' : 'sesiones'}
                          </small>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="focus-empty-state">
                    Vincula una asignatura a tus sesiones para comparar el
                    tiempo.
                  </p>
                )}
              </article>
            </div>

            <article className="focus-recent-card">
              <header>
                <div>
                  <span>Historial</span>
                  <h3>Sesiones recientes</h3>
                </div>
              </header>
              {overview.recentSessions.length ? (
                <div className="focus-recent-list">
                  {overview.recentSessions.slice(0, 8).map((session) => (
                    <div key={session.id}>
                      <span
                        className={`focus-recent-list__mark focus-recent-list__mark--${session.status}`}
                        aria-hidden="true"
                      >
                        {session.status === 'completed' ? '✓' : '•'}
                      </span>
                      <div>
                        <strong>
                          {session.task?.title ?? sessionCourseName(session)}
                        </strong>
                        <small>
                          {METHOD_NAMES[session.method]} ·{' '}
                          {dateTimeFormatter.format(
                            new Date(session.startedAt),
                          )}
                        </small>
                      </div>
                      <span>
                        {formatDuration(session.effectiveFocusedSeconds)}
                      </span>
                      <small>{STATUS_LABELS[session.status]}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="focus-empty-state">
                  Aún no tienes sesiones registradas.
                </p>
              )}
            </article>
          </>
        ) : (
          <div className="focus-dashboard__unavailable" role="status">
            <strong>Tu progreso no está disponible</strong>
            <p>
              No mostramos valores estimados mientras no podamos recuperar el
              resumen de tus sesiones. Reintenta cuando tengas conexión.
            </p>
          </div>
        )}
      </section>
    </section>
  )
}
