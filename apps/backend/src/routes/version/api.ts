import { HttpStatusCode } from 'axios'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { Router, type Request, type Response } from 'express'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../../package.json'), 'utf-8'),
) as { version: string }

export const router = Router()

export interface VersionResponse {
  version: string
}

router.get('/', (_req: Request, res: Response<VersionResponse>) => {
  res.status(HttpStatusCode.Ok).json({ version })
})
