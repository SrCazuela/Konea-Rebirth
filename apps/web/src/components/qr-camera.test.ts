import { describe, expect, it, vi } from 'vitest'
import { releaseCamera } from './qr-camera'

describe('releaseCamera', () => {
  it('stops every captured track and detaches the stream from the video', () => {
    const firstStop = vi.fn()
    const secondStop = vi.fn()
    const stream = {
      getTracks: () => [{ stop: firstStop }, { stop: secondStop }],
    } as unknown as Pick<MediaStream, 'getTracks'>
    const video = {
      srcObject: stream as MediaStream,
    } as Pick<HTMLVideoElement, 'srcObject'>

    releaseCamera(stream, video)

    expect(firstStop).toHaveBeenCalledOnce()
    expect(secondStop).toHaveBeenCalledOnce()
    expect(video.srcObject).toBeNull()
  })
})
