import { Router } from 'express'
import type { Request, Response } from 'express'

import {
  type Secret,
  type SecretsListResponse,
  SecretCreateSchema,
  SecretUpdateSchema,
} from './models.ts'
import {
  getAllSecrets,
  getSecretById,
  createSecret,
  updateSecret,
  deleteSecret,
} from '../../db/secrets-queries.ts'
import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { problem } from '../response.ts'

export const router = Router()

// Get all secrets - requires ACCESS_CODES_USER permission
router.get(
  '/',
  validateUser(MIKPermissions.ACCESS_CODES_USER, MIKPermissions.ACCESS_CODES_ADMIN),
  async (req: Request, res: Response<SecretsListResponse>) => {
    const isAdmin = req.user!.permissions.includes(MIKPermissions.ACCESS_CODES_ADMIN)
    const secrets = await getAllSecrets(isAdmin)

    res.status(200).json({
      secrets,
    })
  },
)

// Get a single secret by ID - requires ACCESS_CODES_USER permission
router.get(
  '/:id',
  validateUser(MIKPermissions.ACCESS_CODES_USER, MIKPermissions.ACCESS_CODES_ADMIN),
  async (req: Request<{ id: string }>, res: Response<Secret>) => {
    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      return problem({ status: 400, detail: 'Invalid secret ID' })
    }

    const secret = await getSecretById(id)

    if (!secret) {
      return problem({ status: 404, detail: 'Secret not found' })
    }

    const isAdmin = req.user!.permissions.includes(MIKPermissions.ACCESS_CODES_ADMIN)
    if (secret.secretClass === 'BOARD' && !isAdmin) {
      return problem({ status: 403, detail: 'Forbidden' })
    }

    res.status(200).json(secret)
  },
)

// Create a new secret - requires ACCESS_CODES_ADMIN permission
router.post(
  '/',
  validateUser(MIKPermissions.ACCESS_CODES_ADMIN),
  async (req: Request, res: Response<Secret>) => {
    const secretData = SecretCreateSchema.parse(req.body)
    const secret = await createSecret(secretData, req.user!)

    res.status(201).json(secret)
  },
)

// Update an existing secret - requires ACCESS_CODES_ADMIN permission
router.patch(
  '/:id',
  validateUser(MIKPermissions.ACCESS_CODES_ADMIN),
  async (req: Request<{ id: string }>, res: Response<Secret>) => {
    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      return problem({ status: 400, detail: 'Invalid secret ID' })
    }

    const updateData = SecretUpdateSchema.parse(req.body)
    const secret = await updateSecret(id, updateData, req.user!)

    if (!secret) {
      return problem({ status: 404, detail: 'Secret not found' })
    }

    res.status(200).json(secret)
  },
)

// Delete a secret - requires ACCESS_CODES_ADMIN permission
router.delete(
  '/:id',
  validateUser(MIKPermissions.ACCESS_CODES_ADMIN),
  async (req: Request<{ id: string }>, res: Response) => {
    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      return problem({ status: 400, detail: 'Invalid secret ID' })
    }

    const success = await deleteSecret(id)

    if (!success) {
      return problem({ status: 404, detail: 'Secret not found' })
    }

    res.status(204).end()
  },
)
