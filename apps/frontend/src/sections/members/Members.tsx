import {
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
} from '@mui/material'
import useApi from '../../hooks/useApi'
import { MemberListResponse } from '@backend/routes/members/models'

const Members = () => {
  const { data, error, isLoading } = useApi<MemberListResponse>({
    url: 'v1/members',
  })

  return (
    <Box>
      <Typography variant='h2' gutterBottom>
        Members
      </Typography>
      {isLoading ? (
        <CircularProgress size={24} color='inherit' />
      ) : error || !data ? (
        <Typography variant='h6' color='error' align='center'>
          Error loading member data.
        </Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table sx={{ minWidth: 650 }} aria-label='simple table'>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell align='right'>Phone Number</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data?.members.map((row) => (
                <TableRow
                  key={row.name}
                  sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                >
                  <TableCell component='th' scope='row'>
                    {row.name}
                  </TableCell>
                  <TableCell align='right'>{row.phoneNumber}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}

export default Members
