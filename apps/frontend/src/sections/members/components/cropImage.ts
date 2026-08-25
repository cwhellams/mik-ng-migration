export type PixelCrop = { x: number; y: number; width: number; height: number }

// Never upscale a crop that's already smaller than the target — only shrink oversized
// crops down to a sane storage size (the backend re-compresses to 300x300 anyway, but a
// smaller upload is faster and avoids sending an unnecessarily large PNG/JPEG over the wire).
export const clampOutputSize = (width: number, height: number, maxSize: number) => {
  if (width <= maxSize && height <= maxSize) return { width, height }
  const scale = maxSize / Math.max(width, height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (event) => reject(event))
    image.crossOrigin = 'anonymous'
    image.src = src
  })

/**
 * Draws the cropped region of `imageSrc` (a browser object URL) onto a canvas sized to
 * fit within `maxSize` and exports it as a JPEG blob, so the zoom/pan the member chose
 * in the crop UI is what actually gets uploaded rather than the original multi-MB photo.
 */
export const getCroppedImageBlob = async (
  imageSrc: string,
  cropPixels: PixelCrop,
  { maxSize = 512, quality = 0.92 }: { maxSize?: number; quality?: number } = {},
): Promise<Blob> => {
  const image = await loadImage(imageSrc)
  const { width, height } = clampOutputSize(cropPixels.width, cropPixels.height, maxSize)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available')

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    width,
    height,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode cropped image'))),
      'image/jpeg',
      quality,
    )
  })
}
