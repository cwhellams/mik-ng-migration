declare namespace Express {
  export interface User {
    memberId: string
    email: string
    permissions: MIKPermissions[]
  }
}
