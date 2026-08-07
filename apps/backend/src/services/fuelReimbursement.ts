// Cross-trip balanced fuel price cap (issue #955).
//
// The club reimburses fuel up to the local (EFNU) price. On a cross-country trip that
// fuels at multiple stops — some cheaper, some pricier than home base — the total cost
// across the whole trip is compared to the local price × total litres, and the cheaper
// of the two is what's reimbursed. This lets a pricier outstation stop balance out
// against a cheaper one, rather than capping every single line item independently.
//
// Fuel paid with the club's card is never reimbursed to the member, but its litres and
// cost still count toward the trip totals above. If the club-card spend alone exceeds
// the trip's capped total, the member owes the club the difference — the "same cap"
// applies to club-card fuel as to member-paid fuel (issue #955 clarification).

export interface FuelReimbursementLineItem {
  quantity: number
  unitPrice: number
  totalCost?: number | null
  paidWithClubCard: boolean
}

export interface FuelReimbursementSummary {
  totalLitres: number
  totalCost: number
  localPriceEurPerLitre: number | null
  localPriceCost: number | null
  cappedTotal: number | null
  clubCardLitres: number
  clubCardCost: number
  /** What the club owes the member for this trip. */
  memberReimbursement: number
  /** What the member owes the club — only nonzero when club-card spend exceeds the capped total. */
  memberOwesClub: number
  /** True when the local price cap actually reduced the total below the raw cost. */
  capped: boolean
}

const lineCost = (item: FuelReimbursementLineItem): number =>
  item.totalCost ?? item.quantity * item.unitPrice

export function computeFuelReimbursement(
  lineItems: FuelReimbursementLineItem[],
  localPriceEurPerLitre: number | null,
): FuelReimbursementSummary {
  const totalLitres = lineItems.reduce((sum, item) => sum + item.quantity, 0)
  const totalCost = lineItems.reduce((sum, item) => sum + lineCost(item), 0)
  const clubCardItems = lineItems.filter((item) => item.paidWithClubCard)
  const clubCardLitres = clubCardItems.reduce((sum, item) => sum + item.quantity, 0)
  const clubCardCost = clubCardItems.reduce((sum, item) => sum + lineCost(item), 0)

  // No price configured for this fuel type/date, or nothing to reimburse — fall back to
  // the raw (uncapped) cost, minus whatever was already paid via the club's card.
  if (localPriceEurPerLitre == null || totalLitres <= 0) {
    return {
      totalLitres,
      totalCost: +totalCost.toFixed(2),
      localPriceEurPerLitre: null,
      localPriceCost: null,
      cappedTotal: null,
      clubCardLitres,
      clubCardCost: +clubCardCost.toFixed(2),
      memberReimbursement: +Math.max(0, totalCost - clubCardCost).toFixed(2),
      memberOwesClub: 0,
      capped: false,
    }
  }

  const localPriceCost = totalLitres * localPriceEurPerLitre
  const cappedTotal = Math.min(totalCost, localPriceCost)
  const netForMember = cappedTotal - clubCardCost

  return {
    totalLitres,
    totalCost: +totalCost.toFixed(2),
    localPriceEurPerLitre,
    localPriceCost: +localPriceCost.toFixed(2),
    cappedTotal: +cappedTotal.toFixed(2),
    clubCardLitres,
    clubCardCost: +clubCardCost.toFixed(2),
    memberReimbursement: +Math.max(0, netForMember).toFixed(2),
    memberOwesClub: +Math.max(0, -netForMember).toFixed(2),
    capped: totalCost > localPriceCost,
  }
}
