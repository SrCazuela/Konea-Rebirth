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
  deactivateAcademicCourse,
  deleteAcademicTask,
  getAcademicDashboard,
  updateAcademicCourse,
  updateAcademicTask,
  type AcademicCourse,
  type AcademicDashboard,
  type AcademicTask,
} from '../api/academic'
import { AvaCalendarSync } from './AvaCalendarSync'
import './Academic.css'

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const allDayDateFormatter = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

type CourseDraft = {
  name: string
  code: string
  section: string
  term: string
}
type TaskDraft = Pick<
  AcademicTask,
  'title' | 'description' | 'courseId' | 'priority' | 'status'
> & { dueAt: string }

const emptyCourseDraft: CourseDraft = {
  name: '',
  code: '',
  section: '',
  term: '',
}
const emptyTaskDraft: TaskDraft = {
  title: '',
  description: '',
  courseId: '',
  dueAt: '',
  priority: 'medium',
  status: 'pending',
}

function readableError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'No pudimos completar la acción.'
}

function toLocalDateTimeInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatAgendaDate(value: string | null, allDay: boolean) {
  if (!value) return 'Sin fecha límite'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'
  return allDay
    ? `${allDayDateFormatter.format(date)} · Todo el día`
    : dateFormatter.format(date)
}

const statusLabels: Record<AcademicTask['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completada',
}

export function Academic() {
  const [dashboard, setDashboard] = useState<AcademicDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [courseFormOpen, setCourseFormOpen] = useState(false)
  const [taskFormOpen, setTaskFormOpen] = useState(false)
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [agendaView, setAgendaView] = useState<'open' | 'completed'>('open')
  const [courseDraft, setCourseDraft] = useState<CourseDraft>(emptyCourseDraft)
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(emptyTaskDraft)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      setError('')
      setDashboard(await getAcademicDashboard())
    } catch (loadError) {
      setError(readableError(loadError))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getAcademicDashboard()
      .then((result) => {
        if (!cancelled) {
          setDashboard(result)
          setError('')
        }
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

  const openAgenda = useMemo(() => {
    if (!dashboard) return []
    const courseNames = new Map(
      [...dashboard.courses, ...dashboard.archivedCourses].map((course) => [
        course.id,
        course.name,
      ]),
    )
    return [
      ...dashboard.tasks
        .filter((task) => task.status !== 'completed')
        .map((task) => ({
          id: task.id,
          kind: 'task' as const,
          title: task.title,
          description: task.description,
          date: task.dueAt,
          allDay: false,
          course: task.courseId
            ? (courseNames.get(task.courseId) ?? 'Materia archivada')
            : null,
          priority: task.priority,
          status: task.status,
          task,
        })),
      ...dashboard.events.map((event) => ({
        id: event.id,
        kind: 'ava' as const,
        title: event.title,
        description: event.description,
        date: event.startsAt,
        allDay: event.allDay,
        course: event.courseName,
        priority: 'medium' as const,
        status: 'pending' as const,
        task: null,
      })),
    ].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
  }, [dashboard])

  const completedAgenda = useMemo(() => {
    if (!dashboard) return []
    const courseNames = new Map(
      [...dashboard.courses, ...dashboard.archivedCourses].map((course) => [
        course.id,
        course.name,
      ]),
    )
    return dashboard.tasks
      .filter((task) => task.status === 'completed')
      .map((task) => ({
        id: task.id,
        kind: 'task' as const,
        title: task.title,
        description: task.description,
        date: task.dueAt,
        allDay: false,
        course: task.courseId
          ? (courseNames.get(task.courseId) ?? 'Materia archivada')
          : null,
        priority: task.priority,
        status: task.status,
        task,
      }))
      .sort((a, b) => b.task.updatedAt.localeCompare(a.task.updatedAt))
  }, [dashboard])

  const visibleAgenda = agendaView === 'open' ? openAgenda : completedAgenda

  const closeCourseForm = () => {
    setCourseFormOpen(false)
    setEditingCourseId(null)
    setCourseDraft(emptyCourseDraft)
  }

  const startNewCourse = () => {
    if (courseFormOpen && !editingCourseId) {
      closeCourseForm()
      return
    }
    setEditingCourseId(null)
    setCourseDraft(emptyCourseDraft)
    setCourseFormOpen(true)
  }

  const startEditingCourse = (course: AcademicCourse) => {
    setEditingCourseId(course.id)
    setCourseDraft({
      name: course.name,
      code: course.code ?? '',
      section: course.section ?? '',
      term: course.term ?? '',
    })
    setCourseFormOpen(true)
  }

  const closeTaskForm = () => {
    setTaskFormOpen(false)
    setEditingTaskId(null)
    setTaskDraft(emptyTaskDraft)
  }

  const startNewTask = () => {
    if (taskFormOpen && !editingTaskId) {
      closeTaskForm()
      return
    }
    setEditingTaskId(null)
    setTaskDraft(emptyTaskDraft)
    setTaskFormOpen(true)
  }

  const startEditingTask = (task: AcademicTask) => {
    setEditingTaskId(task.id)
    setTaskDraft({
      title: task.title,
      description: task.description ?? '',
      courseId: task.courseId ?? '',
      dueAt: toLocalDateTimeInput(task.dueAt),
      priority: task.priority,
      status: task.status,
    })
    setTaskFormOpen(true)
  }

  const submitCourse = async (event: FormEvent) => {
    event.preventDefault()
    const operationId = editingCourseId ?? 'course'
    setBusyId(operationId)
    setError('')
    try {
      if (editingCourseId) {
        await updateAcademicCourse(editingCourseId, courseDraft)
      } else {
        await createAcademicCourse(courseDraft)
      }
      closeCourseForm()
      await load()
    } catch (submitError) {
      setError(readableError(submitError))
    } finally {
      setBusyId(null)
    }
  }

  const submitTask = async (event: FormEvent) => {
    event.preventDefault()
    const operationId = editingTaskId ?? 'task'
    setBusyId(operationId)
    setError('')
    try {
      const payload = {
        title: taskDraft.title,
        description: taskDraft.description ?? '',
        courseId: taskDraft.courseId || null,
        dueAt: taskDraft.dueAt ? new Date(taskDraft.dueAt).toISOString() : null,
        priority: taskDraft.priority,
      }
      if (editingTaskId) {
        await updateAcademicTask(editingTaskId, {
          ...payload,
          status: taskDraft.status,
        })
      } else {
        await createAcademicTask(payload)
      }
      closeTaskForm()
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
    setError('')
    try {
      await updateAcademicTask(taskId, { status })
      await load()
    } catch (taskError) {
      setError(readableError(taskError))
    } finally {
      setBusyId(null)
    }
  }

  const removeCourse = async (course: AcademicCourse) => {
    if (
      !window.confirm(
        `¿Quieres desactivar “${course.name}”? Sus tareas seguirán en tu historial.`,
      )
    )
      return
    setBusyId(course.id)
    setError('')
    try {
      await deactivateAcademicCourse(course.id)
      if (editingCourseId === course.id) closeCourseForm()
      await load()
    } catch (courseError) {
      setError(readableError(courseError))
    } finally {
      setBusyId(null)
    }
  }

  const removeTask = async (taskId: string) => {
    if (!window.confirm('¿Quieres eliminar definitivamente esta tarea?')) return
    setBusyId(taskId)
    setError('')
    try {
      await deleteAcademicTask(taskId)
      if (editingTaskId === taskId) closeTaskForm()
      await load()
    } catch (taskError) {
      setError(readableError(taskError))
    } finally {
      setBusyId(null)
    }
  }

  if (loading)
    return (
      <div className="academic-loading" role="status" aria-live="polite">
        Preparando tu espacio académico…
      </div>
    )

  if (!dashboard)
    return (
      <div className="academic-load-failure" role="alert">
        <p>{error || 'No pudimos cargar tu espacio académico.'}</p>
        <button type="button" disabled={refreshing} onClick={() => void load()}>
          {refreshing ? 'Reintentando…' : 'Reintentar'}
        </button>
      </div>
    )

  return (
    <section className="academic-layout" aria-busy={refreshing || !!busyId}>
      {error && (
        <div className="academic-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>
            Cerrar
          </button>
        </div>
      )}
      <div className="academic-summary">
        <div>
          <span>Materias activas</span>
          <strong>{dashboard.courses.length}</strong>
        </div>
        <div>
          <span>Tareas abiertas</span>
          <strong>
            {
              dashboard.tasks.filter((task) => task.status !== 'completed')
                .length
            }
          </strong>
        </div>
        <div>
          <span>Eventos próximos de AVA</span>
          <strong>{dashboard.events.length}</strong>
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
              aria-expanded={courseFormOpen}
              onClick={startNewCourse}
            >
              {courseFormOpen && !editingCourseId
                ? 'Cerrar'
                : '+ Añadir materia'}
            </button>
          </header>
          {courseFormOpen && (
            <form className="academic-form" onSubmit={submitCourse}>
              <h3>{editingCourseId ? 'Editar materia' : 'Nueva materia'}</h3>
              <label>
                Nombre
                <input
                  required
                  autoFocus
                  maxLength={300}
                  value={courseDraft.name}
                  onChange={(event) =>
                    setCourseDraft({ ...courseDraft, name: event.target.value })
                  }
                />
              </label>
              <div>
                <label>
                  Código
                  <input
                    maxLength={80}
                    value={courseDraft.code ?? ''}
                    onChange={(event) =>
                      setCourseDraft({
                        ...courseDraft,
                        code: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Sección
                  <input
                    maxLength={80}
                    value={courseDraft.section ?? ''}
                    onChange={(event) =>
                      setCourseDraft({
                        ...courseDraft,
                        section: event.target.value,
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
                  value={courseDraft.term ?? ''}
                  onChange={(event) =>
                    setCourseDraft({ ...courseDraft, term: event.target.value })
                  }
                />
              </label>
              <div className="academic-form-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeCourseForm}
                >
                  Cancelar
                </button>
                <button disabled={busyId === (editingCourseId ?? 'course')}>
                  {busyId === (editingCourseId ?? 'course')
                    ? 'Guardando…'
                    : editingCourseId
                      ? 'Guardar cambios'
                      : 'Guardar materia'}
                </button>
              </div>
            </form>
          )}
          <div className="academic-course-list">
            {!dashboard.courses.length ? (
              <p className="academic-empty">
                AVA no informó materias. Puedes añadirlas manualmente.
              </p>
            ) : (
              dashboard.courses.map((course) => (
                <article key={course.id}>
                  <span className="academic-course-mark" aria-hidden="true">
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
                  {course.source === 'ava' ? (
                    <small title="Se actualiza mediante la sincronización con AVA">
                      AVA · Solo lectura
                    </small>
                  ) : (
                    <div className="academic-course-actions">
                      {course.source === 'ava_extension' && (
                        <small title="Importada desde el DOM visible de AVA">
                          AVA experimental
                        </small>
                      )}
                      <button
                        type="button"
                        disabled={busyId === course.id}
                        onClick={() => startEditingCourse(course)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={busyId === course.id}
                        onClick={() => void removeCourse(course)}
                      >
                        Desactivar
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="academic-panel academic-panel--agenda">
          <header>
            <div>
              <span>Planificación</span>
              <h2>
                {agendaView === 'open'
                  ? 'Próximas tareas'
                  : 'Historial de tareas'}
              </h2>
            </div>
            <button
              type="button"
              aria-expanded={taskFormOpen}
              onClick={startNewTask}
            >
              {taskFormOpen && !editingTaskId ? 'Cerrar' : '+ Crear tarea'}
            </button>
          </header>
          <div className="academic-agenda-tabs" aria-label="Filtrar tareas">
            <button
              type="button"
              aria-pressed={agendaView === 'open'}
              onClick={() => setAgendaView('open')}
            >
              Pendientes (
              {openAgenda.filter((item) => item.kind === 'task').length})
            </button>
            <button
              type="button"
              aria-pressed={agendaView === 'completed'}
              onClick={() => setAgendaView('completed')}
            >
              Completadas ({completedAgenda.length})
            </button>
          </div>
          {taskFormOpen && (
            <form className="academic-form" onSubmit={submitTask}>
              <h3>{editingTaskId ? 'Editar tarea' : 'Nueva tarea'}</h3>
              <label>
                Título
                <input
                  required
                  autoFocus
                  maxLength={160}
                  value={taskDraft.title}
                  onChange={(event) =>
                    setTaskDraft({ ...taskDraft, title: event.target.value })
                  }
                />
              </label>
              <label>
                Materia
                <select
                  value={taskDraft.courseId ?? ''}
                  onChange={(event) =>
                    setTaskDraft({ ...taskDraft, courseId: event.target.value })
                  }
                >
                  <option value="">Sin materia</option>
                  {taskDraft.courseId &&
                    dashboard.archivedCourses
                      .filter((course) => course.id === taskDraft.courseId)
                      .map((course) => (
                        <option key={course.id} value={course.id} disabled>
                          {course.name} (desactivada)
                        </option>
                      ))}
                  {dashboard.courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <label>
                  Fecha y hora
                  <input
                    type="datetime-local"
                    value={taskDraft.dueAt}
                    onChange={(event) =>
                      setTaskDraft({ ...taskDraft, dueAt: event.target.value })
                    }
                  />
                </label>
                <label>
                  Prioridad
                  <select
                    value={taskDraft.priority}
                    onChange={(event) =>
                      setTaskDraft({
                        ...taskDraft,
                        priority: event.target
                          .value as AcademicTask['priority'],
                      })
                    }
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                  </select>
                </label>
              </div>
              {editingTaskId && (
                <label>
                  Estado
                  <select
                    value={taskDraft.status}
                    onChange={(event) =>
                      setTaskDraft({
                        ...taskDraft,
                        status: event.target.value as AcademicTask['status'],
                      })
                    }
                  >
                    <option value="pending">Pendiente</option>
                    <option value="in_progress">En progreso</option>
                    <option value="completed">Completada</option>
                  </select>
                </label>
              )}
              <label>
                Descripción
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={taskDraft.description ?? ''}
                  onChange={(event) =>
                    setTaskDraft({
                      ...taskDraft,
                      description: event.target.value,
                    })
                  }
                />
              </label>
              <div className="academic-form-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeTaskForm}
                >
                  Cancelar
                </button>
                <button disabled={busyId === (editingTaskId ?? 'task')}>
                  {busyId === (editingTaskId ?? 'task')
                    ? 'Guardando…'
                    : editingTaskId
                      ? 'Guardar cambios'
                      : 'Guardar tarea'}
                </button>
              </div>
            </form>
          )}
          <div className="academic-agenda-list" aria-live="polite">
            {!visibleAgenda.length ? (
              <p className="academic-empty">
                {agendaView === 'open'
                  ? 'No hay eventos ni tareas pendientes.'
                  : 'Aún no tienes tareas completadas.'}
              </p>
            ) : (
              visibleAgenda.map((item) => (
                <article
                  className={`academic-agenda-item academic-agenda-item--${item.status}`}
                  key={`${item.kind}-${item.id}`}
                >
                  <span
                    className={`academic-priority academic-priority--${item.priority}`}
                    aria-hidden="true"
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
                    {item.kind === 'task' && (
                      <span
                        className={`academic-status academic-status--${item.status}`}
                      >
                        {statusLabels[item.status]}
                      </span>
                    )}
                    {item.description && <p>{item.description}</p>}
                    <time dateTime={item.date ?? undefined}>
                      {formatAgendaDate(item.date, item.allDay)}
                    </time>
                  </div>
                  {item.kind === 'task' && item.task && (
                    <div className="academic-task-actions">
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => startEditingTask(item.task)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
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
                        type="button"
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
