import { problem } from '../../src/routes/response.ts'

describe('throwProblem', () => {
  test('should throw an error with the provided message', () => {
    const errorMessage = 'Test error message'
    expect(() => problem({ status: 500, detail: errorMessage })).toThrow(errorMessage)
  })

  test('should throw an instance of Error', () => {
    expect(() => problem({ status: 500, detail: 'Some error' })).toThrow(Error)
  })
})
