import { toggleButtonGroupClasses } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

/**
 * Sx prop for ToggleButtonGroup that allows wrapping onto multiple rows.
 *
 * MUI's ToggleButtonGroup by default joins its children into one segmented control
 * by keying border-radius and negative margins off first/middle/last position in the GROUP.
 * Those seams break as soon as the buttons wrap onto a second row (squared corners,
 * misaligned left margins, transparent borders).
 *
 * This helper:
 * - Enables flexWrap with a small gap
 * - Resets every button to a full border radius and solid border
 * - Removes negative margins
 * - Allows buttons to size to content with flex: '1 1 auto'
 *
 * Each button is visually self-contained, so it looks correct wherever a row break lands.
 *
 * Usage:
 * ```tsx
 * <ToggleButtonGroup sx={wrappingToggleGroupSx} ...>
 * ```
 *
 * Important: Do NOT use `fullWidth` on the group when using this helper, as it would
 * make each button take 100% width and stack into one column.
 */
export const wrappingToggleGroupSx: SxProps<Theme> = {
  flexWrap: 'wrap',
  gap: 0.5,
  [`& .${toggleButtonGroupClasses.firstButton},
    & .${toggleButtonGroupClasses.middleButton},
    & .${toggleButtonGroupClasses.lastButton}`]: {
    marginLeft: 0,
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 1,
    flex: '1 1 auto',
    width: 'auto',
  },
  [`& .${toggleButtonGroupClasses.grouped}.Mui-selected + .${toggleButtonGroupClasses.grouped}.Mui-selected`]:
    {
      borderLeft: '1px solid',
      borderColor: 'divider',
      marginLeft: 0,
    },
}
