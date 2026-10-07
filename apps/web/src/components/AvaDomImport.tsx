import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  confirmAvaImport,
  createAvaImportPreview,
  discardAvaImport,
  type AvaDomImportPayload,
  type AvaImportPreview,
  type AvaImportResult,
} from '../api/ava-imports'

const MAX_CAPTURE_BYTES = 512 * 1_024

function readableError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'No pudimos preparar esta captura de AVA.'
}

function resultMessage(result: AvaImportResult) {
  const reactivated = result.reactivatedCourses ?? 0
  const imported = result.importedCourses + result.importedTasks
  const existing = result.existingCourses + result.existingTasks
  const parts = [
    imported > 0
      ? `${imported} ${imported === 1 ? 'elemento importado' : 'elementos importados'}`
      : '',
    reactivated > 0
      ? `${reactivated} ${reactivated === 1 ? 'materia reactivada' : 'materias reactivadas'}`
      : '',
    existing > 0 ? `${existing} ya existían` : '',
  ].filter(Boolean)
  return `${parts.join(' · ') || 'No se realizaron cambios'}.`
}

export function AvaDomImport({ onImported }: { onImported?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<AvaImportPreview | null>(null)
  const [courseIds, setCourseIds] = useState<Set<string>>(new Set())
  const [activityIds, setActivityIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const prepareFile = async (file: File | undefined) => {
    if (!file || busy) return
    setError('')
    setSuccess('')
    if (file.size > MAX_CAPTURE_BYTES) {
      setError('La captura supera el máximo permitido de 512 KB.')
      return
    }
    setBusy(true)
    try {
      const parsed = JSON.parse(await file.text()) as AvaDomImportPayload
      const nextPreview = await createAvaImportPreview(parsed)
      setPreview(nextPreview)
      setCourseIds(
        new Set(
          nextPreview.courses
            .filter((course) => !course.existing)
            .map((course) => course.clientId),
        ),
      )
      setActivityIds(
        new Set(
          nextPreview.activities
            .filter((activity) => !activity.existing)
            .map((activity) => activity.clientId),
        ),
      )
      if (
        nextPreview.import.status === 'confirmed' &&
        nextPreview.import.result
      ) {
        setSuccess(
          `Esta captura ya fue confirmada: ${resultMessage(nextPreview.import.result)}`,
        )
      }
    } catch (captureError) {
      setPreview(null)
      setError(
        captureError instanceof SyntaxError
          ? 'El archivo no contiene una captura JSON válida.'
          : readableError(captureError),
      )
    } finally {
      setBusy(false)
    }
  }

  const loadCapture = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    void prepareFile(file)
  }

  const dropCapture = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    void prepareFile(event.dataTransfer.files[0])
  }

  const toggle = (
    current: Set<string>,
    setter: (value: Set<string>) => void,
    id: string,
  ) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setter(next)
  }

  const confirm = async () => {
    if (!preview || busy || preview.import.status !== 'draft') return
    if (courseIds.size === 0 && activityIds.size === 0) {
      setError('Selecciona al menos una materia o actividad.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { result } = await confirmAvaImport(preview.import.id, {
        courseClientIds: [...courseIds],
        activityClientIds: [...activityIds],
      })
      setPreview({
        ...preview,
        import: { ...preview.import, status: 'confirmed', result },
      })
      setSuccess(resultMessage(result))
      onImported?.()
    } catch (confirmError) {
      setError(readableError(confirmError))
    } finally {
      setBusy(false)
    }
  }

  const discard = async () => {
    if (!preview || busy || preview.import.status !== 'draft') {
      setPreview(null)
      return
    }
    setBusy(true)
    setError('')
    try {
      await discardAvaImport(preview.import.id)
      setPreview(null)
      setCourseIds(new Set())
      setActivityIds(new Set())
    } catch (discardError) {
      setError(readableError(discardError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ava-dom-import" aria-busy={busy}>
      <header>
        <div>
          <strong>Conector AVA experimental</strong>
          <span>Más cómodo · revisión obligatoria</span>
        </div>
        <a
          href="https://campusvirtual.duoc.cl/"
          target="_blank"
          rel="noreferrer"
        >
          Abrir AVA
        </a>
      </header>
      <p>
        Usa la extensión local para leer materias y actividades visibles. No
        comparte tu contraseña, cookies ni sesión con Konea.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        onChange={loadCapture}
        hidden
      />
      <button
        type="button"
        className="ava-dom-import__file"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={dropCapture}
      >
        {busy
          ? 'Preparando vista previa…'
          : 'Seleccionar o arrastrar captura de la extensión'}
      </button>

      {error && (
        <p className="ava-sync-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="ava-sync-success" role="status">
          {success}
        </p>
      )}

      {preview && (
        <div className="ava-dom-import__preview">
          <p>
            Captura: <strong>{preview.courses.length}</strong> materias y{' '}
            <strong>{preview.activities.length}</strong> actividades. Los
            elementos marcados como existentes no se duplicarán.
          </p>
          <fieldset disabled={busy || preview.import.status !== 'draft'}>
            <legend>Materias</legend>
            {preview.courses.length === 0 ? (
              <small>No se detectaron materias en esta página.</small>
            ) : (
              preview.courses.map((course) => (
                <label key={course.clientId}>
                  <input
                    type="checkbox"
                    disabled={course.existing}
                    checked={courseIds.has(course.clientId)}
                    onChange={() =>
                      toggle(courseIds, setCourseIds, course.clientId)
                    }
                  />
                  <span>
                    <strong>{course.name}</strong>
                    <small>
                      {course.reactivatable
                        ? 'Archivada · se reactivará'
                        : course.existing
                          ? 'Ya existe en Konea'
                          : [
                              course.code,
                              course.section && `Sección ${course.section}`,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Nueva materia'}
                    </small>
                  </span>
                </label>
              ))
            )}
          </fieldset>
          <fieldset disabled={busy || preview.import.status !== 'draft'}>
            <legend>Próximas tareas</legend>
            {preview.activities.length === 0 ? (
              <small>
                No se detectaron actividades con fecha en esta página.
              </small>
            ) : (
              preview.activities.map((activity) => (
                <label key={activity.clientId}>
                  <input
                    type="checkbox"
                    disabled={activity.existing}
                    checked={activityIds.has(activity.clientId)}
                    onChange={() =>
                      toggle(activityIds, setActivityIds, activity.clientId)
                    }
                  />
                  <span>
                    <strong>{activity.title}</strong>
                    <small>
                      {activity.existing
                        ? 'Ya existe en Konea'
                        : `${activity.courseName || 'Sin materia'}${
                            activity.dueAt
                              ? ` · ${new Date(activity.dueAt).toLocaleString('es-CL')}`
                              : ''
                          }`}
                    </small>
                  </span>
                </label>
              ))
            )}
          </fieldset>
          {preview.import.status === 'draft' && (
            <div className="ava-dom-import__actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => void discard()}
              >
                Descartar
              </button>
              <button
                type="button"
                disabled={
                  busy || (courseIds.size === 0 && activityIds.size === 0)
                }
                onClick={() => void confirm()}
              >
                Confirmar e importar
              </button>
            </div>
          )}
        </div>
      )}
      <small className="ava-dom-import__notice">
        Si Blackboard cambia su interfaz, usa el enlace ICS que aparece abajo.
      </small>
    </section>
  )
}
