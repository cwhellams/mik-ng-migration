import { Router } from 'express'

import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'

const router = Router()
router.use(validateUser(MIKPermissions.INVOICING_USER, MIKPermissions.INVOICING_ADMIN))

export default router
