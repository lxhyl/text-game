import { prepareWithSegments, layoutWithLines, type PreparedTextWithSegments, type LayoutLinesResult } from '@chenglou/pretext'
import { COLORS } from '../utils/colors.js'

export let CANVAS_W = 800
export let CANVAS_H = 500
export const MONO_FONT = '16px "Courier New", monospace'
export const UI_FONT = '16px "Courier New", monospace'
export const TITLE_FONT = '14px "Courier New", monospace'
export const SMALL_FONT = '13px "Courier New", monospace'
export const LARGE_FONT = '24px "Courier New", monospace'

const preparedCache = new Map<string, PreparedTextWithSegments>()
const layoutCache = new Map<string, LayoutLinesResult>()

function getPrepared(text: string, font: string): PreparedTextWithSegments {
  const key = font + '||' + text
  let p = preparedCache.get(key)
  if (!p) {
    p = prepareWithSegments(text, font)
    preparedCache.set(key, p)
  }
  return p
}

export function measureText(text: string, font: string, maxWidth: number): LayoutLinesResult {
  const cacheKey = font + '||' + text + '||' + maxWidth
  let result = layoutCache.get(cacheKey)
  if (!result) {
    const prepared = getPrepared(text, font)
    const lineHeight = parseFontSize(font) * 1.4
    result = layoutWithLines(prepared, maxWidth, lineHeight)
    layoutCache.set(cacheKey, result)
  }
  return result
}

function parseFontSize(font: string): number {
  const match = font.match(/(\d+)px/)
  return match ? parseInt(match[1]) : 16
}

export function getLineHeight(font: string): number {
  return parseFontSize(font) * 1.4
}

let ctx: CanvasRenderingContext2D
let canvasRef: HTMLCanvasElement | null = null
let resizeBound = false

export function initRenderer(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  canvasRef = canvas
  ctx = canvas.getContext('2d')!
  resizeRenderer(window.innerWidth, window.innerHeight)
  if (!resizeBound) {
    window.addEventListener('resize', () => {
      resizeRenderer(window.innerWidth, window.innerHeight)
    })
    resizeBound = true
  }
  return ctx
}

export function getCtx(): CanvasRenderingContext2D {
  return ctx
}

export function resizeRenderer(width: number, height: number) {
  if (!canvasRef) return
  CANVAS_W = Math.max(360, Math.floor(width))
  CANVAS_H = Math.max(360, Math.floor(height))

  const dpr = window.devicePixelRatio || 1
  canvasRef.width = Math.floor(CANVAS_W * dpr)
  canvasRef.height = Math.floor(CANVAS_H * dpr)
  canvasRef.style.width = CANVAS_W + 'px'
  canvasRef.style.height = CANVAS_H + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = false
}

export function clearScreen(color: string = COLORS.bg) {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
}

export function drawText(
  text: string,
  font: string,
  x: number,
  y: number,
  color: string,
  maxWidth: number = 9999,
  alpha: number = 1,
) {
  if (alpha <= 0) return
  const result = measureText(text, font, maxWidth)
  const lineHeight = getLineHeight(font)

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  for (let i = 0; i < result.lines.length; i++) {
    ctx.fillText(result.lines[i].text, x, y + i * lineHeight)
  }
  ctx.restore()
}

export function drawTextCentered(
  text: string,
  font: string,
  centerX: number,
  y: number,
  color: string,
  maxWidth: number = 9999,
  alpha: number = 1,
) {
  if (alpha <= 0) return
  const result = measureText(text, font, maxWidth)
  const lineHeight = getLineHeight(font)

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  for (let i = 0; i < result.lines.length; i++) {
    const lx = centerX - result.lines[i].width / 2
    ctx.fillText(result.lines[i].text, lx, y + i * lineHeight)
  }
  ctx.restore()
}

export function drawAsciiArt(
  lines: string[],
  font: string,
  x: number,
  y: number,
  color: string,
  alpha: number = 1,
  offsetX: number = 0,
  offsetY: number = 0,
) {
  if (alpha <= 0) return
  const lineHeight = getLineHeight(font)

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x + offsetX, y + i * lineHeight + offsetY)
  }
  ctx.restore()
}

export function drawRect(x: number, y: number, w: number, h: number, color: string, alpha: number = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}

export function drawBorder(x: number, y: number, w: number, h: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  ctx.restore()
}

export function getTextWidth(text: string, font: string): number {
  const result = measureText(text, font, 9999)
  return result.lines.length > 0 ? result.lines[0].width : 0
}
