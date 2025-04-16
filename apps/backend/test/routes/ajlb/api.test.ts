import express from 'express'
import request from 'supertest'

import ajlbRouter from '../../../src/routes/ajlb/api.ts'
import { generateAccessToken } from '../../../src/routes/auth/token.ts'
import { MIKPermissions } from '../../../src/routes/members/models.ts'

// Create an instance of the Express app
const app = express()
app.use(express.json())
app.use('/ajlb', ajlbRouter)

const token = generateAccessToken({
  memberId: 2,
  email: 'jonny.depp@mik.fi',
  permissions: [MIKPermissions.FLIGHTLOG_USER],
})

const adminToken = generateAccessToken({
  memberId: 1,
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
    expect(response.status).toBe(403)
  })

  it('should return 400 for a bad filter', async () => {
    const badFilter = {
      someField: 'rubbish',
    }
    const response = await request(app)
      .get('/ajlb')
      .set('Authorization', `Bearer ${adminToken}`)
      .query(badFilter)
    expect(response.status).toBe(400)
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
