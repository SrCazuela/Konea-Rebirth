const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Only an explicitly named, local demo database may receive these fixtures. */
export function assertPublicDemoDatabase(databaseUrl: string) {
  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error('La demostración requiere una URL PostgreSQL local válida.')
  }

  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !LOCAL_DATABASE_HOSTS.has(parsed.hostname.toLowerCase()) ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      'La demostración solo admite PostgreSQL local, sin parámetros que puedan redirigir la conexión.',
    )
  }

  let databaseName: string
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1))
  } catch {
    throw new Error('El nombre de la base de demostración no es válido.')
  }
  if (!/^konea_public_demo(?:_[a-z0-9_]+)?$/.test(databaseName)) {
    throw new Error(
      'La base debe llamarse konea_public_demo o konea_public_demo_<identificador>; nunca se utilizará la base personal.',
    )
  }

  return databaseName
}

export function assertPublicDemoPasswords(input: {
  adminPassword: string | undefined
  studentPassword: string | undefined
}) {
  for (const password of [input.adminPassword, input.studentPassword]) {
    if (
      !password ||
      password.length < 16 ||
      password.length > 128 ||
      password.trim() !== password
    ) {
      throw new Error(
        'PUBLIC_DEMO_ADMIN_PASSWORD y PUBLIC_DEMO_STUDENT_PASSWORD deben contener contraseñas aleatorias de 16 a 128 caracteres, sin espacios al principio o al final.',
      )
    }
  }
  if (input.adminPassword === input.studentPassword) {
    throw new Error(
      'Las cuentas administradora y estudiante deben tener contraseñas diferentes.',
    )
  }
  return {
    adminPassword: input.adminPassword as string,
    studentPassword: input.studentPassword as string,
  }
}
