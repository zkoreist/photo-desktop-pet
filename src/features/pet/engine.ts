export type PetMode = 'idle' | 'walking' | 'dragging' | 'paused'

export interface Size {
  width: number
  height: number
}

/**
 * 工作区边界，统一使用「屏幕绝对坐标」（物理像素）：
 * x/y 是工作区左上角的屏幕坐标，width/height 是工作区尺寸。
 * 这样引擎、拖拽、窗口位置三者坐标体系统一，天然支持多显示器负坐标。
 */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PetState {
  x: number
  y: number
  vy: number
  direction: 1 | -1
  speed: number
  mode: PetMode
  bounds: Bounds
  size: Size
  /** 贴地锚点的垂直位置（相对窗口高度 0-1），1 = 脚底在窗口最底部。 */
  anchorY: number
  idleTimer: number
  walkTimer: number
}

/** 返回 [0, 1) 的随机数源，测试时注入 seeded 实现以保证确定性。 */
export type Rng = () => number

const GRAVITY = 900 // 像素 / 秒²
const JUMP_SPEED = -320 // 像素 / 秒（向上为负）

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

/** mulberry32：小而稳定的 seeded PRNG，返回 [0, 1)。 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createPet(
  bounds: Bounds,
  size: Size = { width: 140, height: 160 },
  anchorY = 1,
): PetState {
  const feetY = anchorY * size.height
  return {
    x: bounds.x + clamp((bounds.width - size.width) / 2, 0, Math.max(0, bounds.width - size.width)),
    y: bounds.y + Math.max(0, bounds.height - feetY),
    vy: 0,
    direction: 1,
    speed: 68,
    mode: 'walking',
    bounds,
    size,
    anchorY,
    idleTimer: 0,
    walkTimer: 2500,
  }
}

/**
 * 推进宠物状态一帧。
 * - paused / dragging：不产生自主移动，原样返回。
 * - walking：水平移动 + 边界反弹；垂直方向受重力、落地后有机会随机起跳。
 * - idle：计时结束后随机方向恢复 walking。
 * - 时间步长被 clamp 到 [0, 100]ms。
 * 所有坐标均为屏幕绝对坐标，宠物被约束在 bounds 内（含 x/y 偏移）。
 */
export function tick(pet: PetState, elapsedMs: number, rng: Rng = Math.random): PetState {
  if (pet.mode === 'paused' || pet.mode === 'dragging') return pet
  const dt = Math.min(Math.max(elapsedMs, 0), 100) / 1000
  const minX = pet.bounds.x
  const minY = pet.bounds.y
  const maxX = pet.bounds.x + Math.max(0, pet.bounds.width - pet.size.width)
  const feetY = pet.anchorY * pet.size.height
  const maxY = pet.bounds.y + Math.max(0, pet.bounds.height - feetY)

  if (pet.mode === 'idle') {
    const idleTimer = pet.idleTimer - elapsedMs
    if (idleTimer <= 0) {
      return {
        ...pet,
        mode: 'walking',
        idleTimer: 0,
        walkTimer: 1500 + rng() * 3000,
        direction: rng() < 0.5 ? 1 : -1,
      }
    }
    return { ...pet, idleTimer }
  }

  // 水平移动 + 边界反弹
  let x = pet.x + pet.direction * pet.speed * dt
  let direction = pet.direction
  if (x < minX || x > maxX) {
    x = clamp(x, minX, maxX)
    direction = direction === 1 ? -1 : 1
  }

  // 垂直：重力 + 落地 + 顶部边界
  let y = pet.y + pet.vy * dt
  let vy = pet.vy + GRAVITY * dt
  let onGround = false
  if (y >= maxY) {
    y = maxY
    vy = 0
    onGround = true
  } else if (y < minY) {
    y = minY
    if (vy < 0) vy = 0
  }

  let mode: PetMode = 'walking'
  let idleTimer = 0
  let walkTimer = Math.max(0, pet.walkTimer - elapsedMs)

  const r1 = rng()
  if (walkTimer <= 0 && r1 < 0.3) {
    // 走累了，休息一下
    mode = 'idle'
    idleTimer = 1000 + rng() * 3000
    walkTimer = 0
  } else {
    if (r1 < 0.002) {
      // 偶尔自发换向
      direction = direction === 1 ? -1 : 1
    }
    if (onGround && rng() < 0.001) {
      // 偶尔跳一下
      vy = JUMP_SPEED
    }
  }

  return { ...pet, x, y, vy, direction, mode, idleTimer, walkTimer }
}
