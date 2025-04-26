import express from 'express'
import request from 'supertest'

import ajlbRouter from '../../../src/routes/ajlb/api.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'
import { problemErrorHandler } from '../../../src/routes/response.ts'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/ajlb', ajlbRouter)
app.use(problemErrorHandler)

const token = generateAccessToken({
  memberId: 'Matti1',
  email: 'jonny.depp@mik.fi',
  permissions: [MIKPermissions.FLIGHTLOG_USER],
})

const adminToken = generateAccessToken({
  memberId: 'k1mnimda',
  email: 'jonny.depp@mik.fi',
  permissions: [MIKPermissions.FLIGHTLOG_ADMIN],
})

describe('GET /ajlb', () => {
  it('should get all ajlbs for an admin user', async () => {
    const response = await request(app).get('/ajlb').set('Authorization', `Bearer ${adminToken}`)
    expect(response.status).toBe(200)
    expect(response.body).toMatchSnapshot()
  })

  it('should return 403 for a regular user', async () => {
    const response = await request(app).get('/ajlb').set('Authorization', `Bearer ${token}`)
    expect(response.body).toEqual({
      status: 403,
      title: 'Forbidden',
      detail: 'Protected Content',
      instance: '/ajlb',
      timestamp: expect.any(String),
    })
  })

  it('should return 400 for a bad filter', async () => {
    const badFilter = {
      someField: 'rubbish',
    }
    const response = await request(app)
      .get('/ajlb')
      .set('Authorization', `Bearer ${adminToken}`)
      .query(badFilter)
    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      instance: '/ajlb',
      timestamp: expect.any(String),
      errors: [
        {
          code: 'unrecognized_keys',
          keys: ['someField'],
          message: "Unrecognized key(s) in object: 'someField'",
          path: [],
        },
      ],
    })
  })

  it('should get latest ajlbs for an admin user', async () => {
    const response = await request(app)
      .get('/ajlb/latest')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(response.status).toBe(200)
    expect(response.body).toMatchSnapshot()
  })

  it('should get filtered ajlbs for an admin user', async () => {
    const filter = {
      aircraft_registration: 'OH-P28',
    }

    const response = await request(app)
      .get('/ajlb')
      .set('Authorization', `Bearer ${adminToken}`)
      .query(filter)
    expect(response.status).toBe(200)
    expect(response.body).toMatchSnapshot()
  })
})
