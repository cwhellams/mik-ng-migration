import { describe, expect, it } from 'vitest'

import { MemberAdminPatchSchema } from '../src/members.ts'

describe('MemberAdminPatchSchema', () => {
  it('does not accept avatarUrl or avatarStyle — both have dedicated endpoints and must not be silently writable via the generic admin PATCH', () => {
    expect(MemberAdminPatchSchema.shape).not.toHaveProperty('avatarUrl')
    expect(MemberAdminPatchSchema.shape).not.toHaveProperty('avatarStyle')
  })
})
