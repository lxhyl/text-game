import {
  layoutNextLine,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
import {
  CANVAS_H,
  CANVAS_W,
  clearScreen,
  getCtx,
  initRenderer,
} from './engine/renderer.js'
import {
  clearFrameInput,
  initInput,
  isKeyDown,
  wasKeyPressed,
} from './engine/input.js'
import { startLoop } from './engine/game-loop.js'
import { COLORS } from './utils/colors.js'

type Vec2 = {
  x: number
  y: number
}

type Controls = {
  left: string
  right: string
  up: string
  down: string
  fire: string
  spin: string
  pulse: string
}

type Player = {
  id: number
  name: string
  x: number
  y: number
  facing: Vec2
  bob: number
  hp: number
  maxHp: number
  score: number
  color: string
  glow: string
  controls: Controls
  respawn: number
  invuln: number
}

type Fireball = {
  ownerId: number
  x: number
  y: number
  vx: number
  vy: number
  life: number
  age: number
}

type SpinAttack = {
  ownerId: number
  age: number
  duration: number
  hitVictims: number[]
}

type Pulse = {
  ownerId: number
  x: number
  y: number
  age: number
  duration: number
  maxRadius: number
  hitVictims: number[]
}

type Wake = {
  x: number
  y: number
  age: number
  life: number
  radius: number
  color: string
}

type GlyphBurst = {
  token: string
  life: number
}

type Obstacle = {
  x: number
  y: number
  radius: number
  strength: number
}

type Interval = {
  start: number
  end: number
}

type Slot = {
  x: number
  width: number
}

type LayoutStats = {
  lines: number
  characters: number
  layoutMs: number
  prepareMs: number
}

const GLYPH_FAMILY = '"Menlo", "Consolas", monospace'
const UI_FAMILY = '"Menlo", "Consolas", monospace'
const PLAYER_TWO = {
  color: '#8ecbff',
  glow: 'rgba(96, 186, 255, 0.36)',
}
const ARTICLE_TITLE = 'NASA Sets Coverage for First Artemis Crewed Mission Around Moon'
const ARTICLE_DECK = 'A public schedule released by NASA details briefings, launch coverage, mission updates, and online viewing plans for the first crewed Artemis flight.'
const ARTICLE_META = 'By Jennifer M. Dooren | NASA Headquarters | March 25, 2026 | Media Advisory M26-026'
const ARTICLE_PARAGRAPHS = [
  'NASA said a broad run of prelaunch, launch, and mission events for Artemis II will stream online as the agency works toward the first crewed flight of the Artemis program. The mission is targeted no earlier than April 1, with a two-hour launch window opening in the early evening and additional opportunities scheduled in the following days.',
  'Artemis II will send Reid Wiseman, Victor Glover, Christina Koch, and Canadian Space Agency astronaut Jeremy Hansen on an approximately 10-day journey around the Moon. NASA says the flight is meant to test Orion life-support systems with people aboard for the first time and to prepare the way for later crewed lunar missions.',
  'The agency said briefings, events, and around-the-clock mission coverage will be available through NASA online video channels. Separate streams will be used for major events as launch approaches, and NASA said timing remains subject to change as mission planning continues.',
  'Highlighted events in the published schedule include astronaut arrival activities, a quarantine media event, status briefings, a prelaunch news conference, and launch-day coverage that begins with tanking operations before shifting into full mission broadcasting. NASA also plans a postlaunch news conference after Orion is sent toward high Earth orbit.',
  'During the mission, the agency expects to provide continuing updates, live downlinks, and daily status briefings from Johnson Space Center, except when lunar flyby operations take precedence. NASA also said imagery, tracking updates, and public-facing mission resources will be updated throughout the flight.',
  'The release closes by framing Artemis as part of a longer effort to return astronauts to the Moon, expand scientific discovery, and build operational experience for eventual crewed missions to Mars. In that sense, the coverage plan functions not only as logistics, but also as a public roadmap for the next major American mission beyond low Earth orbit.',
] as const

const players: Player[] = [
  {
    id: 1,
    name: 'P1',
    x: 0,
    y: 0,
    facing: { x: 1, y: 0 },
    bob: 0,
    hp: 5,
    maxHp: 5,
    score: 0,
    color: COLORS.player,
    glow: COLORS.titleGlow,
    controls: {
      left: 'a',
      right: 'd',
      up: 'w',
      down: 's',
      fire: 'f',
      spin: 'g',
      pulse: 'h',
    },
    respawn: 0,
    invuln: 0,
  },
  {
    id: 2,
    name: 'P2',
    x: 0,
    y: 0,
    facing: { x: -1, y: 0 },
    bob: 0,
    hp: 5,
    maxHp: 5,
    score: 0,
    color: PLAYER_TWO.color,
    glow: PLAYER_TWO.glow,
    controls: {
      left: 'ArrowLeft',
      right: 'ArrowRight',
      up: 'ArrowUp',
      down: 'ArrowDown',
      fire: 'j',
      spin: 'k',
      pulse: 'l',
    },
    respawn: 0,
    invuln: 0,
  },
]

let fireballs: Fireball[] = []
let spins: SpinAttack[] = []
let pulses: Pulse[] = []
let wakes: Wake[] = []
let bursts: GlyphBurst[] = []

let glyphPrepared: PreparedTextWithSegments | null = null
let glyphText = ''
let glyphDirty = true
let glyphSignature = ''
let lastGlyphFont = ''
let lastLayoutStats: LayoutStats = {
  lines: 0,
  characters: 0,
  layoutMs: 0,
  prepareMs: 0,
}

let timeSeconds = 0
let lastViewport = { w: 800, h: 500 }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t)
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

function normalize(vec: Vec2): Vec2 {
  const length = Math.hypot(vec.x, vec.y)
  if (length === 0) return { x: 1, y: 0 }
  return { x: vec.x / length, y: vec.y / length }
}

function getGlyphTypography() {
  const size = clamp(Math.round(Math.min(CANVAS_W, CANVAS_H) * 0.016), 9, 15)
  const lineHeight = Math.round(size * 1.04)
  return {
    size,
    lineHeight,
    font: `${size}px ${GLYPH_FAMILY}`,
  }
}

function getUiTypography() {
  const size = clamp(Math.round(Math.min(CANVAS_W, CANVAS_H) * 0.0155), 11, 16)
  return {
    size,
    font: `${size}px ${UI_FAMILY}`,
    smallFont: `${Math.max(10, size - 2)}px ${UI_FAMILY}`,
  }
}

function markGlyphDirty() {
  glyphDirty = true
}

function spawnPosition(playerId: number): Vec2 {
  if (playerId === 1) {
    return { x: CANVAS_W * 0.18, y: CANVAS_H * 0.55 }
  }
  return { x: CANVAS_W * 0.82, y: CANVAS_H * 0.55 }
}

function resetPlayer(player: Player) {
  const pos = spawnPosition(player.id)
  player.x = pos.x
  player.y = pos.y
  player.facing = player.id === 1 ? { x: 1, y: 0 } : { x: -1, y: 0 }
  player.hp = player.maxHp
  player.respawn = 0
  player.invuln = 1
}

function getPlayerById(playerId: number): Player {
  const player = players.find((candidate) => candidate.id === playerId)
  if (!player) throw new Error(`player ${playerId} not found`)
  return player
}

function getOtherPlayer(playerId: number): Player {
  return players[playerId === 1 ? 1 : 0]
}

function emitBurst(token: string, life: number) {
  bursts.unshift({ token, life })
  if (bursts.length > 8) bursts.length = 8
  markGlyphDirty()
}

function spawnWake(x: number, y: number, radius: number, color: string) {
  wakes.push({ x, y, age: 0, life: 0.42, radius, color })
  if (wakes.length > 36) wakes.shift()
}

function spawnPulse(ownerId: number, x: number, y: number, radius: number) {
  pulses.push({
    ownerId,
    x,
    y,
    age: 0,
    duration: 0.82,
    maxRadius: radius,
    hitVictims: [],
  })
}

function spawnFireball(player: Player) {
  if (player.respawn > 0) return
  const direction = normalize(player.facing)
  fireballs.push({
    ownerId: player.id,
    x: player.x + direction.x * 22,
    y: player.y - 10 + direction.y * 8,
    vx: direction.x * 510,
    vy: direction.y * 510,
    life: 1.2,
    age: 0,
  })
  spawnWake(player.x, player.y - 8, 16, player.color)
  emitBurst(`${player.name} FIRE >>> split the margin`, 1.8)
}

function spawnSpin(player: Player) {
  if (player.respawn > 0) return
  spins = spins.filter((spin) => spin.ownerId !== player.id)
  spins.push({
    ownerId: player.id,
    age: 0,
    duration: 0.75,
    hitVictims: [],
  })
  emitBurst(`${player.name} SPIN //// slash the nearest line`, 1.6)
}

function spawnPulseFromPlayer(player: Player) {
  if (player.respawn > 0) return
  spawnPulse(player.id, player.x, player.y - 10, Math.min(CANVAS_W, CANVAS_H) * 0.18)
  emitBurst(`${player.name} PULSE ((( push the column walls )))`, 1.8)
}

function getPulseRadius(pulse: Pulse): number {
  return lerp(16, pulse.maxRadius, easeOutExpo(clamp(pulse.age / pulse.duration, 0, 1)))
}

function buildGlyphCorpus(): string {
  const liveNote = `Live scoreboard: P1 ${players[0].score}-${players[0].hp}, P2 ${players[1].score}-${players[1].hp}.`
  const indentedParagraphs = ARTICLE_PARAGRAPHS.map((paragraph) => `    ${paragraph}`)
  const articleBlock = [
    ARTICLE_TITLE,
    ARTICLE_DECK,
    ARTICLE_META,
    '',
    indentedParagraphs[0],
    '',
    indentedParagraphs[1],
    '',
    indentedParagraphs[2],
    '',
    indentedParagraphs[3],
    '',
    indentedParagraphs[4],
    '',
    indentedParagraphs[5],
    '',
    liveNote,
  ].join('\n')

  const sections: string[] = []
  for (let i = 0; i < 10; i++) {
    sections.push(articleBlock)
  }
  return sections.join('\n\n')
}

function computeGlyphSignature(): string {
  return JSON.stringify({
    p1: {
      hp: players[0].hp,
      score: players[0].score,
      respawn: players[0].respawn > 0,
    },
    p2: {
      hp: players[1].hp,
      score: players[1].score,
      respawn: players[1].respawn > 0,
    },
  })
}

function ensureGlyphPrepared() {
  const typography = getGlyphTypography()
  const nextSignature = computeGlyphSignature()
  if (!glyphDirty && lastGlyphFont === typography.font && glyphPrepared !== null && glyphSignature === nextSignature) {
    return
  }

  glyphText = buildGlyphCorpus()
  const started = performance.now()
  glyphPrepared = prepareWithSegments(glyphText, typography.font, { whiteSpace: 'pre-wrap' })
  lastLayoutStats.prepareMs = performance.now() - started
  lastLayoutStats.characters = glyphText.length
  glyphSignature = nextSignature
  lastGlyphFont = typography.font
  glyphDirty = false
}

function syncViewport() {
  if (lastViewport.w === CANVAS_W && lastViewport.h === CANVAS_H) return

  const scaleX = CANVAS_W / lastViewport.w
  const scaleY = CANVAS_H / lastViewport.h

  for (const player of players) {
    player.x *= scaleX
    player.y *= scaleY
  }

  fireballs = fireballs.map((fireball) => ({
    ...fireball,
    x: fireball.x * scaleX,
    y: fireball.y * scaleY,
    vx: fireball.vx * scaleX,
    vy: fireball.vy * scaleY,
  }))

  pulses = pulses.map((pulse) => ({
    ...pulse,
    x: pulse.x * scaleX,
    y: pulse.y * scaleY,
    maxRadius: pulse.maxRadius * ((scaleX + scaleY) * 0.5),
  }))

  wakes = wakes.map((wake) => ({
    ...wake,
    x: wake.x * scaleX,
    y: wake.y * scaleY,
    radius: wake.radius * ((scaleX + scaleY) * 0.5),
  }))

  lastViewport = { w: CANVAS_W, h: CANVAS_H }
  markGlyphDirty()
}

function applyHit(attackerId: number, victim: Player, force: Vec2, tag: string) {
  if (victim.respawn > 0 || victim.invuln > 0) return

  victim.hp -= 1
  victim.invuln = 0.28
  victim.x = clamp(victim.x + force.x, 44, CANVAS_W - 44)
  victim.y = clamp(victim.y + force.y, 84, CANVAS_H - 36)
  spawnWake(victim.x, victim.y - 10, 18, victim.color)
  emitBurst(`${getPlayerById(attackerId).name} ${tag} -> ${victim.name}`, 1.4)

  if (victim.hp > 0) {
    markGlyphDirty()
    return
  }

  const attacker = getPlayerById(attackerId)
  attacker.score += 1
  victim.respawn = 1.3
  victim.invuln = 0
  spawnPulse(attacker.id, victim.x, victim.y - 10, Math.min(CANVAS_W, CANVAS_H) * 0.12)
  emitBurst(`${attacker.name} scores on ${victim.name}`, 2.2)
  markGlyphDirty()
}

function updatePlayers(dt: number) {
  for (const player of players) {
    if (player.respawn > 0) {
      player.respawn -= dt
      if (player.respawn <= 0) {
        resetPlayer(player)
        emitBurst(`${player.name} re-enters the paragraph`, 1.5)
        markGlyphDirty()
      }
      continue
    }

    player.invuln = Math.max(0, player.invuln - dt)

    const moveX = (isKeyDown(player.controls.right) ? 1 : 0) - (isKeyDown(player.controls.left) ? 1 : 0)
    const moveY = (isKeyDown(player.controls.down) ? 1 : 0) - (isKeyDown(player.controls.up) ? 1 : 0)
    const magnitude = Math.hypot(moveX, moveY)
    if (magnitude > 0) {
      const nx = moveX / magnitude
      const ny = moveY / magnitude
      const spinBoost = spins.some((spin) => spin.ownerId === player.id) ? 1.16 : 1
      player.x += nx * 245 * spinBoost * dt
      player.y += ny * 245 * spinBoost * dt
      player.facing = { x: nx, y: ny }
      spawnWake(player.x, player.y + 4, 12, player.color)
    }

    player.x = clamp(player.x, 36, CANVAS_W - 36)
    player.y = clamp(player.y, 82, CANVAS_H - 34)
    player.bob += dt * (magnitude > 0 ? 8 : 4)
  }

  const p1 = players[0]
  const p2 = players[1]
  if (p1.respawn <= 0 && p2.respawn <= 0) {
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const dist = Math.hypot(dx, dy)
    if (dist > 0 && dist < 28) {
      const push = (28 - dist) * 0.5
      const nx = dx / dist
      const ny = dy / dist
      p1.x = clamp(p1.x - nx * push, 36, CANVAS_W - 36)
      p1.y = clamp(p1.y - ny * push, 82, CANVAS_H - 34)
      p2.x = clamp(p2.x + nx * push, 36, CANVAS_W - 36)
      p2.y = clamp(p2.y + ny * push, 82, CANVAS_H - 34)
    }
  }
}

function updateActions() {
  for (const player of players) {
    if (player.respawn > 0) continue
    if (wasKeyPressed(player.controls.fire)) spawnFireball(player)
    if (wasKeyPressed(player.controls.spin)) spawnSpin(player)
    if (wasKeyPressed(player.controls.pulse)) spawnPulseFromPlayer(player)
  }
}

function updateFireballs(dt: number) {
  const nextFireballs: Fireball[] = []

  for (const fireball of fireballs) {
    const moved = {
      ...fireball,
      x: fireball.x + fireball.vx * dt,
      y: fireball.y + fireball.vy * dt,
      life: fireball.life - dt,
      age: fireball.age + dt,
    }

    const victim = getOtherPlayer(fireball.ownerId)
    const outside = moved.x < -24 || moved.x > CANVAS_W + 24 || moved.y < -24 || moved.y > CANVAS_H + 24
    const hit = victim.respawn <= 0 && distance(moved.x, moved.y, victim.x, victim.y - 12) < 18

    if (hit) {
      const direction = normalize({ x: moved.vx, y: moved.vy })
      applyHit(fireball.ownerId, victim, { x: direction.x * 18, y: direction.y * 10 }, 'fire')
      spawnPulse(fireball.ownerId, moved.x, moved.y, Math.min(CANVAS_W, CANVAS_H) * 0.12)
      continue
    }

    if (outside || moved.life <= 0) {
      spawnPulse(fireball.ownerId, moved.x, moved.y, Math.min(CANVAS_W, CANVAS_H) * 0.09)
      continue
    }

    nextFireballs.push(moved)
  }

  fireballs = nextFireballs
}

function updateSpins(dt: number) {
  const nextSpins: SpinAttack[] = []

  for (const spin of spins) {
    spin.age += dt
    if (spin.age >= spin.duration) continue

    const owner = getPlayerById(spin.ownerId)
    const victim = getOtherPlayer(spin.ownerId)
    if (owner.respawn <= 0 && victim.respawn <= 0) {
      const orbit = 30 + Math.sin((spin.age / spin.duration) * Math.PI) * 18
      const dist = distance(owner.x, owner.y - 12, victim.x, victim.y - 12)
      if (dist < orbit + 18 && !spin.hitVictims.includes(victim.id)) {
        spin.hitVictims.push(victim.id)
        const force = normalize({ x: victim.x - owner.x, y: victim.y - owner.y + 8 })
        applyHit(owner.id, victim, { x: force.x * 20, y: force.y * 12 }, 'spin')
      }
    }

    nextSpins.push(spin)
  }

  spins = nextSpins
}

function updatePulses(dt: number) {
  const nextPulses: Pulse[] = []

  for (const pulse of pulses) {
    pulse.age += dt
    if (pulse.age >= pulse.duration) continue

    const victim = getOtherPlayer(pulse.ownerId)
    if (victim.respawn <= 0 && !pulse.hitVictims.includes(victim.id)) {
      const radius = getPulseRadius(pulse)
      const dist = distance(pulse.x, pulse.y, victim.x, victim.y - 10)
      if (Math.abs(dist - radius) < 14) {
        pulse.hitVictims.push(victim.id)
        const force = normalize({ x: victim.x - pulse.x, y: victim.y - pulse.y })
        applyHit(pulse.ownerId, victim, { x: force.x * 16, y: force.y * 12 }, 'pulse')
      }
    }

    nextPulses.push(pulse)
  }

  pulses = nextPulses
}

function updateTransient(dt: number) {
  wakes = wakes.filter((wake) => {
    wake.age += dt
    return wake.age < wake.life
  })

  let burstExpired = false
  bursts = bursts.filter((burst) => {
    burst.life -= dt
    const alive = burst.life > 0
    if (!alive) burstExpired = true
    return alive
  })

  if (burstExpired) markGlyphDirty()
}

function pushHumanoidObstacles(target: Obstacle[], player: Player) {
  if (player.respawn > 0) return
  const facing = normalize(player.facing)
  const sideX = -facing.y
  const bob = Math.sin(player.bob) * 2
  const skeleton: Array<[number, number, number, number]> = [
    [0, -38 + bob, 12, 1.06],
    [0, -18 + bob, 11, 1.08],
    [0, 2 + bob, 10, 1.04],
    [sideX * 11, -16 + bob, 8, 0.9],
    [-sideX * 11, -16 + bob, 8, 0.9],
    [sideX * 8, 20 + bob, 8, 0.84],
    [-sideX * 8, 20 + bob, 8, 0.84],
  ]

  for (const [dx, dy, radius, strength] of skeleton) {
    target.push({
      x: player.x + dx,
      y: player.y + dy,
      radius,
      strength,
    })
  }
}

function collectObstacles(): Obstacle[] {
  const obstacles: Obstacle[] = []

  for (const player of players) {
    pushHumanoidObstacles(obstacles, player)
  }

  for (const fireball of fireballs) {
    obstacles.push({
      x: fireball.x,
      y: fireball.y,
      radius: 30,
      strength: 0.94,
    })
  }

  for (const spin of spins) {
    const owner = getPlayerById(spin.ownerId)
    const orbit = 30 + Math.sin((spin.age / spin.duration) * Math.PI) * 18
    for (let i = 0; i < 6; i++) {
      const angle = timeSeconds * 12 + i * (Math.PI / 3)
      obstacles.push({
        x: owner.x + Math.cos(angle) * orbit,
        y: owner.y - 14 + Math.sin(angle) * orbit,
        radius: 12,
        strength: 0.76,
      })
    }
  }

  for (const pulse of pulses) {
    const radius = getPulseRadius(pulse)
    obstacles.push({
      x: pulse.x,
      y: pulse.y,
      radius,
      strength: 0.44,
    })
  }

  return obstacles
}

function getObstacleIntervalsForBand(obstacles: Obstacle[], bandTop: number, bandBottom: number, minX: number, maxX: number): Interval[] {
  const intervals: Interval[] = []

  for (const obstacle of obstacles) {
    const closestY = clamp(obstacle.y, bandTop, bandBottom)
    const dy = Math.abs(closestY - obstacle.y)
    if (dy >= obstacle.radius) continue
    const span = Math.sqrt(obstacle.radius * obstacle.radius - dy * dy) * obstacle.strength
    intervals.push({
      start: clamp(obstacle.x - span, minX, maxX),
      end: clamp(obstacle.x + span, minX, maxX),
    })
  }

  intervals.sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const interval of intervals) {
    const last = merged[merged.length - 1]
    if (last !== undefined && interval.start <= last.end + 6) {
      last.end = Math.max(last.end, interval.end)
    } else {
      merged.push({ ...interval })
    }
  }

  return merged
}

function getAvailableSlots(obstacles: Obstacle[], bandTop: number, bandBottom: number, minX: number, maxX: number): Slot[] {
  const intervals = getObstacleIntervalsForBand(obstacles, bandTop, bandBottom, minX, maxX)
  const slots: Slot[] = []
  let cursor = minX

  for (const interval of intervals) {
    if (interval.start > cursor) {
      slots.push({ x: cursor, width: interval.start - cursor })
    }
    cursor = Math.max(cursor, interval.end)
  }

  if (cursor < maxX) {
    slots.push({ x: cursor, width: maxX - cursor })
  }

  return slots
}

function getLineHeat(x: number, y: number, obstacles: Obstacle[]): number {
  let heat = 0
  for (const obstacle of obstacles) {
    const influenceRadius = obstacle.radius * 1.85
    const influence = 1 - distance(x, y, obstacle.x, obstacle.y) / influenceRadius
    if (influence > 0) {
      heat += influence * obstacle.strength
    }
  }
  return clamp(heat, 0, 1.25)
}

function drawBackdrop(obstacles: Obstacle[]) {
  const ctx = getCtx()
  clearScreen()

  const wash = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H)
  wash.addColorStop(0, '#1a120d')
  wash.addColorStop(0.48, COLORS.bg)
  wash.addColorStop(1, '#120d0b')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  for (const player of players) {
    if (player.respawn > 0) continue
    const glow = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, Math.max(CANVAS_W, CANVAS_H) * 0.22)
    glow.addColorStop(0, player.glow)
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }

  for (const obstacle of obstacles) {
    const gradient = ctx.createRadialGradient(obstacle.x, obstacle.y, 0, obstacle.x, obstacle.y, obstacle.radius * 1.6)
    gradient.addColorStop(0, 'rgba(255, 130, 52, 0.04)')
    gradient.addColorStop(1, 'rgba(255, 130, 52, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(
      obstacle.x - obstacle.radius * 1.6,
      obstacle.y - obstacle.radius * 1.6,
      obstacle.radius * 3.2,
      obstacle.radius * 3.2,
    )
  }

  ctx.fillStyle = COLORS.paperSoft
  for (let y = 0; y < CANVAS_H; y += 4) {
    ctx.fillRect(0, y, CANVAS_W, 1)
  }

  const outerMargin = clamp(Math.round(CANVAS_W * 0.03), 16, 34)
  const columnGap = clamp(Math.round(CANVAS_W * 0.032), 22, 52)
  const innerWidth = CANVAS_W - outerMargin * 2
  const columnWidth = (innerWidth - columnGap * 2) / 3
  const gapOneX = outerMargin + columnWidth
  const gapTwoX = gapOneX + columnGap + columnWidth

  ctx.fillStyle = 'rgba(255, 232, 204, 0.035)'
  ctx.fillRect(gapOneX, 0, columnGap, CANVAS_H)
  ctx.fillRect(gapTwoX, 0, columnGap, CANVAS_H)
}

function drawGlyphField(obstacles: Obstacle[]) {
  ensureGlyphPrepared()
  if (glyphPrepared === null) return

  const ctx = getCtx()
  const typography = getGlyphTypography()
  const marginX = clamp(Math.round(CANVAS_W * 0.03), 16, 34)
  const columnGap = clamp(Math.round(CANVAS_W * 0.032), 22, 52)
  const fullWidth = CANVAS_W - marginX * 2
  const columnWidth = Math.max(120, (fullWidth - columnGap * 2) / 3)
  const topY = clamp(Math.round(CANVAS_H * 0.14), 104, 148)
  const bottomY = CANVAS_H - clamp(Math.round(CANVAS_H * 0.05), 22, 44)

  ctx.save()
  ctx.font = typography.font
  ctx.textBaseline = 'top'

  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let recycled = false
  let lineCount = 0
  const started = performance.now()

  for (let column = 0; column < 3; column++) {
    const minX = marginX + column * (columnWidth + columnGap)
    const maxX = minX + columnWidth

    for (let y = topY; y < bottomY; y += typography.lineHeight) {
      const slots = getAvailableSlots(obstacles, y, y + typography.lineHeight, minX, maxX)
      const usableSlots = slots.filter((slot) => slot.width >= 44)
      if (usableSlots.length === 0) {
        usableSlots.push({ x: minX, width: maxX - minX })
      }

      for (const slot of usableSlots) {
        const heat = getLineHeat(slot.x + slot.width * 0.5, y + typography.lineHeight * 0.5, obstacles)
        let line = layoutNextLine(glyphPrepared, cursor, slot.width)
        if (line === null) {
          if (recycled) break
          cursor = { segmentIndex: 0, graphemeIndex: 0 }
          recycled = true
          line = layoutNextLine(glyphPrepared, cursor, slot.width)
        }
        if (line === null) break

        ctx.globalAlpha = 0.06 + heat * 0.12
        ctx.fillStyle = COLORS.titleGlow
        ctx.fillText(line.text, slot.x + 1 + heat * 2, y + 1)

        ctx.globalAlpha = 0.4 + heat * 0.28
        ctx.fillStyle = `hsl(${34 + heat * 14}, ${78 + heat * 6}%, ${74 - heat * 8}%)`
        ctx.fillText(line.text, slot.x, y)

        cursor = line.end
        lineCount++
      }
    }
  }

  ctx.restore()

  lastLayoutStats.lines = lineCount
  lastLayoutStats.layoutMs = performance.now() - started
}

function getPlayerArt(player: Player): string[] {
  if (Math.abs(player.facing.x) > 0.45) {
    return player.facing.x > 0
      ? [' o>', '/| ', '/ \\\\']
      : ['<o ', ' |\\\\', '/ \\\\']
  }
  return [' o ', '/|\\\\', '/ \\\\']
}

function drawCenteredAscii(lines: string[], centerX: number, topY: number, font: string, color: string, alpha: number) {
  const ctx = getCtx()
  ctx.save()
  ctx.font = font
  ctx.textBaseline = 'top'
  ctx.fillStyle = color
  ctx.globalAlpha = alpha

  const lineHeight = parseInt(font, 10) * 1.05
  for (let i = 0; i < lines.length; i++) {
    const width = ctx.measureText(lines[i]).width
    ctx.fillText(lines[i], centerX - width * 0.5, topY + i * lineHeight)
  }

  ctx.restore()
}

function drawPulseGlyphs() {
  const ctx = getCtx()
  const glyphSize = Math.max(10, Math.round(getGlyphTypography().size * 0.9))
  ctx.save()
  ctx.font = `${glyphSize}px ${GLYPH_FAMILY}`
  ctx.textBaseline = 'middle'

  for (const pulse of pulses) {
    const owner = getPlayerById(pulse.ownerId)
    const radius = getPulseRadius(pulse)
    const alpha = (1 - pulse.age / pulse.duration) * 0.5
    const count = clamp(Math.round(radius / 14), 10, 52)
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + pulse.age * 2.4
      ctx.globalAlpha = alpha
      ctx.fillStyle = owner.color
      ctx.fillText(i % 2 === 0 ? 'o' : '*', pulse.x + Math.cos(angle) * radius, pulse.y + Math.sin(angle) * radius)
    }
  }

  ctx.restore()
}

function drawFireballs() {
  const ctx = getCtx()
  const projectileFont = `${Math.max(11, getGlyphTypography().size)}px ${GLYPH_FAMILY}`

  for (const fireball of fireballs) {
    const owner = getPlayerById(fireball.ownerId)
    const angle = Math.atan2(fireball.vy, fireball.vx)
    ctx.save()
    ctx.translate(fireball.x, fireball.y)
    ctx.rotate(angle)
    ctx.font = projectileFont
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = 0.2
    ctx.fillStyle = owner.glow
    ctx.fillText('==>', -18, 2)
    ctx.globalAlpha = 0.95
    ctx.fillStyle = owner.color
    ctx.fillText('==>', -20, 0)
    ctx.restore()
  }
}

function drawSpinGlyphs() {
  const ctx = getCtx()
  const font = `${Math.max(11, getGlyphTypography().size)}px ${GLYPH_FAMILY}`
  ctx.save()
  ctx.font = font
  ctx.textBaseline = 'middle'

  for (const spin of spins) {
    const owner = getPlayerById(spin.ownerId)
    const orbit = 30 + Math.sin((spin.age / spin.duration) * Math.PI) * 18
    for (let i = 0; i < 4; i++) {
      const angle = timeSeconds * 12 + i * (Math.PI / 2)
      ctx.globalAlpha = 0.82
      ctx.fillStyle = owner.color
      ctx.fillText(
        ['/', '\\\\', '|', '-'][i],
        owner.x + Math.cos(angle) * orbit,
        owner.y - 14 + Math.sin(angle) * orbit,
      )
    }
  }

  ctx.restore()
}

function drawWakes() {
  const ctx = getCtx()
  ctx.save()
  ctx.font = `${Math.max(9, getGlyphTypography().size - 2)}px ${GLYPH_FAMILY}`
  ctx.textBaseline = 'middle'

  for (const wake of wakes) {
    const fade = 1 - wake.age / wake.life
    ctx.globalAlpha = fade * 0.26
    ctx.fillStyle = wake.color
    ctx.fillText('.', wake.x, wake.y)
  }

  ctx.restore()
}

function drawPlayer(player: Player) {
  if (player.respawn > 0) return
  const glyphSize = Math.max(13, Math.round(getGlyphTypography().size * 1.15))
  const font = `${glyphSize}px ${GLYPH_FAMILY}`
  const art = getPlayerArt(player)
  const bob = Math.sin(player.bob) * 2
  const alpha = player.invuln > 0 ? 0.46 + Math.abs(Math.sin(timeSeconds * 18)) * 0.32 : 0.96

  drawCenteredAscii(art, player.x, player.y - 46 + bob, font, player.glow, 0.26)
  drawCenteredAscii(art, player.x, player.y - 47 + bob, font, player.color, alpha)
}

function drawHud() {
  const ctx = getCtx()
  const ui = getUiTypography()

  ctx.save()
  ctx.textBaseline = 'top'

  const panelW = Math.min(620, CANVAS_W - 20)
  ctx.fillStyle = COLORS.panelBg
  ctx.fillRect(10, 10, panelW, 78)
  ctx.strokeStyle = COLORS.panelBorder
  ctx.strokeRect(10.5, 10.5, panelW - 1, 77)

  ctx.font = ui.font
  ctx.fillStyle = COLORS.title
  ctx.fillText('PRETEXT GLYPH DUEL', 22, 18)

  ctx.font = ui.smallFont
  ctx.fillStyle = players[0].color
  ctx.fillText(`P1 WASD + F/G/H   HP ${players[0].hp}/${players[0].maxHp}   SCORE ${players[0].score}`, 22, 42)
  ctx.fillStyle = players[1].color
  ctx.fillText(`P2 Arrows + J/K/L   HP ${players[1].hp}/${players[1].maxHp}   SCORE ${players[1].score}`, 22, 58)

  const statsX = CANVAS_W - Math.min(360, CANVAS_W - 20) - 10
  ctx.fillStyle = COLORS.panelBg
  ctx.fillRect(statsX, 10, Math.min(360, CANVAS_W - 20), 78)
  ctx.strokeStyle = COLORS.panelBorder
  ctx.strokeRect(statsX + 0.5, 10.5, Math.min(360, CANVAS_W - 20) - 1, 77)
  ctx.font = ui.smallFont
  ctx.fillStyle = COLORS.ui
  ctx.fillText(`layout ${lastLayoutStats.layoutMs.toFixed(2)}ms  prepare ${lastLayoutStats.prepareMs.toFixed(2)}ms`, statsX + 14, 20)
  ctx.fillText(`lines ${lastLayoutStats.lines}  chars ${lastLayoutStats.characters}`, statsX + 14, 38)
  ctx.fillText(`fireballs ${fireballs.length}  spins ${spins.length}  pulses ${pulses.length}`, statsX + 14, 56)

  ctx.restore()
}

function update(dt: number, now: number) {
  timeSeconds = now
  syncViewport()
  updatePlayers(dt)
  updateActions()
  updateFireballs(dt)
  updateSpins(dt)
  updatePulses(dt)
  updateTransient(dt)
  clearFrameInput()
}

function render() {
  const obstacles = collectObstacles()
  drawBackdrop(obstacles)
  drawGlyphField(obstacles)
  drawWakes()
  drawPulseGlyphs()
  drawFireballs()
  drawSpinGlyphs()
  for (const player of players) {
    drawPlayer(player)
  }
  drawHud()
}

function main() {
  const canvas = document.getElementById('game')
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('#game canvas not found')
  }

  initRenderer(canvas)
  initInput(canvas)
  for (const player of players) {
    resetPlayer(player)
  }
  lastViewport = { w: CANVAS_W, h: CANVAS_H }
  markGlyphDirty()
  startLoop(update, render)
}

main()
