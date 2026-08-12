// Response of the public GET /v1/time endpoint. Clients use it to detect and
// compensate for local clock skew; the server runs NTP-sync'd, so this
// timestamp is authoritative.
export interface TimeResponse {
  utcIso: string
  epochMs: number
}
