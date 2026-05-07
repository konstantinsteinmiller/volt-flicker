<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { MawStage, MawIsland, Obstacle } from '@/use/useMawCampaign'
import { STAGES } from '@/use/useMawCampaign'
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
  drawWater,
  drawIsland,
  drawObstacle,
  drawGrassBlade,
  drawExitPole
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
  | 'grass'
  | 'exit'

interface EditorIsland extends MawIsland {
  id: string
}

interface SelectedIsland { type: 'island'; islandId: string }
interface SelectedObstacle { type: 'obstacle'; islandId: string; obstacleIdx: number }
interface SelectedGrass { type: 'grass'; islandId: string; grassIdx: number }
interface SelectedExit { type: 'exit' }
type Selection = SelectedIsland | SelectedObstacle | SelectedGrass | SelectedExit | null

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
  const dx = x - isle.cx
  const dy = y - isle.cy
  if (isle.shape === 'round') return dx * dx + dy * dy <= isle.radius * isle.radius
  return Math.abs(dx) <= isle.radius && Math.abs(dy) <= isle.radius
}

const findIslandAt = (x: number, y: number): EditorIsland | null => {
  for (let i = islands.value.length - 1; i >= 0; i--) {
    const isle = islands.value[i]!
    if (islandContains(isle, x, y)) return isle
  }
  return null
}

const findEntityAt = (x: number, y: number): Selection => {
  // Exit pole first — small target, draw on top.
  if (Math.hypot(x - exitX.value, y - exitY.value) <= 22) return { type: 'exit' }
  // Then obstacles / grass on top of islands (pick smaller hit-radius first).
  for (let i = islands.value.length - 1; i >= 0; i--) {
    const isle = islands.value[i]!
    for (let j = isle.obstacles.length - 1; j >= 0; j--) {
      const ob = isle.obstacles[j]!
      const r = ob.type === 'boulder' ? 28 : ob.type === 'crystal' ? 18 : 22
      if (Math.hypot(x - ob.x, y - ob.y) <= r) {
        return { type: 'obstacle', islandId: isle.id, obstacleIdx: j }
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
  const obType: Obstacle['type'] = t === 'stump' ? 'stump' : t === 'boulder' ? 'boulder' : 'crystal'
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
    // Move the island and bring its grass + obstacles along.
    isle.cx = x
    isle.cy = y
    isle.grass = isle.grass.map(([gx, gy]) => [gx + dx, gy + dy])
    isle.obstacles = isle.obstacles.map(o => ({ ...o, x: o.x + dx, y: o.y + dy }))
    return
  }
  if (sel.type === 'obstacle') {
    isle.obstacles[sel.obstacleIdx] = { ...isle.obstacles[sel.obstacleIdx]!, x, y }
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
  const isleIdx = islands.value.findIndex(i => i.id === sel.islandId)
  if (isleIdx < 0) return
  const isle = islands.value[isleIdx]!
  if (sel.type === 'island') {
    if (islands.value.length <= 1) {
      status.value = 'Stage needs at least one island.'
      return
    }
    islands.value = islands.value.filter(i => i.id !== sel.islandId)
  } else if (sel.type === 'obstacle') {
    isle.obstacles = isle.obstacles.filter((_, i) => i !== sel.obstacleIdx)
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
  // Only the dedicated Delete key triggers selection removal — Backspace is
  // reserved for editing the stage-name / target-clears inputs without
  // also wiping the canvas selection. Skip entirely while focus is on any
  // form element so typing inside the toolbar inputs is never destructive.
  if (e.key !== 'Delete') return
  if (isTypingTarget(e.target)) return
  if (!selection.value) return
  deleteSelection(selection.value)
  e.preventDefault()
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
  if (isle) isle.radius = Math.max(40, Math.min(400, r))
}

const setSelectedShape = (shape: 'round' | 'square') => {
  const isle = selectedIsland.value
  if (isle) isle.shape = shape
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
    obstacles: i.obstacles.map(o => ({ ...o }))
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
  stageName.value = displayName
  islands.value = s.islands.map(i => ({
    id: newId(),
    cx: i.cx, cy: i.cy, radius: i.radius, shape: i.shape,
    grass: i.grass.map(g => [g[0], g[1]] as [number, number]),
    obstacles: i.obstacles.map(o => ({ ...o }))
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
  const stage = STAGES.find(s => String(s.id) === idStr)
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

  drawWater(ctx, cameraX.value, cameraY.value, w / zoom.value, h / zoom.value)

  for (const isle of islands.value) drawIsland(ctx, isle)
  for (const isle of islands.value) {
    for (const ob of isle.obstacles) drawObstacle(ctx, ob)
    for (let i = 0; i < isle.grass.length; i++) {
      const [gx, gy] = isle.grass[i]!
      drawGrassBlade(ctx, gx, gy, 'forest', i)
    }
  }
  drawExitPole(ctx, exitX.value, exitY.value, false, true)

  // Selection outline.
  const sel = selection.value
  if (sel) {
    ctx.strokeStyle = '#ffe066'
    ctx.lineWidth = 3 / zoom.value
    if (sel.type === 'island') {
      const isle = islands.value.find(i => i.id === sel.islandId)
      if (isle) {
        ctx.beginPath()
        if (isle.shape === 'round') {
          ctx.arc(isle.cx, isle.cy, isle.radius + 4, 0, Math.PI * 2)
        } else {
          ctx.rect(isle.cx - isle.radius - 4, isle.cy - isle.radius - 4, (isle.radius + 4) * 2, (isle.radius + 4) * 2)
        }
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

onMounted(() => {
  updateCanvasSize()
  window.addEventListener('resize', updateCanvasSize)
  window.addEventListener('keydown', onKeyDown)
  raf = requestAnimationFrame(renderLoop)
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
  STAGES.map(s => {
    const overridden = campaignOverrides.value[s.id] ? ' ✎' : ''
    return { key: `${s.id}:${s.name}`, label: `${s.id} — ${s.name}${s.isBoss ? ' (boss)' : ''}${overridden}` }
  })
)
const campaignSlotOptions = computed(() =>
  STAGES.map(s => ({
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
        div.text-xs.opacity-60 Decor (grass / stump / boulder / crystal) snaps to the island under the cursor.

      //- Canvas
      div.flex-1.relative
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
          button.px-2.py-1.rounded.text-sm(
            class="bg-red-700 hover:bg-red-600"
            @click="deleteSelection(selection)"
          ) Delete (DEL)
</template>
