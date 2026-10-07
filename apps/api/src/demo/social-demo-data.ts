import { readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ProfileAchievement,
  ProfileEducation,
  ProfileProject,
} from '../db/schema.js'

const stableId = (namespace: string, sequence: number) =>
  `${namespace}000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`

export const SOCIAL_DEMO_USER_IDS = {
  vale: stableId('d1', 1),
  mati: stableId('d1', 2),
  fer: stableId('d1', 3),
  diego: stableId('d1', 4),
  cami: stableId('d1', 5),
  tomas: stableId('d1', 6),
  anto: stableId('d1', 7),
  benja: stableId('d1', 8),
  javi: stableId('d1', 9),
  nico: stableId('d1', 10),
  isi: stableId('d1', 11),
  seba: stableId('d1', 12),
  news: stableId('d1', 13),
} as const

const demoMedia = (
  sequence: number,
  ownerId: string,
  candidates: string[],
) => ({
  id: stableId('d2', sequence),
  ownerId,
  candidates,
})

export const SOCIAL_DEMO_MEDIA = {
  avatarOrangeCat: {
    id: stableId('d2', 1),
    ownerId: SOCIAL_DEMO_USER_IDS.isi,
    candidates: ['avatar-orange-cat.jpg'],
  },
  avatarBlackCat: {
    id: stableId('d2', 2),
    ownerId: SOCIAL_DEMO_USER_IDS.cami,
    candidates: ['avatar-black-cat.jpg'],
  },
  avatarGreyKitten: {
    id: stableId('d2', 3),
    ownerId: SOCIAL_DEMO_USER_IDS.nico,
    candidates: ['avatar-grey-kitten.jpg'],
  },
  avatarGrumpyCat: {
    id: stableId('d2', 4),
    ownerId: SOCIAL_DEMO_USER_IDS.seba,
    candidates: ['avatar-grumpy-cat.jpg'],
  },
  avatarKiki: {
    id: stableId('d2', 5),
    ownerId: SOCIAL_DEMO_USER_IDS.fer,
    candidates: ['avatar-kiki.png'],
  },
  avatarPepper: {
    id: stableId('d2', 6),
    ownerId: SOCIAL_DEMO_USER_IDS.javi,
    candidates: [
      'avatar-pepper.jpg',
      'avatar-pepper.png',
      'avatar-pepper.webp',
    ],
  },
  avatarGodot: {
    id: stableId('d2', 7),
    ownerId: SOCIAL_DEMO_USER_IDS.mati,
    candidates: ['avatar-godot.png'],
  },
  avatarSupertuxkart: {
    id: stableId('d2', 8),
    ownerId: SOCIAL_DEMO_USER_IDS.diego,
    candidates: ['avatar-supertuxkart.png'],
  },
  postCatLaptop: {
    id: stableId('d2', 9),
    ownerId: SOCIAL_DEMO_USER_IDS.vale,
    candidates: ['post-cat-laptop.jpg'],
  },
  postBlackCatComputer: {
    id: stableId('d2', 10),
    ownerId: SOCIAL_DEMO_USER_IDS.benja,
    candidates: ['post-black-cat-computer.jpg'],
  },
  postStudyDesk: {
    id: stableId('d2', 11),
    ownerId: SOCIAL_DEMO_USER_IDS.tomas,
    candidates: ['post-study-desk.jpg'],
  },
  postPurpleWorkspace: {
    id: stableId('d2', 12),
    ownerId: SOCIAL_DEMO_USER_IDS.anto,
    candidates: ['post-purple-workspace.jpg'],
  },
  coverVale: demoMedia(13, SOCIAL_DEMO_USER_IDS.vale, [
    'post-purple-workspace.jpg',
  ]),
  projectVale: demoMedia(14, SOCIAL_DEMO_USER_IDS.vale, ['profile-code.jpg']),
  achievementVale: demoMedia(15, SOCIAL_DEMO_USER_IDS.vale, [
    'profile-certificate.png',
  ]),
  coverMati: demoMedia(16, SOCIAL_DEMO_USER_IDS.mati, ['profile-code.jpg']),
  projectMati: demoMedia(17, SOCIAL_DEMO_USER_IDS.mati, ['profile-code.jpg']),
  achievementMati: demoMedia(18, SOCIAL_DEMO_USER_IDS.mati, [
    'profile-certificate.png',
  ]),
  coverFer: demoMedia(19, SOCIAL_DEMO_USER_IDS.fer, ['profile-workspace.jpg']),
  projectFer: demoMedia(20, SOCIAL_DEMO_USER_IDS.fer, [
    'profile-workspace.jpg',
  ]),
  achievementFer: demoMedia(21, SOCIAL_DEMO_USER_IDS.fer, [
    'profile-certificate.png',
  ]),
  coverDiego: demoMedia(22, SOCIAL_DEMO_USER_IDS.diego, [
    'profile-mixing-console.jpg',
  ]),
  projectDiego: demoMedia(23, SOCIAL_DEMO_USER_IDS.diego, [
    'profile-mixing-console.jpg',
  ]),
  achievementDiego: demoMedia(24, SOCIAL_DEMO_USER_IDS.diego, [
    'profile-certificate.png',
  ]),
  coverCami: demoMedia(25, SOCIAL_DEMO_USER_IDS.cami, [
    'profile-warehouse.jpg',
  ]),
  projectCami: demoMedia(26, SOCIAL_DEMO_USER_IDS.cami, [
    'profile-warehouse.jpg',
  ]),
  achievementCami: demoMedia(27, SOCIAL_DEMO_USER_IDS.cami, [
    'profile-certificate.png',
  ]),
  coverTomas: demoMedia(28, SOCIAL_DEMO_USER_IDS.tomas, ['profile-code.jpg']),
  projectTomas: demoMedia(29, SOCIAL_DEMO_USER_IDS.tomas, ['profile-code.jpg']),
  achievementTomas: demoMedia(30, SOCIAL_DEMO_USER_IDS.tomas, [
    'profile-certificate.png',
  ]),
  coverAnto: demoMedia(31, SOCIAL_DEMO_USER_IDS.anto, [
    'profile-film-production.jpg',
  ]),
  projectAnto: demoMedia(32, SOCIAL_DEMO_USER_IDS.anto, [
    'profile-film-production.jpg',
  ]),
  achievementAnto: demoMedia(33, SOCIAL_DEMO_USER_IDS.anto, [
    'profile-certificate.png',
  ]),
  coverBenja: demoMedia(34, SOCIAL_DEMO_USER_IDS.benja, ['profile-code.jpg']),
  projectBenja: demoMedia(35, SOCIAL_DEMO_USER_IDS.benja, ['profile-code.jpg']),
  achievementBenja: demoMedia(36, SOCIAL_DEMO_USER_IDS.benja, [
    'profile-certificate.png',
  ]),
  coverJavi: demoMedia(37, SOCIAL_DEMO_USER_IDS.javi, [
    'profile-workspace.jpg',
  ]),
  projectJavi: demoMedia(38, SOCIAL_DEMO_USER_IDS.javi, [
    'profile-workspace.jpg',
  ]),
  achievementJavi: demoMedia(39, SOCIAL_DEMO_USER_IDS.javi, [
    'profile-certificate.png',
  ]),
  coverNico: demoMedia(40, SOCIAL_DEMO_USER_IDS.nico, [
    'profile-workspace.jpg',
  ]),
  projectNico: demoMedia(41, SOCIAL_DEMO_USER_IDS.nico, [
    'profile-workspace.jpg',
  ]),
  achievementNico: demoMedia(42, SOCIAL_DEMO_USER_IDS.nico, [
    'profile-certificate.png',
  ]),
  coverIsi: demoMedia(43, SOCIAL_DEMO_USER_IDS.isi, ['profile-warehouse.jpg']),
  projectIsi: demoMedia(44, SOCIAL_DEMO_USER_IDS.isi, [
    'profile-workspace.jpg',
  ]),
  achievementIsi: demoMedia(45, SOCIAL_DEMO_USER_IDS.isi, [
    'profile-certificate.png',
  ]),
  coverSeba: demoMedia(46, SOCIAL_DEMO_USER_IDS.seba, ['profile-code.jpg']),
  projectSeba: demoMedia(47, SOCIAL_DEMO_USER_IDS.seba, ['profile-code.jpg']),
  achievementSeba: demoMedia(48, SOCIAL_DEMO_USER_IDS.seba, [
    'profile-certificate.png',
  ]),
} as const

export type SocialDemoMediaKey = keyof typeof SOCIAL_DEMO_MEDIA

export const SOCIAL_DEMO_ASSET_DIRECTORY = fileURLToPath(
  new URL('../../demo-assets/social/', import.meta.url),
)

export type ResolvedSocialDemoAsset = {
  key: SocialDemoMediaKey
  id: string
  ownerId: string
  sourcePath: string
  sourceName: string
  storedName: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  size: number
}

const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
} as const

function hasExpectedSignature(
  header: Buffer,
  mimeType: ResolvedSocialDemoAsset['mimeType'],
) {
  if (mimeType === 'image/jpeg') {
    return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
  }
  if (mimeType === 'image/png') {
    return header
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  return (
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP'
  )
}

/**
 * Resuelve y valida todos los medios antes de modificar la base de datos.
 * El error enumera tanto la clave lógica como los nombres aceptados para que
 * sea sencillo alinear una descarga nueva sin cambiar el seeder.
 */
export async function resolveSocialDemoAssets(
  assetDirectory = SOCIAL_DEMO_ASSET_DIRECTORY,
) {
  const resolved = new Map<SocialDemoMediaKey, ResolvedSocialDemoAsset>()
  const errors: string[] = []

  for (const [key, specification] of Object.entries(SOCIAL_DEMO_MEDIA) as Array<
    [SocialDemoMediaKey, (typeof SOCIAL_DEMO_MEDIA)[SocialDemoMediaKey]]
  >) {
    let selectedPath = ''
    let selectedName = ''
    let selectedSize = 0

    for (const candidate of specification.candidates) {
      const candidatePath = join(assetDirectory, candidate)
      try {
        const details = await stat(candidatePath)
        if (details.isFile()) {
          selectedPath = candidatePath
          selectedName = candidate
          selectedSize = details.size
          break
        }
      } catch {
        // Se informa junto con el resto de assets faltantes al terminar.
      }
    }

    if (!selectedPath) {
      errors.push(
        `${key}: falta ${specification.candidates.join(' o ')} en ${assetDirectory}`,
      )
      continue
    }

    const extension = extname(selectedName).toLowerCase()
    const mimeType = mimeTypes[extension as keyof typeof mimeTypes]
    if (!mimeType) {
      errors.push(
        `${key}: extensión no soportada (${extension || 'sin extensión'})`,
      )
      continue
    }
    if (selectedSize <= 0 || selectedSize > 5 * 1024 * 1024) {
      errors.push(
        `${key}: ${selectedName} debe pesar entre 1 byte y 5 MB (actual: ${selectedSize})`,
      )
      continue
    }

    const header = (await readFile(selectedPath)).subarray(0, 16)
    if (!hasExpectedSignature(header, mimeType)) {
      errors.push(
        `${key}: la firma binaria de ${selectedName} no coincide con ${mimeType}`,
      )
      continue
    }

    resolved.set(key, {
      key,
      id: specification.id,
      ownerId: specification.ownerId,
      sourcePath: selectedPath,
      sourceName: selectedName,
      storedName: `${specification.id}${extension}`,
      mimeType,
      size: selectedSize,
    })
  }

  if (errors.length) {
    throw new Error(
      `No se puede preparar el entorno social de demostración:\n- ${errors.join('\n- ')}`,
    )
  }

  return resolved
}

type SocialDemoProject = Omit<ProfileProject, 'imageUrl'> & {
  imageMediaKey: SocialDemoMediaKey
}

type SocialDemoAchievement = Omit<ProfileAchievement, 'imageUrl'> & {
  imageMediaKey: SocialDemoMediaKey
}

type SocialDemoProfile = {
  id: string
  email: string
  username: string
  displayName: string
  role: 'student' | 'professor'
  bio: string
  institution: string
  campus: string
  career: string
  avatarMediaKey: SocialDemoMediaKey | null
  coverMediaKey: SocialDemoMediaKey | null
  education: ProfileEducation[]
  projects: SocialDemoProject[]
  achievements: SocialDemoAchievement[]
}

const currentEducation = (
  sequence: number,
  program: string,
): ProfileEducation[] => [
  {
    id: stableId('d5', sequence),
    institution: 'Duoc UC',
    program,
    startYear: 2024,
    endYear: null,
    current: true,
  },
]

export const SOCIAL_DEMO_PROFILES: SocialDemoProfile[] = [
  {
    id: SOCIAL_DEMO_USER_IDS.vale,
    email: 'vale.compila@demo.konea.local',
    username: 'vale.compila',
    displayName: 'Valentina Rojas',
    role: 'student',
    bio: 'Convirtiendo café y errores de TypeScript en entregas que sí compilan.',
    institution: 'Duoc UC',
    campus: 'Sede San Joaquín',
    career: 'Ingeniería en Informática',
    avatarMediaKey: 'postCatLaptop',
    coverMediaKey: 'coverVale',
    education: currentEducation(1, 'Ingeniería en Informática'),
    projects: [
      {
        id: stableId('d6', 1),
        title: 'Mapa colaborativo de salas',
        description:
          'Proyecto académico de demostración para ubicar laboratorios, salas y servicios dentro de la sede.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectVale',
        technologies: ['React', 'TypeScript', 'PostgreSQL'],
      },
      {
        id: stableId('d6', 5),
        title: 'Panel de acompañamiento de Capstone',
        description:
          'Prototipo ficticio que resume hitos, bloqueos y acuerdos de un equipo estudiantil.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectVale',
        technologies: ['Node.js', 'Figma', 'SQL'],
      },
    ],
    achievements: [
      {
        id: stableId('d7', 2),
        title: 'Prototipo colaborativo destacado',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-08',
        description:
          'Reconocimiento ficticio creado exclusivamente para demostrar el portafolio de Konea.',
        credentialUrl: null,
        imageMediaKey: 'achievementVale',
      },
    ],
  },
  {
    id: SOCIAL_DEMO_USER_IDS.mati,
    email: 'mati.en.loop@demo.konea.local',
    username: 'mati.en.loop',
    displayName: 'Matías Soto',
    role: 'student',
    bio: 'Programo, juego y vuelvo a programar hasta que desaparece el error.',
    institution: 'Duoc UC',
    campus: 'Sede Antonio Varas',
    career: 'Analista Programador',
    avatarMediaKey: 'avatarGodot',
    coverMediaKey: 'coverMati',
    education: currentEducation(2, 'Analista Programador'),
    projects: [
      {
        id: stableId('d6', 6),
        title: 'Bitácora de errores jugable',
        description:
          'Proyecto ficticio de demostración que convierte ejercicios de lógica en desafíos breves.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectMati',
        technologies: ['Godot', 'GDScript', 'Git'],
      },
    ],
    achievements: [
      {
        id: stableId('d7', 3),
        title: 'Mención por depuración creativa',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-05',
        description:
          'Hito ficticio incorporado para mostrar certificaciones y logros dentro del perfil.',
        credentialUrl: null,
        imageMediaKey: 'achievementMati',
      },
    ],
  },
  {
    id: SOCIAL_DEMO_USER_IDS.fer,
    email: 'fer.trazos@demo.konea.local',
    username: 'fer.trazos',
    displayName: 'Fernanda Leiva',
    role: 'student',
    bio: 'Ilustración, narrativa visual y demasiados pinceles sin nombre.',
    institution: 'Duoc UC',
    campus: 'Sede Viña del Mar',
    career: 'Ilustración para Contextos Globales',
    avatarMediaKey: 'avatarKiki',
    coverMediaKey: 'coverFer',
    education: currentEducation(3, 'Ilustración para Contextos Globales'),
    projects: [
      {
        id: stableId('d6', 2),
        title: 'Bestiario del transporte público',
        description:
          'Serie ficticia de personajes inspirados en trayectos cotidianos por Valparaíso y Viña del Mar.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectFer',
        technologies: ['Procreate', 'Photoshop'],
      },
      {
        id: stableId('d6', 7),
        title: 'Guía visual de emociones académicas',
        description:
          'Proyecto de demostración con recursos gráficos para comunicar estados de ánimo sin exponer datos personales.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectFer',
        technologies: ['Krita', 'Illustrator'],
      },
    ],
    achievements: [
      {
        id: stableId('d7', 4),
        title: 'Selección de narrativa visual',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-07',
        description:
          'Selección simulada para enseñar cómo Konea presenta hitos creativos en un portafolio.',
        credentialUrl: null,
        imageMediaKey: 'achievementFer',
      },
      {
        id: stableId('d7', 5),
        title: 'Taller de accesibilidad gráfica',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-09',
        description:
          'Constancia ficticia utilizada únicamente como contenido demostrativo.',
        credentialUrl: null,
        imageMediaKey: 'achievementFer',
      },
    ],
  },
  {
    id: SOCIAL_DEMO_USER_IDS.diego,
    email: 'dieguito.wav@demo.konea.local',
    username: 'dieguito.wav',
    displayName: 'Diego Muñoz',
    role: 'student',
    bio: 'Si suena raro, probablemente todavía estoy mezclándolo.',
    institution: 'Duoc UC',
    campus: 'Sede San Carlos de Apoquindo',
    career: 'Ingeniería en Sonido',
    avatarMediaKey: 'avatarSupertuxkart',
    coverMediaKey: 'coverDiego',
    education: currentEducation(4, 'Ingeniería en Sonido'),
    projects: [
      {
        id: stableId('d6', 8),
        title: 'Paisaje sonoro de la sede',
        description:
          'Proyecto ficticio de demostración que mezcla sonidos cotidianos para una pieza inmersiva.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectDiego',
        technologies: ['Reaper', 'Pro Tools', 'Field Recording'],
      },
    ],
    achievements: [
      {
        id: stableId('d7', 6),
        title: 'Mezcla estudiantil destacada',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-06',
        description:
          'Reconocimiento ficticio incluido para la demostración del módulo de portafolio.',
        credentialUrl: null,
        imageMediaKey: 'achievementDiego',
      },
    ],
  },
  {
    id: SOCIAL_DEMO_USER_IDS.cami,
    email: 'cami.logistica@demo.konea.local',
    username: 'cami.logistica',
    displayName: 'Camila Herrera',
    role: 'student',
    bio: 'Organizando rutas, inventarios y al grupo que responde cinco minutos antes.',
    institution: 'Duoc UC',
    campus: 'Sede Plaza Oeste',
    career: 'Ingeniería en Gestión Logística',
    avatarMediaKey: 'avatarBlackCat',
    coverMediaKey: 'coverCami',
    education: currentEducation(5, 'Ingeniería en Gestión Logística'),
    projects: [
      {
        id: stableId('d6', 9),
        title: 'Simulador de preparación de pedidos',
        description:
          'Caso ficticio de portafolio para comparar recorridos y tiempos de preparación en bodega.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectCami',
        technologies: ['Power BI', 'Excel', 'SQL'],
      },
    ],
    achievements: [
      {
        id: stableId('d7', 1),
        title: 'Finalista desafío de mejora de procesos',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-06',
        description:
          'Reconocimiento ficticio a una propuesta estudiantil para reducir tiempos de preparación.',
        credentialUrl: null,
        imageMediaKey: 'achievementCami',
      },
      {
        id: stableId('d7', 7),
        title: 'Taller de visualización de operaciones',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-08',
        description:
          'Constancia ficticia creada para mostrar múltiples logros en un perfil de demostración.',
        credentialUrl: null,
        imageMediaKey: 'achievementCami',
      },
    ],
  },
  {
    id: SOCIAL_DEMO_USER_IDS.tomas,
    email: 'tomas.sin.cafe@demo.konea.local',
    username: 'tomas.sin.cafe',
    displayName: 'Tomás Araya',
    role: 'student',
    bio: 'Backend, bases de datos y opiniones probablemente demasiado largas.',
    institution: 'Duoc UC',
    campus: 'Sede Padre Alonso de Ovalle',
    career: 'Ingeniería en Informática',
    avatarMediaKey: 'postStudyDesk',
    coverMediaKey: 'coverTomas',
    education: currentEducation(6, 'Ingeniería en Informática'),
    projects: [
      {
        id: stableId('d6', 10),
        title: 'API para grupos de estudio',
        description:
          'Proyecto ficticio de demostración para coordinar sesiones, materias y disponibilidad.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectTomas',
        technologies: ['Node.js', 'Express', 'PostgreSQL'],
      },
    ],
    achievements: [
      {
        id: stableId('d7', 8),
        title: 'Buenas prácticas de bases de datos',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-05',
        description:
          'Insignia ficticia preparada exclusivamente para la experiencia demo de Konea.',
        credentialUrl: null,
        imageMediaKey: 'achievementTomas',
      },
    ],
  },
  {
    id: SOCIAL_DEMO_USER_IDS.anto,
    email: 'anto.en.camara@demo.konea.local',
    username: 'anto.en.camara',
    displayName: 'Antonia Paredes',
    role: 'student',
    bio: 'Dirección, montaje y planes de rodaje que sobreviven al clima.',
    institution: 'Duoc UC',
    campus: 'Sede Viña del Mar',
    career: 'Comunicación Audiovisual',
    avatarMediaKey: 'postPurpleWorkspace',
    coverMediaKey: 'coverAnto',
    education: currentEducation(7, 'Comunicación Audiovisual'),
    projects: [
      {
        id: stableId('d6', 3),
        title: 'Último recorrido',
        description:
          'Cortometraje ficticio sobre las historias que coinciden en el último bus de la noche.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectAnto',
        technologies: ['DaVinci Resolve', 'Premiere Pro'],
      },
      {
        id: stableId('d6', 11),
        title: 'Detrás de una entrega',
        description:
          'Microdocumental de demostración sobre la coordinación de un equipo audiovisual estudiantil.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectAnto',
        technologies: ['After Effects', 'Audition'],
      },
    ],
    achievements: [
      {
        id: stableId('d7', 9),
        title: 'Muestra audiovisual estudiantil',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-07',
        description:
          'Participación ficticia incluida para enseñar la sección de logros del perfil.',
        credentialUrl: null,
        imageMediaKey: 'achievementAnto',
      },
    ],
  },
  {
    id: SOCIAL_DEMO_USER_IDS.benja,
    email: 'benja.redes@demo.konea.local',
    username: 'benja.redes',
    displayName: 'Benjamín Vera',
    role: 'student',
    bio: 'Redes, Linux y el cable que nadie quería revisar.',
    institution: 'Duoc UC',
    campus: 'Sede San Joaquín',
    career: 'Ingeniería en Redes y Telecomunicaciones',
    avatarMediaKey: 'postBlackCatComputer',
    coverMediaKey: 'coverBenja',
    education: currentEducation(8, 'Ingeniería en Redes y Telecomunicaciones'),
    projects: [
      {
        id: stableId('d6', 12),
        title: 'Monitor del laboratorio 302',
        description:
          'Proyecto ficticio de demostración que registra disponibilidad y alertas de una red de laboratorio.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectBenja',
        technologies: ['Linux', 'Docker', 'Grafana'],
      },
    ],
    achievements: [
      {
        id: stableId('d7', 10),
        title: 'Laboratorio de redes seguras',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-04',
        description:
          'Constancia ficticia utilizada para demostrar medios adjuntos a certificaciones.',
        credentialUrl: null,
        imageMediaKey: 'achievementBenja',
      },
      {
        id: stableId('d7', 11),
        title: 'Desafío de observabilidad',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-09',
        description:
          'Hito simulado para mostrar una trayectoria técnica más completa.',
        credentialUrl: null,
        imageMediaKey: 'achievementBenja',
      },
    ],
  },
  {
    id: SOCIAL_DEMO_USER_IDS.javi,
    email: 'javi.disena@demo.konea.local',
    username: 'javi.disena',
    displayName: 'Javiera Salas',
    role: 'student',
    bio: 'Diseño identidades, interfaces y presentaciones con una capa de más.',
    institution: 'Duoc UC',
    campus: 'Sede Plaza Vespucio',
    career: 'Diseño Gráfico',
    avatarMediaKey: 'avatarPepper',
    coverMediaKey: 'coverJavi',
    education: currentEducation(9, 'Diseño Gráfico'),
    projects: [
      {
        id: stableId('d6', 4),
        title: 'Señalética accesible para talleres',
        description:
          'Proyecto ficticio de alto contraste para recorridos y espacios de trabajo.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectJavi',
        technologies: ['Figma', 'Illustrator'],
      },
    ],
    achievements: [
      {
        id: stableId('d7', 12),
        title: 'Mención de diseño inclusivo',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-06',
        description:
          'Reconocimiento ficticio incorporado para visualizar un portafolio de diseño completo.',
        credentialUrl: null,
        imageMediaKey: 'achievementJavi',
      },
    ],
  },
  {
    id: SOCIAL_DEMO_USER_IDS.nico,
    email: 'nico.turno@demo.konea.local',
    username: 'nico.turno',
    displayName: 'Nicolás Fuentes',
    role: 'student',
    bio: 'Sobreviviendo a prácticas, apuntes y alarmas demasiado tempranas.',
    institution: 'Duoc UC',
    campus: 'Sede Puente Alto',
    career: 'Técnico en Enfermería',
    avatarMediaKey: 'avatarGreyKitten',
    coverMediaKey: 'coverNico',
    education: currentEducation(10, 'Técnico en Enfermería'),
    projects: [
      {
        id: stableId('d6', 13),
        title: 'Checklist de preparación de turno',
        description:
          'Recurso ficticio de demostración para organizar materiales, pausas y aprendizajes de práctica.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectNico',
        technologies: ['Notion', 'Canva', 'Excel'],
      },
    ],
    achievements: [
      {
        id: stableId('d7', 13),
        title: 'Taller simulado de primeros auxilios',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-08',
        description:
          'Constancia completamente ficticia para demostrar la presentación de formación complementaria.',
        credentialUrl: null,
        imageMediaKey: 'achievementNico',
      },
    ],
  },
  {
    id: SOCIAL_DEMO_USER_IDS.isi,
    email: 'isi.marketing@demo.konea.local',
    username: 'isi.marketing',
    displayName: 'Isidora Peña',
    role: 'student',
    bio: 'Marketing, tendencias y métricas que sí deberían venir con contexto.',
    institution: 'Duoc UC',
    campus: 'Sede Maipú',
    career: 'Ingeniería en Marketing Digital',
    avatarMediaKey: 'avatarOrangeCat',
    coverMediaKey: 'coverIsi',
    education: currentEducation(11, 'Ingeniería en Marketing Digital'),
    projects: [
      {
        id: stableId('d6', 14),
        title: 'Panel de campaña para feria estudiantil',
        description:
          'Caso ficticio de portafolio para analizar alcance, interacción y conversiones de una campaña.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectIsi',
        technologies: ['Looker Studio', 'Figma', 'Google Sheets'],
      },
    ],
    achievements: [
      {
        id: stableId('d7', 14),
        title: 'Pitch de campaña destacado',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-07',
        description:
          'Reconocimiento ficticio preparado para mostrar logros vinculados al área de marketing.',
        credentialUrl: null,
        imageMediaKey: 'achievementIsi',
      },
    ],
  },
  {
    id: SOCIAL_DEMO_USER_IDS.seba,
    email: 'seba.ultimahora@demo.konea.local',
    username: 'seba_ultimahora',
    displayName: 'Sebastián Lagos',
    role: 'student',
    bio: 'Llego justo, entrego justo y siempre tengo una opinión impopular.',
    institution: 'Duoc UC',
    campus: 'Sede Plaza Norte',
    career: 'Ingeniería en Informática',
    avatarMediaKey: 'avatarGrumpyCat',
    coverMediaKey: 'coverSeba',
    education: currentEducation(12, 'Ingeniería en Informática'),
    projects: [
      {
        id: stableId('d6', 15),
        title: 'Radar de entregas críticas',
        description:
          'Aplicación ficticia de demostración para priorizar entregas y detectar plazos demasiado ajustados.',
        url: null,
        repositoryUrl: null,
        imageMediaKey: 'projectSeba',
        technologies: ['Vue', 'TypeScript', 'SQLite'],
      },
    ],
    achievements: [
      {
        id: stableId('d7', 15),
        title: 'Reto de prototipado rápido',
        issuer: 'Konea · escenario ficticio',
        issuedAt: '2026-05',
        description:
          'Hito ficticio creado para poblar la vista de logros durante la demostración.',
        credentialUrl: null,
        imageMediaKey: 'achievementSeba',
      },
    ],
  },
  {
    id: SOCIAL_DEMO_USER_IDS.news,
    email: 'noticias.duoc.demo@demo.konea.local',
    username: 'noticias.duoc.demo',
    displayName: 'Noticias Duoc UC · demo',
    role: 'professor',
    bio: 'Cuenta demostrativa no oficial. Resume información pública y enlaza siempre la fuente original de Duoc UC.',
    institution: 'Duoc UC',
    campus: 'Campus Virtual',
    career: 'Administración Pública',
    avatarMediaKey: null,
    coverMediaKey: null,
    education: [],
    projects: [],
    achievements: [],
  },
]

export type SocialDemoPost = {
  id: string
  authorId: string
  content: string
  contentType: 'community' | 'announcement'
  visibility: 'campus' | 'public'
  imageMediaKey?: SocialDemoMediaKey
  shareCount: number
  likeCount: number
  ageHours?: number
  publishedAt?: string
  sourceUrl?: string
}

const postId = (sequence: number) => stableId('d3', sequence)

export const SOCIAL_DEMO_POSTS: SocialDemoPost[] = [
  {
    id: postId(1),
    authorId: SOCIAL_DEMO_USER_IDS.vale,
    content:
      'Mi ayudante de Capstone decidió dormir sobre el notebook justo cuando iba a hacer push. ¿Esto cuenta como revisión de código? 🐈💻',
    contentType: 'community',
    visibility: 'campus',
    imageMediaKey: 'postCatLaptop',
    shareCount: 2,
    likeCount: 8,
    ageHours: 3,
  },
  {
    id: postId(2),
    authorId: SOCIAL_DEMO_USER_IDS.mati,
    content:
      '¿Alguien tiene un método que le haya servido para estudiar Fundamentos de Matemáticas sin memorizar todo a última hora? Tengo prueba el viernes y quiero organizarme bien.',
    contentType: 'community',
    visibility: 'campus',
    shareCount: 1,
    likeCount: 5,
    ageHours: 8,
  },
  {
    id: postId(3),
    authorId: SOCIAL_DEMO_USER_IDS.cami,
    content:
      'Encontré una tarjeta Bip! con una cinta morada afuera de la biblioteca. La dejé en portería indicando la hora y el lugar por si es de alguien de acá.',
    contentType: 'community',
    visibility: 'campus',
    shareCount: 3,
    likeCount: 6,
    ageHours: 13,
  },
  {
    id: postId(4),
    authorId: SOCIAL_DEMO_USER_IDS.tomas,
    content:
      'Opinión impopular: muchos trabajos grupales terminan evaluando disponibilidad de horario más que aprendizaje. La pauta debería separar mejor el aporte individual. Los leo 👀',
    contentType: 'community',
    visibility: 'campus',
    imageMediaKey: 'postStudyDesk',
    shareCount: 3,
    likeCount: 9,
    ageHours: 20,
  },
  {
    id: postId(5),
    authorId: SOCIAL_DEMO_USER_IDS.diego,
    content:
      'Ranking completamente científico del café de sede: máquina del segundo piso > cafetería del patio > el que preparo apurado antes de salir. Acepto evidencia en contra.',
    contentType: 'community',
    visibility: 'campus',
    shareCount: 1,
    likeCount: 7,
    ageHours: 30,
  },
  {
    id: postId(6),
    authorId: SOCIAL_DEMO_USER_IDS.anto,
    content:
      'Buscamos dos personas para actuar en un cortometraje estudiantil este sábado en Viña. No se necesita experiencia; sí puntualidad y ganas de participar. Si les interesa, comenten y les envío los detalles.',
    contentType: 'community',
    visibility: 'public',
    imageMediaKey: 'postPurpleWorkspace',
    shareCount: 4,
    likeCount: 8,
    ageHours: 40,
  },
  {
    id: postId(7),
    authorId: SOCIAL_DEMO_USER_IDS.benja,
    content:
      '¿A alguien más se le cayó la conexión del laboratorio 302 o mi computador decidió iniciar el fin de semana antes que yo?',
    contentType: 'community',
    visibility: 'campus',
    imageMediaKey: 'postBlackCatComputer',
    shareCount: 0,
    likeCount: 5,
    ageHours: 50,
  },
  {
    id: postId(8),
    authorId: SOCIAL_DEMO_USER_IDS.javi,
    content:
      'Estoy ordenando mi portafolio y no sé si abrir con el proyecto más completo o con el que tiene mejor historia visual. ¿Qué miran primero cuando revisan uno?',
    contentType: 'community',
    visibility: 'public',
    shareCount: 1,
    likeCount: 7,
    ageHours: 60,
  },
  {
    id: postId(9),
    authorId: SOCIAL_DEMO_USER_IDS.nico,
    content:
      'Primera semana de práctica completada. Aprendí muchísimo, anoté todo y ahora entiendo por qué el descanso también forma parte de organizarse 😴',
    contentType: 'community',
    visibility: 'campus',
    shareCount: 0,
    likeCount: 8,
    ageHours: 72,
  },
  {
    id: postId(10),
    authorId: SOCIAL_DEMO_USER_IDS.isi,
    content:
      'El profesor dijo “es una actividad corta para comprobar conocimientos” y apareció un quiz de 18 preguntas. El marketing de expectativas estuvo impecable.',
    contentType: 'community',
    visibility: 'campus',
    shareCount: 2,
    likeCount: 10,
    ageHours: 85,
  },
  {
    id: postId(11),
    authorId: SOCIAL_DEMO_USER_IDS.seba,
    content:
      'Si un grupo tuvo tres semanas y entrega tarde, quizá el problema no era el plazo. Digo nomás.',
    contentType: 'community',
    visibility: 'campus',
    shareCount: 2,
    likeCount: 6,
    ageHours: 100,
  },
  {
    id: postId(12),
    authorId: SOCIAL_DEMO_USER_IDS.vale,
    content:
      'Voy a estar mañana en biblioteca repasando Node y PostgreSQL desde las 16:00. Si alguien quiere sumarse a resolver dudas y comparar apuntes, apaño.',
    contentType: 'community',
    visibility: 'campus',
    shareCount: 2,
    likeCount: 6,
    ageHours: 118,
  },
  {
    id: postId(13),
    authorId: SOCIAL_DEMO_USER_IDS.cami,
    content:
      '¿Alguien ha gestionado un cambio de sección este semestre? DUCO me ayudó a ordenar los antecedentes y preparar el borrador, pero quisiera saber cuánto demoró la respuesta.',
    contentType: 'community',
    visibility: 'campus',
    shareCount: 1,
    likeCount: 4,
    ageHours: 140,
  },
  {
    id: postId(14),
    authorId: SOCIAL_DEMO_USER_IDS.diego,
    content:
      'Estamos armando torneo amistoso de juegos de carrera para el viernes después de clases. La idea es desconectarse un rato; principiantes totalmente bienvenidos.',
    contentType: 'community',
    visibility: 'public',
    shareCount: 3,
    likeCount: 7,
    ageHours: 165,
  },
  {
    id: postId(15),
    authorId: SOCIAL_DEMO_USER_IDS.tomas,
    content:
      'Recordatorio amistoso para quienes cruzan media ciudad: revisen el pronóstico y salgan con tiempo. Hoy llegamos cinco personas empapadas a la misma prueba.',
    contentType: 'community',
    visibility: 'campus',
    shareCount: 2,
    likeCount: 7,
    ageHours: 190,
  },
  {
    id: postId(16),
    authorId: SOCIAL_DEMO_USER_IDS.news,
    content:
      'AVISO VIGENTE · Calendario académico 2026 · Revisa las fechas académicas y confirma siempre posibles actualizaciones directamente en el sitio oficial de Duoc UC.\n\nFuente oficial: https://www.duoc.cl/calendario-academico/',
    contentType: 'announcement',
    visibility: 'public',
    shareCount: 4,
    likeCount: 7,
    publishedAt: '2026-09-22T12:00:00.000Z',
    sourceUrl: 'https://www.duoc.cl/calendario-academico/',
  },
  {
    id: postId(17),
    authorId: SOCIAL_DEMO_USER_IDS.news,
    content:
      'NOTICIA · 16-09-2026 · Una especialista de Duoc UC participó en una jornada nacional sobre seguridad del paciente. Este post es un resumen demostrativo; consulta la nota original para conocer el contexto completo.\n\nFuente oficial: https://www.duoc.cl/?noticia_post_type=especialista-de-duoc-uc-participa-en-jornada-nacional-sobre-seguridad-del-paciente',
    contentType: 'announcement',
    visibility: 'public',
    shareCount: 2,
    likeCount: 6,
    publishedAt: '2026-09-16T16:00:00.000Z',
    sourceUrl:
      'https://www.duoc.cl/?noticia_post_type=especialista-de-duoc-uc-participa-en-jornada-nacional-sobre-seguridad-del-paciente',
  },
  {
    id: postId(18),
    authorId: SOCIAL_DEMO_USER_IDS.news,
    content:
      'NOTICIA · 09-09-2026 · Estudiantes de Duoc UC desarrollaron soluciones para el desafío Marketing Challenge 2026. Revisa la publicación original para ver los detalles de la experiencia.\n\nFuente oficial: https://www.duoc.cl/?noticia_post_type=estudiantes-de-duoc-uc-desarrollan-soluciones-para-desafio-de-marketing-challenge-2026',
    contentType: 'announcement',
    visibility: 'public',
    shareCount: 3,
    likeCount: 8,
    publishedAt: '2026-09-09T15:00:00.000Z',
    sourceUrl:
      'https://www.duoc.cl/?noticia_post_type=estudiantes-de-duoc-uc-desarrollan-soluciones-para-desafio-de-marketing-challenge-2026',
  },
  {
    id: postId(19),
    authorId: SOCIAL_DEMO_USER_IDS.news,
    content:
      'NOTICIA · 09-09-2026 · Toyota Chile y Duoc UC impulsaron a una primera generación de mujeres que busca abrirse camino en la industria automotriz.\n\nFuente oficial: https://www.duoc.cl/?noticia_post_type=toyota-chile-y-duoc-uc-impulsan-a-primera-generacion-de-mujeres-que-busca-abrirse-camino-en-la-industria-automotriz',
    contentType: 'announcement',
    visibility: 'public',
    shareCount: 3,
    likeCount: 8,
    publishedAt: '2026-09-09T14:00:00.000Z',
    sourceUrl:
      'https://www.duoc.cl/?noticia_post_type=toyota-chile-y-duoc-uc-impulsan-a-primera-generacion-de-mujeres-que-busca-abrirse-camino-en-la-industria-automotriz',
  },
  {
    id: postId(20),
    authorId: SOCIAL_DEMO_USER_IDS.news,
    content:
      'ARCHIVO · ACTIVIDAD FINALIZADA · 10-07-2026 · Estudiantes y titulados de Duoc UC ganaron el Pitch Indie 2026 de Chilemonos con “La aprendiz de bruja”.\n\nFuente oficial: https://www.duoc.cl/?noticia_post_type=estudiantes-y-titulados-duoc-uc-ganan-el-pitch-indie-2026-de-chilemonos-conla-aprendiz-de-bruja',
    contentType: 'announcement',
    visibility: 'public',
    shareCount: 2,
    likeCount: 7,
    publishedAt: '2026-07-10T16:00:00.000Z',
    sourceUrl:
      'https://www.duoc.cl/?noticia_post_type=estudiantes-y-titulados-duoc-uc-ganan-el-pitch-indie-2026-de-chilemonos-conla-aprendiz-de-bruja',
  },
  {
    id: postId(21),
    authorId: SOCIAL_DEMO_USER_IDS.news,
    content:
      'ARCHIVO · ACTIVIDAD FINALIZADA · 02-12-2025 · Portfolio Night Santiago 2025 conectó a jóvenes talentos de Duoc UC con la industria creativa. Se conserva como referencia de actividades anteriores.\n\nFuente oficial: https://www.duoc.cl/?noticia_post_type=portfolio-night-santiago-2025-jovenes-talentos-de-duoc-uc-se-conectan-con-la-industria-creativa',
    contentType: 'announcement',
    visibility: 'public',
    shareCount: 1,
    likeCount: 6,
    publishedAt: '2025-12-02T15:00:00.000Z',
    sourceUrl:
      'https://www.duoc.cl/?noticia_post_type=portfolio-night-santiago-2025-jovenes-talentos-de-duoc-uc-se-conectan-con-la-industria-creativa',
  },
  {
    id: postId(22),
    authorId: SOCIAL_DEMO_USER_IDS.news,
    content:
      'ARCHIVO · ACTIVIDAD FINALIZADA · 16-09-2024 · La Feria Intercarreras fue una instancia para conectar a estudiantes con la industria. Esta publicación histórica se muestra como referencia.\n\nFuente oficial: https://www.duoc.cl/?noticia_post_type=feria-intercarreras-una-instancia-que-conecta-a-los-estudiantes-con-la-industria',
    contentType: 'announcement',
    visibility: 'public',
    shareCount: 1,
    likeCount: 5,
    publishedAt: '2024-09-16T15:00:00.000Z',
    sourceUrl:
      'https://www.duoc.cl/?noticia_post_type=feria-intercarreras-una-instancia-que-conecta-a-los-estudiantes-con-la-industria',
  },
]

export type SocialDemoComment = {
  id: string
  postId: string
  authorId: string
  parentCommentId?: string
  content: string
  minutesAfterPost: number
}

const commentId = (sequence: number) => stableId('d4', sequence)

export const SOCIAL_DEMO_COMMENTS: SocialDemoComment[] = [
  {
    id: commentId(1),
    postId: postId(1),
    authorId: SOCIAL_DEMO_USER_IDS.mati,
    content: 'Ese gato hizo un push directo a main.',
    minutesAfterPost: 18,
  },
  {
    id: commentId(2),
    postId: postId(1),
    authorId: SOCIAL_DEMO_USER_IDS.vale,
    parentCommentId: commentId(1),
    content: 'Sin tests y con una seguridad envidiable.',
    minutesAfterPost: 27,
  },
  {
    id: commentId(3),
    postId: postId(1),
    authorId: SOCIAL_DEMO_USER_IDS.benja,
    content: 'Perfil senior, claramente.',
    minutesAfterPost: 42,
  },
  {
    id: commentId(4),
    postId: postId(2),
    authorId: SOCIAL_DEMO_USER_IDS.vale,
    content: 'Tengo un resumen por temas. Lo puedo llevar mañana a biblioteca.',
    minutesAfterPost: 24,
  },
  {
    id: commentId(5),
    postId: postId(2),
    authorId: SOCIAL_DEMO_USER_IDS.cami,
    content:
      'Me sumo si hacen grupo. A mí me sirve resolver ejercicios cortos y explicar el procedimiento.',
    minutesAfterPost: 41,
  },
  {
    id: commentId(6),
    postId: postId(2),
    authorId: SOCIAL_DEMO_USER_IDS.mati,
    parentCommentId: commentId(5),
    content:
      'Buena, les escribo para coordinarnos sin llenar el post de horarios.',
    minutesAfterPost: 55,
  },
  {
    id: commentId(7),
    postId: postId(3),
    authorId: SOCIAL_DEMO_USER_IDS.nico,
    content: 'Grande por dejarla en portería y no publicar los datos.',
    minutesAfterPost: 30,
  },
  {
    id: commentId(8),
    postId: postId(3),
    authorId: SOCIAL_DEMO_USER_IDS.isi,
    content: 'Compartido al grupo de la sede, ojalá aparezca la persona.',
    minutesAfterPost: 48,
  },
  {
    id: commentId(9),
    postId: postId(4),
    authorId: SOCIAL_DEMO_USER_IDS.cami,
    content:
      'Coordinarse también es una habilidad, pero estoy de acuerdo con que la nota individual debería pesar más.',
    minutesAfterPost: 25,
  },
  {
    id: commentId(10),
    postId: postId(4),
    authorId: SOCIAL_DEMO_USER_IDS.seba,
    content:
      'Si cada persona cumple su parte, el horario deja de ser el problema.',
    minutesAfterPost: 44,
  },
  {
    id: commentId(11),
    postId: postId(4),
    authorId: SOCIAL_DEMO_USER_IDS.tomas,
    parentCommentId: commentId(10),
    content:
      'A veces hay dependencias entre tareas. Por eso una pauta más transparente ayudaría a todos.',
    minutesAfterPost: 61,
  },
  {
    id: commentId(12),
    postId: postId(4),
    authorId: SOCIAL_DEMO_USER_IDS.javi,
    content:
      'La coevaluación bien diseñada salva bastante, siempre que no sea solo poner una nota al final.',
    minutesAfterPost: 79,
  },
  {
    id: commentId(13),
    postId: postId(5),
    authorId: SOCIAL_DEMO_USER_IDS.isi,
    content:
      'La máquina del segundo piso gana por consistencia, no necesariamente por sabor.',
    minutesAfterPost: 16,
  },
  {
    id: commentId(14),
    postId: postId(5),
    authorId: SOCIAL_DEMO_USER_IDS.diego,
    parentCommentId: commentId(13),
    content: 'Acepto el criterio, pero eso suena a agua con intención de café.',
    minutesAfterPost: 23,
  },
  {
    id: commentId(15),
    postId: postId(5),
    authorId: SOCIAL_DEMO_USER_IDS.nico,
    content: 'El de termo traído desde la casa supera a todos y cuesta menos.',
    minutesAfterPost: 57,
  },
  {
    id: commentId(16),
    postId: postId(6),
    authorId: SOCIAL_DEMO_USER_IDS.javi,
    content: 'Me interesa. ¿Tienen una referencia del estilo visual?',
    minutesAfterPost: 35,
  },
  {
    id: commentId(17),
    postId: postId(6),
    authorId: SOCIAL_DEMO_USER_IDS.nico,
    content: '¿En qué horario sería? Podría después de mi práctica.',
    minutesAfterPost: 54,
  },
  {
    id: commentId(18),
    postId: postId(6),
    authorId: SOCIAL_DEMO_USER_IDS.anto,
    parentCommentId: commentId(17),
    content: 'Entre 15:00 y 18:00. Te mando la pauta por interno.',
    minutesAfterPost: 66,
  },
  {
    id: commentId(19),
    postId: postId(7),
    authorId: SOCIAL_DEMO_USER_IDS.vale,
    content: 'Acá también falló. Cambiamos el cable y volvió por unos minutos.',
    minutesAfterPost: 12,
  },
  {
    id: commentId(20),
    postId: postId(7),
    authorId: SOCIAL_DEMO_USER_IDS.benja,
    parentCommentId: commentId(19),
    content: 'Entonces no era solo mi equipo, gracias por confirmar.',
    minutesAfterPost: 19,
  },
  {
    id: commentId(21),
    postId: postId(7),
    authorId: SOCIAL_DEMO_USER_IDS.mati,
    content:
      'El laboratorio ya lo reportó a soporte, dijeron que lo estaban revisando.',
    minutesAfterPost: 38,
  },
  {
    id: commentId(22),
    postId: postId(8),
    authorId: SOCIAL_DEMO_USER_IDS.fer,
    content:
      'Yo abriría con el proyecto que mejor explica tu proceso. Después muestras la pieza más pulida.',
    minutesAfterPost: 31,
  },
  {
    id: commentId(23),
    postId: postId(8),
    authorId: SOCIAL_DEMO_USER_IDS.javi,
    parentCommentId: commentId(22),
    content: 'Tiene sentido: contexto, proceso y luego resultado. Gracias.',
    minutesAfterPost: 47,
  },
  {
    id: commentId(24),
    postId: postId(9),
    authorId: SOCIAL_DEMO_USER_IDS.cami,
    content:
      'Felicitaciones por la primera semana. Descansar también es parte del plan.',
    minutesAfterPost: 28,
  },
  {
    id: commentId(25),
    postId: postId(9),
    authorId: SOCIAL_DEMO_USER_IDS.nico,
    parentCommentId: commentId(24),
    content: 'Aprendido a la fuerza, pero aprendido jajaja.',
    minutesAfterPost: 39,
  },
  {
    id: commentId(26),
    postId: postId(10),
    authorId: SOCIAL_DEMO_USER_IDS.seba,
    content: 'Técnicamente avisó que comprobaría conocimientos.',
    minutesAfterPost: 14,
  },
  {
    id: commentId(27),
    postId: postId(10),
    authorId: SOCIAL_DEMO_USER_IDS.isi,
    parentCommentId: commentId(26),
    content: 'La letra chica académica nunca falla.',
    minutesAfterPost: 21,
  },
  {
    id: commentId(28),
    postId: postId(11),
    authorId: SOCIAL_DEMO_USER_IDS.vale,
    content:
      'O quizá el alcance estaba mal estimado. Sin contexto es difícil culpar al grupo completo.',
    minutesAfterPost: 20,
  },
  {
    id: commentId(29),
    postId: postId(11),
    authorId: SOCIAL_DEMO_USER_IDS.seba,
    parentCommentId: commentId(28),
    content:
      'Puede ser. En este caso cambiaron el tema dos veces, así que contexto sí faltaba.',
    minutesAfterPost: 34,
  },
  {
    id: commentId(30),
    postId: postId(11),
    authorId: SOCIAL_DEMO_USER_IDS.cami,
    content:
      'Planificar ayuda, pero avisar a tiempo cuando algo se bloquea ayuda todavía más.',
    minutesAfterPost: 49,
  },
  {
    id: commentId(31),
    postId: postId(11),
    authorId: SOCIAL_DEMO_USER_IDS.mati,
    content:
      'La conclusión oficial es que necesitamos retrospectiva y menos indirectas.',
    minutesAfterPost: 64,
  },
  {
    id: commentId(32),
    postId: postId(12),
    authorId: SOCIAL_DEMO_USER_IDS.benja,
    content: 'Apaño con PostgreSQL. Me falta practicar joins y transacciones.',
    minutesAfterPost: 17,
  },
  {
    id: commentId(33),
    postId: postId(12),
    authorId: SOCIAL_DEMO_USER_IDS.mati,
    content:
      'Voy. Puedo llevar ejercicios de Node que nos dejaron el semestre pasado.',
    minutesAfterPost: 29,
  },
  {
    id: commentId(34),
    postId: postId(12),
    authorId: SOCIAL_DEMO_USER_IDS.vale,
    parentCommentId: commentId(32),
    content:
      'Perfecto, partimos por joins y después vemos transacciones con un ejemplo chico.',
    minutesAfterPost: 38,
  },
  {
    id: commentId(35),
    postId: postId(13),
    authorId: SOCIAL_DEMO_USER_IDS.mati,
    content:
      'A mí me respondieron en cuatro días hábiles. Tener el borrador claro evitó que me pidieran lo mismo dos veces.',
    minutesAfterPost: 22,
  },
  {
    id: commentId(36),
    postId: postId(13),
    authorId: SOCIAL_DEMO_USER_IDS.cami,
    parentCommentId: commentId(35),
    content: 'Buen dato, entonces adjunto todo desde el primer envío.',
    minutesAfterPost: 36,
  },
  {
    id: commentId(37),
    postId: postId(14),
    authorId: SOCIAL_DEMO_USER_IDS.benja,
    content: 'Me anoto. Prometo no culpar al control si quedo último.',
    minutesAfterPost: 20,
  },
  {
    id: commentId(38),
    postId: postId(14),
    authorId: SOCIAL_DEMO_USER_IDS.fer,
    content: '¿Aceptan gente que todavía confunde freno con derrape?',
    minutesAfterPost: 42,
  },
  {
    id: commentId(39),
    postId: postId(14),
    authorId: SOCIAL_DEMO_USER_IDS.diego,
    parentCommentId: commentId(38),
    content: 'Ese es exactamente el espíritu del torneo.',
    minutesAfterPost: 50,
  },
  {
    id: commentId(40),
    postId: postId(15),
    authorId: SOCIAL_DEMO_USER_IDS.nico,
    content:
      'Confirmo. Una chaqueta impermeable vale más que cualquier técnica de estudio en esos días.',
    minutesAfterPost: 25,
  },
  {
    id: commentId(41),
    postId: postId(15),
    authorId: SOCIAL_DEMO_USER_IDS.tomas,
    parentCommentId: commentId(40),
    content: 'Y una bolsa para proteger el cuaderno. Lección aprendida.',
    minutesAfterPost: 37,
  },
]

const studentIds = SOCIAL_DEMO_PROFILES.filter(
  (profile) => profile.role === 'student',
).map((profile) => profile.id)

export const SOCIAL_DEMO_LIKES = SOCIAL_DEMO_POSTS.flatMap(
  (post, postIndex) => {
    const candidates = Array.from(
      { length: studentIds.length },
      (_, offset) => studentIds[(postIndex * 3 + offset) % studentIds.length],
    ).filter((userId): userId is string =>
      Boolean(userId && userId !== post.authorId),
    )

    return candidates.slice(0, post.likeCount).map((userId) => ({
      postId: post.id,
      userId,
    }))
  },
)

function duplicateValues(values: string[]) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}

export function validateSocialDemoData() {
  const errors: string[] = []
  const userIds = new Set(SOCIAL_DEMO_PROFILES.map((profile) => profile.id))
  const postIds = new Set(SOCIAL_DEMO_POSTS.map((post) => post.id))
  const mediaKeys = new Set(Object.keys(SOCIAL_DEMO_MEDIA))
  const educationIds = SOCIAL_DEMO_PROFILES.flatMap((profile) =>
    profile.education.map((entry) => entry.id),
  )
  const projectIds = SOCIAL_DEMO_PROFILES.flatMap((profile) =>
    profile.projects.map((entry) => entry.id),
  )
  const achievementIds = SOCIAL_DEMO_PROFILES.flatMap((profile) =>
    profile.achievements.map((entry) => entry.id),
  )
  const commentsById = new Map(
    SOCIAL_DEMO_COMMENTS.map((comment) => [comment.id, comment]),
  )
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  const duplicateGroups = [
    ['user id', SOCIAL_DEMO_PROFILES.map((profile) => profile.id)],
    ['email', SOCIAL_DEMO_PROFILES.map((profile) => profile.email)],
    ['username', SOCIAL_DEMO_PROFILES.map((profile) => profile.username)],
    ['post id', SOCIAL_DEMO_POSTS.map((post) => post.id)],
    ['comment id', SOCIAL_DEMO_COMMENTS.map((comment) => comment.id)],
    ['media id', Object.values(SOCIAL_DEMO_MEDIA).map((media) => media.id)],
    ['education id', educationIds],
    ['project id', projectIds],
    ['achievement id', achievementIds],
  ] as const

  for (const [label, values] of duplicateGroups) {
    for (const duplicate of duplicateValues([...values])) {
      errors.push(`${label} duplicado: ${duplicate}`)
    }
  }

  const allIds = [
    ...SOCIAL_DEMO_PROFILES.map((profile) => profile.id),
    ...SOCIAL_DEMO_POSTS.map((post) => post.id),
    ...SOCIAL_DEMO_COMMENTS.map((comment) => comment.id),
    ...Object.values(SOCIAL_DEMO_MEDIA).map((media) => media.id),
    ...educationIds,
    ...projectIds,
    ...achievementIds,
  ]
  for (const id of allIds) {
    if (!uuidPattern.test(id)) errors.push(`UUID demo inválido: ${id}`)
  }

  const students = SOCIAL_DEMO_PROFILES.filter(
    (profile) => profile.role === 'student',
  )
  if (students.length !== 12) {
    errors.push(`se esperaban 12 estudiantes y hay ${students.length}`)
  }
  if (SOCIAL_DEMO_PROFILES.length !== 13) {
    errors.push(`se esperaban 13 perfiles y hay ${SOCIAL_DEMO_PROFILES.length}`)
  }

  for (const profile of SOCIAL_DEMO_PROFILES) {
    if (!/^[a-z0-9._]{3,30}$/.test(profile.username)) {
      errors.push(`username inválido: ${profile.username}`)
    }
    if (profile.avatarMediaKey && !mediaKeys.has(profile.avatarMediaKey)) {
      errors.push(`avatar inexistente para ${profile.username}`)
    }
    if (
      profile.avatarMediaKey &&
      SOCIAL_DEMO_MEDIA[profile.avatarMediaKey].ownerId !== profile.id
    ) {
      errors.push(`el avatar de ${profile.username} pertenece a otra cuenta`)
    }
    if (profile.coverMediaKey && !mediaKeys.has(profile.coverMediaKey)) {
      errors.push(`portada inexistente para ${profile.username}`)
    }
    if (
      profile.coverMediaKey &&
      SOCIAL_DEMO_MEDIA[profile.coverMediaKey].ownerId !== profile.id
    ) {
      errors.push(`la portada de ${profile.username} pertenece a otra cuenta`)
    }
    if (profile.bio.length > 280) {
      errors.push(`bio fuera de rango para ${profile.username}`)
    }
    for (const value of [profile.institution, profile.campus, profile.career]) {
      if (value.length < 2 || value.length > 160) {
        errors.push(`dato académico fuera de rango para ${profile.username}`)
      }
    }
    for (const project of profile.projects) {
      if (!mediaKeys.has(project.imageMediaKey)) {
        errors.push(`imagen inexistente para proyecto ${project.id}`)
      } else if (
        SOCIAL_DEMO_MEDIA[project.imageMediaKey].ownerId !== profile.id
      ) {
        errors.push(
          `la imagen del proyecto ${project.id} pertenece a otra cuenta`,
        )
      }
      if (
        project.title.length < 2 ||
        project.title.length > 120 ||
        project.description.length < 2 ||
        project.description.length > 1_000 ||
        project.technologies.length > 12 ||
        project.technologies.some(
          (technology) => technology.length < 1 || technology.length > 30,
        )
      ) {
        errors.push(`proyecto fuera de rango: ${project.id}`)
      }
    }
    for (const achievement of profile.achievements) {
      if (!mediaKeys.has(achievement.imageMediaKey)) {
        errors.push(`imagen inexistente para logro ${achievement.id}`)
      } else if (
        SOCIAL_DEMO_MEDIA[achievement.imageMediaKey].ownerId !== profile.id
      ) {
        errors.push(
          `la imagen del logro ${achievement.id} pertenece a otra cuenta`,
        )
      }
      if (
        achievement.title.length < 2 ||
        achievement.title.length > 160 ||
        achievement.issuer.length < 2 ||
        achievement.issuer.length > 160 ||
        achievement.description.length > 600 ||
        (achievement.issuedAt &&
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(achievement.issuedAt))
      ) {
        errors.push(`logro fuera de rango: ${achievement.id}`)
      }
    }
  }

  for (const student of students) {
    if (!student.coverMediaKey) {
      errors.push(`el estudiante ${student.username} no tiene portada`)
    }
    if (student.projects.length < 1 || student.projects.length > 2) {
      errors.push(
        `el estudiante ${student.username} debe tener entre 1 y 2 proyectos`,
      )
    }
    if (student.achievements.length < 1 || student.achievements.length > 2) {
      errors.push(
        `el estudiante ${student.username} debe tener entre 1 y 2 logros`,
      )
    }
  }

  const communityCount = SOCIAL_DEMO_POSTS.filter(
    (post) => post.contentType === 'community',
  ).length
  const announcementCount = SOCIAL_DEMO_POSTS.filter(
    (post) => post.contentType === 'announcement',
  ).length
  if (communityCount !== 15) {
    errors.push(`se esperaban 15 posts de comunidad y hay ${communityCount}`)
  }
  if (announcementCount !== 7) {
    errors.push(`se esperaban 7 anuncios y hay ${announcementCount}`)
  }

  for (const post of SOCIAL_DEMO_POSTS) {
    if (!userIds.has(post.authorId)) {
      errors.push(`autor inexistente para post ${post.id}`)
    }
    if (!post.content.trim() || post.content.length > 2_000) {
      errors.push(`contenido fuera de rango en post ${post.id}`)
    }
    if (post.imageMediaKey) {
      if (!mediaKeys.has(post.imageMediaKey)) {
        errors.push(`imagen inexistente en post ${post.id}`)
      } else if (
        SOCIAL_DEMO_MEDIA[post.imageMediaKey].ownerId !== post.authorId
      ) {
        errors.push(`la imagen del post ${post.id} pertenece a otra cuenta`)
      }
    }
    if ((post.ageHours === undefined) === (post.publishedAt === undefined)) {
      errors.push(
        `post ${post.id} debe declarar ageHours o publishedAt, no ambos`,
      )
    }
    if (post.publishedAt && Number.isNaN(Date.parse(post.publishedAt))) {
      errors.push(`fecha inválida en post ${post.id}`)
    }
    if (post.contentType === 'announcement') {
      if (post.authorId !== SOCIAL_DEMO_USER_IDS.news || !post.sourceUrl) {
        errors.push(`anuncio ${post.id} sin autor o fuente oficial`)
      } else if (!post.content.includes(post.sourceUrl)) {
        errors.push(`anuncio ${post.id} no muestra su fuente`)
      }
    }
  }

  for (const comment of SOCIAL_DEMO_COMMENTS) {
    if (!postIds.has(comment.postId)) {
      errors.push(`post inexistente para comentario ${comment.id}`)
    }
    if (!userIds.has(comment.authorId)) {
      errors.push(`autor inexistente para comentario ${comment.id}`)
    }
    if (!comment.content.trim() || comment.content.length > 1_000) {
      errors.push(`contenido fuera de rango en comentario ${comment.id}`)
    }
    if (comment.parentCommentId) {
      const parent = commentsById.get(comment.parentCommentId)
      if (!parent || parent.postId !== comment.postId) {
        errors.push(`respuesta ${comment.id} apunta a un comentario inválido`)
      }
    }
  }

  const likePairs = new Set<string>()
  for (const like of SOCIAL_DEMO_LIKES) {
    const pair = `${like.postId}:${like.userId}`
    if (likePairs.has(pair)) errors.push(`reacción duplicada: ${pair}`)
    likePairs.add(pair)
    const post = SOCIAL_DEMO_POSTS.find((entry) => entry.id === like.postId)
    if (!post || !userIds.has(like.userId)) {
      errors.push(`reacción con referencia inválida: ${pair}`)
    } else if (post.authorId === like.userId) {
      errors.push(`reacción propia no esperada: ${pair}`)
    }
  }

  for (const post of SOCIAL_DEMO_POSTS) {
    const actualLikes = SOCIAL_DEMO_LIKES.filter(
      (like) => like.postId === post.id,
    ).length
    if (actualLikes !== post.likeCount) {
      errors.push(
        `post ${post.id} esperaba ${post.likeCount} reacciones y tiene ${actualLikes}`,
      )
    }
  }

  return errors
}

export function assertValidSocialDemoData() {
  const errors = validateSocialDemoData()
  if (errors.length) {
    throw new Error(`Dataset social demo inválido:\n- ${errors.join('\n- ')}`)
  }
}
