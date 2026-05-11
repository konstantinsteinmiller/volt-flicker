<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { MawStage, MawIsland, Obstacle, MovementSpec } from '@/use/useMawCampaign'
import { loadAllStages } from '@/use/useMawCampaign'
import { pointInIsland, islandPolygonWorld } from '@/use/useIslandShapes'
import {
  customStages,
  campaignOverrides,
  saveCustomStage,
  deleteCustomStage,
  saveCampaignOverride,
  clearCampaignOverride,
  setTestStage
} from '@/use/useCustomStages'
import {
  drawIsland,
  drawObstacle,
  drawGrassBlade,
  drawExitPole,
  drawDecor
} from '@/use/useMawArt'

/**
 * Level editor — drag-and-drop authoring of custom stages.
 *
 * The editor draws into the same world space as the gameplay scene and uses
 * the same art helpers, so what you see is what plays. Tools fall into
 * three buckets:
 *  - Islands (round / square): top-level entities the player platforms over.
 *  - Decor (stump / boulder / crystal / grass): attach to whichever island
 *    they're placed inside. Outside any island, the click is a no-op.
 *  - Exit (pole): single per-stage; placement moves the existing pole.
 * Select tool drags whatever is under the cursor, including obstacles and
 * the pole. Right-click deletes.
 */

type Tool =
  | 'select'
  | 'island-round'
  | 'island-square'
  | 'stump'
  | 'boulder'
  | 'crystal'
  | 'liberty'
  | 'grass'
  | 'libertyTrash'
  | 'exit'

interface EditorIsland extends MawIsland {
  id: string
}

interface SelectedIsland { type: 'island'; islandId: string }
interface SelectedObstacle { type: 'obstacle'; islandId: string; obstacleIdx: number }
interface SelectedGrass { type: 'grass'; islandId: string; grassIdx: number }
interface SelectedDecor { type: 'decor'; islandId: string; decorIdx: number }
interface SelectedExit { type: 'exit' }
/** Editor selection for one endpoint of an island's motion path. The
 *  user can drag these handles to retune where the platform travels. */
interface SelectedMotion { type: 'motion'; islandId: string; endpoint: 'a' | 'b' }
type Selection = SelectedIsland | SelectedObstacle | SelectedGrass | SelectedDecor | SelectedExit | SelectedMotion | null

const router = useRouter()

const stageName = ref<string>('untitled')
const loadName = ref<string>('')
const campaignName = ref<string>('')
/** Which campaign id (1..30) the "Overwrite campaign" button targets.
 *  Defaults to whatever was last imported so the natural flow is
 *  Import → edit → Overwrite the same slot. Empty = no campaign target. */
const overwriteCampaignId = ref<number | ''>('')
const tool: Ref<Tool> = ref('select')

const islands: Ref<EditorIsland[]> = ref([])
const exitX = ref<number>(0)
const exitY = ref<number>(0)
const targetClears = ref<number>(40)

const selection: Ref<Selection> = ref(null)
const status = ref<string>('')

// Camera / zoom — purely editor-side, no in-game effect.
const cameraX = ref<number>(0)
const cameraY = ref<number>(0)
const zoom = ref<number>(0.7)

// Live drag state.
let dragging = false
let dragOriginX = 0
let dragOriginY = 0
let dragStartCamX = 0
let dragStartCamY = 0
let dragMode: 'pan' | 'move' | null = null
let dragSelectionAnchor = { x: 0, y: 0 }

const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasWidth = ref<number>(0)
const canvasHeight = ref<number>(0)

/** CSS background-position for the tiled water layer — keeps the bitmap
 *  anchored to world (0, 0) and zoom-scaled, so the water visually moves
 *  with the canvas-rendered world (no "islands floating over static
 *  water" effect). */
const waterBgStyle = computed(() => {
  const z = zoom.value
  const tile = 512 * z
  return {
    backgroundSize: `${tile}px ${tile}px`,
    backgroundPositionX: `${canvasWidth.value / 2 - z * cameraX.value}px`,
    backgroundPositionY: `${canvasHeight.value / 2 - z * cameraY.value}px`
  }
})

const updateCanvasSize = () => {
  const el = canvasRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  canvasWidth.value = rect.width
  canvasHeight.value = rect.height
  el.width = rect.width
  el.height = rect.height
}

let raf: number | null = null

const newId = (() => {
  let n = 0
  return () => `${Date.now().toString(36)}_${n++}`
})()

const newStage = () => {
  islands.value = [
    {
      id: newId(),
      cx: 0,
      cy: 0,
      radius: 200,
      shape: 'round',
      grass: [],
      obstacles: []
    }
  ]
  exitX.value = 360
  exitY.value = 0
  targetClears.value = 40
  selection.value = null
}

newStage()

// ─── Undo / redo ──────────────────────────────────────────────────────────
// Snapshot-based history: every editor action (placement, deletion,
// drag-move, slider change, import, shape swap) deep-copies the editable
// state onto `undoStack` BEFORE applying the change. Ctrl+Z pops one off
// and restores; Ctrl+Shift+Z (or Ctrl+Y) walks back forward through
// `redoStack`. Stacks reset together on any fresh action so the redo
// chain only matches the actual edit history.
interface EditorSnapshot {
  islands: EditorIsland[]
  exitX: number
  exitY: number
  targetClears: number
  selection: Selection
}

const UNDO_LIMIT = 100
// Refs (not plain arrays) so the Undo/Redo buttons' `:disabled` re-renders
// as the stacks grow and shrink.
const undoStack: Ref<EditorSnapshot[]> = ref([])
const redoStack: Ref<EditorSnapshot[]> = ref([])
/** When a slider/input fires many rapid changes within this window the
 *  snapshots collapse to a single undo step — otherwise dragging the
 *  radius slider would queue dozens of micro-undos. */
const COALESCE_MS = 350
let lastSnapshotKey = ''
let lastSnapshotAt = 0

const cloneIslands = (src: EditorIsland[]): EditorIsland[] =>
  src.map(i => ({
    id: i.id,
    cx: i.cx, cy: i.cy, radius: i.radius, shape: i.shape,
    grass: i.grass.map(g => [g[0], g[1]] as [number, number]),
    obstacles: i.obstacles.map(o => ({ ...o })),
    decor: i.decor ? i.decor.map(d => ({ ...d })) : undefined,
    motion: i.motion ? { ...i.motion } : undefined
  }))

const captureSnapshot = (): EditorSnapshot => ({
  islands: cloneIslands(islands.value),
  exitX: exitX.value,
  exitY: exitY.value,
  targetClears: targetClears.value,
  selection: selection.value ? { ...(selection.value as object) } as Selection : null
})

/** Push a snapshot of the current state onto the undo stack BEFORE the
 *  caller mutates anything. Pass a `key` to coalesce rapid repeats of
 *  the same action type (slider drags, radius nudges, etc.) into a
 *  single undo step within `COALESCE_MS`. */
const pushHistory = (key = '') => {
  const now = performance.now()
  if (key && key === lastSnapshotKey && (now - lastSnapshotAt) < COALESCE_MS) {
    lastSnapshotAt = now
    return
  }
  undoStack.value.push(captureSnapshot())
  if (undoStack.value.length > UNDO_LIMIT) undoStack.value.shift()
  redoStack.value.length = 0
  lastSnapshotKey = key
  lastSnapshotAt = now
}

const restoreSnapshot = (snap: EditorSnapshot) => {
  islands.value = cloneIslands(snap.islands)
  exitX.value = snap.exitX
  exitY.value = snap.exitY
  targetClears.value = snap.targetClears
  selection.value = snap.selection
  // After a restore, the next pushHistory shouldn't coalesce with the
  // pre-restore action — clearing the key forces a fresh undo step.
  lastSnapshotKey = ''
}

const undo = () => {
  if (undoStack.value.length === 0) {
    status.value = 'Nothing to undo.'
    return
  }
  redoStack.value.push(captureSnapshot())
  if (redoStack.value.length > UNDO_LIMIT) redoStack.value.shift()
  restoreSnapshot(undoStack.value.pop()!)
  status.value = `Undo · ${undoStack.value.length} more available`
}

const redo = () => {
  if (redoStack.value.length === 0) {
    status.value = 'Nothing to redo.'
    return
  }
  undoStack.value.push(captureSnapshot())
  if (undoStack.value.length > UNDO_LIMIT) undoStack.value.shift()
  restoreSnapshot(redoStack.value.pop()!)
  status.value = `Redo · ${redoStack.value.length} more available`
}

// ─── Coordinate conversion ────────────────────────────────────────────────
const screenToWorld = (sx: number, sy: number) => {
  const w = canvasWidth.value
  const h = canvasHeight.value
  const z = zoom.value
  return {
    x: (sx - w / 2) / z + cameraX.value,
    y: (sy - h / 2) / z + cameraY.value
  }
}

// ─── Hit-tests ────────────────────────────────────────────────────────────
const islandContains = (isle: EditorIsland, x: number, y: number) => {
  // Match the gameplay hit-test exactly: both shapes use the polygon
  // traced from the bitmap (pixel-perfect once the bitmap decodes).
  return pointInIsland(isle.shape, x, y, isle.cx, isle.cy, isle.radius)
}

const findIslandAt = (x: number, y: number): EditorIsland | null => {
  for (let i = islands.value.length - 1; i >= 0; i--) {
    const isle = islands.value[i]!
    if (islandContains(isle, x, y)) return isle
  }
  return null
}

const findEntityAt = (x: number, y: number): Selection => {
  // Motion handles for the currently-edited island always come first so
  // they're clickable even when stacked over an island body or each
  // other. They only exist for the active selection chain.
  const motionIsle = motionEditingIsland.value
  if (motionIsle?.motion) {
    if (Math.hypot(x - motionIsle.motion.ax, y - motionIsle.motion.ay) <= 14) {
      return { type: 'motion', islandId: motionIsle.id, endpoint: 'a' }
    }
    if (Math.hypot(x - motionIsle.motion.bx, y - motionIsle.motion.by) <= 14) {
      return { type: 'motion', islandId: motionIsle.id, endpoint: 'b' }
    }
  }
  // Exit pole next — small target, draw on top.
  if (Math.hypot(x - exitX.value, y - exitY.value) <= 22) return { type: 'exit' }
  // Then obstacles / decor / grass on top of islands (pick smaller hit-
  // radius first so smaller props win the click over larger surrounding
  // ones).
  for (let i = islands.value.length - 1; i >= 0; i--) {
    const isle = islands.value[i]!
    for (let j = isle.obstacles.length - 1; j >= 0; j--) {
      const ob = isle.obstacles[j]!
      const r =
        ob.type === 'boulder' ? 28
        : ob.type === 'crystal' ? 18
        : ob.type === 'liberty' ? 28
        : 22
      if (Math.hypot(x - ob.x, y - ob.y) <= r) {
        return { type: 'obstacle', islandId: isle.id, obstacleIdx: j }
      }
    }
    if (isle.decor) {
      for (let j = isle.decor.length - 1; j >= 0; j--) {
        const d = isle.decor[j]!
        if (Math.hypot(x - d.x, y - d.y) <= 22) {
          return { type: 'decor', islandId: isle.id, decorIdx: j }
        }
      }
    }
    for (let j = isle.grass.length - 1; j >= 0; j--) {
      const [gx, gy] = isle.grass[j]!
      if (Math.hypot(x - gx, y - gy) <= 12) {
        return { type: 'grass', islandId: isle.id, grassIdx: j }
      }
    }
  }
  // Finally the island bodies themselves.
  const isle = findIslandAt(x, y)
  if (isle) return { type: 'island', islandId: isle.id }
  return null
}

/** Currently-relevant island for motion editing. Resolved from whichever
 *  selection is active so the dashed path + handles stay on screen while
 *  the user is dragging an endpoint or sub-decor on the same island. */
const motionEditingIsland = computed<EditorIsland | null>(() => {
  const sel = selection.value
  if (!sel) return null
  let islandId: string | null = null
  if (sel.type === 'island' || sel.type === 'motion'
    || sel.type === 'obstacle' || sel.type === 'grass'
    || sel.type === 'decor') islandId = sel.islandId
  if (!islandId) return null
  const isle = islands.value.find(i => i.id === islandId)
  return (isle && isle.motion) ? isle : null
})

// ─── Pointer handling ─────────────────────────────────────────────────────
const onPointerDown = (e: PointerEvent) => {
  e.preventDefault()
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  dragOriginX = e.offsetX
  dragOriginY = e.offsetY
  const wp = screenToWorld(e.offsetX, e.offsetY)

  // Middle-button or shift+left = pan.
  if (e.button === 1 || e.shiftKey) {
    dragging = true
    dragMode = 'pan'
    dragStartCamX = cameraX.value
    dragStartCamY = cameraY.value
    return
  }

  // Right-click deletes whatever's under the cursor.
  if (e.button === 2) {
    const hit = findEntityAt(wp.x, wp.y)
    if (hit) deleteSelection(hit)
    return
  }

  if (tool.value === 'select') {
    const hit = findEntityAt(wp.x, wp.y)
    selection.value = hit
    if (hit) {
      // Snapshot before the drag begins so Ctrl+Z restores the position
      // the entity was at when the user grabbed it.
      pushHistory()
      dragging = true
      dragMode = 'move'
      dragSelectionAnchor = entityAnchor(hit)
    }
    return
  }

  // Placement tools — single-click spawn.
  placeAt(tool.value, wp.x, wp.y)
}

const entityAnchor = (sel: Selection) => {
  if (!sel) return { x: 0, y: 0 }
  if (sel.type === 'exit') return { x: exitX.value, y: exitY.value }
  const isle = islands.value.find(i => i.id === sel.islandId)
  if (!isle) return { x: 0, y: 0 }
  if (sel.type === 'island') return { x: isle.cx, y: isle.cy }
  if (sel.type === 'obstacle') return { x: isle.obstacles[sel.obstacleIdx]!.x, y: isle.obstacles[sel.obstacleIdx]!.y }
  if (sel.type === 'motion') {
    if (!isle.motion) return { x: isle.cx, y: isle.cy }
    return sel.endpoint === 'a'
      ? { x: isle.motion.ax, y: isle.motion.ay }
      : { x: isle.motion.bx, y: isle.motion.by }
  }
  if (sel.type === 'decor') {
    const d = isle.decor?.[sel.decorIdx]
    return d ? { x: d.x, y: d.y } : { x: isle.cx, y: isle.cy }
  }
  const g = isle.grass[sel.grassIdx]!
  return { x: g[0], y: g[1] }
}

const onPointerMove = (e: PointerEvent) => {
  if (!dragging) return
  const dxScreen = e.offsetX - dragOriginX
  const dyScreen = e.offsetY - dragOriginY
  const dxWorld = dxScreen / zoom.value
  const dyWorld = dyScreen / zoom.value

  if (dragMode === 'pan') {
    cameraX.value = dragStartCamX - dxWorld
    cameraY.value = dragStartCamY - dyWorld
    return
  }

  if (dragMode === 'move' && selection.value) {
    const targetX = dragSelectionAnchor.x + dxWorld
    const targetY = dragSelectionAnchor.y + dyWorld
    moveSelection(selection.value, targetX, targetY)
  }
}

const onPointerUp = () => {
  dragging = false
  dragMode = null
}

const onWheel = (e: WheelEvent) => {
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
  zoom.value = Math.max(0.2, Math.min(2, zoom.value * factor))
}

// ─── Placement / deletion / move ──────────────────────────────────────────
const placeAt = (t: Tool, x: number, y: number) => {
  pushHistory()
  if (t === 'island-round' || t === 'island-square') {
    const isle: EditorIsland = {
      id: newId(),
      cx: x,
      cy: y,
      radius: 130,
      shape: t === 'island-round' ? 'round' : 'square',
      grass: [],
      obstacles: []
    }
    islands.value = [...islands.value, isle]
    selection.value = { type: 'island', islandId: isle.id }
    return
  }
  if (t === 'exit') {
    exitX.value = x
    exitY.value = y
    selection.value = { type: 'exit' }
    return
  }
  // Decor tools require an island under the click.
  const host = findIslandAt(x, y)
  if (!host) {
    status.value = 'Place this on an island.'
    return
  }
  if (t === 'grass') {
    host.grass = [...host.grass, [x, y]]
    selection.value = { type: 'grass', islandId: host.id, grassIdx: host.grass.length - 1 }
    return
  }
  if (t === 'libertyTrash') {
    const decor = host.decor ? [...host.decor] : []
    decor.push({ type: 'libertyTrash', x, y })
    host.decor = decor
    selection.value = { type: 'decor', islandId: host.id, decorIdx: decor.length - 1 }
    return
  }
  const obType: Obstacle['type'] =
    t === 'stump' ? 'stump'
    : t === 'boulder' ? 'boulder'
    : t === 'crystal' ? 'crystal'
    : 'liberty'
  host.obstacles = [...host.obstacles, { type: obType, x, y }]
  selection.value = { type: 'obstacle', islandId: host.id, obstacleIdx: host.obstacles.length - 1 }
}

const moveSelection = (sel: Selection, x: number, y: number) => {
  if (!sel) return
  if (sel.type === 'exit') {
    exitX.value = x
    exitY.value = y
    return
  }
  const isleIdx = islands.value.findIndex(i => i.id === sel.islandId)
  if (isleIdx < 0) return
  const isle = islands.value[isleIdx]!
  if (sel.type === 'island') {
    const dx = x - isle.cx
    const dy = y - isle.cy
    // Move the island and bring its grass + obstacles + decor + motion path along.
    isle.cx = x
    isle.cy = y
    isle.grass = isle.grass.map(([gx, gy]) => [gx + dx, gy + dy])
    isle.obstacles = isle.obstacles.map(o => ({ ...o, x: o.x + dx, y: o.y + dy }))
    if (isle.decor) {
      isle.decor = isle.decor.map(d => ({ ...d, x: d.x + dx, y: d.y + dy }))
    }
    if (isle.motion) {
      isle.motion = {
        ...isle.motion,
        ax: isle.motion.ax + dx,
        ay: isle.motion.ay + dy,
        bx: isle.motion.bx + dx,
        by: isle.motion.by + dy
      }
    }
    return
  }
  if (sel.type === 'obstacle') {
    isle.obstacles[sel.obstacleIdx] = { ...isle.obstacles[sel.obstacleIdx]!, x, y }
    return
  }
  if (sel.type === 'decor') {
    if (!isle.decor) return
    isle.decor[sel.decorIdx] = { ...isle.decor[sel.decorIdx]!, x, y }
    return
  }
  if (sel.type === 'motion') {
    if (!isle.motion) return
    if (sel.endpoint === 'a') {
      isle.motion = { ...isle.motion, ax: x, ay: y }
    } else {
      isle.motion = { ...isle.motion, bx: x, by: y }
    }
    return
  }
  isle.grass[sel.grassIdx] = [x, y]
}

const deleteSelection = (sel: Selection) => {
  if (!sel) return
  if (sel.type === 'exit') {
    status.value = 'Exit cannot be deleted, only moved.'
    return
  }
  if (sel.type === 'motion') {
    status.value = 'Use "Remove motion" in the properties panel.'
    return
  }
  const isleIdx = islands.value.findIndex(i => i.id === sel.islandId)
  if (isleIdx < 0) return
  const isle = islands.value[isleIdx]!
  if (sel.type === 'island' && islands.value.length <= 1) {
    status.value = 'Stage needs at least one island.'
    return
  }
  pushHistory()
  if (sel.type === 'island') {
    islands.value = islands.value.filter(i => i.id !== sel.islandId)
  } else if (sel.type === 'obstacle') {
    isle.obstacles = isle.obstacles.filter((_, i) => i !== sel.obstacleIdx)
  } else if (sel.type === 'decor') {
    if (isle.decor) isle.decor = isle.decor.filter((_, i) => i !== sel.decorIdx)
  } else {
    isle.grass = isle.grass.filter((_, i) => i !== sel.grassIdx)
  }
  selection.value = null
}

const isTypingTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return el.isContentEditable
}

const onKeyDown = (e: KeyboardEvent) => {
  // Skip entirely while focus is on any form element so typing inside
  // toolbar inputs never triggers canvas-level shortcuts (and so the
  // browser's native input-undo on Ctrl+Z keeps working inside the
  // stage-name field).
  if (isTypingTarget(e.target)) return

  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) = redo.
  const modKey = e.ctrlKey || e.metaKey
  if (modKey && (e.key === 'z' || e.key === 'Z')) {
    if (e.shiftKey) redo()
    else undo()
    e.preventDefault()
    return
  }
  if (modKey && (e.key === 'y' || e.key === 'Y')) {
    redo()
    e.preventDefault()
    return
  }

  // Delete the current selection. Backspace is reserved so it doesn't
  // wipe the canvas selection when used to clear a typed value.
  if (e.key === 'Delete') {
    if (!selection.value) return
    deleteSelection(selection.value)
    e.preventDefault()
  }
}

// ─── Selected island properties (radius slider) ───────────────────────────
const selectedIsland = computed<EditorIsland | null>(() => {
  const sel = selection.value
  if (sel && sel.type === 'island') {
    return islands.value.find(i => i.id === sel.islandId) ?? null
  }
  return null
})

const setSelectedRadius = (r: number) => {
  const isle = selectedIsland.value
  if (!isle) return
  // Coalesce: a slider drag fires dozens of changes — collapse them to
  // one undo step within COALESCE_MS, then start a fresh step on pause.
  pushHistory(`radius:${isle.id}`)
  isle.radius = Math.max(40, Math.min(400, r))
}

const setSelectedShape = (shape: 'round' | 'square') => {
  const isle = selectedIsland.value
  if (!isle || isle.shape === shape) return
  pushHistory()
  isle.shape = shape
}

// ─── Motion (moving islands) ──────────────────────────────────────────────
/** Default motion path for a newly-marked moving island — horizontal
 *  ping-pong centred on its current position, 120 wu wide and 3 s round
 *  trip. The user can drag the A/B handles afterwards to retune. */
const addMotionToSelectedIsland = () => {
  const isle = selectedIsland.value
  if (!isle || isle.motion) return
  pushHistory()
  isle.motion = {
    ax: isle.cx - 60,
    ay: isle.cy,
    bx: isle.cx + 60,
    by: isle.cy,
    periodMs: 3000,
    phase: 0
  }
}

const removeMotionFromSelectedIsland = () => {
  const isle = selectedIsland.value
  if (!isle || !isle.motion) return
  pushHistory()
  isle.motion = undefined
  // Drop any motion-handle selection that was bound to this island.
  if (selection.value?.type === 'motion' && selection.value.islandId === isle.id) {
    selection.value = { type: 'island', islandId: isle.id }
  }
}

const setMotionPeriod = (ms: number) => {
  const isle = selectedIsland.value
  if (!isle || !isle.motion) return
  // Coalesce slider drags into one undo step.
  pushHistory(`motion-period:${isle.id}`)
  isle.motion = { ...isle.motion, periodMs: Math.max(500, Math.min(20000, ms)) }
}

const setMotionPhase = (phase: number) => {
  const isle = selectedIsland.value
  if (!isle || !isle.motion) return
  pushHistory(`motion-phase:${isle.id}`)
  isle.motion = { ...isle.motion, phase: Math.max(0, Math.min(1, phase)) }
}

// ─── Save / Load / Test / Back ────────────────────────────────────────────
const buildStage = (): MawStage => ({
  id: -1,
  name: stageName.value || 'custom',
  biome: 'forest',
  targetClears: targetClears.value,
  rewardWin: 80,
  rewardLose: 5,
  chainLength: 96,
  islands: islands.value.map(i => ({
    cx: i.cx, cy: i.cy, radius: i.radius, shape: i.shape,
    grass: i.grass.map(g => [g[0], g[1]] as [number, number]),
    obstacles: i.obstacles.map(o => ({ ...o })),
    ...(i.decor && i.decor.length ? { decor: i.decor.map(d => ({ ...d })) } : {}),
    ...(i.motion ? { motion: { ...i.motion } } : {})
  })),
  isBoss: false,
  exitX: exitX.value,
  exitY: exitY.value
})

const onSave = () => {
  const name = stageName.value.trim()
  if (!name) {
    status.value = 'Enter a stage name first.'
    return
  }
  saveCustomStage(name, buildStage())
  status.value = `Saved "${name}".`
}

/** Load a stage's geometry into editor state. Used by both the saved-stages
 *  dropdown and the campaign-import dropdown — the on-screen `stageName`
 *  becomes whatever the caller passes, so an imported campaign stage saves
 *  to a different slot than the original (a copy-on-edit flow). */
const loadStageIntoEditor = (s: MawStage, displayName: string) => {
  pushHistory()
  stageName.value = displayName
  islands.value = s.islands.map(i => ({
    id: newId(),
    cx: i.cx, cy: i.cy, radius: i.radius, shape: i.shape,
    grass: i.grass.map(g => [g[0], g[1]] as [number, number]),
    obstacles: i.obstacles.map(o => ({ ...o })),
    decor: i.decor ? i.decor.map(d => ({ ...d })) : undefined,
    motion: i.motion ? { ...i.motion } : undefined
  }))
  exitX.value = s.exitX
  exitY.value = s.exitY
  targetClears.value = s.targetClears
  selection.value = null
}

const onLoad = () => {
  const name = loadName.value
  if (!name) return
  const s = customStages.value[name]
  if (!s) return
  loadStageIntoEditor(s, name)
  status.value = `Loaded "${name}".`
}

const onImportCampaign = () => {
  const key = campaignName.value
  if (!key) return
  const idStr = key.split(':')[0]!
  const stage = campaignStages.value.find(s => String(s.id) === idStr)
  if (!stage) return
  // If this slot already has an override, load that instead so the editor
  // shows what currently plays in-game rather than the procedural baseline.
  const live = campaignOverrides.value[stage.id] ?? stage
  loadStageIntoEditor(live, `copy-of-${stage.name}`)
  // Pre-select the same campaign id as the overwrite target — most users
  // want Import → tweak → Overwrite the same stage.
  overwriteCampaignId.value = stage.id
  status.value = `Imported campaign stage ${stage.id} (${stage.name})${campaignOverrides.value[stage.id] ? ' [override]' : ''}.`
}

const onOverwriteCampaign = () => {
  const id = overwriteCampaignId.value
  if (typeof id !== 'number') return
  if (!confirm(`Replace campaign stage ${id} with the current edit? In-game gameplay at stage ${id} will use this version until you revert.`)) return
  saveCampaignOverride(id, buildStage())
  status.value = `Overwrote campaign stage ${id}.`
}

const onRevertCampaign = () => {
  const id = overwriteCampaignId.value
  if (typeof id !== 'number') return
  if (!campaignOverrides.value[id]) {
    status.value = `Stage ${id} has no override.`
    return
  }
  if (!confirm(`Revert campaign stage ${id} to the procedural default?`)) return
  clearCampaignOverride(id)
  status.value = `Reverted campaign stage ${id}.`
}

const onDelete = () => {
  const name = loadName.value
  if (!name) return
  if (!confirm(`Delete saved stage "${name}"?`)) return
  deleteCustomStage(name)
  loadName.value = ''
  status.value = `Deleted "${name}".`
}

const onTest = () => {
  setTestStage(buildStage())
  router.push('/')
}

const onBackToMenu = () => {
  setTestStage(null)
  router.push('/')
}

// ─── Render loop ──────────────────────────────────────────────────────────
const paint = () => {
  const c = canvasRef.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  const w = canvasWidth.value
  const h = canvasHeight.value
  ctx.clearRect(0, 0, w, h)

  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.scale(zoom.value, zoom.value)
  ctx.translate(-cameraX.value, -cameraY.value)

  // Water is the wrapper div's tiled CSS background — the canvas stays
  // transparent so it shows through.

  for (const isle of islands.value) drawIsland(ctx, isle)
  for (const isle of islands.value) {
    for (const ob of isle.obstacles) drawObstacle(ctx, ob)
    if (isle.decor) {
      for (const d of isle.decor) drawDecor(ctx, d.type, d.x, d.y)
    }
    for (let i = 0; i < isle.grass.length; i++) {
      const [gx, gy] = isle.grass[i]!
      drawGrassBlade(ctx, gx, gy, 'forest', i)
    }
  }
  drawExitPole(ctx, exitX.value, exitY.value, false, true)

  // Motion path + endpoint handles for the island currently being edited.
  // Drawn before the selection outline so the selection ring sits on top.
  const motionIsle = motionEditingIsland.value
  if (motionIsle?.motion) {
    const m = motionIsle.motion
    ctx.save()
    ctx.strokeStyle = '#ff66cc'
    ctx.lineWidth = 2 / zoom.value
    ctx.setLineDash([10, 6])
    ctx.beginPath()
    ctx.moveTo(m.ax, m.ay)
    ctx.lineTo(m.bx, m.by)
    ctx.stroke()
    ctx.setLineDash([])
    // Handles
    const handleR = 12
    for (const ep of ['a', 'b'] as const) {
      const hx = ep === 'a' ? m.ax : m.bx
      const hy = ep === 'a' ? m.ay : m.by
      ctx.beginPath()
      ctx.arc(hx, hy, handleR, 0, Math.PI * 2)
      ctx.fillStyle = '#ff66cc'
      ctx.fill()
      ctx.lineWidth = 2 / zoom.value
      ctx.strokeStyle = '#1a0e22'
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${14}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(ep.toUpperCase(), hx, hy + 1)
    }
    ctx.restore()
  }

  // Selection outline.
  const sel = selection.value
  if (sel) {
    ctx.strokeStyle = '#ffe066'
    ctx.lineWidth = 3 / zoom.value
    if (sel.type === 'island') {
      const isle = islands.value.find(i => i.id === sel.islandId)
      if (isle) {
        // Outline the playable grass polygon for both shapes — same
        // geometry the gameplay hit-test uses, so what you select is
        // exactly what you can anchor on. The +4 radius bump puts the
        // ring just outside the walkable area.
        ctx.beginPath()
        const polySel = islandPolygonWorld(isle.shape, isle.cx, isle.cy, isle.radius + 4)
        for (let i = 0; i < polySel.length; i++) {
          const [wx, wy] = polySel[i]!
          if (i === 0) ctx.moveTo(wx, wy)
          else ctx.lineTo(wx, wy)
        }
        ctx.closePath()
        ctx.stroke()
      }
    } else if (sel.type === 'exit') {
      ctx.beginPath()
      ctx.arc(exitX.value, exitY.value - 26, 30, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      const isle = islands.value.find(i => i.id === sel.islandId)
      if (isle) {
        const p = entityAnchor(sel)
        ctx.beginPath()
        ctx.arc(p.x, p.y, 18, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  ctx.restore()
}

const renderLoop = () => {
  paint()
  raf = requestAnimationFrame(renderLoop)
}

// Campaign stages are built lazily — the editor needs all 20 to populate
// the Import / Overwrite dropdowns. `loadAllStages()` resolves a list of
// every built stage; the local `campaignStages` ref drives the computed
// lists below. While the load is in flight the dropdowns just stay empty.
const campaignStages: Ref<MawStage[]> = ref([])

onMounted(() => {
  updateCanvasSize()
  window.addEventListener('resize', updateCanvasSize)
  window.addEventListener('keydown', onKeyDown)
  raf = requestAnimationFrame(renderLoop)
  void loadAllStages().then(stages => {
    campaignStages.value = stages
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', updateCanvasSize)
  window.removeEventListener('keydown', onKeyDown)
  if (raf !== null) cancelAnimationFrame(raf)
})

watch(status, (msg) => {
  if (!msg) return
  setTimeout(() => { if (status.value === msg) status.value = '' }, 2400)
})

const tools: Array<{ id: Tool; label: string }> = [
  { id: 'select',         label: 'Select / Drag' },
  { id: 'island-round',   label: 'Round Island' },
  { id: 'island-square',  label: 'Square Platform' },
  { id: 'grass',          label: 'Grass Blade' },
  { id: 'stump',          label: 'Tree Stump' },
  { id: 'boulder',        label: 'Boulder' },
  { id: 'crystal',        label: 'Crystal' },
  { id: 'liberty',        label: 'Liberty Cat (Lv8)' },
  { id: 'libertyTrash',   label: 'Trash Pile (decor)' },
  { id: 'exit',           label: 'Exit Pole' }
]

const stageList = computed(() => Object.keys(customStages.value).sort())
/** Whether the currently-selected overwrite slot has an override on disk.
 *  Extracted into a computed because the previous inline expression used a
 *  TS `as number` cast that Pug's template compiler refused to parse. */
const selectedSlotHasOverride = computed(() => {
  const id = overwriteCampaignId.value
  return typeof id === 'number' && Boolean(campaignOverrides.value[id])
})
const campaignList = computed(() =>
  campaignStages.value.map(s => {
    const overridden = campaignOverrides.value[s.id] ? ' ✎' : ''
    return { key: `${s.id}:${s.name}`, label: `${s.id} — ${s.name}${s.isBoss ? ' (boss)' : ''}${overridden}` }
  })
)
const campaignSlotOptions = computed(() =>
  campaignStages.value.map(s => ({
    id: s.id,
    label: `Stage ${s.id} — ${s.name}${campaignOverrides.value[s.id] ? ' ✎' : ''}`
  }))
)
</script>

<template lang="pug">
  div.editor.relative.w-screen.h-screen.flex.flex-col(class="bg-[#0d2a18] text-white select-none")
    //- Top toolbar
    div.flex.items-center.gap-2.p-2.border-b(class="border-white/15 bg-black/40")
      input(
        v-model="stageName"
        placeholder="Stage name"
        class="px-2 py-1 rounded bg-black/60 border border-white/20 text-sm w-44"
      )
      button.px-3.py-1.rounded.font-bold(
        class="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-sm"
        @click="onSave"
      ) Save
      select(
        v-model="loadName"
        class="px-2 py-1 rounded bg-black/60 border border-white/20 text-sm"
      )
        option(value="") — load saved —
        option(v-for="n in stageList" :key="n" :value="n") {{ n }}
      button.px-3.py-1.rounded(
        class="bg-blue-600 hover:bg-blue-500 active:scale-95 text-sm disabled:opacity-50"
        :disabled="!loadName"
        @click="onLoad"
      ) Load
      button.px-3.py-1.rounded(
        class="bg-red-700 hover:bg-red-600 active:scale-95 text-sm disabled:opacity-50"
        :disabled="!loadName"
        @click="onDelete"
      ) Delete
      div.w-px.h-6(class="bg-white/15 mx-1")
      select(
        v-model="campaignName"
        class="px-2 py-1 rounded bg-black/60 border border-white/20 text-sm max-w-[180px]"
      )
        option(value="") — campaign stage —
        option(v-for="c in campaignList" :key="c.key" :value="c.key") {{ c.label }}
      button.px-3.py-1.rounded(
        class="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-sm disabled:opacity-50"
        :disabled="!campaignName"
        @click="onImportCampaign"
      ) Import
      div.w-px.h-6(class="bg-white/15 mx-1")
      select(
        v-model.number="overwriteCampaignId"
        class="px-2 py-1 rounded bg-black/60 border border-white/20 text-sm max-w-[200px]"
      )
        option(value="") — overwrite slot —
        option(v-for="o in campaignSlotOptions" :key="o.id" :value="o.id") {{ o.label }}
      button.px-3.py-1.rounded.font-bold(
        class="bg-orange-600 hover:bg-orange-500 active:scale-95 text-sm disabled:opacity-50"
        :disabled="overwriteCampaignId === ''"
        @click="onOverwriteCampaign"
        title="Replace the campaign stage at this slot with the current edit"
      ) Overwrite
      button.px-3.py-1.rounded(
        class="bg-slate-600 hover:bg-slate-500 active:scale-95 text-sm disabled:opacity-50"
        :disabled="!selectedSlotHasOverride"
        @click="onRevertCampaign"
        title="Restore the procedural built-in stage for this slot"
      ) Revert
      div.w-px.h-6(class="bg-white/15 mx-1")
      button.px-3.py-1.rounded(
        class="bg-slate-700 hover:bg-slate-600 active:scale-95 text-sm disabled:opacity-50"
        :disabled="undoStack.length === 0"
        @click="undo"
        title="Undo (Ctrl+Z)"
      ) ↶ Undo
      button.px-3.py-1.rounded(
        class="bg-slate-700 hover:bg-slate-600 active:scale-95 text-sm disabled:opacity-50"
        :disabled="redoStack.length === 0"
        @click="redo"
        title="Redo (Ctrl+Shift+Z)"
      ) ↷ Redo
      div.flex-1
      button.px-3.py-1.rounded.font-bold(
        class="bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-sm text-black"
        @click="onTest"
      ) Test In-Game ▶
      button.px-3.py-1.rounded(
        class="bg-slate-700 hover:bg-slate-600 active:scale-95 text-sm"
        @click="onBackToMenu"
      ) Back to Menu

    div.flex-1.flex.relative
      //- Tool palette
      div.flex.flex-col.gap-1.p-2.border-r(class="border-white/15 bg-black/30 w-44")
        div.text-xs.uppercase.opacity-60.mb-1 Tools
        button.text-left.px-2.py-1.rounded.text-sm(
          v-for="t in tools"
          :key="t.id"
          :class="tool === t.id ? 'bg-emerald-600 font-bold' : 'bg-black/40 hover:bg-black/60'"
          @click="tool = t.id"
        ) {{ t.label }}
        div.text-xs.opacity-60.mt-3 Shift+drag = pan, wheel = zoom, right-click = delete
        div.text-xs.opacity-60 Ctrl+Z undo · Ctrl+Shift+Z redo · Del removes selection
        div.text-xs.opacity-60 Decor (grass / stump / boulder / crystal / liberty / trash) snaps to the island under the cursor.

      //- Canvas
      div.flex-1.relative.maw-water-bg(:style="waterBgStyle")
        canvas(
          ref="canvasRef"
          class="block w-full h-full cursor-crosshair touch-none"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @wheel="onWheel"
          @contextmenu.prevent
        )
        div.absolute.bottom-2.left-2.text-xs.opacity-70(v-if="status") {{ status }}

      //- Properties panel
      div.flex.flex-col.gap-2.p-2.border-l(class="border-white/15 bg-black/30 w-56")
        div.text-xs.uppercase.opacity-60 Stage
        label.text-xs.flex.items-center.gap-2
          span.opacity-70.w-24 Target clears
          input(
            type="number"
            v-model.number="targetClears"
            min="1"
            class="px-1 py-0.5 rounded bg-black/60 border border-white/20 text-sm w-20"
          )

        div.text-xs.uppercase.opacity-60.mt-2 Selection
        div.text-xs.opacity-70(v-if="!selection") Nothing selected.
        template(v-else)
          div.text-xs.opacity-90 Type: {{ selection.type }}
          template(v-if="selectedIsland")
            label.text-xs.flex.items-center.gap-2
              span.opacity-70.w-16 Radius
              input(
                type="range"
                :value="selectedIsland.radius"
                min="40"
                max="400"
                step="5"
                @input="(e: any) => setSelectedRadius(parseInt(e.target.value))"
                class="flex-1"
              )
              span.w-10.text-right {{ selectedIsland.radius }}
            div.flex.gap-1
              button.flex-1.px-2.py-1.rounded.text-xs(
                :class="selectedIsland.shape === 'round' ? 'bg-emerald-600' : 'bg-black/40'"
                @click="setSelectedShape('round')"
              ) Round
              button.flex-1.px-2.py-1.rounded.text-xs(
                :class="selectedIsland.shape === 'square' ? 'bg-emerald-600' : 'bg-black/40'"
                @click="setSelectedShape('square')"
              ) Square

            //- Motion (moving island) controls — drag the pink A/B
            //- handles on the canvas to retune the path.
            div.mt-2.flex.flex-col.gap-1.rounded.p-2(class="bg-pink-900/30 border border-pink-500/30")
              div.text-xs.uppercase.opacity-70 Motion
              template(v-if="!selectedIsland.motion")
                button.w-full.px-2.py-1.rounded.text-xs(
                  class="bg-pink-600 hover:bg-pink-500 active:scale-95"
                  @click="addMotionToSelectedIsland"
                ) + Make this island move
              template(v-else)
                label.text-xs.flex.items-center.gap-2
                  span.opacity-70.w-14 Period
                  input(
                    type="range"
                    :value="selectedIsland.motion.periodMs"
                    min="800"
                    max="8000"
                    step="100"
                    @input="(e: any) => setMotionPeriod(parseInt(e.target.value))"
                    class="flex-1"
                  )
                  span.w-12.text-right {{ (selectedIsland.motion.periodMs / 1000).toFixed(1) }}s
                label.text-xs.flex.items-center.gap-2
                  span.opacity-70.w-14 Phase
                  input(
                    type="range"
                    :value="(selectedIsland.motion.phase ?? 0) * 100"
                    min="0"
                    max="100"
                    step="5"
                    @input="(e: any) => setMotionPhase(parseInt(e.target.value) / 100)"
                    class="flex-1"
                  )
                  span.w-10.text-right {{ Math.round((selectedIsland.motion.phase ?? 0) * 100) }}%
                div.opacity-60(class="text-[10px]") Drag the pink A / B markers on the canvas to set endpoints.
                button.w-full.px-2.py-1.rounded.text-xs(
                  class="bg-slate-700 hover:bg-slate-600 active:scale-95"
                  @click="removeMotionFromSelectedIsland"
                ) − Remove motion

          button.px-2.py-1.rounded.text-sm(
            class="bg-red-700 hover:bg-red-600"
            @click="deleteSelection(selection)"
          ) Delete (DEL)
</template>

<style scoped lang="sass">
// Browser-tiled water — the canvas stays transparent so this shows through.
.maw-water-bg
  background-color: #3aa6c4
  background-image: url('/images/props/water_512x512.webp')
  background-repeat: repeat
  background-size: 512px 512px
</style>
