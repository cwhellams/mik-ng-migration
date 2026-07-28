import { Box } from '@mui/material'

export function MarkdownContent({ html }: Readonly<{ html: string }>) {
  return (
    <Box
      sx={{
        '& :first-of-type': { mt: 0 },
        '& table': {
          borderCollapse: 'collapse',
          width: '100%',
          mb: 2,
        },
        '& th, & td': {
          border: '1px solid',
          borderColor: 'divider',
          px: 1.5,
          py: 1,
          textAlign: 'left',
          verticalAlign: 'top',
        },
        '& th': {
          fontWeight: 'bold',
          bgcolor: 'action.hover',
        },
        '& tr:nth-of-type(even)': {
          bgcolor: 'action.selected',
        },
        '& blockquote': {
          borderLeft: '4px solid',
          borderColor: 'divider',
          pl: 2,
          ml: 0,
          color: 'text.secondary',
          fontStyle: 'italic',
        },
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
