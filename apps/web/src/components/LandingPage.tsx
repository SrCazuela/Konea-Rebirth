import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { AuthMode } from './AuthDialog'
import owlSprite from '../assets/focusbuddy/owl-shimeji-provisional.png'
import './LandingPage.css'

gsap.registerPlugin(ScrollTrigger)

type IconName =
  | 'arrow'
  | 'people'
  | 'chat'
  | 'check'
  | 'book'
  | 'spark'
  | 'clock'
  | 'shield'
  | 'pause'
  | 'play'
  | 'heart'
  | 'code'

function Icon({
  name,
  className = '',
}: {
  name: IconName
  className?: string
}) {
  const paths: Record<IconName, ReactNode> = {
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2" />
      </>
    ),
    chat: (
      <path d="M20 11.5a8 8 0 0 1-8 8H5l-3 3v-11a9 9 0 0 1 18 0ZM7 10h8M7 14h5" />
    ),
    check: <path d="m5 12 4 4L19 6" />,
    book: (
      <>
        <path d="M4 4h7a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4ZM20 4h-3a3 3 0 0 0-3 3M20 4v15h-2" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6ZM20 2v4M18 4h4" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    pause: (
      <>
        <path d="M9 5v14M15 5v14" />
      </>
    ),
    play: <path d="m9 4 11 8-11 8Z" />,
    heart: (
      <path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z" />
    ),
    code: (
      <>
        <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
      </>
    ),
  }
  return (
    <svg
      className={`landing-icon ${className}`}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function Kuco({ className = '' }: { className?: string }) {
  return (
    <span
      className={`landing-kuco ${className}`}
      style={{ backgroundImage: `url(${owlSprite})` }}
      role="img"
      aria-label="Kuco, tu compañero de concentración"
    />
  )
}

const previewTabs = [
  { id: 'community', label: 'Comunidad', icon: 'people' },
  { id: 'organize', label: 'Mi día', icon: 'book' },
  { id: 'focus', label: 'Kuco', icon: 'clock' },
] as const

type PreviewTab = (typeof previewTabs)[number]['id']

function CampusPreview() {
  const [tab, setTab] = useState<PreviewTab>('community')
  const previewRef = useRef<HTMLDivElement>(null)

  function navigateTabs(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? previewTabs.length - 1
          : (index +
              (event.key === 'ArrowRight' ? 1 : -1) +
              previewTabs.length) %
            previewTabs.length
    const nextTab = previewTabs[next]
    if (!nextTab) return
    setTab(nextTab.id)
    previewRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus()
  }

  return (
    <div className="landing-stage" ref={previewRef}>
      <div className="landing-stage__halo" aria-hidden="true" />
      <svg
        className="landing-stage__orbit"
        viewBox="0 0 600 600"
        fill="none"
        aria-hidden="true"
      >
        <ellipse
          cx="300"
          cy="300"
          rx="272"
          ry="235"
          stroke="currentColor"
          strokeDasharray="3 10"
          transform="rotate(-28 300 300)"
        />
        <circle cx="93" cy="163" r="8" fill="currentColor" />
      </svg>
      <div className="landing-stage__spark" aria-hidden="true">
        ✳
      </div>
      <div className="landing-preview" data-stage-reveal>
        <div className="landing-preview__chrome">
          <span aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Un vistazo a tu campus</span>
          <Icon name="shield" />
        </div>
        <div className="landing-preview__content">
          <div className="landing-preview__greeting">
            <span>LO BUENO DE ESTAR AQUÍ</span>
            <strong>
              Hola, comunidad <span aria-hidden="true">✦</span>
            </strong>
          </div>
          <div
            className="landing-preview__tabs"
            role="tablist"
            aria-label="Explora una vista previa de Konea"
          >
            {previewTabs.map((item, index) => (
              <button
                key={item.id}
                id={`landing-tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                aria-controls={`landing-panel-${item.id}`}
                tabIndex={tab === item.id ? 0 : -1}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => navigateTabs(event, index)}
              >
                <Icon name={item.icon} />
                {item.label}
              </button>
            ))}
          </div>
          <div
            key={tab}
            className="landing-preview__panel"
            id={`landing-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`landing-tab-${tab}`}
            tabIndex={0}
          >
            {tab === 'community' ? (
              <>
                <div className="landing-post__author">
                  <span className="landing-avatar landing-avatar--coral">
                    S
                  </span>
                  <div>
                    <strong>Sofía M.</strong>
                    <span>Diseño · Compartiendo ideas</span>
                  </div>
                  <span className="landing-post__tag">Comunidad</span>
                </div>
                <p className="landing-post__copy">
                  ¿Y si el próximo proyecto lo hacemos juntos?
                </p>
                <div className="landing-post__art" aria-hidden="true">
                  <span className="landing-post__art-line">Ideas que</span>
                  <strong>conectan.</strong>
                  <span className="landing-post__flower">✳</span>
                  <span className="landing-post__art-pill">
                    DE UNA IDEA A ALGO GRANDE ↗
                  </span>
                </div>
                <div className="landing-post__reactions">
                  <span>
                    <Icon name="heart" />
                    Me gusta
                  </span>
                  <span>
                    <Icon name="chat" />
                    Conversemos
                  </span>
                  <Icon name="arrow" />
                </div>
              </>
            ) : tab === 'organize' ? (
              <>
                <div className="landing-day__heading">
                  <strong>Un paso a la vez.</strong>
                  <span>Tu plan de hoy</span>
                </div>
                <div className="landing-day__task">
                  <span className="landing-day__done">
                    <Icon name="check" />
                  </span>
                  <div>
                    <strong>Revisar ideas del proyecto</strong>
                    <small>Capstone · Listo</small>
                  </div>
                </div>
                <div className="landing-day__task">
                  <span />
                  <div>
                    <strong>Preparar la presentación</strong>
                    <small>Comunicación · Próximo paso</small>
                  </div>
                  <span className="landing-day__priority">Hoy</span>
                </div>
                <div className="landing-day__task">
                  <span />
                  <div>
                    <strong>Practicar para la evaluación</strong>
                    <small>Inglés · A tu ritmo</small>
                  </div>
                </div>
                <div className="landing-day__duco">
                  <Icon name="spark" />
                  <p>
                    <strong>DUCO te acompaña.</strong> Organiza tus pendientes y
                    prepara solicitudes contigo.
                  </p>
                </div>
              </>
            ) : (
              <div className="landing-focus-preview">
                <div>
                  <span className="landing-mini-label">
                    TU MOMENTO DE ENFOQUE
                  </span>
                  <strong>25:00</strong>
                  <span>Pomodoro · Un bloque, un avance.</span>
                  <span className="landing-focus-preview__pill">
                    <Icon name="play" />A tu ritmo, con Kuco
                  </span>
                </div>
                <Kuco />
              </div>
            )}
          </div>
          <span className="landing-preview__disclaimer">
            Vista ilustrativa de las funciones de Konea
          </span>
        </div>
      </div>
      <div
        className="landing-float landing-float--connection"
        data-stage-reveal
        aria-hidden="true"
      >
        <span className="landing-float__check">
          <Icon name="check" />
        </span>
        <div>
          <strong>Una conexión de verdad.</strong>
          <span>Ambos dijeron que sí.</span>
        </div>
        <span className="landing-float__heart">♡</span>
      </div>
      <div
        className="landing-float landing-float--focus"
        data-stage-reveal
        aria-hidden="true"
      >
        <span className="landing-float__clock">
          <Icon name="clock" />
        </span>
        <div>
          <span>UN MOMENTO PARA TI</span>
          <strong>
            25<span>:00</span>
          </strong>
        </div>
        <span className="landing-float__wave">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
      <span className="landing-stage__note" aria-hidden="true">
        Un lugar para ser tú.
        <svg viewBox="0 0 66 35" fill="none">
          <path
            d="M2 2c27 26 36 34 57 15m-1-9 5 8-10 5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </div>
  )
}

export default function LandingPage({
  apiState,
  onAuth,
}: {
  apiState: 'checking' | 'online' | 'offline'
  onAuth: (mode: AuthMode) => void
}) {
  const pageRef = useRef<HTMLDivElement>(null)
  const [motionEnabled, setMotionEnabled] = useState(true)

  useLayoutEffect(() => {
    const root = pageRef.current
    if (!root || !motionEnabled) return
    const media = gsap.matchMedia()
    media.add(
      '(prefers-reduced-motion: no-preference)',
      () => {
        const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })
        intro
          .from(root.querySelectorAll('[data-intro]'), {
            y: 24,
            opacity: 0,
            duration: 0.85,
            stagger: 0.1,
          })
          .from(
            root.querySelectorAll('[data-stage-reveal]'),
            { y: 38, opacity: 0, scale: 0.96, duration: 1, stagger: 0.12 },
            0.2,
          )
        gsap.to(root.querySelector('.landing-float--connection'), {
          y: -10,
          rotation: -1,
          duration: 3.8,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: 1.5,
        })
        gsap.to(root.querySelector('.landing-float--focus'), {
          y: 9,
          rotation: 1,
          duration: 4.4,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: 1.5,
        })
        gsap.to(root.querySelector('.landing-stage__spark'), {
          rotation: 110,
          duration: 30,
          repeat: -1,
          ease: 'none',
        })
        root
          .querySelectorAll<HTMLElement>('[data-reveal]')
          .forEach((section) => {
            gsap.from(section, {
              y: 34,
              opacity: 0,
              duration: 0.85,
              ease: 'power2.out',
              scrollTrigger: { trigger: section, start: 'top 92%', once: true },
            })
          })
      },
      root,
    )
    return () => media.revert()
  }, [motionEnabled])

  const serviceLabel = {
    checking: 'Comprobando disponibilidad',
    online: 'Servicios disponibles',
    offline: 'Conexión temporalmente no disponible',
  }[apiState]

  return (
    <div
      className="landing"
      ref={pageRef}
      data-motion={motionEnabled ? 'on' : 'off'}
    >
      <a className="landing-skip" href="#landing-main">
        Ir al contenido
      </a>
      <header className="landing-header">
        <a className="landing-brand" href="#top" aria-label="Konea, inicio">
          <img src="/konea-logo.svg" alt="Konea" width="128" height="46" />
        </a>
        <nav aria-label="Navegación principal">
          <a href="#tu-espacio">Tu espacio</a>
          <a href="#a-tu-ritmo">A tu ritmo</a>
          <a href="#conexiones">Conecta con confianza</a>
        </nav>
        <div className="landing-header__actions">
          <button
            className="landing-login"
            type="button"
            onClick={() => onAuth('login')}
          >
            Iniciar sesión
          </button>
          <button
            className="landing-header__join"
            type="button"
            onClick={() => onAuth('register')}
          >
            Unirme <Icon name="arrow" />
          </button>
        </div>
      </header>

      <main id="landing-main">
        <section
          className="landing-hero landing-container"
          id="top"
          aria-labelledby="landing-title"
        >
          <div className="landing-hero__copy">
            <span className="landing-kicker" data-intro>
              <i /> HECHO PARA TU VIDA UNIVERSITARIA
            </span>
            <h1 id="landing-title">
              <span data-intro>Tu campus,</span>
              <span data-intro>mucho más</span>
              <span className="landing-hero__accent" data-intro>
                conectado.
                <svg
                  viewBox="0 0 505 19"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d="M4 14C128 0 360 1 500 8" />
                </svg>
              </span>
            </h1>
            <p className="landing-hero__summary" data-intro>
              Encuentra a tu gente. Comparte lo que creas.
              <br className="landing-desktop-break" /> Organiza lo que viene.
              Todo en un espacio
              <br className="landing-desktop-break" /> donde tú eliges cómo
              conectar.
            </p>
            <div className="landing-hero__actions" data-intro>
              <button
                className="landing-button landing-button--purple"
                type="button"
                onClick={() => onAuth('register')}
              >
                Quiero ser parte <Icon name="arrow" />
              </button>
              <a className="landing-text-link" href="#tu-espacio">
                Descubre Konea <span aria-hidden="true">↘</span>
              </a>
            </div>
            <p className="landing-hero__trust" data-intro>
              <Icon name="shield" />
              Tu comunidad. Tus tiempos. Tus decisiones.
            </p>
          </div>
          <CampusPreview />
          <div className="landing-hero__bottom">
            <span>EL CAMPUS NO TERMINA EN LA SALA.</span>
            <a href="#tu-espacio" aria-label="Explorar las funciones de Konea">
              <span>Hay mucho por descubrir</span>
              <Icon name="arrow" />
            </a>
          </div>
        </section>

        <div
          className="landing-ribbon"
          aria-label="Lo que puedes hacer en Konea"
        >
          <div className="landing-container">
            <span>Comparte ideas</span>
            <i aria-hidden="true">✳</i>
            <span>Construye conexiones</span>
            <i aria-hidden="true">✳</i>
            <span>Encuentra tu ritmo</span>
            <i aria-hidden="true">✳</i>
            <span>Hazlo tuyo</span>
          </div>
        </div>

        <section
          className="landing-features landing-container"
          id="tu-espacio"
          aria-labelledby="landing-features-title"
        >
          <div className="landing-section-heading" data-reveal>
            <div>
              <span className="landing-kicker">MUCHO MÁS QUE UN FEED</span>
              <h2 id="landing-features-title">
                Todo lo que eres.
                <br />
                <em>En un mismo lugar.</em>
              </h2>
            </div>
            <p>
              La vida universitaria viene con ideas, personas y mil cosas por
              hacer. Konea les da un espacio para encontrarse.
            </p>
          </div>
          <div className="landing-bento">
            <article
              className="landing-feature landing-feature--community"
              data-reveal
            >
              <div className="landing-feature__top">
                <span className="landing-feature__icon">
                  <Icon name="people" />
                </span>
                <span>01 / COMUNIDAD</span>
              </div>
              <h3>
                Tu gente está
                <br />
                más cerca de lo que crees.
              </h3>
              <p>
                Conversaciones, proyectos y vida de campus. Comparte lo que te
                mueve y encuentra personas con quienes crear.
              </p>
              <div className="landing-community-art" aria-hidden="true">
                <span className="landing-community-art__line" />
                <span className="landing-community-art__person">
                  M<span>¿Creamos algo?</span>
                </span>
                <span className="landing-community-art__center">
                  <Icon name="spark" />
                </span>
                <span className="landing-community-art__person">
                  S<span>¡Vamos!</span>
                </span>
                <i>Las buenas ideas se comparten.</i>
              </div>
            </article>
            <article
              className="landing-feature landing-feature--duco"
              data-reveal
            >
              <div className="landing-feature__top">
                <span className="landing-feature__icon">
                  <Icon name="spark" />
                </span>
                <span>02 / DUCO</span>
              </div>
              <h3>
                Mil pendientes.
                <br />
                Un próximo paso.
              </h3>
              <p>
                Tu asistente para organizar tareas y preparar solicitudes. Tú
                revisas y confirmas cada acción.
              </p>
              <div className="landing-duco-art" aria-hidden="true">
                <span>Necesito organizar mi semana.</span>
                <div>
                  <Icon name="spark" />
                  <p>
                    Vamos paso a paso.<strong>¿Por dónde empezamos?</strong>
                  </p>
                </div>
                <span className="landing-duco-art__draft">
                  <Icon name="check" />
                  Borrador listo para revisar
                  <Icon name="arrow" />
                </span>
              </div>
            </article>
            <article
              className="landing-feature landing-feature--focus"
              id="a-tu-ritmo"
              data-reveal
            >
              <div className="landing-feature__top">
                <span className="landing-feature__icon">
                  <Icon name="clock" />
                </span>
                <span>03 / FOCUSBUDDY</span>
              </div>
              <h3>
                Menos ruido.
                <br />
                Más de tu propio ritmo.
              </h3>
              <p>
                Sesiones de estudio, pausas y progreso personal. Kuco te
                acompaña, un bloque a la vez.
              </p>
              <div className="landing-focus-art">
                <div aria-hidden="true">
                  <span>UN BLOQUE PARA AVANZAR</span>
                  <strong>
                    25<span>:00</span>
                  </strong>
                  <span className="landing-focus-art__progress">
                    <i />
                  </span>
                  <small>Enfócate · Respira · Continúa</small>
                </div>
                <Kuco />
              </div>
            </article>
            <article
              className="landing-feature landing-feature--portfolio"
              data-reveal
            >
              <div className="landing-feature__top">
                <span className="landing-feature__icon">
                  <Icon name="code" />
                </span>
                <span>04 / TU PORTAFOLIO</span>
              </div>
              <h3>
                Lo que haces
                <br />
                también habla de ti.
              </h3>
              <p>
                Dale un lugar a tus proyectos, tu formación y tus logros. Tu
                perfil crece contigo, dentro y fuera del campus.
              </p>
              <div className="landing-portfolio-art" aria-hidden="true">
                <div>
                  <Icon name="code" />
                  <span>Mi próximo gran proyecto</span>
                  <small>Diseñado con ganas.</small>
                </div>
                <div>
                  <span className="landing-portfolio-art__star">✷</span>
                  <span>Un nuevo logro</span>
                  <small>Un paso más en mi camino.</small>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section
          className="landing-connections landing-container"
          id="conexiones"
          aria-labelledby="landing-connections-title"
        >
          <div className="landing-connections__visual" data-reveal>
            <span className="landing-connections__ring" aria-hidden="true" />
            <span
              className="landing-connections__avatar landing-connections__avatar--one"
              aria-hidden="true"
            >
              TÚ
            </span>
            <span className="landing-connections__link" aria-hidden="true">
              <Icon name="heart" />
            </span>
            <span
              className="landing-connections__avatar landing-connections__avatar--two"
              aria-hidden="true"
            >
              TU GENTE
            </span>
            <span className="landing-connections__caption">
              <Icon name="check" />
              La conexión empieza cuando ambos quieren.
            </span>
            <span className="landing-connections__star" aria-hidden="true">
              ✳
            </span>
          </div>
          <div className="landing-connections__copy" data-reveal>
            <span className="landing-kicker">
              CONECTAR DEBERÍA SENTIRSE BIEN
            </span>
            <h2 id="landing-connections-title">
              Un sí de tu lado.
              <br />
              <em>Un sí del otro.</em>
            </h2>
            <p>
              Las conexiones son recíprocas. Conoce a alguien a través de una
              publicación o comparte tu código o QR. El chat se abre cuando la
              conexión está confirmada.
            </p>
            <ul>
              <li>
                <Icon name="shield" />
                Solicitudes privadas, sin presión.
              </li>
              <li>
                <Icon name="people" />
                Conversaciones con consentimiento.
              </li>
              <li>
                <Icon name="heart" />
                Herramientas para cuidar la convivencia.
              </li>
            </ul>
            <button
              className="landing-text-link"
              type="button"
              onClick={() => onAuth('register')}
            >
              Encuentra tu lugar <Icon name="arrow" />
            </button>
          </div>
        </section>

        <section
          className="landing-cta landing-container"
          aria-labelledby="landing-cta-title"
          data-reveal
        >
          <div>
            <span className="landing-kicker">
              TU HISTORIA UNIVERSITARIA SIGUE AQUÍ
            </span>
            <h2 id="landing-cta-title">
              Lo que viene,
              <br />
              <em>conéctalo en Konea.</em>
            </h2>
            <button
              className="landing-button landing-button--lime"
              type="button"
              onClick={() => onAuth('register')}
            >
              Crear mi cuenta <Icon name="arrow" />
            </button>
            <button
              className="landing-cta__login"
              type="button"
              onClick={() => onAuth('login')}
            >
              Ya soy parte. Iniciar sesión ↗
            </button>
          </div>
          <span className="landing-cta__star" aria-hidden="true">
            ✳
          </span>
          <span className="landing-cta__orbit" aria-hidden="true" />
        </section>
      </main>

      <footer className="landing-footer landing-container">
        <a
          className="landing-brand"
          href="#top"
          aria-label="Konea, volver al inicio"
        >
          <img src="/konea-logo.svg" alt="Konea" width="106" height="38" />
        </a>
        <p>
          Un campus conectado empieza contigo.
          <span>Proyecto Capstone · {new Date().getFullYear()}</span>
        </p>
        <div className="landing-footer__controls">
          <span
            className={`landing-service landing-service--${apiState}`}
            role="status"
          >
            <i />
            {serviceLabel}
          </span>
          <button
            type="button"
            onClick={() => setMotionEnabled((enabled) => !enabled)}
            aria-pressed={!motionEnabled}
          >
            <Icon name={motionEnabled ? 'pause' : 'play'} />
            {motionEnabled ? 'Pausar animaciones' : 'Activar animaciones'}
          </button>
        </div>
      </footer>
    </div>
  )
}
