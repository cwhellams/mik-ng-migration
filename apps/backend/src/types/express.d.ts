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
      permissions: import('../routes/members/models.ts').MIKPermissions[]
      canMakeReservations: boolean
    }
  }
}
