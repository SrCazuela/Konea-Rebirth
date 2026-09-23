type CameraStream = Pick<MediaStream, 'getTracks'>
type CameraVideo = Pick<HTMLVideoElement, 'srcObject'>

export function releaseCamera(
  stream: CameraStream | null,
  video: CameraVideo | null,
) {
  stream?.getTracks().forEach((track) => track.stop())
  if (video) video.srcObject = null
}
