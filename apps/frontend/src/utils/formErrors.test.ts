import type { FieldError } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import { formatRequiredFieldError, shouldShowFieldError } from './formErrors'

const anError = (type: string, message?: string): FieldError => ({ type, message }) as FieldError

describe('formatRequiredFieldError', () => {
  it('returns nothing when there is no error', () => {
    expect(formatRequiredFieldError(undefined, 'This field is required')).toBeUndefined()
  })

  it('replaces zod’s missing-value message with the friendly one', () => {
    const zodMissing = anError('invalid_type', 'Invalid input: expected string, received undefined')

    expect(formatRequiredFieldError(zodMissing, 'This field is required')).toBe(
      'This field is required',
    )
  })

  it('treats an at-the-minimum value as "nothing was entered"', () => {
    expect(formatRequiredFieldError(anError('too_small'), 'This field is required')).toBe(
      'This field is required',
    )
  })

  it('passes any other validation message through untouched', () => {
    expect(formatRequiredFieldError(anError('too_big', 'Must be before 12:00'), 'required')).toBe(
      'Must be before 12:00',
    )
    expect(
      formatRequiredFieldError(anError('custom', 'Member is not an instructor'), 'required'),
    ).toBe('Member is not an instructor')
  })

  it('returns undefined when a passed-through error carries no message', () => {
    expect(formatRequiredFieldError(anError('custom'), 'required')).toBeUndefined()
  })
})

describe('shouldShowFieldError', () => {
  const error = anError('invalid_type')

  it('stays quiet when there is no error at all', () => {
    expect(shouldShowFieldError(undefined, true, true)).toBe(false)
  })

  it('stays quiet for a field the user has not touched before the first save', () => {
    // The flight log forms re-validate the whole form on every change, so an
    // untouched required field always has an error — showing it immediately
    // would paint the form red before the user reaches those fields.
    expect(shouldShowFieldError(error, false, false)).toBe(false)
  })

  it('shows the error once the field itself has been changed', () => {
    expect(shouldShowFieldError(error, true, false)).toBe(true)
  })

  it('shows every remaining error once a save has been attempted', () => {
    expect(shouldShowFieldError(error, false, true)).toBe(true)
  })
})
