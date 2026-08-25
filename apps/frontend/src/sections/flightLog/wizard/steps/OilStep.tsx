import { LiquidType, type LiquidRecordWithLock } from '@mik/contracts/liquid'
import { LiquidUpliftField } from '../../components/LiquidUpliftField'
import type { WizardFormProps } from '../types'

interface Props extends WizardFormProps {
  aircraftRegistration?: string
  pendingRecord?: LiquidRecordWithLock
  onPendingRecordChange: (record: LiquidRecordWithLock | undefined) => void
}

export const OilStep = ({
  control,
  aircraftRegistration,
  pendingRecord,
  onPendingRecordChange,
}: Props) => (
  <LiquidUpliftField
    liquidType={LiquidType.OIL}
    control={control}
    aircraftRegistration={aircraftRegistration}
    pendingRecord={pendingRecord}
    onPendingRecordChange={onPendingRecordChange}
    hideLabel
  />
)
