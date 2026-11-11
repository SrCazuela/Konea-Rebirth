import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { test } from 'node:test'

const execute = promisify(execFile)

test('Sites preparation replaces stale bundles and builds for production from a development environment', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'konea-sites-prepare-'))
  const repository = join(temporary, 'repository')
  const checkout = join(temporary, 'site')
  try {
    for (const path of [
      'scripts/hosting',
      'node_modules/typescript/bin',
      'node_modules/vite/bin',
      'apps/web',
      'hosting/sites-adapter',
    ]) {
      await mkdir(join(repository, path), { recursive: true })
    }
    await mkdir(join(checkout, '.openai'), { recursive: true })
    await mkdir(join(checkout, 'public/assets'), { recursive: true })
    await writeFile(
      join(checkout, 'public/assets/obsolete-development.js'),
      'old development bundle',
    )
    await writeFile(join(checkout, 'public/keep.txt'), 'authored public file')
    await writeFile(
      join(checkout, '.openai/hosting.json'),
      JSON.stringify({
        project_id: 'production-build-fixture',
        d1: null,
        r2: null,
      }),
    )
    await copyFile(
      new URL('./prepare-sites.mjs', import.meta.url),
      join(repository, 'scripts/hosting/prepare-sites.mjs'),
    )
    await writeFile(
      join(repository, 'hosting/sites-adapter/backend-proxy.mjs'),
      'export function proxyBackend() {}\n',
    )
    // Compiler fixtures record the environment actually inherited by each
    // subprocess, without installing dependencies or running a full Vite build.
    await writeFile(
      join(repository, 'node_modules/typescript/bin/tsc'),
      `require('node:fs').writeFileSync('typecheck-environment.json', JSON.stringify({ nodeEnv: process.env.NODE_ENV }));\n`,
    )
    await writeFile(
      join(repository, 'node_modules/vite/bin/vite.js'),
      `const fs = require('node:fs');
fs.mkdirSync('dist/assets', { recursive: true });
fs.writeFileSync('dist/index.html', '<html><body><div id="root"></div></body></html>');
fs.writeFileSync('dist/assets/current-production.js', 'current production bundle');
fs.writeFileSync('dist/build-environment.json', JSON.stringify({
  nodeEnv: process.env.NODE_ENV,
  apiUrl: process.env.VITE_API_URL,
  downloadUrl: process.env.VITE_FOCUSBUDDY_DOWNLOAD_URL,
}));
`,
    )
    await execute(
      process.execPath,
      [
        '--no-maglev',
        join(repository, 'scripts/hosting/prepare-sites.mjs'),
        '--directory',
        checkout,
      ],
      {
        cwd: repository,
        windowsHide: true,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          VITE_API_URL: 'http://localhost:3000/api/v1',
          VITE_FOCUSBUDDY_DOWNLOAD_URL: 'http://localhost/unpublished.exe',
        },
      },
    )
    assert.deepEqual(
      JSON.parse(
        await readFile(
          join(repository, 'apps/web/typecheck-environment.json'),
          'utf8',
        ),
      ),
      { nodeEnv: 'production' },
    )
    assert.deepEqual(
      JSON.parse(
        await readFile(join(checkout, 'public/build-environment.json'), 'utf8'),
      ),
      { nodeEnv: 'production', apiUrl: '/api/v1', downloadUrl: '' },
    )
    assert.equal(
      await readFile(
        join(checkout, 'public/assets/current-production.js'),
        'utf8',
      ),
      'current production bundle',
    )
    await assert.rejects(
      readFile(join(checkout, 'public/assets/obsolete-development.js')),
      { code: 'ENOENT' },
    )
    assert.equal(
      await readFile(join(checkout, 'public/keep.txt'), 'utf8'),
      'authored public file',
    )
    assert.equal(
      JSON.parse(await readFile(join(checkout, '.openai/hosting.json'), 'utf8'))
        .project_id,
      'production-build-fixture',
    )
  } finally {
    // Delete only the exact disposable fixture created directly under tmpdir.
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()))
    await rm(temporary, { recursive: true, force: true })
  }
})
