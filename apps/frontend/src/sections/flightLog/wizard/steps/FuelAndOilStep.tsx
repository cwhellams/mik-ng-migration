import type { LiquidRecordWithLock } from '@mik/contracts/liquid'
import { FuelOilSection } from '../../components/FuelOilSection'
import type { WizardFormProps } from '../types'

interface Props extends WizardFormProps {
  aircraftRegistration?: string
  /** Present once the flight itself has been saved — enables live link/unlink. */
  flightId?: string
  pendingFuelRecord?: LiquidRecordWithLock
  pendingOilRecord?: LiquidRecordWithLock
  onPendingFuelRecordChange: (record: LiquidRecordWithLock | undefined) => void
  onPendingOilRecordChange: (record: LiquidRecordWithLock | undefined) => void
}

export const FuelAndOilStep = ({
  control,
  aircraftRegistration,
  flightId,
  pendingFuelRecord,
  pendingOilRecord,
  onPendingFuelRecordChange,
  onPendingOilRecordChange,
}: Props) => (
  <FuelOilSection
    control={control}
    aircraftRegistration={aircraftRegistration}
    flightId={flightId}
    pendingFuelRecord={pendingFuelRecord}
    pendingOilRecord={pendingOilRecord}
    onPendingFuelRecordChange={onPendingFuelRecordChange}
    onPendingOilRecordChange={onPendingOilRecordChange}
  />
)
