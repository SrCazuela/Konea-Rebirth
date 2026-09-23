import {
  focusBuddyDownloadUrl,
  isFocusBuddyDesktopRuntime,
} from '../config/focusbuddy-download'
import './FocusBuddyDesktopDownload.css'

export function FocusBuddyDesktopDownload() {
  const desktopBridge = (window as Window & { focusBuddyDesktop?: unknown })
    .focusBuddyDesktop
  if (isFocusBuddyDesktopRuntime(desktopBridge)) return null

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
        <span>Aplicación de escritorio</span>
        <h2 id="focus-desktop-download-title">Lleva FocusBuddy a Windows</h2>
        <p>
          Usa el temporizador, el panel y la mascota flotante desde una
          aplicación instalada, con tu misma cuenta de Konea.
        </p>
        <small>Windows x64 · instalador sin firma digital por ahora</small>
      </div>
      {focusBuddyDownloadUrl ? (
        <a
          className="focus-desktop-download__action"
          href={focusBuddyDownloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Descargar Konea FocusBuddy para Windows x64"
        >
          Descargar instalador
        </a>
      ) : (
        <span className="focus-desktop-download__unavailable" role="status">
          Versión pública aún no publicada
        </span>
      )}
    </aside>
  )
}
