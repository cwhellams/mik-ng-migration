import { computeFuelReimbursement } from '../../src/services/fuelReimbursement.ts'

describe('computeFuelReimbursement', () => {
  it('reimburses the raw cost when every stop is cheaper than the local price', () => {
    const summary = computeFuelReimbursement(
      [{ quantity: 100, unitPrice: 2.5, paidWithClubCard: false }],
      3.0,
    )
    expect(summary.totalLitres).toBe(100)
    expect(summary.totalCost).toBe(250)
    expect(summary.localPriceCost).toBe(300)
    expect(summary.cappedTotal).toBe(250)
    expect(summary.memberReimbursement).toBe(250)
    expect(summary.memberOwesClub).toBe(0)
    expect(summary.capped).toBe(false)
  })

  it('caps at the local price when every stop is pricier', () => {
    const summary = computeFuelReimbursement(
      [{ quantity: 100, unitPrice: 3.5, paidWithClubCard: false }],
      3.0,
    )
    expect(summary.totalCost).toBe(350)
    expect(summary.localPriceCost).toBe(300)
    expect(summary.cappedTotal).toBe(300)
    expect(summary.memberReimbursement).toBe(300)
    expect(summary.capped).toBe(true)
  })

  it('balances a cheaper stop against a pricier one across the trip', () => {
    // 50L @ 2.00 (home, cheap) + 50L @ 4.00 (outstation, pricy) = 300 total for 100L
    // Local price 3.00 * 100L = 300 -> exactly at the cap, not capped further.
    const summary = computeFuelReimbursement(
      [
        { quantity: 50, unitPrice: 2.0, paidWithClubCard: false },
        { quantity: 50, unitPrice: 4.0, paidWithClubCard: false },
      ],
      3.0,
    )
    expect(summary.totalCost).toBe(300)
    expect(summary.localPriceCost).toBe(300)
    expect(summary.cappedTotal).toBe(300)
    expect(summary.memberReimbursement).toBe(300)
    expect(summary.capped).toBe(false)
  })

  it('excludes club-card litres from the member reimbursement but counts them toward the trip totals', () => {
    // 50L member-paid @ 2.50 + 50L club-card @ 2.50 = 250 total, well under the 300 cap.
    const summary = computeFuelReimbursement(
      [
        { quantity: 50, unitPrice: 2.5, paidWithClubCard: false },
        { quantity: 50, unitPrice: 2.5, paidWithClubCard: true },
      ],
      3.0,
    )
    expect(summary.totalLitres).toBe(100)
    expect(summary.totalCost).toBe(250)
    expect(summary.clubCardLitres).toBe(50)
    expect(summary.clubCardCost).toBe(125)
    // cappedTotal (250) - clubCardCost (125) = 125 owed to the member
    expect(summary.memberReimbursement).toBe(125)
    expect(summary.memberOwesClub).toBe(0)
  })

  it('makes the member owe the club when club-card spend alone exceeds the capped trip total', () => {
    // Club card buys 100L @ 4.00 = 400, but the trip is capped at 100L * 3.00 = 300.
    const summary = computeFuelReimbursement(
      [{ quantity: 100, unitPrice: 4.0, paidWithClubCard: true }],
      3.0,
    )
    expect(summary.cappedTotal).toBe(300)
    expect(summary.clubCardCost).toBe(400)
    expect(summary.memberReimbursement).toBe(0)
    expect(summary.memberOwesClub).toBe(100)
  })

  it('falls back to raw (uncapped) cost when no local price is configured', () => {
    const summary = computeFuelReimbursement(
      [{ quantity: 100, unitPrice: 3.5, paidWithClubCard: false }],
      null,
    )
    expect(summary.localPriceCost).toBeNull()
    expect(summary.cappedTotal).toBeNull()
    expect(summary.memberReimbursement).toBe(350)
    expect(summary.capped).toBe(false)
  })

  it('handles zero line items without dividing by zero', () => {
    const summary = computeFuelReimbursement([], 3.0)
    expect(summary.totalLitres).toBe(0)
    expect(summary.memberReimbursement).toBe(0)
    expect(summary.memberOwesClub).toBe(0)
  })

  it('prefers the persisted totalCost over quantity * unitPrice when present (issue #1024 precision)', () => {
    const summary = computeFuelReimbursement(
      [{ quantity: 100, unitPrice: 2.755, totalCost: 275.5, paidWithClubCard: false }],
      3.0,
    )
    expect(summary.totalCost).toBe(275.5)
  })
})
