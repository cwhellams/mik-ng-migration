declare namespace Express {
  export interface User {
    userId: number
    email: string
    roles: MIKRoles[]
  }
}
