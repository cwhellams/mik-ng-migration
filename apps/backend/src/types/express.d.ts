declare namespace Express {
  export interface User {
    memberId: number
    email: string
    roles: MIKRoles[]
  }
}
