import { useEffect } from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/renderWithProviders'
import { AvatarUpload } from './AvatarUpload'

// The real Cropper needs actual image decoding (jsdom has none) to ever fire
// onCropComplete. Stubbing it lets these tests focus on AvatarUpload's own logic —
// file validation, dialog open/close, and wiring save/delete to onUpload/onDelete —
// while cropImage.test.ts covers the canvas math this stub bypasses. The real
// onCropComplete fires from a pointer/media-load callback, never during render, so
// this stub fires it from an effect too — calling it inline would setState on every
// render and spin forever.
vi.mock('react-easy-crop', () => {
  const CropperStub = ({
    onCropComplete,
  }: {
    onCropComplete: (a: unknown, b: unknown) => void
  }) => {
    useEffect(() => {
      onCropComplete({}, { x: 0, y: 0, width: 100, height: 100 })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <div data-testid='cropper-stub' />
  }
  return { default: CropperStub }
})

vi.mock('./cropImage', () => ({
  getCroppedImageBlob: vi.fn(async () => new Blob(['cropped'], { type: 'image/jpeg' })),
}))

const aFile = (name = 'photo.jpg', type = 'image/jpeg', size = 1024) => {
  const file = new File(['x'.repeat(size)], name, { type })
  return file
}

const selectFile = async (user: ReturnType<typeof renderWithProviders>['user'], file: File) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await user.upload(input, file)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AvatarUpload', () => {
  it('shows only Change photo when the member has no avatar yet', () => {
    renderWithProviders(<AvatarUpload hasAvatar={false} onUpload={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getByRole('button', { name: /change photo/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove photo/i })).not.toBeInTheDocument()
  })

  it('shows Remove photo once the member has an avatar', () => {
    renderWithProviders(<AvatarUpload hasAvatar onUpload={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getByRole('button', { name: /remove photo/i })).toBeInTheDocument()
  })

  it('rejects a non-image file without opening the crop dialog', async () => {
    renderWithProviders(<AvatarUpload hasAvatar={false} onUpload={vi.fn()} onDelete={vi.fn()} />)

    // user-event's upload() enforces the input's `accept` filter itself (as a real
    // browser's file picker would); fireEvent bypasses that to exercise our own
    // defense-in-depth validation for e.g. a drag-and-drop that skips the picker.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [aFile('notes.txt', 'text/plain')] } })

    expect(await screen.findByText(/only jpeg, png and webp/i)).toBeInTheDocument()
    expect(screen.queryByTestId('cropper-stub')).not.toBeInTheDocument()
  })

  it('rejects a file over the 40MB source limit', async () => {
    const { user } = renderWithProviders(
      <AvatarUpload hasAvatar={false} onUpload={vi.fn()} onDelete={vi.fn()} />,
    )

    const tooLarge = aFile('huge.jpg')
    Object.defineProperty(tooLarge, 'size', { value: 41 * 1024 * 1024 })
    await selectFile(user, tooLarge)

    expect(await screen.findByText(/less than 40mb/i)).toBeInTheDocument()
    expect(screen.queryByTestId('cropper-stub')).not.toBeInTheDocument()
  })

  it('opens the crop dialog for a valid image and uploads the cropped blob on Save', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined)
    const { user } = renderWithProviders(
      <AvatarUpload hasAvatar={false} onUpload={onUpload} onDelete={vi.fn()} />,
    )

    await selectFile(user, aFile())
    expect(await screen.findByTestId('cropper-stub')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1))
    expect(onUpload.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(screen.queryByTestId('cropper-stub')).not.toBeInTheDocument()
  })

  it('closes the dialog without uploading on Cancel', async () => {
    const onUpload = vi.fn()
    const { user } = renderWithProviders(
      <AvatarUpload hasAvatar={false} onUpload={onUpload} onDelete={vi.fn()} />,
    )

    await selectFile(user, aFile())
    expect(await screen.findByTestId('cropper-stub')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByTestId('cropper-stub')).not.toBeInTheDocument()
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('shows an error and keeps the dialog open when the upload fails', async () => {
    const onUpload = vi.fn().mockRejectedValue(new Error('Server exploded'))
    const { user } = renderWithProviders(
      <AvatarUpload hasAvatar={false} onUpload={onUpload} onDelete={vi.fn()} />,
    )

    await selectFile(user, aFile())
    await screen.findByTestId('cropper-stub')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText('Server exploded')).toBeInTheDocument()
  })

  it('deletes the avatar after the user confirms', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { user } = renderWithProviders(
      <AvatarUpload hasAvatar onUpload={vi.fn()} onDelete={onDelete} />,
    )

    await user.click(screen.getByRole('button', { name: /remove photo/i }))

    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('does not delete the avatar when the user declines the confirmation', async () => {
    const onDelete = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user } = renderWithProviders(
      <AvatarUpload hasAvatar onUpload={vi.fn()} onDelete={onDelete} />,
    )

    await user.click(screen.getByRole('button', { name: /remove photo/i }))

    expect(onDelete).not.toHaveBeenCalled()
  })

  it('disables the controls while isLoading', () => {
    renderWithProviders(<AvatarUpload hasAvatar isLoading onUpload={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getByRole('button', { name: /change photo/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /remove photo/i })).toBeDisabled()
  })
})
