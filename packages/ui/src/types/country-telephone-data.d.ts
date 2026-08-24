/**
 * `country-telephone-data` ships no types of its own. `apps/frontend` got away
 * without this declaration; this package's tsconfig is stricter about the
 * module's untyped entry point, so the shape it actually returns is declared
 * here rather than silenced with an `any`.
 */
declare module 'country-telephone-data' {
  export interface RawCountry {
    /** ISO 3166-1 alpha-2 code, lower case, e.g. `fi`. */
    iso2: string
    /** English name, sometimes with a native-script suffix in parentheses. */
    name: string
    /** Dial code with no leading `+`, e.g. `358`. */
    dialCode: string
    /** National format template, e.g. `+... .. .... ....`. Empty for ~20 territories. */
    format?: string
    priority?: number
    areaCodes?: string[] | null
  }

  export const allCountries: RawCountry[]
  export const iso2Lookup: Record<string, number>
  export const allCountryCodes: Record<string, string[]>
}
