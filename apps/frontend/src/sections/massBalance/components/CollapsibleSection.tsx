import type { ReactNode } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

interface CollapsibleSectionProps {
  /** Heading rendered in the always-visible summary row. */
  title: string
  /**
   * Initial state only. The accordion is uncontrolled, so a section the user has
   * folded open stays open — #382 asked for "collapsed until tapped" on mobile,
   * not for the page to re-collapse it as values change.
   */
  defaultExpanded: boolean
  children: ReactNode
}

/**
 * An `elevation={2}` surface, matching the page's other `Paper` blocks, whose
 * body can be folded away behind its heading.
 *
 * The mass & balance page stacks several tall read-only blocks (weight summary,
 * aircraft specifications, conversion factors) around the loading inputs. On a
 * phone they pushed the first input field off-screen (#382), so each collapses
 * to a single heading row there while desktop keeps them open.
 */
const CollapsibleSection = ({ title, defaultExpanded, children }: CollapsibleSectionProps) => (
  <Accordion
    defaultExpanded={defaultExpanded}
    disableGutters
    elevation={2}
    sx={{ mb: 3, '&:before': { display: 'none' } }}
  >
    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 3 }}>
      <Typography variant='h6'>{title}</Typography>
    </AccordionSummary>
    <AccordionDetails sx={{ px: 3, pt: 0, pb: 3 }}>{children}</AccordionDetails>
  </Accordion>
)

export default CollapsibleSection
