import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  resolveSocialDemoAssets,
  SOCIAL_DEMO_COMMENTS,
  SOCIAL_DEMO_LIKES,
  SOCIAL_DEMO_MEDIA,
  SOCIAL_DEMO_POSTS,
  SOCIAL_DEMO_PROFILES,
  SOCIAL_DEMO_USER_IDS,
  validateSocialDemoData,
} from './social-demo-data.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  )
})

describe('social demo dataset', () => {
  it('is internally consistent and contains the intended amount of activity', () => {
    expect(validateSocialDemoData()).toEqual([])
    expect(
      SOCIAL_DEMO_PROFILES.filter((profile) => profile.role === 'student'),
    ).toHaveLength(12)
    expect(SOCIAL_DEMO_PROFILES).toHaveLength(13)
    expect(
      SOCIAL_DEMO_POSTS.filter((post) => post.contentType === 'community'),
    ).toHaveLength(15)
    expect(
      SOCIAL_DEMO_POSTS.filter((post) => post.contentType === 'announcement'),
    ).toHaveLength(7)
    expect(SOCIAL_DEMO_COMMENTS.length).toBeGreaterThanOrEqual(40)
    expect(SOCIAL_DEMO_LIKES.length).toBeGreaterThan(80)
  })

  it('identifies the institutional account as a non-official demo and cites every announcement', () => {
    const newsProfile = SOCIAL_DEMO_PROFILES.find(
      (profile) => profile.id === SOCIAL_DEMO_USER_IDS.news,
    )
    expect(newsProfile).toMatchObject({
      displayName: 'Noticias Duoc UC · demo',
      role: 'professor',
    })
    expect(newsProfile?.bio.toLowerCase()).toContain('no oficial')

    const announcements = SOCIAL_DEMO_POSTS.filter(
      (post) => post.contentType === 'announcement',
    )
    expect(
      announcements.every((post) =>
        post.sourceUrl?.startsWith('https://www.duoc.cl/'),
      ),
    ).toBe(true)
    expect(
      announcements.filter((post) =>
        post.content.includes('ACTIVIDAD FINALIZADA'),
      ),
    ).toHaveLength(3)
  })

  it('resolves every repository asset and validates its real file signature', async () => {
    const assets = await resolveSocialDemoAssets()
    expect(assets.size).toBe(Object.keys(SOCIAL_DEMO_MEDIA).length)
    expect(assets.get('avatarPepper')?.sourceName).toBe('avatar-pepper.jpg')
    expect(
      [...assets.values()].every(
        (asset) => asset.size > 0 && asset.size <= 5 * 1024 * 1024,
      ),
    ).toBe(true)
  })

  it('reports all accepted filenames when a required asset is missing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'konea-social-demo-'))
    temporaryDirectories.push(directory)

    await expect(resolveSocialDemoAssets(directory)).rejects.toThrow(
      /avatarPepper: falta avatar-pepper\.jpg o avatar-pepper\.png o avatar-pepper\.webp/,
    )
  })
})
