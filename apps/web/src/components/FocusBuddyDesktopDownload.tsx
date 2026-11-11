import {
  focusBuddyDownloadUrl,
  getFocusBuddyDesktopChannel,
  getFocusBuddyLaunchUrl,
  isFocusBuddyDesktopRuntime,
} from '../config/focusbuddy-download'
import './FocusBuddyDesktopDownload.css'

export function FocusBuddyDesktopDownload() {
  const desktopBridge = (window as Window & { focusBuddyDesktop?: unknown })
    .focusBuddyDesktop
  if (isFocusBuddyDesktopRuntime(desktopBridge)) return null
  const isLocal =
    getFocusBuddyDesktopChannel(window.location.hostname) === 'local'
  const launchUrl = getFocusBuddyLaunchUrl(window.location.hostname)

  return (
    <aside
      className="focus-desktop-download"
      aria-labelledby="focus-desktop-download-title"
    >
      <div className="focus-desktop-download__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8M12 17v4M12 7v6M9.5 10.5 12 13l2.5-2.5" />
        </svg>
      </div>
      <div className="focus-desktop-download__copy">
        <span>Aplicación de escritorio · {isLocal ? 'local' : 'oficial'}</span>
        <h2 id="focus-desktop-download-title">
          {isLocal
            ? 'FocusBuddy para tu entorno local'
            : 'Lleva FocusBuddy a Windows'}
        </h2>
        <p>
          {isLocal
            ? 'La aplicación local comparte tus tareas, sesiones y progreso con este Konea al usar la misma cuenta. Los datos de la versión publicada son independientes.'
            : 'Usa el temporizador, el panel y la mascota flotante desde Windows. La versión oficial comparte tus tareas, sesiones y progreso con esta página al usar tu cuenta de Konea publicada.'}
        </p>
        <small>
          {isLocal
            ? 'Requiere mantener el proyecto local en ejecución.'
            : 'Windows x64 · instalador sin firma digital por ahora'}
        </small>
      </div>
      <div className="focus-desktop-download__actions">
        <a className="focus-desktop-download__action" href={launchUrl}>
          {isLocal ? 'Abrir FocusBuddy local' : 'Abrir FocusBuddy'}
        </a>
        <small>
          {isLocal
            ? 'También puedes usar iniciar-focusbuddy.bat. Inicia sesión en el programa.'
            : 'Requiere la versión oficial instalada. Inicia sesión en el programa.'}
        </small>
        {!isLocal && focusBuddyDownloadUrl ? (
          <a
            className="focus-desktop-download__action"
            href={focusBuddyDownloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Descargar Konea FocusBuddy para Windows x64"
          >
            Descargar versión oficial
          </a>
        ) : !isLocal ? (
          <span className="focus-desktop-download__unavailable" role="status">
            Versión oficial aún no publicada
          </span>
        ) : null}
      </div>
    </aside>
  )
}
