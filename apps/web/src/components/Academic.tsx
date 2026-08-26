import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import {
  createAcademicCourse,
  createAcademicTask,
  deleteAcademicTask,
  getAcademicDashboard,
  updateAcademicTask,
  type AcademicDashboard,
  type AcademicTask,
} from '../api/academic'
import { AvaCalendarSync } from './AvaCalendarSync'
import './Academic.css'

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function readableError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'No pudimos completar la acción.'
}

export function Academic() {
  const [dashboard, setDashboard] = useState<AcademicDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [courseFormOpen, setCourseFormOpen] = useState(false)
  const [taskFormOpen, setTaskFormOpen] = useState(false)
  const [courseDraft, setCourseDraft] = useState({
    name: '',
    code: '',
    section: '',
    term: '',
  })
  const [taskDraft, setTaskDraft] = useState({
    title: '',
    description: '',
    courseId: '',
    dueAt: '',
    priority: 'medium' as AcademicTask['priority'],
  })

  const load = useCallback(async () => {
    try {
      setError('')
      setDashboard(await getAcademicDashboard())
    } catch (loadError) {
      setError(readableError(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getAcademicDashboard()
      .then((result) => {
        if (!cancelled) setDashboard(result)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(readableError(loadError))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const agenda = useMemo(() => {
    if (!dashboard) return []
    const courseNames = new Map(
      dashboard.courses.map((course) => [course.id, course.name]),
    )
    return [
      ...dashboard.tasks.map((task) => ({
        id: task.id,
        kind: 'task' as const,
        title: task.title,
        description: task.description,
        date: task.dueAt,
        course: task.courseId ? (courseNames.get(task.courseId) ?? null) : null,
        priority: task.priority,
        status: task.status,
      })),
      ...dashboard.events.map((event) => ({
        id: event.id,
        kind: 'ava' as const,
        title: event.title,
        description: event.description,
        date: event.startsAt,
        course: event.courseName,
        priority: 'medium' as const,
        status: 'pending' as const,
      })),
    ].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
  }, [dashboard])

  const submitCourse = async (event: FormEvent) => {
    event.preventDefault()
    setBusyId('course')
    try {
      await createAcademicCourse(courseDraft)
      setCourseDraft({ name: '', code: '', section: '', term: '' })
      setCourseFormOpen(false)
      await load()
    } catch (submitError) {
      setError(readableError(submitError))
    } finally {
      setBusyId(null)
    }
  }

  const submitTask = async (event: FormEvent) => {
    event.preventDefault()
    setBusyId('task')
    try {
      await createAcademicTask({
        title: taskDraft.title,
        description: taskDraft.description,
        courseId: taskDraft.courseId || null,
        dueAt: taskDraft.dueAt ? new Date(taskDraft.dueAt).toISOString() : null,
        priority: taskDraft.priority,
      })
      setTaskDraft({
        title: '',
        description: '',
        courseId: '',
        dueAt: '',
        priority: 'medium',
      })
      setTaskFormOpen(false)
      await load()
    } catch (submitError) {
      setError(readableError(submitError))
    } finally {
      setBusyId(null)
    }
  }

  const changeTaskStatus = async (
    taskId: string,
    status: AcademicTask['status'],
  ) => {
    setBusyId(taskId)
    try {
      await updateAcademicTask(taskId, { status })
      await load()
    } catch (taskError) {
      setError(readableError(taskError))
    } finally {
      setBusyId(null)
    }
  }

  const removeTask = async (taskId: string) => {
    if (!window.confirm('¿Quieres eliminar esta tarea personal?')) return
    setBusyId(taskId)
    try {
      await deleteAcademicTask(taskId)
      await load()
    } catch (taskError) {
      setError(readableError(taskError))
    } finally {
      setBusyId(null)
    }
  }

  if (loading)
    return (
      <div className="academic-loading">Preparando tu espacio académico…</div>
    )

  return (
    <section className="academic-layout">
      {error && (
        <p className="academic-error" role="alert">
          {error}
        </p>
      )}
      <div className="academic-summary">
        <div>
          <span>Materias activas</span>
          <strong>{dashboard?.courses.length ?? 0}</strong>
        </div>
        <div>
          <span>Tareas abiertas</span>
          <strong>
            {dashboard?.tasks.filter((t) => t.status !== 'completed').length ??
              0}
          </strong>
        </div>
        <div>
          <span>Eventos de AVA</span>
          <strong>{dashboard?.events.length ?? 0}</strong>
        </div>
        <div className="academic-sync">
          <AvaCalendarSync onSynchronized={() => void load()} />
        </div>
      </div>

      <div className="academic-columns">
        <section className="academic-panel">
          <header>
            <div>
              <span>Tu carga académica</span>
              <h2>Materias</h2>
            </div>
            <button
              type="button"
              onClick={() => setCourseFormOpen((value) => !value)}
            >
              + Añadir materia
            </button>
          </header>
          {courseFormOpen && (
            <form className="academic-form" onSubmit={submitCourse}>
              <label>
                Nombre
                <input
                  required
                  maxLength={300}
                  value={courseDraft.name}
                  onChange={(e) =>
                    setCourseDraft({ ...courseDraft, name: e.target.value })
                  }
                />
              </label>
              <div>
                <label>
                  Código
                  <input
                    maxLength={80}
                    value={courseDraft.code}
                    onChange={(e) =>
                      setCourseDraft({ ...courseDraft, code: e.target.value })
                    }
                  />
                </label>
                <label>
                  Sección
                  <input
                    maxLength={80}
                    value={courseDraft.section}
                    onChange={(e) =>
                      setCourseDraft({
                        ...courseDraft,
                        section: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Periodo
                <input
                  maxLength={100}
                  placeholder="Ej. Segundo semestre 2026"
                  value={courseDraft.term}
                  onChange={(e) =>
                    setCourseDraft({ ...courseDraft, term: e.target.value })
                  }
                />
              </label>
              <button disabled={busyId === 'course'}>
                {busyId === 'course' ? 'Guardando…' : 'Guardar materia'}
              </button>
            </form>
          )}
          <div className="academic-course-list">
            {!dashboard?.courses.length ? (
              <p className="academic-empty">
                AVA no informó materias. Puedes añadirlas manualmente.
              </p>
            ) : (
              dashboard.courses.map((course) => (
                <article key={course.id}>
                  <span className="academic-course-mark">
                    {course.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <h3>{course.name}</h3>
                    <p>
                      {[
                        course.code,
                        course.section && `Sección ${course.section}`,
                        course.term,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Sin detalles adicionales'}
                    </p>
                  </div>
                  <small>{course.source === 'ava' ? 'AVA' : 'Manual'}</small>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="academic-panel academic-panel--agenda">
          <header>
            <div>
              <span>Planificación</span>
              <h2>Próximas tareas</h2>
            </div>
            <button
              type="button"
              onClick={() => setTaskFormOpen((value) => !value)}
            >
              + Crear tarea
            </button>
          </header>
          {taskFormOpen && (
            <form className="academic-form" onSubmit={submitTask}>
              <label>
                Título
                <input
                  required
                  maxLength={160}
                  value={taskDraft.title}
                  onChange={(e) =>
                    setTaskDraft({ ...taskDraft, title: e.target.value })
                  }
                />
              </label>
              <label>
                Materia
                <select
                  value={taskDraft.courseId}
                  onChange={(e) =>
                    setTaskDraft({ ...taskDraft, courseId: e.target.value })
                  }
                >
                  <option value="">Sin materia</option>
                  {dashboard?.courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <label>
                  Fecha
                  <input
                    type="datetime-local"
                    value={taskDraft.dueAt}
                    onChange={(e) =>
                      setTaskDraft({ ...taskDraft, dueAt: e.target.value })
                    }
                  />
                </label>
                <label>
                  Prioridad
                  <select
                    value={taskDraft.priority}
                    onChange={(e) =>
                      setTaskDraft({
                        ...taskDraft,
                        priority: e.target.value as AcademicTask['priority'],
                      })
                    }
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                  </select>
                </label>
              </div>
              <label>
                Descripción
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={taskDraft.description}
                  onChange={(e) =>
                    setTaskDraft({ ...taskDraft, description: e.target.value })
                  }
                />
              </label>
              <button disabled={busyId === 'task'}>
                {busyId === 'task' ? 'Guardando…' : 'Guardar tarea'}
              </button>
            </form>
          )}
          <div className="academic-agenda-list">
            {!agenda.length ? (
              <p className="academic-empty">
                No hay eventos ni tareas. Crea tu primer pendiente.
              </p>
            ) : (
              agenda.map((item) => (
                <article
                  className={`academic-agenda-item academic-agenda-item--${item.status}`}
                  key={`${item.kind}-${item.id}`}
                >
                  <span
                    className={`academic-priority academic-priority--${item.priority}`}
                  />
                  <div>
                    <div>
                      <small>
                        {item.kind === 'ava'
                          ? 'Evento AVA'
                          : item.course || 'Tarea personal'}
                      </small>
                      <h3>{item.title}</h3>
                    </div>
                    {item.description && <p>{item.description}</p>}
                    <time>
                      {item.date
                        ? dateFormatter.format(new Date(item.date))
                        : 'Sin fecha límite'}
                    </time>
                  </div>
                  {item.kind === 'task' && (
                    <div className="academic-task-actions">
                      <button
                        disabled={busyId === item.id}
                        onClick={() =>
                          void changeTaskStatus(
                            item.id,
                            item.status === 'completed'
                              ? 'pending'
                              : 'completed',
                          )
                        }
                      >
                        {item.status === 'completed' ? 'Reabrir' : 'Completar'}
                      </button>
                      <button
                        disabled={busyId === item.id}
                        onClick={() => void removeTask(item.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  )
}
