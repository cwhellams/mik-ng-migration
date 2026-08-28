declare namespace Express {
  interface Request {
    // Results of routes/validate.ts's validate() middleware, one slot per
    // source so validating query and body (or params) on the same request
    // can't silently clobber each other — cast to the relevant schema's
    // inferred type at the point of use.
    validated?: {
      query?: unknown
      body?: unknown
      params?: unknown
    }
    user?: {
      memberId: string
      lastName: string
      email: string
      roles: string[]
      permissions: import('@mik/contracts/members').MIKPermissions[]
      canMakeReservations: boolean
      // The member.sessions row this access token belongs to (#1234). Optional
      // because a token minted before that shipped does not carry one, and
      // because authMiddleware spreads the verified payload as-is rather than
      // re-validating it. Read only by the sessions routes, to mark which listed
      // session is the caller's own — never on the request hot path.
      sid?: string
    }
  }
}
