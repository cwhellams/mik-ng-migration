import axios from 'axios'
import { afterEach, describe, expect, it } from 'vitest'

import { http, resetHttpClient, setHttpClient } from './http'

/**
 * The contract this module exists to hold: the shared API clients get whichever
 * axios instance the running app registered, and never one of their own.
 */
describe('http client registry', () => {
  afterEach(() => resetHttpClient())

  it('hands back the instance the app registered', () => {
    const instance = axios.create()
    setHttpClient(instance)

    expect(http()).toBe(instance)
  })

  it('throws a message naming the fix when no app has registered one', () => {
    resetHttpClient()

    // The failure mode this replaces is an undefined-is-not-a-function deep
    // inside dtoApi, which says nothing about the missing setHttpClient call.
    expect(() => http()).toThrow(/setHttpClient/)
  })

  it('lets the last registration win, so a test can swap the client', () => {
    const first = axios.create()
    const second = axios.create()

    setHttpClient(first)
    setHttpClient(second)

    expect(http()).toBe(second)
  })
})
