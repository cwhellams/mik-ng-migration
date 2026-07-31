import { randomInt } from 'node:crypto'

export const getRandomInt = (min: number, max: number): number => {
  min = Math.ceil(min) // Round up min
  max = Math.floor(max) // Round down max
  return randomInt(min, max + 1)
}

export const splitTime = (hhMM: string) => {
  const [hours, minutes] = hhMM.split(':')
  return {
    hours: Number(hours),
    minutes: Number(minutes),
  }
}
