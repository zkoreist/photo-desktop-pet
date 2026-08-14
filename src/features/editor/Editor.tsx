import { useEffect, useRef, useState } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  computeCropLayout,
  FULL_CROP,
  normalizeCrop,
  type Anchor,
  type CropRect,
  type PetRecord,
} from '../pet/crop'

const PREVIEW_MAX_W = 760
const PREVIEW_MAX_H = 430
const EFFECT_BOX = 180

type DragMode = null | 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'anchor'

function fitPreview(w: number, h: number): { w: number; h: number } {
  const s = Math.min(PREVIEW_MAX_W / w, PREVIEW_MAX_H / h)
  return { w: w * s, h: h * s }
}

export function Editor() {
  const [image, setImage] = useState<{ src: string; w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<CropRect>(FULL_CROP)
  const [scale, setScale] = useState(1)
  const [anchor, setAnchor] = useState<Anchor>({ x: 0.5, y: 1 })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    mode: Exclude<DragMode, null>
    startX: number
    startY: number
    crop0: CropRect
    anchor0: Anchor
  } | null>(null)

  // 加载当前图片与已保存配置
  useEffect(() => {
    ;(async () => {
      try {
        const record = await invoke<PetRecord | null>('load_pet_state')
        if (!record?.path) {
          setError('尚未导入图片。请先从系统托盘「导入图片…」选择一张照片。')
          return
        }
        const src = convertFileSrc(record.path)
        const img = new Image()
        img.onload = () => {
          setImage({ src, w: img.naturalWidth, h: img.naturalHeight })
          setCrop(record.crop ? normalizeCrop(record.crop) : FULL_CROP)
          setScale(record.scale ?? 1)
          setAnchor({ x: record.anchor_x ?? 0.5, y: record.anchor_y ?? 1 })
        }
        img.onerror = () => setError('无法加载图片')
        img.src = src
      } catch (e) {
        setError(String(e))
      }
    })()
  }, [])

  // 关闭按钮（窗口 X）→ 隐藏而非销毁
  useEffect(() => {
    const win = getCurrentWindow()
    let un: (() => void) | undefined
    win
      .onCloseRequested((e) => {
        e.preventDefault()
        void win.hide()
      })
      .then((u) => {
        un = u
      })
    return () => {
      un?.()
    }
  }, [])

  const display = image ? fitPreview(image.w, image.h) : null
  const cropPx =
    display && image
      ? {
          x: crop.x * display.w,
          y: crop.y * display.h,
          w: crop.width * display.w,
          h: crop.height * display.h,
        }
      : null
  const anchorPx = cropPx
    ? { x: cropPx.x + anchor.x * cropPx.w, y: cropPx.y + anchor.y * cropPx.h }
    : null

  // 与主窗口同套计算的最终效果布局
  const layout = image ? computeCropLayout(image.w, image.h, crop, scale) : null
  const effectFit = layout ? Math.min(EFFECT_BOX / layout.width, EFFECT_BOX / layout.height, 1) : 0

  function clientToPreview(clientX: number, clientY: number) {
    const rect = stageRef.current!.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function onMouseDown(e: React.MouseEvent, mode: Exclude<DragMode, null>) {
    e.preventDefault()
    e.stopPropagation()
    const { x, y } = clientToPreview(e.clientX, e.clientY)
    dragRef.current = { mode, startX: x, startY: y, crop0: crop, anchor0: anchor }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e: MouseEvent) {
    const drag = dragRef.current
    if (!drag || !display) return
    const { x, y } = clientToPreview(e.clientX, e.clientY)
    const dx = (x - drag.startX) / display.w
    const dy = (y - drag.startY) / display.h

    if (drag.mode === 'move') {
      setCrop(
        normalizeCrop({
          x: drag.crop0.x + dx,
          y: drag.crop0.y + dy,
          width: drag.crop0.width,
          height: drag.crop0.height,
        }),
      )
    } else if (drag.mode === 'anchor') {
      const ax = (x - drag.crop0.x * display.w) / (drag.crop0.width * display.w)
      const ay = (y - drag.crop0.y * display.h) / (drag.crop0.height * display.h)
      setAnchor({
        x: Math.min(Math.max(ax, 0), 1),
        y: Math.min(Math.max(ay, 0), 1),
      })
    } else {
      const c0 = drag.crop0
      let nx = c0.x
      let ny = c0.y
      let nw = c0.width
      let nh = c0.height
      if (drag.mode === 'nw') {
        nx = c0.x + dx
        ny = c0.y + dy
        nw = c0.width - dx
        nh = c0.height - dy
      } else if (drag.mode === 'ne') {
        ny = c0.y + dy
        nw = c0.width + dx
        nh = c0.height - dy
      } else if (drag.mode === 'sw') {
        nx = c0.x + dx
        nw = c0.width - dx
        nh = c0.height + dy
      } else {
        nw = c0.width + dx
        nh = c0.height + dy
      }
      setCrop(normalizeCrop({ x: nx, y: ny, width: nw, height: nh }, 0.02))
    }
  }

  function onMouseUp() {
    dragRef.current = null
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  async function save() {
    if (!image) return
    setSaving(true)
    try {
      await invoke('save_pet_config', {
        crop,
        scale,
        anchorX: anchor.x,
        anchorY: anchor.y,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function close() {
    await invoke('close_editor').catch(() => {})
  }

  return (
    <main className="editor">
      <header className="editor-header">
        <h1>编辑桌宠图片</h1>
        <span className="editor-sub">裁剪 · 缩放 · 设定贴地锚点（非破坏保存，原图不受影响）</span>
        <button type="button" className="editor-close" onClick={close} aria-label="关闭">
          ×
        </button>
      </header>

      <div className="editor-body">
        <section className="preview-col">
          <div className="preview-stage" ref={stageRef}>
            {image && display && (
              <div className="preview-canvas" style={{ width: display.w, height: display.h }}>
                <img
                  src={image.src}
                  alt="待裁剪图片"
                  draggable={false}
                  style={{ width: display.w, height: display.h }}
                />
                {cropPx && (
                  <div
                    className="crop-box"
                    style={{ left: cropPx.x, top: cropPx.y, width: cropPx.w, height: cropPx.h }}
                    onMouseDown={(e) => onMouseDown(e, 'move')}
                  >
                    <span className="handle nw" onMouseDown={(e) => onMouseDown(e, 'nw')} />
                    <span className="handle ne" onMouseDown={(e) => onMouseDown(e, 'ne')} />
                    <span className="handle sw" onMouseDown={(e) => onMouseDown(e, 'sw')} />
                    <span className="handle se" onMouseDown={(e) => onMouseDown(e, 'se')} />
                  </div>
                )}
                {anchorPx && (
                  <div
                    className="anchor-marker"
                    title="脚底贴地锚点，可拖动"
                    style={{ left: anchorPx.x, top: anchorPx.y }}
                    onMouseDown={(e) => onMouseDown(e, 'anchor')}
                  />
                )}
              </div>
            )}
            {!image && <p className="editor-empty">{error ?? '加载中…'}</p>}
          </div>
          <p className="editor-hint">
            拖动裁剪框选择保留区域；拖动四角缩放；拖动 <span className="anchor-legend">⊕</span>{' '}
            设定脚底贴地锚点。
          </p>
        </section>

        <aside className="editor-controls">
          <div className="control-row">
            <label htmlFor="scale">缩放倍数</label>
            <input
              id="scale"
              type="range"
              min={0.1}
              max={3}
              step={0.01}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            />
            <span className="scale-value">×{scale.toFixed(2)}</span>
          </div>

          <div className="control-row">
            <span className="size-label">桌宠尺寸</span>
            <span className="size-value">
              {layout ? `${Math.round(layout.width)} × ${Math.round(layout.height)} px` : '—'}
            </span>
          </div>

          <div className="effect-block">
            <span className="size-label">效果预览（与桌宠窗口同套计算）</span>
            <div className="effect-preview">
              {layout && image && effectFit > 0 && (
                <div
                  className="effect-inner"
                  style={{ width: layout.width * effectFit, height: layout.height * effectFit }}
                >
                  <img
                    src={image.src}
                    alt=""
                    draggable={false}
                    style={{
                      width: layout.imgWidth * effectFit,
                      height: layout.imgHeight * effectFit,
                      transform: `translate(${layout.translateX * effectFit}px, ${layout.translateY * effectFit}px)`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            className="editor-save"
            disabled={saving || !image}
            onClick={save}
          >
            {saving ? '保存中…' : saved ? '已保存 ✓' : '保存并应用到桌宠'}
          </button>
          <button type="button" className="editor-cancel" onClick={close}>
            关闭
          </button>
          {error && <p className="editor-error">{error}</p>}
        </aside>
      </div>
    </main>
  )
}
