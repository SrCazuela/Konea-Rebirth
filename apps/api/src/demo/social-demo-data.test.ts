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

  it('gives every demo student a complete, media-rich fictional portfolio', () => {
    const students = SOCIAL_DEMO_PROFILES.filter(
      (profile) => profile.role === 'student',
    )

    for (const student of students) {
      expect(student.email.endsWith('@demo.konea.local')).toBe(true)
      expect(student.coverMediaKey).not.toBeNull()
      expect(student.projects.length).toBeGreaterThanOrEqual(1)
      expect(student.projects.length).toBeLessThanOrEqual(2)
      expect(student.achievements.length).toBeGreaterThanOrEqual(1)
      expect(student.achievements.length).toBeLessThanOrEqual(2)
      expect(
        student.projects.every(
          (project) =>
            SOCIAL_DEMO_MEDIA[project.imageMediaKey].ownerId === student.id,
        ),
      ).toBe(true)
      expect(
        student.achievements.every(
          (achievement) =>
            SOCIAL_DEMO_MEDIA[achievement.imageMediaKey].ownerId === student.id,
        ),
      ).toBe(true)
      expect(
        student.achievements.every(
          (achievement) =>
            achievement.issuer.includes('escenario ficticio') &&
            /(fictici|simulad|demostr)/i.test(achievement.description),
        ),
      ).toBe(true)
    }
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
    expect(new Set([...assets.values()].map((asset) => asset.id)).size).toBe(
      assets.size,
    )
  })

  it('reports all accepted filenames when a required asset is missing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'konea-social-demo-'))
    temporaryDirectories.push(directory)

    await expect(resolveSocialDemoAssets(directory)).rejects.toThrow(
      /avatarPepper: falta avatar-pepper\.jpg o avatar-pepper\.png o avatar-pepper\.webp/,
    )
  })
})
