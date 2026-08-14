import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './App.css'
import { clamp, createPet, tick, type PetState } from './features/pet/engine'
import {
  computeCropLayout,
  FULL_CROP,
  type CropRect,
  type PetRecord,
} from './features/pet/crop'
import { Editor } from './features/editor/Editor'

const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
const maxFileSize = 10 * 1024 * 1024

interface WorkArea {
  x: number
  y: number
  width: number
  height: number
  scale: number
}

function App() {
  const [windowLabel, setWindowLabel] = useState('main')
  const desktopRuntime = '__TAURI_INTERNALS__' in window

  useEffect(() => {
    if (desktopRuntime) {
      setWindowLabel(getCurrentWindow().label)
    }
  }, [desktopRuntime])

  if (!desktopRuntime) return <WebPrototype />
  if (windowLabel === 'editor') return <Editor />
  return <DesktopPet />
}

function WebPrototype() {
  const [pet, setPet] = useState<PetState>(() => createPet({ x: 0, y: 0, width: 860, height: 420 }))
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('示例宠物（仅演示）')
  const [notice, setNotice] = useState('导入一张你拥有使用权的透明 PNG，即可开始预览。')
  const previousTime = useRef<number | null>(null)

  useEffect(() => {
    let frame = 0
    const animate = (time: number) => {
      const delta = previousTime.current === null ? 0 : time - previousTime.current
      previousTime.current = time
      setPet((current) => tick(current, delta))
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [])

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!allowedTypes.includes(file.type) || file.size > maxFileSize) {
      setNotice('只支持不超过 10 MB 的 PNG、JPG 或 WebP。推荐使用透明 PNG。')
      return
    }
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl(URL.createObjectURL(file))
    setFileName(file.name)
    setNotice('仅在此浏览器预览中读取图片；桌面版将把文件复制到本地应用数据目录。')
  }

  return (
    <main className="app-shell">
      <header>
        <p className="eyebrow">PHOTO DESKTOP PET · WINDOWS MVP</p>
        <h1>让有授权的照片，成为你的桌面伙伴。</h1>
        <p className="lede">本地优先、透明 PNG 优先。当前是 Web 交互原型；Tauri 原生窗口将在 Rust 工具链可用后接入。</p>
      </header>

      <section className="workspace" aria-label="桌宠预览工作区">
        <aside className="panel controls">
          <h2>创建桌宠</h2>
          <label className="upload-button">
            选择照片
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectImage} />
          </label>
          <p className="hint">支持 PNG、JPG、WebP，最大 10 MB。建议先准备已去背景的透明 PNG。</p>
          <div className="rights">
            <span aria-hidden="true">✓</span>
            我确认拥有该图片的使用权，并了解图片不会被上传。
          </div>
          <hr />
          <h3>行为</h3>
          <button type="button" className="secondary" onClick={() => setPet((current) => ({ ...current, mode: current.mode === 'paused' ? 'walking' : 'paused' }))}>
            {pet.mode === 'paused' ? '继续活动' : '暂停活动'}
          </button>
          <button type="button" className="secondary" onClick={() => setPet((current) => ({ ...current, direction: (current.direction === 1 ? -1 : 1), mode: 'walking' }))}>换个方向</button>
        </aside>

        <section className="stage" aria-label="桌面宠物预览">
          <div className="stage-topline"><span>预览桌面</span><span>{pet.mode === 'paused' ? '已暂停' : '悠闲散步中'}</span></div>
          <div className="window-lines" />
          <div className="pet" style={{ transform: `translate(${pet.x}px, ${pet.y}px) scaleX(${pet.direction})` }}>
            {imageUrl ? <img src={imageUrl} alt={`${fileName} 的预览`} /> : <div className="sample-pet" aria-label="抽象示例宠物"><i /><b /><em /></div>}
          </div>
          <div className="ground" />
          <p className="pet-label">{fileName}</p>
        </section>
      </section>

      <footer><span>{notice}</span><a href="https://github.com" target="_blank">准备开源</a></footer>
    </main>
  )
}

function loadImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

function DesktopPet() {
  const [image, setImage] = useState<{ src: string; name: string; w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<CropRect>(FULL_CROP)
  const [scale, setScale] = useState(1)
  const petRef = useRef<PetState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const cropLayout = image ? computeCropLayout(image.w, image.h, crop, scale) : null

  // 完整（重新）初始化：读配置 → 加载图片 → 设窗口尺寸 → 重建引擎与位置
  const setupPet = useCallback(async () => {
    try {
      const record = await invoke<PetRecord | null>('load_pet_state')
      const workArea = await invoke<WorkArea>('get_work_area')
      const win = getCurrentWindow()
      const anchorY = record?.anchor_y ?? 1
      const crop0 = record?.crop ?? FULL_CROP
      const scale0 = record?.scale ?? 1
      setCrop(crop0)
      setScale(scale0)

      let size = await win.outerSize()
      if (record?.path) {
        const src = convertFileSrc(record.path)
        const { w, h } = await loadImageSize(src)
        setImage({ src, name: record.display_name ?? 'pet', w, h })
        if (record.crop && record.scale) {
          const layout = computeCropLayout(w, h, crop0, scale0)
          await invoke('set_window_size', { width: layout.width, height: layout.height }).catch(() => {})
          size = await win.outerSize()
        }
      } else {
        setImage(null)
      }

      const sizeObj = { width: size.width, height: size.height }
      let bounds = workArea
      let pet = createPet(bounds, sizeObj, anchorY)
      if (record?.x != null && record?.y != null) {
        const x = record.x
        const y = record.y
        await invoke('set_pet_position', { x, y }).catch(() => {})
        bounds = await invoke<WorkArea>('get_work_area').catch(() => workArea)
        const maxX = Math.max(bounds.x, bounds.x + bounds.width - sizeObj.width)
        const maxY = Math.max(bounds.y, bounds.y + bounds.height - anchorY * sizeObj.height)
        pet = { ...pet, bounds, x: clamp(x, bounds.x, maxX), y: clamp(y, bounds.y, maxY) }
      }
      pet = { ...pet, direction: record?.direction === -1 ? -1 : 1 }
      petRef.current = pet
      await invoke('set_pet_position', { x: pet.x, y: pet.y }).catch(() => {})
      console.log('[diagnostic] setupPet: bounds=', bounds, '| size=', sizeObj, '| pos=', { x: pet.x, y: pet.y }, '| anchorY=', anchorY)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    setupPet()
    let un1: (() => void) | undefined
    let un2: (() => void) | undefined
    listen('pet-changed', () => setupPet()).then((u) => { un1 = u })
    listen<string>('pet-error', (e) => console.error(e.payload)).then((u) => { un2 = u })
    return () => { un1?.(); un2?.() }
  }, [setupPet])

  // 动画循环：tick 引擎（屏幕绝对坐标）+ 节流同步窗口位置（拖拽期间由 Rust 控制窗口）
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastSync = 0
    const loop = (now: number) => {
      const dt = now - last
      last = now
      const pet = petRef.current
      if (pet && pet.mode !== 'dragging') {
        petRef.current = tick(pet, dt)
      }
      const p = petRef.current
      if (p && p.mode !== 'dragging' && now - lastSync > 100) {
        lastSync = now
        invoke('set_pet_position', { x: Math.round(p.x), y: Math.round(p.y) }).catch(() => {})
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // 拖拽结束：同步位置 + 重新获取窗口所在显示器工作区 + 恢复走动
  useEffect(() => {
    let un: (() => void) | undefined
    listen<[number, number]>('drag-ended', (e) => {
      const [x, y] = e.payload
      ;(async () => {
        const bounds = await invoke<WorkArea>('get_work_area').catch(() => null)
        const p = petRef.current
        if (!p) return
        const nextBounds = bounds ?? p.bounds
        const maxX = Math.max(nextBounds.x, nextBounds.x + nextBounds.width - p.size.width)
        const maxY = Math.max(nextBounds.y, nextBounds.y + nextBounds.height - p.anchorY * p.size.height)
        petRef.current = {
          ...p,
          bounds: nextBounds,
          x: clamp(x, nextBounds.x, maxX),
          y: clamp(y, nextBounds.y, maxY),
          mode: 'walking',
        }
        console.log('[diagnostic] drag-ended →', { x, y })
      })()
    }).then((u) => { un = u })
    return () => { un?.() }
  }, [])

  // 鼠标按下：进入 PRESSED，交给 Rust 层拖拽状态机
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onMouseDown = (e: globalThis.MouseEvent) => {
      if (e.button !== 0) return
      if (petRef.current) petRef.current = { ...petRef.current, mode: 'dragging' }
      invoke('begin_press').catch(() => {
        if (petRef.current && petRef.current.mode === 'dragging') {
          petRef.current = { ...petRef.current, mode: 'walking' }
        }
      })
    }
    el.addEventListener('mousedown', onMouseDown)
    return () => el.removeEventListener('mousedown', onMouseDown)
  }, [])

  return (
    <div
      ref={containerRef}
      className="native-pet"
      title="拖拽可移动，从系统托盘导入或编辑图片"
    >
      {image && cropLayout ? (
        <div className="crop-viewport">
          <img
            src={image.src}
            alt={`${image.name} 的桌宠`}
            draggable={false}
            style={{
              width: cropLayout.imgWidth,
              height: cropLayout.imgHeight,
              transform: `translate(${cropLayout.translateX}px, ${cropLayout.translateY}px)`,
            }}
          />
        </div>
      ) : (
        <div className="sample-pet" aria-label="抽象示例宠物"><i /><b /><em /></div>
      )}
    </div>
  )
}

export default App
