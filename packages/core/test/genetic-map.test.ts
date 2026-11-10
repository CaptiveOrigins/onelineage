import { describe, expect, it } from 'vitest'
import { parsePlinkMap } from '../src/index.js'

const map = parsePlinkMap('test map', ['# chromosome id cM position', '1 a 0 1000000', '1 b 10 2000000', '1 c 12 4000000', 'chr2 d 0 500', '2 e 5 1500'].join('\n'))

describe('a PLINK-format genetic map', () => {
  it('interpolates between points, and extends past the ends at the nearest rate', () => {
    expect(map.toCm('1', 1500000)).toBeCloseTo(5)
    expect(map.toCm('1', 3000000)).toBeCloseTo(11)
    expect(map.toCm('1', 5000000)).toBeCloseTo(13)
    expect(map.toCm('1', 500000)).toBe(0)
    expect(map.toCm('2', 1000)).toBeCloseTo(2.5)
  })
  it('names itself, and refuses a chromosome it has no points for', () => {
    expect(map.name).toBe('test map')
    expect(() => map.toCm('9', 1)).toThrow(/no points/)
  })
  it('refuses malformed or out-of-order maps', () => {
    expect(() => parsePlinkMap('x', '1 a b 100')).toThrow(/bad cM/)
    expect(() => parsePlinkMap('x', '1 a 0 200\n1 b 1 100')).toThrow(/positions must increase/)
    expect(() => parsePlinkMap('x', '1 a 5 100\n1 b 1 200')).toThrow(/must not decrease/)
  })
})
