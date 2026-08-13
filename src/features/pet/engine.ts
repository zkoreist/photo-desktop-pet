export type PetMode = 'idle' | 'walking' | 'dragging' | 'paused'
export interface Bounds { width: number; height: number }
export interface PetState { x: number; y: number; direction: 1 | -1; speed: number; mode: PetMode; bounds: Bounds }

export function createPet(bounds: Bounds): PetState { return { x: 160, y: 0, direction: 1, speed: 68, mode: 'walking', bounds } }
export function tick(pet: PetState, elapsedMs: number): PetState {
  if (pet.mode === 'paused' || pet.mode === 'dragging') return pet
  const dt = Math.min(Math.max(elapsedMs, 0), 100) / 1000
  const maxX = Math.max(0, pet.bounds.width - 140)
  let x = pet.x + pet.direction * pet.speed * dt
  let direction = pet.direction
  if (x < 0 || x > maxX) { x = Math.min(Math.max(x, 0), maxX); direction = pet.direction === 1 ? -1 : 1 }
  return { ...pet, x, direction }
}
