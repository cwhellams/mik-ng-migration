import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'

import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { router } from '../../../src/routes/secrets/api.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'
import { db } from '../../../src/db/connection.ts'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use(cookieParser())
app.use('/secrets', router)
app.use(problemErrorHandler)

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  lastName: 'Admin',
  email: 'admin@mik.fi',
  roles: [],
  permissions: [MIKPermissions.ACCESS_CODES_ADMIN],
  canMakeReservations: false,
})

const userToken = generateAccessToken({
  memberId: 'Anna1',
  lastName: 'Korhonen',
  email: 'user@mik.fi',
  roles: [],
  permissions: [MIKPermissions.ACCESS_CODES_USER],
  canMakeReservations: false,
})

const noPermissionsToken = generateAccessToken({
  memberId: 'Juha1',
  lastName: 'Mäkinen',
  email: 'no-permissions@mik.fi',
  roles: [],
  permissions: [MIKPermissions.MEMBER],
  canMakeReservations: false,
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
        .set('Cookie', `accessToken=${noPermissionsToken}`)

      expect(response.status).toBe(403)
    })

    it('should return secrets for authorized user', async () => {
      const response = await request(app).get('/secrets').set('Cookie', `accessToken=${userToken}`)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('secrets')
      expect(Array.isArray(response.body.secrets)).toBe(true)
    })

    it('should return secrets in alphabetical order', async () => {
      // Create test secrets
      await request(app)
        .post('/secrets')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ secretKey: 'Z Last Key', secretValue: 'Last Value' })

      await request(app)
        .post('/secrets')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ secretKey: 'A First Key', secretValue: 'First Value' })

      const response = await request(app).get('/secrets').set('Cookie', `accessToken=${userToken}`)

      expect(response.status).toBe(200)
      expect(response.body.secrets).toHaveLength(2)
      expect(response.body.secrets[0].secretKey).toBe('A First Key')
      expect(response.body.secrets[1].secretKey).toBe('Z Last Key')
    })

    it('should not return BOARD secrets to ACCESS_CODES_USER', async () => {
      await request(app)
        .post('/secrets')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ secretKey: 'Member Code', secretValue: '1234', secretClass: 'MEMBER' })

      await request(app)
        .post('/secrets')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ secretKey: 'Board Safe Code', secretValue: '9999', secretClass: 'BOARD' })

      const response = await request(app).get('/secrets').set('Cookie', `accessToken=${userToken}`)

      expect(response.status).toBe(200)
      expect(response.body.secrets).toHaveLength(1)
      expect(response.body.secrets[0].secretKey).toBe('Member Code')
      expect(response.body.secrets[0].secretClass).toBe('MEMBER')
    })

    it('should return both MEMBER and BOARD secrets to ACCESS_CODES_ADMIN', async () => {
      await request(app)
        .post('/secrets')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ secretKey: 'Member Code', secretValue: '1234', secretClass: 'MEMBER' })

      await request(app)
        .post('/secrets')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ secretKey: 'Board Safe Code', secretValue: '9999', secretClass: 'BOARD' })

      const response = await request(app).get('/secrets').set('Cookie', `accessToken=${adminToken}`)

      expect(response.status).toBe(200)
      expect(response.body.secrets).toHaveLength(2)
    })
  })

  describe('POST /secrets', () => {
    it('should require ACCESS_CODES_ADMIN permission', async () => {
      const response = await request(app)
        .post('/secrets')
        .set('Cookie', `accessToken=${userToken}`)
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
        .set('Cookie', `accessToken=${adminToken}`)
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
        .set('Cookie', `accessToken=${adminToken}`)
        .send({})

      expect(response.status).toBe(400)
    })

    it('should default secretClass to MEMBER when not specified', async () => {
      const response = await request(app)
        .post('/secrets')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ secretKey: 'No Class Key', secretValue: 'value' })

      expect(response.status).toBe(201)
      expect(response.body.secretClass).toBe('MEMBER')
    })

    it('should create a BOARD secret for admin user', async () => {
      const response = await request(app)
        .post('/secrets')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ secretKey: 'Board Secret', secretValue: 'board-value', secretClass: 'BOARD' })

      expect(response.status).toBe(201)
      expect(response.body.secretClass).toBe('BOARD')
    })
  })

  describe('GET /secrets/:id', () => {
    it('should return 403 when user only has ACCESS_CODES_USER and secret is BOARD class', async () => {
      const createResponse = await request(app)
        .post('/secrets')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ secretKey: 'Board Secret', secretValue: 'board-value', secretClass: 'BOARD' })

      const secretId = createResponse.body.id

      const response = await request(app)
        .get(`/secrets/${secretId}`)
        .set('Cookie', `accessToken=${userToken}`)

      expect(response.status).toBe(403)
    })

    it('should allow ACCESS_CODES_ADMIN to access BOARD secret by id', async () => {
      const createResponse = await request(app)
        .post('/secrets')
        .set('Cookie', `accessToken=${adminToken}`)
        .send({ secretKey: 'Board Secret', secretValue: 'board-value', secretClass: 'BOARD' })

      const secretId = createResponse.body.id

      const response = await request(app)
        .get(`/secrets/${secretId}`)
        .set('Cookie', `accessToken=${adminToken}`)

      expect(response.status).toBe(200)
      expect(response.body.secretClass).toBe('BOARD')
    })
  })

  describe('PATCH /secrets/:id', () => {
    it('should update an existing secret', async () => {
      // Create a secret first
      const createResponse = await request(app)
        .post('/secrets')
        .set('Cookie', `accessToken=${adminToken}`)
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
        .set('Cookie', `accessToken=${adminToken}`)
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
        .set('Cookie', `accessToken=${adminToken}`)
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
        .set('Cookie', `accessToken=${adminToken}`)
        .send({
          secretKey: 'Delete Me',
          secretValue: 'Delete Me',
        })

      const secretId = createResponse.body.id
      // Delete the secret
      const response = await request(app)
        .delete(`/secrets/${secretId}`)
        .set('Cookie', `accessToken=${adminToken}`)

      expect(response.status).toBe(204)

      // Verify it's deleted
      const getResponse = await request(app)
        .get(`/secrets/${secretId}`)
        .set('Cookie', `accessToken=${adminToken}`)

      expect(getResponse.status).toBe(404)
    })

    it('should return 404 for non-existent secret', async () => {
      const response = await request(app)
        .delete('/secrets/999999')
        .set('Cookie', `accessToken=${adminToken}`)

      expect(response.status).toBe(404)
    })
  })
})
