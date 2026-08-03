import { useFormState, type Control, type FieldValues } from 'react-hook-form'

// The flight log forms validate with a single whole-form schema resolver in
// mode:'onChange', so any change anywhere re-validates every field — including ones
// the user hasn't reached yet. Showing a field's error the instant it exists would
// make untouched required fields flash red as soon as the user touches anything else.
// Only show it once this specific field has actually been changed (the user entered
// something invalid), or once a save attempt has been made (at which point every
// remaining problem should surface, touched or not).
//
// Call this at the top of the host component (a real hook call site) to get
// isSubmitted, then combine it with the per-field isDirty/error you already get from
// Controller's own render callback — those aren't hooks, so it's safe to compute the
// final boolean anywhere: `!!error && (isDirty || isSubmitted)`.
export function useIsFormSubmitted<T extends FieldValues>(control: Control<T>): boolean {
  return useFormState({ control }).isSubmitted
}
