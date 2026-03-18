declare namespace Express {
  interface Request {
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
