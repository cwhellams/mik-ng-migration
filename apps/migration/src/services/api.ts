import axios from 'axios'
import * as path from 'path'
import * as os from 'os'
import { readFile, writeFileSync } from 'fs'
import { promisify } from 'util'

const API_BASE = {
  dev: 'http://localhost:3000/api/',
  test: 'https://walrus-app-sa62h.ondigitalocean.app/api/',
  production: 'TBD',
}

if (
  process.env.NODE_ENV !== 'dev' &&
  process.env.NODE_ENV !== 'test' &&
  process.env.NODE_ENV !== 'production'
) {
  throw new Error(
    `Invalid NODE_ENV ${process.env.NODE_ENV}, must be 'dev' or 'test' or 'production'`
  )
}

const cookieFile = path.join(
  os.homedir(),
  `.mik-cookies-${process.env.NODE_ENV}`
)
const tokenFile = path.join(os.homedir(), `.mik-token-${process.env.NODE_ENV}`)

const readFileAsync = promisify(readFile)

const api = axios.create({
  baseURL: API_BASE[process.env.NODE_ENV],
  withCredentials: true,
})

export const request = async <Req, Res = Req>(
  method: string,
  url: string,
  data: Req | undefined = undefined
): Promise<Res | undefined> => {
  const token = await readFileAsync(tokenFile, 'utf-8')

  const call = async (token: string, retryOn401: boolean): Promise<Res> =>
    api
      .request({
        url,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'x-sudo': 'true',
          'x-mik-migration': 'true',
        },
        data,
      })
      .then((res) => res.data as Res)
      .catch(async (err) => {
        if (retryOn401 && err.response?.status === 401) {
          // retry with new token
          return call(await refresh(), false)
        }

        const msg = axios.isAxiosError(err)
          ? JSON.stringify(err.response?.data, null, 2)
          : err.message

        throw new Error(
          `${method} ${url} returned ${err.response?.status || 0}: ${msg}`
        )
      })

  return await call(token, true)
}

export const login = async (token: string) => {
  try {
    const response = await api.post('auth/login/validate', { token })
    if (response.status !== 200) {
      throw new Error(`Login failed with status ${response.status}`)
    }

    console.log('Login successful')
    writeFileSync(tokenFile, response.data.accessToken, 'utf-8')

    const cookie = response.headers['set-cookie']?.[0] || ''
    writeFileSync(cookieFile, cookie, 'utf-8')
  } catch (err) {
    if (err instanceof Error) {
      console.error('Login failed:', err.message)
    } else {
      console.error('Login failed:', err)
    }
  }
}

export const refresh = async (): Promise<string> => {
  const cookie = await readFileAsync(cookieFile, 'utf-8')

  return await api
    .post(
      'auth/refresh',
      {},
      {
        headers: {
          Cookie: cookie.split(';')[0],
        },
      }
    )
    .then((res) => {
      writeFileSync(tokenFile, res.data.accessToken, 'utf-8')

      return res.data.accessToken
    })
    .catch((err) => {
      console.error('Error during token refresh:', err)
      throw err
    })
}
