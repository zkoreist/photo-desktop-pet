import { describe, expect, it } from 'vitest'
import { clamp, createPet, mulberry32, tick, type Bounds, type PetState } from './engine'

const bounds: Bounds = { width: 800, height: 600 }
const maxX = 800 - 140
const maxY = 600 - 160

function withOverrides(pet: PetState, overrides: Partial<PetState> = {}): PetState {
  return { ...pet, ...overrides }
}

describe('engine', () => {
  it('createPet 居中贴地、初始为 walking', () => {
    const pet = createPet(bounds)
    expect(pet.mode).toBe('walking')
    expect(pet.x).toBe((800 - 140) / 2)
    expect(pet.y).toBe(maxY)
    expect(pet.vy).toBe(0)
  })

  it('向右走时 x 增加', () => {
    const pet = createPet(bounds)
    const next = tick(pet, 100, () => 1)
    expect(next.x).toBeGreaterThan(pet.x)
  })

  it('向左走时 x 减少', () => {
    const pet = withOverrides(createPet(bounds), { direction: -1 })
    const next = tick(pet, 100, () => 1)
    expect(next.x).toBeLessThan(pet.x)
  })

  it('撞左边界时方向翻转为向右且不越界', () => {
    const pet = withOverrides(createPet(bounds), { x: 0, direction: -1 })
    const next = tick(pet, 1000, () => 1)
    expect(next.direction).toBe(1)
    expect(next.x).toBeGreaterThanOrEqual(0)
  })

  it('拖拽期间位置与状态不变', () => {
    const pet = withOverrides(createPet(bounds), { mode: 'dragging' })
    expect(tick(pet, 100, () => 0)).toBe(pet)
  })

  it('暂停期间位置与状态不变', () => {
    const pet = withOverrides(createPet(bounds), { mode: 'paused' })
    expect(tick(pet, 100, () => 0)).toBe(pet)
  })

  it('时间步长被 clamp：超大 elapsedMs 不会产生大跳变', () => {
    const pet = createPet(bounds)
    const next = tick(pet, 100000, () => 1)
    // clamp 到 100ms → 最多移动 speed * 0.1 ≈ 6.8px
    expect(next.x - pet.x).toBeLessThanOrEqual(7)
  })

  it('空中下落最终落地且垂直速度归零', () => {
    const pet = withOverrides(createPet(bounds), { y: 100, vy: 200 })
    let p = pet
    for (let i = 0; i < 200; i++) p = tick(p, 16, () => 1)
    expect(p.y).toBe(maxY)
    expect(p.vy).toBe(0)
  })

  it('长时间模拟始终保持在 bounds 内', () => {
    let pet = createPet(bounds)
    const rng = mulberry32(42)
    for (let i = 0; i < 20000; i++) {
      pet = tick(pet, 16, rng)
      expect(pet.x).toBeGreaterThanOrEqual(0)
      expect(pet.x).toBeLessThanOrEqual(maxX)
      expect(pet.y).toBeGreaterThanOrEqual(0)
      expect(pet.y).toBeLessThanOrEqual(maxY)
    }
  })

  it('mulberry32 同 seed 产生相同序列', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })

  it('clamp 正确夹取', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
})
