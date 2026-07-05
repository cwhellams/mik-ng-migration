/**
 * Fetches ECB historical exchange rates via the Frankfurter API
 * (https://www.frankfurter.app), which mirrors ECB reference rates.
 *
 * Returns the rate as: 1 <currency> = X EUR
 */

const FRANKFURTER_BASE = 'https://api.frankfurter.app'

export interface EcbFxRateResult {
  date: string
  currency: string
  /** How many EUR one unit of <currency> is worth */
  rateToEur: number
}

/**
 * Look up the ECB FX rate for a given currency on a specific date.
 * Falls back to the most recent available rate if no rate exists for the exact date
 * (e.g. weekends / holidays) by using the date as `startPeriod` and fetching the latest.
 *
 * @param currency ISO 4217 currency code (e.g. "USD", "SEK")
 * @param date     ISO date string "YYYY-MM-DD"
 * @throws if the currency is not supported or the request fails
 */
export async function getEcbFxRate(currency: string, date: string): Promise<EcbFxRateResult> {
  if (currency === 'EUR') {
    return { date, currency: 'EUR', rateToEur: 1 }
  }

  // Frankfurter endpoint: /{date}?from={currency}&to=EUR
  // If no rate exists for that exact date it returns the closest prior business day.
  const url = `${FRANKFURTER_BASE}/${encodeURIComponent(date)}?from=${encodeURIComponent(currency)}&to=EUR`

  const response = await fetch(url)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`No ECB rate found for ${currency} on ${date}`)
    }
    throw new Error(`Frankfurter API error ${response.status}: ${await response.text()}`)
  }

  const json = (await response.json()) as {
    amount: number
    base: string
    date: string
    rates: Record<string, number>
  }

  const rateToEur = json.rates['EUR']
  if (rateToEur == null) {
    throw new Error(`No EUR rate in Frankfurter response for ${currency}`)
  }

  return {
    date: json.date,
    currency,
    rateToEur,
  }
}
