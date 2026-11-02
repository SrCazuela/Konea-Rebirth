import { spawn } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const destinationArgument = process.argv.indexOf('--directory')
if (destinationArgument < 0 || !process.argv[destinationArgument + 1]) {
  throw new Error(
    'Use --directory <checkout independiente de Sites ya registrado>',
  )
}
const destination = resolve(process.argv[destinationArgument + 1])
const fromRepository = relative(repository, destination)
if (
  !fromRepository ||
  (!fromRepository.startsWith('..') && !isAbsolute(fromRepository))
) {
  throw new Error(
    'El checkout de Sites debe estar fuera del repositorio local de Konea.',
  )
}
const hosting = JSON.parse(
  await readFile(resolve(destination, '.openai/hosting.json'), 'utf8'),
)
if (!hosting.project_id || hosting.static) {
  throw new Error(
    'Se requiere un checkout Vinext registrado con Sites, sin static.directory.',
  )
}

async function run(args, cwd) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, ['--no-maglev', ...args], {
      cwd,
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        VITE_API_URL: '/api/v1',
        VITE_FOCUSBUDDY_DOWNLOAD_URL: '',
      },
    })
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0
        ? resolveRun()
        : reject(new Error(`Build terminó con código ${code}`)),
    )
  })
}

await run(
  [resolve(repository, 'node_modules/typescript/bin/tsc'), '-b'],
  resolve(repository, 'apps/web'),
)
await run(
  [resolve(repository, 'node_modules/vite/bin/vite.js'), 'build'],
  resolve(repository, 'apps/web'),
)

const index = await readFile(
  resolve(repository, 'apps/web/dist/index.html'),
  'utf8',
)
if (!index.includes('id="root"') || /localhost:|127\.0\.0\.1:/.test(index)) {
  throw new Error('El HTML compilado no es apto para publicar.')
}
await mkdir(resolve(destination, 'lib'), { recursive: true })
await mkdir(resolve(destination, 'app/api/v1/[[...path]]'), { recursive: true })
await cp(resolve(repository, 'apps/web/dist'), resolve(destination, 'public'), {
  recursive: true,
})
// The root HTML is served by a route handler; the original React application
// mounts normally without a second React/Vinext hydration tree around it.
await rm(resolve(destination, 'public/index.html'), { force: true })
await writeFile(
  resolve(destination, 'lib/konea-index.ts'),
  `// Generated from Konea's production Vite build.\nexport default ${JSON.stringify(index)};\n`,
)
await cp(
  resolve(repository, 'hosting/sites-adapter/backend-proxy.mjs'),
  resolve(destination, 'lib/backend-proxy.mjs'),
)

await writeFile(
  resolve(destination, 'app/route.ts'),
  `import html from '../lib/konea-index';
export const dynamic = 'force-dynamic';
export function GET() {
  return new Response(html, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  } });
}
export function HEAD() { const response = GET(); return new Response(null, { headers: response.headers }); }
`,
)
await rm(resolve(destination, 'app/page.tsx'), { force: true })
await writeFile(
  resolve(destination, 'app/api/v1/[[...path]]/route.ts'),
  `import { env } from 'cloudflare:workers';
import { proxyBackend } from '../../../../lib/backend-proxy.mjs';
export const dynamic = 'force-dynamic';
function handle(request: Request) { return proxyBackend(request, env); }
export { handle as GET, handle as HEAD, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
`,
)
await writeFile(
  resolve(destination, 'app/layout.tsx'),
  `import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Konea · Tu campus, conectado', description: 'Red social universitaria Konea.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
`,
)
await writeFile(
  resolve(destination, 'cloudflare-env.d.ts'),
  `declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    KONEA_BACKEND_ORIGIN?: string;
    SITES_BACKEND_TOKEN?: string;
  }
}
`,
)
await writeFile(
  resolve(destination, 'README.md'),
  `# Konea en Sites\n\nEste checkout contiene el frontend real compilado desde Konea-Rebirth y el adaptador de Sites.\nLa API Express, PostgreSQL y los archivos privados se alojan fuera de Sites (Render y Neon).\nLa base local se conserva separada. No hay datos personales, respaldos SQL ni archivos .env en este checkout.\n\n## Actualizar\n\nDesde Konea-Rebirth, ejecutar:\n\n    node scripts/hosting/prepare-sites.mjs --directory "${destination.replace(/\\/g, '/')}"\n\nDespués usar el flujo de build, fuente y publicación de la habilidad Sites, conservando project_id.\nEl sitio nuevo permanece privado mientras se verifica el backend.\n\n## Secretos del servidor de Sites\n\n- KONEA_BACKEND_ORIGIN: origen HTTPS del servicio Render, sin ruta.\n- SITES_BACKEND_TOKEN: mismo valor privado que en Render.\n\nLos secretos de PostgreSQL, S3 y DUCO se configuran únicamente en Render.\nEl proxy transmite solo la cookie konea_session; las cookies e identidad de ChatGPT no salen de Sites.\nEl instalador existente de FocusBuddy sigue apuntando a su configuración local; no se publica como instalador remoto compatible hasta adaptarlo y probarlo.\n`,
)
console.log(
  JSON.stringify({
    project_id: hosting.project_id,
    directory: destination,
    api: '/api/v1',
    databaseCopiedToSource: false,
  }),
)
