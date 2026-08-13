import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'
import { createPet, tick, type PetState } from './features/pet/engine'

const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
const maxFileSize = 10 * 1024 * 1024

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
      {desktopRuntime ? <PetOnly imageUrl={imageUrl} fileName={fileName} /> : <>
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

function PetOnly({ imageUrl, fileName }: { imageUrl: string | null; fileName: string }) {
  return <div className="native-pet" title="从系统托盘打开或退出">
    {imageUrl ? <img src={imageUrl} alt={`${fileName} 的桌宠`} /> : <div className="sample-pet" aria-label="抽象示例宠物"><i /><b /><em /></div>}
  </div>
}

export default App
