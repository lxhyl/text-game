export type UpdateFn = (dt: number, time: number) => void
export type RenderFn = () => void

let running = false
let lastTime = 0
let updateFn: UpdateFn | null = null
let renderFn: RenderFn | null = null

function frame(now: number) {
  if (!running) return
  const dt = Math.min((now - lastTime) / 1000, 0.05) // cap at 50ms
  lastTime = now

  if (updateFn) updateFn(dt, now / 1000)
  if (renderFn) renderFn()

  requestAnimationFrame(frame)
}

export function startLoop(update: UpdateFn, render: RenderFn) {
  updateFn = update
  renderFn = render
  running = true
  lastTime = performance.now()
  requestAnimationFrame(frame)
}

export function stopLoop() {
  running = false
}
