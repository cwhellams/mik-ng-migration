declare namespace Express {
  export interface User {
    memberId: string
    lastName: string
    email: string
    roles: string[]
    permissions: MIKPermissions[]
  }
}
