import { throwError } from '../../src/routes/response.ts'

describe('throwError', () => {
  test('should throw an error with the provided message', () => {
    const errorMessage = 'Test error message'
    expect(() => throwError(errorMessage)).toThrowError(errorMessage)
  })

  test('should throw an instance of Error', () => {
    expect(() => throwError('Some error')).toThrowError(Error)
  })
})
