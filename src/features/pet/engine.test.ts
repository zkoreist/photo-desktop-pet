import { describe, expect, it } from 'vitest'
import { clamp, createPet, mulberry32, tick, type Bounds, type PetState } from './engine'

const bounds: Bounds = { x: 0, y: 0, width: 800, height: 600 }
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
      expect(pet.x).toBeGreaterThanOrEqual(bounds.x)
      expect(pet.x).toBeLessThanOrEqual(bounds.x + maxX)
      expect(pet.y).toBeGreaterThanOrEqual(bounds.y)
      expect(pet.y).toBeLessThanOrEqual(bounds.y + maxY)
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

describe('engine · DPI 150% 物理坐标', () => {
  const bounds: Bounds = { x: 0, y: 0, width: 1920, height: 1080 }
  const size = { width: 390, height: 480 }

  it('createPet 贴底且在屏幕内', () => {
    const pet = createPet(bounds, size)
    expect(pet.y).toBe(1080 - 480)
    expect(pet.y + size.height).toBeLessThanOrEqual(bounds.height)
  })

  it('长时间模拟窗口始终完整在屏幕内', () => {
    let pet = createPet(bounds, size)
    const rng = mulberry32(7)
    for (let i = 0; i < 20000; i++) {
      pet = tick(pet, 16, rng)
      expect(pet.y).toBeGreaterThanOrEqual(0)
      expect(pet.y + size.height).toBeLessThanOrEqual(bounds.height)
      expect(pet.x).toBeGreaterThanOrEqual(0)
      expect(pet.x + size.width).toBeLessThanOrEqual(bounds.width)
    }
  })
})

describe('engine · 多显示器负坐标（副屏在主屏左侧/上方）', () => {
  const size = { width: 390, height: 480 }

  it('副屏位于主屏左侧（x 为负）时位置正确', () => {
    const bounds: Bounds = { x: -1920, y: 0, width: 1920, height: 1080 }
    let pet = createPet(bounds, size)
    const rng = mulberry32(11)
    for (let i = 0; i < 20000; i++) {
      pet = tick(pet, 16, rng)
      expect(pet.x).toBeGreaterThanOrEqual(-1920)
      expect(pet.x + size.width).toBeLessThanOrEqual(-1920 + 1920)
      expect(pet.y).toBeGreaterThanOrEqual(0)
      expect(pet.y + size.height).toBeLessThanOrEqual(1080)
    }
  })

  it('副屏位于主屏上方（y 为负）时位置正确', () => {
    const bounds: Bounds = { x: 0, y: -1080, width: 1920, height: 1080 }
    let pet = createPet(bounds, size)
    const rng = mulberry32(13)
    for (let i = 0; i < 20000; i++) {
      pet = tick(pet, 16, rng)
      expect(pet.y).toBeGreaterThanOrEqual(-1080)
      expect(pet.y + size.height).toBeLessThanOrEqual(-1080 + 1080)
      expect(pet.x).toBeGreaterThanOrEqual(0)
      expect(pet.x + size.width).toBeLessThanOrEqual(1920)
    }
  })
})

describe('engine · 贴地锚点 anchorY', () => {
  const size = { width: 140, height: 160 }

  it('anchorY 默认 1：窗口底边贴地（等价旧行为）', () => {
    const pet = createPet(bounds, size)
    expect(pet.anchorY).toBe(1)
    expect(pet.y).toBe(600 - 160)
  })

  it('anchorY=0.5：锚点（脚底）贴地，窗口中心对齐地面', () => {
    const pet = withOverrides(createPet(bounds, size, 0.5), { y: 100, vy: 100 })
    let p = pet
    for (let i = 0; i < 200; i++) p = tick(p, 16, () => 1)
    expect(p.y + 0.5 * size.height).toBeCloseTo(600)
    expect(p.vy).toBe(0)
  })

  it('anchorY 长时间模拟：锚点始终不越界', () => {
    let pet = createPet(bounds, size, 0.6)
    const rng = mulberry32(5)
    for (let i = 0; i < 20000; i++) {
      pet = tick(pet, 16, rng)
      expect(pet.y).toBeGreaterThanOrEqual(bounds.y)
      expect(pet.y + 0.6 * size.height).toBeLessThanOrEqual(bounds.y + bounds.height + 0.001)
    }
  })
})
