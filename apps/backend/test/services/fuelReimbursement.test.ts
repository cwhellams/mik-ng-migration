import {
  buildFuelPayoutLineItems,
  computeFuelReimbursement,
} from '../../src/services/fuelReimbursement.ts'

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

describe('buildFuelPayoutLineItems', () => {
  const rows = [
    { description: 'Home base', quantity: 50, unitPrice: 2.0, totalCost: 100, itemId: 7 },
    { description: 'Outstation', quantity: 50, unitPrice: 4.0, totalCost: 200, itemId: 7 },
    {
      description: 'Club card',
      quantity: 20,
      unitPrice: 3.0,
      totalCost: 60,
      itemId: 7,
      paidWithClubCard: true,
    },
  ]

  it('drops club-card rows and pays the member-paid rows as entered when nothing is capped', () => {
    const summary = computeFuelReimbursement(
      rows.map((row) => ({ ...row, paidWithClubCard: row.paidWithClubCard ?? false })),
      3.0,
    )
    // 120 l * 3.00 = 360 cap, raw cost also 360 -> not capped; 360 - 60 club card = 300.
    expect(summary.memberReimbursement).toBe(300)

    const payout = buildFuelPayoutLineItems(rows, summary)
    expect(payout).toHaveLength(2)
    expect(payout.map((row) => row.description)).toEqual(['Home base', 'Outstation'])
    expect(payout.reduce((sum, row) => sum + row.totalCost!, 0)).toBe(300)
  })

  it('scales the member-paid rows down to the capped total, exactly', () => {
    // 100 l at 4.00 = 400 claimed, local price 3.00 -> capped at 300.
    const items = [
      { description: 'Leg 1', quantity: 30, unitPrice: 4.0, totalCost: 120 },
      { description: 'Leg 2', quantity: 70, unitPrice: 4.0, totalCost: 280 },
    ]
    const summary = computeFuelReimbursement(
      items.map((item) => ({ ...item, paidWithClubCard: false })),
      3.0,
    )
    expect(summary.capped).toBe(true)
    expect(summary.memberReimbursement).toBe(300)

    const payout = buildFuelPayoutLineItems(items, summary)
    expect(payout.reduce((sum, row) => sum + row.totalCost!, 0)).toBe(300)
    expect(payout[0].totalCost).toBe(90) // 120 * 0.75
    expect(payout[1].totalCost).toBe(210) // 280 * 0.75
    // unitPrice stays consistent with the scaled total.
    expect(payout[0].unitPrice).toBeCloseTo(3.0, 4)
  })

  it('puts the rounding remainder on the last row so the payout matches the summary to the cent', () => {
    const items = [
      { description: 'Leg 1', quantity: 1, unitPrice: 33.33, totalCost: 33.33 },
      { description: 'Leg 2', quantity: 1, unitPrice: 33.33, totalCost: 33.33 },
      { description: 'Leg 3', quantity: 1, unitPrice: 33.34, totalCost: 33.34 },
    ]
    const summary = { ...computeFuelReimbursement([], null), memberReimbursement: 50 }

    const payout = buildFuelPayoutLineItems(items, summary)
    expect(payout.reduce((sum, row) => sum + row.totalCost!, 0)).toBe(50)
  })

  it('pays nothing when the club card already covered the whole capped total', () => {
    // 100 l club-card at 4.00 = 400, cap 100 l * 3.00 = 300 -> member owes 100, gets 0.
    const items = [
      { description: 'Club card', quantity: 100, unitPrice: 4.0, paidWithClubCard: true },
      { description: 'Member paid', quantity: 0.0001, unitPrice: 0, paidWithClubCard: false },
    ]
    const summary = computeFuelReimbursement(
      items.map((item) => ({ ...item, totalCost: null })),
      3.0,
    )
    expect(summary.memberOwesClub).toBeGreaterThan(0)
    expect(buildFuelPayoutLineItems(items, summary)).toEqual([])
  })

  it('pays nothing when every row was on the club card', () => {
    const items = [
      { description: 'Club card', quantity: 10, unitPrice: 2.0, paidWithClubCard: true },
    ]
    const summary = computeFuelReimbursement(
      items.map((item) => ({ ...item, totalCost: null })),
      3.0,
    )
    expect(summary.memberReimbursement).toBe(0)
    expect(buildFuelPayoutLineItems(items, summary)).toEqual([])
  })
})
