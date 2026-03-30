const keys: Record<string, boolean> = {}
const justPressed: Record<string, boolean> = {}
let mouseX = 0
let mouseY = 0
let mouseClicked = false

function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key
}

function shouldPreventDefault(key: string): boolean {
  return key === ' '
    || key === 'ArrowUp'
    || key === 'ArrowDown'
    || key === 'ArrowLeft'
    || key === 'ArrowRight'
}

export function initInput(canvas: HTMLCanvasElement) {
  window.addEventListener('keydown', (e) => {
    const key = normalizeKey(e.key)
    if (shouldPreventDefault(e.key)) {
      e.preventDefault()
    }
    if (!keys[key]) {
      justPressed[key] = true
    }
    keys[key] = true
  })
  window.addEventListener('keyup', (e) => {
    const key = normalizeKey(e.key)
    if (shouldPreventDefault(e.key)) {
      e.preventDefault()
    }
    keys[key] = false
  })
  window.addEventListener('blur', () => {
    for (const key in keys) {
      delete keys[key]
    }
    for (const key in justPressed) {
      delete justPressed[key]
    }
  })
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect()
    mouseX = e.clientX - rect.left
    mouseY = e.clientY - rect.top
  })
  canvas.addEventListener('click', () => {
    mouseClicked = true
  })
}

export function isKeyDown(key: string): boolean {
  return !!keys[key]
}

export function wasKeyPressed(key: string): boolean {
  return !!justPressed[key]
}

export function getMousePos(): { x: number; y: number } {
  return { x: mouseX, y: mouseY }
}

export function wasMouseClicked(): boolean {
  return mouseClicked
}

export function clearFrameInput() {
  for (const key in justPressed) {
    delete justPressed[key]
  }
  mouseClicked = false
}
