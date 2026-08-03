import type { FieldError } from 'react-hook-form'

// zod's default message for a missing required value ("Invalid input: expected
// string, received undefined") means nothing to an end user — show a friendly
// "this field is required" fallback instead whenever that's really all the error is.
// 'too_small' is included alongside 'invalid_type' because every field this helper is
// used for treats its minimum (an empty string, or the lowest selectable number) as
// meaning "nothing was entered", not a distinct out-of-range case.
export const formatRequiredFieldError = (
  error: FieldError | undefined,
  requiredMessage: string,
): string | undefined => {
  if (!error) return undefined
  if (error.type === 'invalid_type' || error.type === 'too_small') return requiredMessage
  return error.message?.toString()
}

// The flight log forms validate with a single whole-form schema resolver in
// mode:'onChange', so any change anywhere re-validates every field — including ones
// the user hasn't reached yet. Showing a field's error the instant it exists would
// make untouched required fields flash red as soon as the user touches anything else.
// Only show it once this specific field has actually been changed (the user entered
// something invalid), or once a save attempt has been made (at which point every
// remaining problem should surface, touched or not).
export const shouldShowFieldError = (
  error: FieldError | undefined,
  isDirty: boolean,
  isSubmitted: boolean,
): boolean => !!error && (isDirty || isSubmitted)
