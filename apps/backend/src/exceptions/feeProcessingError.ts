export class FeeProcessingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeeProcessingError'
  }
}
