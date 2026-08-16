/**
 * Lets a mapper spread a row instead of restating every field, without risking a leak.
 *
 * After the CamelCasePlugin migration (issue #1115, phase 5) the db layer was full of
 * lines like `aircraftRegistration: row.aircraftRegistration,` — the rename turned the
 * old snake→camel mapping into no-ops rather than removing it. The obvious cleanup is to
 * spread the row and override only the fields that do real work:
 *
 * ```ts
 * const mapRowToHil = (row: DbRow<'flight.aircraftHil'>): AircraftHil => ({
 *   ...row,
 *   dueDate: row.dueDate?.toISOString() ?? null,
 * })
 * ```
 *
 * That is unsafe on its own. **TypeScript does not apply excess-property checking to
 * spreads** — only to properties written out literally — so a row carrying columns the
 * contract does not declare compiles cleanly, and those columns are serialised straight
 * to the client. In this database that could be an encrypted hetu or an internal note.
 *
 * `noExtraKeys` closes the hole. It is the identity function at runtime; at compile time
 * a row with keys the contract lacks fails, naming them:
 *
 * ```ts
 * const mapRowToHil = (row: DbRow<'flight.aircraftHil'>): AircraftHil =>
 *   noExtraKeys({ ...row, dueDate: row.dueDate?.toISOString() ?? null })
 * ```
 *
 * `Contract` is inferred from the enclosing function's declared return type, so there is
 * no type argument to keep in sync. That does mean it only works where the call has a
 * contextual type — an annotated return position, or an annotated assignment — which is
 * exactly where mappers live.
 *
 * **It fails closed.** Where there is no contextual type, `Contract` falls back to
 * `unknown`, `keyof unknown` is `never`, and so every key counts as excess: an
 * unannotated call is a compile error, never a silent pass. That is worth stating
 * explicitly, because the opposite would be the dangerous failure mode — a mapper that
 * looks guarded, checks nothing, and ships an encrypted hetu to the client. It also means
 * no lint rule is needed to require the annotation; the compiler already refuses without
 * one. `test/db/rowToContract.test.ts` pins this.
 *
 * The same fallback makes it over-strict in two positions, both of which reject rather
 * than wave anything through: a direct `return` inside `Promise<Contract>`, and a
 * `Contract | undefined` return type — the contextual type is a union in both cases, and
 * `keyof` a union keeps only shared keys. Neither bites in practice, since async mappers
 * map inside `rows.map(...)`, where the element's contextual type is the bare contract.
 *
 * A mapper whose row genuinely has extra columns — a wide `selectAll()`, or a join —
 * keeps listing its fields. This is a way to prove a spread is safe, not to force one.
 */

type ExtraKeys<Row, Contract> = Exclude<keyof Row, keyof Contract>

type Checked<Row, Contract> =
  ExtraKeys<Row, Contract> extends never
    ? Row
    : {
        __error: 'row has keys this contract does not declare; they would be serialised to the client'
        __extraKeys: ExtraKeys<Row, Contract>
      }

export const noExtraKeys = <Contract, Row extends Contract>(
  row: Checked<Row, Contract>,
): Contract => row as unknown as Contract
