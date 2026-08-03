import { Fuel } from '../../components/Fuel'
import type { WizardFormProps } from '../types'

interface Props extends WizardFormProps {
  usableFuelLitres: number
}

export const FuelRemainingStep = ({ control, usableFuelLitres }: Props) => (
  <Fuel control={control} usableFuelLitres={usableFuelLitres} required />
)
