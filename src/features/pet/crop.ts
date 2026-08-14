/**
 * 裁剪/缩放渲染的共享计算。
 * 主窗口（桌宠）与编辑器预览必须使用同一套 crop + scale 计算（GUIDE Phase D 验收），
 * 因此集中在这里，避免两处实现漂移。
 */

/** 裁剪区域，相对原图 0-1 的比例。 */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/** 由 crop + scale 推导出的渲染布局（逻辑/CSS 像素）。 */
export interface CropLayout {
  /** 最终显示宽度（= 窗口逻辑宽度） */
  width: number
  /** 最终显示高度（= 窗口逻辑高度） */
  height: number
  /** 缩放后的原图宽度 */
  imgWidth: number
  /** 缩放后的原图高度 */
  imgHeight: number
  /** img 水平平移（负值向左） */
  translateX: number
  /** img 垂直平移（负值向上） */
  translateY: number
}

/**
 * 计算裁剪+缩放后的渲染布局。
 *
 * 渲染模型：外层容器 overflow:hidden，尺寸 = 最终显示尺寸；
 * 内层 img 按 scale 放大，再平移使裁剪区域左上角对齐容器左上角。
 *
 * @param naturalW 原图像素宽
 * @param naturalH 原图像素高
 * @param crop 裁剪区域（0-1）
 * @param scale 缩放比例
 */
export function computeCropLayout(
  naturalW: number,
  naturalH: number,
  crop: CropRect,
  scale: number,
): CropLayout {
  const imgWidth = naturalW * scale
  const imgHeight = naturalH * scale
  return {
    width: naturalW * crop.width * scale,
    height: naturalH * crop.height * scale,
    imgWidth,
    imgHeight,
    translateX: -crop.x * naturalW * scale,
    translateY: -crop.y * naturalH * scale,
  }
}

/** 默认裁剪：整图。 */
export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 }

/** 归一化并夹取 crop 到合法范围（保持 width/height > 0）。 */
export function normalizeCrop(crop: CropRect, min = 0.01): CropRect {
  const width = Math.min(Math.max(crop.width, min), 1)
  const height = Math.min(Math.max(crop.height, min), 1)
  const x = Math.min(Math.max(crop.x, 0), 1 - width)
  const y = Math.min(Math.max(crop.y, 0), 1 - height)
  return { x, y, width, height }
}

/** 贴地锚点（相对裁剪后图像 0-1）。 */
export interface Anchor {
  x: number
  y: number
}

/** Rust `PetState` 序列化后的记录（load_pet_state 返回值，snake_case）。 */
export interface PetRecord {
  file_name: string | null
  display_name: string | null
  path: string | null
  x: number | null
  y: number | null
  direction: number | null
  crop: CropRect | null
  scale: number | null
  anchor_x: number | null
  anchor_y: number | null
}
