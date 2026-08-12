import type {
  Control,
  FieldErrors,
  UseFormClearErrors,
  UseFormGetValues,
  UseFormRegister,
  UseFormSetError,
  UseFormSetValue,
  UseFormTrigger,
  UseFormWatch,
} from 'react-hook-form'
import type { FlightLogUpsertRequest } from '@mik/contracts/flight-log'

// The subset of react-hook-form's API every wizard step needs, threaded down from the
// single useForm() call owned by FlightLogEntryWizard.
export interface WizardFormProps {
  control: Control<FlightLogUpsertRequest>
  watch: UseFormWatch<FlightLogUpsertRequest>
  setValue: UseFormSetValue<FlightLogUpsertRequest>
  getValues: UseFormGetValues<FlightLogUpsertRequest>
  trigger: UseFormTrigger<FlightLogUpsertRequest>
  register: UseFormRegister<FlightLogUpsertRequest>
  setError: UseFormSetError<FlightLogUpsertRequest>
  clearErrors: UseFormClearErrors<FlightLogUpsertRequest>
  errors: FieldErrors<FlightLogUpsertRequest>
}
