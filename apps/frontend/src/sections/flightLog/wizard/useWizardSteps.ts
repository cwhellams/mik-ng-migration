// Fixed 11-step flow — unlike ExpenseClaimWizard's step list, nothing here is
// conditionally included/excluded; per-step content (e.g. the default-instructor
// crew slot, or the date/timezone controls only shown on the first time step) is
// handled inside the step components themselves.
export const WIZARD_STEPS = [
  'aircraftType',
  'crew',
  'timeDeparture', // off-block + takeoff, on one page
  'timeArrival', // landing + on-block, on one page
  'airports',
  'landings',
  'nightIfr',
  'fuelUplift', // fuel and oil, on one page (FuelOilSection)
  'fuelRemaining',
  'notes',
  'review',
] as const

export type WizardStep = (typeof WIZARD_STEPS)[number]
