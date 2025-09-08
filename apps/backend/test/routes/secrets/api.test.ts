import 'dotenv/config'
import express from 'express'
import request from 'supertest'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router } from '../../../src/routes/secrets/api.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { db } from '../../../src/db/connection.ts'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/secrets', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  email: 'admin@mik.fi',
  permissions: [MIKPermissions.ACCESS_CODES_ADMIN],
})

const userToken = generateAccessToken({
  memberId: 'Anna1',
  email: 'user@mik.fi',
  permissions: [MIKPermissions.ACCESS_CODES_USER],
})

const noPermissionsToken = generateAccessToken({
  memberId: 'Juha1',
  email: 'no-permissions@mik.fi',
  permissions: [MIKPermissions.MEMBER],
})

describe('Secrets API', () => {
  // Clean up secrets before each test
  beforeEach(async () => {
    await db.deleteFrom('secrets').execute()
  })

  describe('GET /secrets', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/secrets')

      expect(response.status).toBe(401)
    })

    it('should require ACCESS_CODES_USER permission', async () => {
      const response = await request(app)
        .get('/secrets')
        .set('Authorization', `Bearer ${noPermissionsToken}`)

      expect(response.status).toBe(403)
    })

    it('should return secrets for authorized user', async () => {
      const response = await request(app)
        .get('/secrets')
        .set('Authorization', `Bearer ${userToken}`)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('secrets')
      expect(Array.isArray(response.body.secrets)).toBe(true)
    })

    it('should return secrets in alphabetical order', async () => {
      // Create test secrets
      await request(app)
        .post('/secrets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ secretKey: 'Z Last Key', secretValue: 'Last Value' })

      await request(app)
        .post('/secrets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ secretKey: 'A First Key', secretValue: 'First Value' })

      const response = await request(app)
        .get('/secrets')
        .set('Authorization', `Bearer ${userToken}`)

      expect(response.status).toBe(200)
      expect(response.body.secrets).toHaveLength(2)
      expect(response.body.secrets[0].secretKey).toBe('A First Key')
      expect(response.body.secrets[1].secretKey).toBe('Z Last Key')
    })
  })

  describe('POST /secrets', () => {
    it('should require ACCESS_CODES_ADMIN permission', async () => {
      const response = await request(app)
        .post('/secrets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          secretKey: 'Test Key',
          secretValue: 'Test Value',
        })

      expect(response.status).toBe(403)
    })

    it('should create a new secret for admin user', async () => {
      const secretData = {
        secretKey: 'Test Key',
        secretValue: 'Test Value',
      }

      const response = await request(app)
        .post('/secrets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(secretData)

      expect(response.status).toBe(201)
      expect(response.body).toMatchObject({
        secretKey: secretData.secretKey,
        secretValue: secretData.secretValue,
        createdBy: 'k1mnimda',
        updatedBy: 'k1mnimda',
      })
      expect(response.body).toHaveProperty('id')
      expect(response.body).toHaveProperty('createdAt')
      expect(response.body).toHaveProperty('updatedAt')
    })

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/secrets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})

      expect(response.status).toBe(400)
    })
  })

  describe('PATCH /secrets/:id', () => {
    it('should update an existing secret', async () => {
      // Create a secret first
      const createResponse = await request(app)
        .post('/secrets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          secretKey: 'Original Key',
          secretValue: 'Original Value',
        })

      const secretId = createResponse.body.id

      // Update the secret
      const updateData = {
        secretKey: 'Updated Key',
        secretValue: 'Updated Value',
      }

      const response = await request(app)
        .patch(`/secrets/${secretId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        id: secretId,
        secretKey: updateData.secretKey,
        secretValue: updateData.secretValue,
        updatedBy: 'k1mnimda',
      })
    })

    it('should return 404 for non-existent secret', async () => {
      const response = await request(app)
        .patch('/secrets/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          secretKey: 'Updated Key',
        })

      expect(response.status).toBe(404)
    })
  })

  describe('DELETE /secrets/:id', () => {
    it('should delete an existing secret', async () => {
      // Create a secret first

      var createResponse = await request(app)
        .post('/secrets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          secretKey: 'Delete Me',
          secretValue: 'Delete Me',
        })

      const secretId = createResponse.body.id
      // Delete the secret
      const response = await request(app)
        .delete(`/secrets/${secretId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(204)

      // Verify it's deleted
      const getResponse = await request(app)
        .get(`/secrets/${secretId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(getResponse.status).toBe(404)
    })

    it('should return 404 for non-existent secret', async () => {
      const response = await request(app)
        .delete('/secrets/999999')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(404)
    })
  })
})
