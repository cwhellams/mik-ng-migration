/**
 * Fee discount utilities for seasonal/half-year discounts.
 *
 * Equipment fee: 50% discount when requested on or after September 1st.
 * Membership fee: 50% discount for new members approved on or after October 1st.
 */

export const HALF_YEAR_DISCOUNT_PERCENT = 50

/**
 * Returns true if the given date is on or after September 1st.
 * This is the cutoff date for the 50% equipment fee discount.
 */
export function isAfterEquipmentFeeDiscountDate(date: Date = new Date()): boolean {
  const month = date.getUTCMonth() + 1 // 1-indexed (1 = January)
  return month >= 9 // September (9) or later
}

/**
 * Returns true if the given date is on or after October 1st.
 * This is the cutoff date for the 50% new-member membership fee discount.
 */
export function isAfterMembershipFeeDiscountDate(date: Date = new Date()): boolean {
  const month = date.getUTCMonth() + 1 // 1-indexed (1 = January)
  return month >= 10 // October (10) or later
}
