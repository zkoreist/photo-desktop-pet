import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './App.css'
import { clamp, createPet, tick, type PetState } from './features/pet/engine'

const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
const maxFileSize = 10 * 1024 * 1024

interface PetRecord {
  file_name: string | null
  display_name: string | null
  path: string | null
  x: number | null
  y: number | null
  direction: number | null
}

interface WorkArea {
  x: number
  y: number
  width: number
  height: number
  scale: number
}

function App() {
  const [pet, setPet] = useState<PetState>(() => createPet({ width: 860, height: 420 }))
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

  const desktopRuntime = '__TAURI_INTERNALS__' in window

  return (
    <main className={desktopRuntime ? 'pet-window' : 'app-shell'}>
      {desktopRuntime ? <DesktopPet /> : <>
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
      </>}
    </main>
  )
}

function DesktopPet() {
  const [image, setImage] = useState<{ src: string; name: string } | null>(null)
  const petRef = useRef<PetState | null>(null)
  const workAreaRef = useRef<WorkArea>({ x: 0, y: 0, width: 860, height: 420, scale: 1 })
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const record = await invoke<PetRecord | null>('load_pet_state')
      setImage(record?.path ? { src: convertFileSrc(record.path), name: record.display_name ?? 'pet' } : null)
    } catch {
      setImage(null)
    }
  }, [])

  // 初始化：运行时动态探测（不假设任何 DPI），并对加载的位置做边界钳制
  useEffect(() => {
    let disposed = false
    const win = getCurrentWindow()
    ;(async () => {
      try {
        const [record, workArea, winSize] = await Promise.all([
          invoke<PetRecord | null>('load_pet_state'),
          invoke<WorkArea>('get_work_area'),
          win.outerSize(),
        ])
        if (disposed) return
        workAreaRef.current = workArea
        // 引擎 size 用窗口物理尺寸，与 bounds（物理 work_area）单位一致
        const size = { width: winSize.width, height: winSize.height }
        const maxX = Math.max(0, workArea.width - size.width)
        const maxY = Math.max(0, workArea.height - size.height)
        console.log(
          '[diagnostic] scale =', workArea.scale,
          '| workArea =', workArea,
          '| winSize(physical) =', size,
          '| maxX/maxY =', maxX, '/', maxY,
        )
        let pet = createPet({ width: workArea.width, height: workArea.height }, size)
        if (record?.x != null && record?.y != null) {
          // 校验并钳制保存的位置：不信任任何残留值，越界就拉回屏幕内
          const x = clamp(record.x, 0, maxX)
          const y = clamp(record.y, 0, maxY)
          if (x !== record.x || y !== record.y) {
            console.warn('[diagnostic] 保存的位置越界，已钳制：', { saved: { x: record.x, y: record.y }, clamped: { x, y } })
          }
          pet = { ...pet, x, y, direction: record.direction === -1 ? -1 : 1 }
        }
        petRef.current = pet
        if (record?.path) {
          setImage({ src: convertFileSrc(record.path), name: record.display_name ?? 'pet' })
        }
        console.log('[diagnostic] initial pet pos =', { x: pet.x, y: pet.y })
        await invoke('set_pet_position', {
          x: Math.round(workArea.x + pet.x),
          y: Math.round(workArea.y + pet.y),
        }).catch(() => {})
      } catch (e) {
        console.error(e)
      }
    })()
    let un1: (() => void) | undefined
    let un2: (() => void) | undefined
    listen('pet-changed', () => refresh()).then((u) => { un1 = u })
    listen<string>('pet-error', (e) => console.error(e.payload)).then((u) => { un2 = u })
    return () => { disposed = true; un1?.(); un2?.() }
  }, [refresh])

  // 动画循环：tick 引擎（物理坐标）+ 节流同步窗口位置
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastSync = 0
    const loop = (now: number) => {
      const dt = now - last
      last = now
      const pet = petRef.current
      if (pet && !draggingRef.current && pet.mode !== 'paused') {
        petRef.current = tick(pet, dt)
      }
      const p = petRef.current
      if (p && !draggingRef.current && now - lastSync > 100) {
        lastSync = now
        const wa = workAreaRef.current
        invoke('set_pet_position', {
          x: Math.round(wa.x + p.x),
          y: Math.round(wa.y + p.y),
        }).catch(() => {})
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // 窗口移动（拖拽或引擎）→ debounce 后读实际位置 → 更新引擎 → 恢复 → 持久化
  useEffect(() => {
    const win = getCurrentWindow()
    let unlisten: (() => void) | undefined
    let timer: number | null = null
    const persist = async () => {
      try {
        const pos = await win.outerPosition()
        const wa = workAreaRef.current
        const p = petRef.current
        if (!wa || !p) return
        const x = pos.x - wa.x
        const y = pos.y - wa.y
        console.log('[diagnostic] persist: outer =', pos, '→ engine x/y =', { x, y })
        petRef.current = { ...p, x, y, mode: p.mode === 'dragging' ? 'walking' : p.mode }
        await invoke('save_pet_position', { x, y, direction: p.direction }).catch(() => {})
      } catch (e) {
        console.error(e)
      } finally {
        draggingRef.current = false
        movedRef.current = false
      }
    }
    win.onMoved(() => {
      movedRef.current = true
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(persist, 200)
    }).then((u) => { unlisten = u })
    return () => { unlisten?.(); if (timer) window.clearTimeout(timer) }
  }, [])

  // 拖拽：原生 mousedown 监听，同步 startDragging（React 委托会错过 Windows 拖拽消息时机）
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onMouseDown = (e: globalThis.MouseEvent) => {
      if (e.button !== 0) return
      draggingRef.current = true
      movedRef.current = false
      if (petRef.current) petRef.current = { ...petRef.current, mode: 'dragging' }
      console.log('[diagnostic] mousedown → startDragging')
      getCurrentWindow().startDragging().catch(() => {})
    }
    const onMouseUp = () => {
      if (!movedRef.current) {
        draggingRef.current = false
        if (petRef.current && petRef.current.mode === 'dragging') {
          petRef.current = { ...petRef.current, mode: 'walking' }
        }
      }
      movedRef.current = false
    }
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('mouseup', onMouseUp)
    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="native-pet"
      title="拖拽可移动，从系统托盘导入或删除图片"
    >
      {image
        ? <img src={image.src} alt={`${image.name} 的桌宠`} draggable={false} />
        : <div className="sample-pet" aria-label="抽象示例宠物"><i /><b /><em /></div>}
    </div>
  )
}

export default App
