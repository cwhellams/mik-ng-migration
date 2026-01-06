import { Grid, Paper, SxProps, Typography } from '@mui/material'

type ResponsiveTableProps<T> = {
  header?: React.ReactElement
  headerProps?: SxProps
  notFoundMsg: string
  rows: T[] | undefined
  rowProps?: (row: T) => SxProps
  row: (row: T) => React.ReactElement
}

export function ResponsiveTable<T>({
  header,
  headerProps,
  notFoundMsg,
  rows,
  rowProps,
  row: rowMapper,
}: ResponsiveTableProps<T>) {
  return (
    <Paper
      sx={{
        p: 1,
      }}
    >
      {header && (
        <Grid
          container
          sx={{
            px: 1,
            py: 2,
            borderBottom: '1px solid',
            display: { xs: 'none', md: 'flex' },
            borderColor: 'divider',
            ...headerProps,
          }}
        >
          {header}
        </Grid>
      )}

      {rows?.map((row, idx) => (
        <Grid
          key={`row-${idx}`}
          container
          alignItems='flex-start'
          sx={{
            px: 1,
            py: 1,
            borderTop: idx > 0 ? '1px solid' : 'none',
            borderColor: 'divider',
            ...rowProps?.(row),
          }}
        >
          {rowMapper(row)}
        </Grid>
      ))}

      {(!rows || rows.length === 0) && (
        <Typography variant='body1' textAlign='center' py={3}>
          {notFoundMsg}
        </Typography>
      )}
    </Paper>
  )
}
