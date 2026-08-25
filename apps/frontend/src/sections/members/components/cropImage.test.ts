import { afterEach, describe, expect, it, vi } from 'vitest'

import { clampOutputSize, getCroppedImageBlob } from './cropImage'

describe('clampOutputSize', () => {
  it('leaves a crop that already fits within maxSize untouched', () => {
    expect(clampOutputSize(200, 150, 512)).toEqual({ width: 200, height: 150 })
  })

  it('downscales an oversized crop proportionally to fit maxSize', () => {
    expect(clampOutputSize(2000, 1000, 500)).toEqual({ width: 500, height: 250 })
  })

  it('scales the taller dimension, not just width, when height is the constraint', () => {
    expect(clampOutputSize(1000, 2000, 500)).toEqual({ width: 250, height: 500 })
  })
})

describe('getCroppedImageBlob', () => {
  const originalImage = globalThis.Image
  const originalCreateElement = document.createElement.bind(document)

  afterEach(() => {
    globalThis.Image = originalImage
    vi.restoreAllMocks()
  })

  const stubImageLoad = () => {
    class StubImage {
      crossOrigin = ''
      src = ''
      private listeners: Record<string, (() => void)[]> = {}
      addEventListener(event: string, cb: () => void) {
        this.listeners[event] = [...(this.listeners[event] ?? []), cb]
        if (event === 'load') queueMicrotask(cb)
      }
    }
    // @ts-expect-error - test stub, not a full HTMLImageElement
    globalThis.Image = StubImage
  }

  const stubCanvas = (drawImage = vi.fn()) => {
    const toBlob = vi.fn((cb: (blob: Blob | null) => void) => cb(new Blob(['x'])))
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') return originalCreateElement(tag)
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob,
      } as unknown as HTMLCanvasElement
    })
    return { drawImage, toBlob }
  }

  it('draws the requested crop region and resolves a blob', async () => {
    stubImageLoad()
    const { drawImage, toBlob } = stubCanvas()

    const blob = await getCroppedImageBlob('blob:fake', { x: 10, y: 20, width: 300, height: 300 })

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 10, 20, 300, 300, 0, 0, 300, 300)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.92)
    expect(blob).toBeInstanceOf(Blob)
  })

  it('downscales the canvas output for an oversized crop', async () => {
    stubImageLoad()
    const { drawImage } = stubCanvas()

    await getCroppedImageBlob(
      'blob:fake',
      { x: 0, y: 0, width: 2000, height: 1000 },
      { maxSize: 500 },
    )

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2000, 1000, 0, 0, 500, 250)
  })

  it('rejects when the canvas has no 2D context', async () => {
    stubImageLoad()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') return originalCreateElement(tag)
      return { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement
    })

    await expect(
      getCroppedImageBlob('blob:fake', { x: 0, y: 0, width: 100, height: 100 }),
    ).rejects.toThrow('Canvas 2D context is not available')
  })
})
