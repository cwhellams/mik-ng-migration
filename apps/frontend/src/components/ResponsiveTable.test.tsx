import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { ResponsiveTable } from './ResponsiveTable'

interface Row {
  registration: string
}

const rows: Row[] = [{ registration: 'OH-STL' }, { registration: 'OH-IHQ' }]

const renderTable = (props: Partial<Parameters<typeof ResponsiveTable<Row>>[0]> = {}) =>
  renderWithProviders(
    <ResponsiveTable<Row>
      notFoundMsg='No aircraft found'
      rows={rows}
      row={(row) => <span>{row.registration}</span>}
      {...props}
    />,
  )

describe('ResponsiveTable', () => {
  it('renders one entry per row', () => {
    renderTable()

    expect(screen.getByText('OH-STL')).toBeInTheDocument()
    expect(screen.getByText('OH-IHQ')).toBeInTheDocument()
  })

  it('renders the header when given one', () => {
    renderTable({ header: <span>Registration</span> })

    expect(screen.getByText('Registration')).toBeInTheDocument()
  })

  it('omits the header entirely when not given one', () => {
    renderTable()

    expect(screen.queryByText('Registration')).toBeNull()
  })

  it('shows the not-found message for an empty list', () => {
    renderTable({ rows: [] })

    expect(screen.getByText('No aircraft found')).toBeInTheDocument()
  })

  it('shows the not-found message while the rows are still undefined', () => {
    // Callers pass SWR data straight in, so undefined is the loading state.
    renderTable({ rows: undefined })

    expect(screen.getByText('No aircraft found')).toBeInTheDocument()
  })

  it('keeps the header visible above the not-found message', () => {
    renderTable({ rows: [], header: <span>Registration</span> })

    expect(screen.getByText('Registration')).toBeInTheDocument()
    expect(screen.getByText('No aircraft found')).toBeInTheDocument()
  })

  it('passes each row to the row renderer', () => {
    renderTable({ row: (row) => <span>Aircraft {row.registration}</span> })

    expect(screen.getByText('Aircraft OH-STL')).toBeInTheDocument()
  })
})
