import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import request from 'supertest'
import { router } from '../../../src/routes/version/api.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { version: rootVersion } = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../../package.json'), 'utf-8'),
) as { version: string }

const app = express()
app.use(express.json())
app.use('/version', router)

describe('GET /version', () => {
  it('should return 200 with a version string', async () => {
    const response = await request(app).get('/version')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
    })
  })

  it('should return the version from the root package.json', async () => {
    const response = await request(app).get('/version')

    expect(response.body.version).toBe(rootVersion)
  })

  it('should not require authentication', async () => {
    const response = await request(app).get('/version')

    expect(response.status).not.toBe(401)
    expect(response.status).not.toBe(403)
  })
})
