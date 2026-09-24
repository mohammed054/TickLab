export class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0
    return this.state / 4_294_967_296
  }

  between(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  integer(min: number, max: number): number {
    return Math.floor(this.between(min, max + 1))
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('cannot pick from an empty collection')
    }
    return items[this.integer(0, items.length - 1)]
  }
}
