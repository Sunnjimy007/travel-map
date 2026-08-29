import { useRef, useState } from 'react'
import type { Sticker } from '../types'

interface StickerLayerProps {
  stickers: Sticker[]
  onMove: (index: number, x: number, y: number) => void
  onRemove: (index: number) => void
}

// Stickers are positioned as fractions (0-1) of the photo box they sit on,
// so placement survives the box being rendered at different sizes (editor
// thumbnail vs. full-size player card) — PRD §11 "Stickers".
export function StickerLayer({ stickers, onMove, onRemove }: StickerLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  function handlePointerDown(index: number, e: React.PointerEvent) {
    e.stopPropagation()
    setDragging(index)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(index: number, e: React.PointerEvent) {
    if (dragging !== index || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    onMove(index, x, y)
  }

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0">
      {stickers.map((s, i) => (
        <button
          key={i}
          onPointerDown={(e) => handlePointerDown(i, e)}
          onPointerMove={(e) => handlePointerMove(i, e)}
          onPointerUp={() => setDragging(null)}
          onDoubleClick={(e) => {
            e.stopPropagation()
            onRemove(i)
          }}
          className="pointer-events-auto absolute cursor-grab text-[24px] leading-none active:cursor-grabbing"
          style={{
            left: `${s.x * 100}%`,
            top: `${s.y * 100}%`,
            transform: `translate(-50%, -50%) rotate(${s.rot}deg) scale(${s.scale})`,
          }}
          title="Drag to move, double-tap to remove"
        >
          {s.emoji}
        </button>
      ))}
    </div>
  )
}
