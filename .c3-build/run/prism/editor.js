// editor.js — in-game level editor (roadmap #19). Toggle with F2 (or the ✎ HUD
// button). Pick a tool from the palette, click/drag on the level to place,
// drag to move, Delete to remove. Save writes a per-level override to
// localStorage (the game loads it automatically) and copies the level JSON to
// the clipboard so you can paste it back into levels.js.
//
// It edits the LIVE world arrays, so changes are visible immediately. Gameplay
// is paused while the editor is open.

import { LEVELS_REV } from './levels.js';

const TOOLS = [
  ['select', 'Select'], ['platform', 'Platform'], ['wall', 'Wall'], ['breakable', 'Breakable'],
  ['exit', 'Exit'], ['door', 'Door'], ['switch', 'Switch'], ['trap', 'Trap'], ['mover', 'Mover'],
  ['capS', 'Capsule'], ['capB', 'Big Cap'],
  ['patrol', 'Patrol'], ['float', 'Float'], ['charger', 'Charger'], ['shielded', 'Shielded'],
  ['shooter', 'Turret'], ['tank', 'Tank'], ['relay', 'Relay'], ['spawn', 'Spawn']
];

const ED_CSS = `
.ed-ui{position:fixed;inset:0;z-index:2147483640;pointer-events:none;font-family:system-ui,sans-serif;color:#dff1ff;display:none}
.ed-ui.on{display:block}
.ed-pal{position:absolute;top:0;left:0;bottom:0;width:148px;overflow:auto;background:rgba(6,12,24,.92);border-right:2px solid #1de0ff;
  pointer-events:auto;padding:8px;display:flex;flex-direction:column;gap:5px}
.ed-pal b{font-size:12px;color:#7fd8ff;letter-spacing:.1em;text-transform:uppercase}
.ed-tool{pointer-events:auto;cursor:pointer;border:1px solid #2b4790;background:#10193a;color:#cfe6ff;border-radius:6px;padding:6px 8px;font-size:12px;text-align:left}
.ed-tool.sel{background:#1de0ff;color:#04121f;border-color:#bff4ff;font-weight:800}
.ed-bar{position:absolute;top:8px;left:160px;display:flex;gap:6px;pointer-events:auto;flex-wrap:wrap}
.ed-btn{pointer-events:auto;cursor:pointer;border:2px solid #1de0ff;background:#0a1530;color:#cfe6ff;border-radius:8px;padding:6px 12px;font-weight:700;font-size:12px}
.ed-btn:active{transform:scale(.95)}
.ed-info{position:absolute;bottom:8px;left:160px;background:rgba(6,12,24,.8);border:1px solid #2b4790;border-radius:6px;padding:6px 10px;font-size:12px;color:#9fc0d8;pointer-events:none}
`;

export class Editor {
  volt-flickeror(game) { this.game = game; this.enabled = false; this.tool = 'select'; this.sel = null; this.drag = null; this.grid = 10; }

  mount(root) {
    const style = document.createElement('style'); style.textContent = ED_CSS; document.head.appendChild(style);
    const el = document.createElement('div'); el.className = 'ed-ui';
    const pal = document.createElement('div'); pal.className = 'ed-pal';
    pal.innerHTML = '<b>Tools</b>';
    for (const [id, label] of TOOLS) {
      const b = document.createElement('button'); b.className = 'ed-tool'; b.textContent = label; b.dataset.tool = id;
      b.addEventListener('click', () => { this.tool = id; this._refreshTools(); });
      pal.appendChild(b);
    }
    const bar = document.createElement('div'); bar.className = 'ed-bar';
    const mkBtn = (label, fn) => { const b = document.createElement('button'); b.className = 'ed-btn'; b.textContent = label; b.addEventListener('click', fn); return b; };
    bar.appendChild(mkBtn('Save+Copy JSON', () => this.save()));
    bar.appendChild(mkBtn('Revert Level', () => this.revert()));
    bar.appendChild(mkBtn('Wider', () => this._resize(20, 0)));
    bar.appendChild(mkBtn('Narrower', () => this._resize(-20, 0)));
    bar.appendChild(mkBtn('Taller', () => this._resize(0, 20)));
    bar.appendChild(mkBtn('Shorter', () => this._resize(0, -20)));
    bar.appendChild(mkBtn('Delete', () => this._delete()));
    bar.appendChild(mkBtn('Exit (F2)', () => this.toggle()));
    const info = document.createElement('div'); info.className = 'ed-info';
    info.textContent = 'Click to place · drag to move · Delete removes · Save overwrites this level';
    el.appendChild(pal); el.appendChild(bar); el.appendChild(info);
    root.appendChild(el);
    this.el = el; this.pal = pal; this._refreshTools();

    const c = this.game.canvas;
    c.addEventListener('pointerdown', (e) => { if (this.enabled) { this._down(e); e.stopPropagation(); } }, true);
    c.addEventListener('pointermove', (e) => { if (this.enabled) this._move(e); }, true);
    window.addEventListener('pointerup', () => { this.drag = null; });
  }

  _refreshTools() { this.pal.querySelectorAll('.ed-tool').forEach((b) => b.classList.toggle('sel', b.dataset.tool === this.tool)); }
  toggle() { this.enabled = !this.enabled; this.el.classList.toggle('on', this.enabled); }

  _w2(e) {
    const v = this.game.computeView();
    const r = this.game.canvas.getBoundingClientRect();
    const g = this.grid;
    return {
      x: Math.round((v.camX + (e.clientX - r.left) / v.scale) / g) * g,
      y: Math.round((v.camY + (e.clientY - r.top) / v.scale) / g) * g
    };
  }
  _hit(p) {
    const w = this.game.world;
    const lists = [w.platforms, w.breakables, w.doors, w.traps, w.enemies, w.capsules];
    for (const list of lists) for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i], ow = o.w || 22, oh = o.h || 22;
      if (p.x >= o.x - 4 && p.x <= o.x + ow + 4 && p.y >= o.y - 4 && p.y <= o.y + oh + 4) return { o, list };
    }
    return null;
  }

  _down(e) {
    const p = this._w2(e);
    if (this.tool === 'select') {
      const h = this._hit(p);
      this.sel = h ? h.o : null; this._selList = h ? h.list : null;
      if (h) this.drag = { ox: p.x - h.o.x, oy: p.y - h.o.y };
      return;
    }
    this._place(p);
  }
  _move(e) {
    if (!this.drag || !this.sel) return;
    const p = this._w2(e);
    this.sel.x = p.x - this.drag.ox; this.sel.y = p.y - this.drag.oy;
    if (this.sel._x0 !== undefined) { this.sel._x0 = this.sel.x; this.sel._y0 = this.sel.y; }
  }

  _place(p) {
    const w = this.game.world, t = this.tool;
    const add = (list, o) => { list.push(o); this.sel = o; this._selList = list; this.tool = 'select'; this._refreshTools(); };
    if (t === 'platform') add(w.platforms, { x: p.x, y: p.y, w: 160, h: 22, wall: false, _x0: p.x, _y0: p.y, dx: 0, dy: 0 });
    else if (t === 'wall') add(w.platforms, { x: p.x, y: p.y, w: 28, h: 160, wall: true, _x0: p.x, _y0: p.y, dx: 0, dy: 0 });
    else if (t === 'mover') add(w.platforms, { x: p.x, y: p.y, w: 150, h: 24, _x0: p.x, _y0: p.y, dx: 0, dy: 0, move: { x2: p.x + 200, y2: p.y, period: 3 } });
    else if (t === 'breakable') add(w.breakables, { x: p.x, y: p.y, w: 24, h: 100, hp: 40, maxHp: 40, alive: true, hitFlash: 0 });
    else if (t === 'exit') w.exit = { x: p.x, y: p.y, w: 56, h: 120 };
    else if (t === 'door') { const id = 'g' + (w.doors.length + 1); add(w.doors, { id, x: p.x, y: p.y, w: 30, h: 110, open: false }); }
    else if (t === 'switch') { const d = w.doors[0]; add(w.switches, { x: p.x, y: p.y, door: d ? d.id : 'g1', on: false }); }
    else if (t === 'trap') add(w.traps, { x: p.x, y: p.y, w: 160, h: 20, armed: true, period: 0, phase: 0 });
    else if (t === 'capS') add(w.capsules, { x: p.x, y: p.y, w: 22, h: 22, big: false, taken: false, bob: 0 });
    else if (t === 'capB') add(w.capsules, { x: p.x, y: p.y, w: 30, h: 30, big: true, taken: false, bob: 0 });
    else if (t === 'spawn') { w.spawn = { x: p.x, y: p.y }; this.game.cp = { x: p.x, y: p.y }; this.game.player.reset(p.x, p.y, 1); }
    else { // enemy types (incl relay)
      const hp = t === 'shooter' ? 900 : t === 'tank' ? 600 : undefined;
      const sz = t === 'tank' ? 96 : t === 'shooter' ? 50 : t === 'relay' ? 44 : 40;
      add(w.enemies, { x: p.x, y: p.y, w: sz, h: sz, type: t, x1: p.x - 120, x2: p.x + 120, baseX: p.x, baseY: p.y, phase: 0, hp: hp ?? 12, maxHp: hp ?? 12, shield: t === 'shielded', dir: 1, vx: 0, vy: 0, alive: true, hitFlash: 0, shootT: 0 });
    }
  }

  _resize(dw, dh) { if (!this.sel || this.sel.w === undefined) return; this.sel.w = Math.max(10, this.sel.w + dw); this.sel.h = Math.max(10, this.sel.h + dh); }
  _delete() {
    if (!this.sel || !this._selList) return;
    const i = this._selList.indexOf(this.sel); if (i >= 0) this._selList.splice(i, 1);
    this.sel = null; this._selList = null;
  }

  // draw selection + grid overlay (called from game after drawScene, in world space)
  draw(ctx, view) {
    if (!this.enabled) return;
    if (this.sel) {
      const o = this.sel, ow = o.w || 22, oh = o.h || 22;
      ctx.save();
      ctx.strokeStyle = '#ffe23a'; ctx.lineWidth = 2 / view.scale;
      ctx.setLineDash([6 / view.scale, 4 / view.scale]);
      ctx.strokeRect(o.x - 2, o.y - 2, ow + 4, oh + 4);
      ctx.restore();
    }
  }

  // ── serialize the live world back to a level object ──
  serialize() {
    const w = this.game.world, lv = w.level || {};
    const clean = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; };
    const relays = w.enemies.filter((e) => e.type === 'relay').map((e) => ({ x: e.x, y: e.y }));
    const out = {
      id: lv.id, name: lv.name || 'Custom', w: w.w, h: w.h, spawn: { ...w.spawn }, facing: w.facing || 1,
      platforms: w.platforms.map((p) => { const o = clean(p, ['x', 'y', 'w', 'h', 'wall', 'bound']); if (p.move) o.move = { x2: p.move.x2, y2: p.move.y2, period: p.move.period, phase: p.move.phase || 0 }; return o; }),
      breakables: w.breakables.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, hp: b.maxHp })),
      doors: w.doors.map((d) => ({ id: d.id, x: d.x, y: d.y, w: d.w, h: d.h })),
      switches: w.switches.map((s) => ({ x: s.x, y: s.y, door: s.door })),
      traps: w.traps.map((t) => clean(t, ['x', 'y', 'w', 'h', 'period', 'phase'])),
      capsules: w.capsules.filter((c) => !c.taken).map((c) => ({ x: c.x, y: c.y, big: !!c.big })),
      enemies: w.enemies.filter((e) => e.type !== 'relay' && !e.child).map((e) => clean({ x: e.x, y: e.y, type: e.type, hp: e.maxHp, w: e.w, h: e.h, x1: e.x1, x2: e.x2 }, ['x', 'y', 'type', 'hp', 'w', 'h', 'x1', 'x2']))
    };
    if (w.exit) out.exit = { ...w.exit };
    if (w.boss) out.boss = { x: w.boss.x, y: w.boss.y, w: w.boss.w, h: w.boss.h, tier: w.boss.tier, archetype: w.boss.archetype, relays: relays.length ? relays : undefined };
    return out;
  }

  save() {
    const obj = this.serialize();
    obj._rev = LEVELS_REV;            // stamp so a later levels.js change invalidates this
    const json = JSON.stringify(obj);
    try { localStorage.setItem('prism_lvl_' + this.game.prism_state.currentLevel, json); } catch {}
    const pretty = JSON.stringify(obj, null, 2);
    try { navigator.clipboard && navigator.clipboard.writeText(pretty); } catch {}
    console.log('[editor] saved level override + copied JSON:\n', pretty);
    this.el.querySelector('.ed-info').textContent = 'Saved! Override stored + JSON copied to clipboard.';
  }
  revert() {
    try { localStorage.removeItem('prism_lvl_' + this.game.prism_state.currentLevel); } catch {}
    this.game.loadLevel(this.game.prism_state.currentLevel);
    this.el.querySelector('.ed-info').textContent = 'Reverted to the built-in level.';
  }
}

// Returns a localStorage level override for index i, or null. Overrides stamped
// with an older LEVELS_REV are stale (the built-in changed underneath them) → drop
// them so edits can't silently shadow a redesigned built-in level.
export const loadLevelOverride = (i) => {
  try {
    const r = localStorage.getItem('prism_lvl_' + i); if (!r) return null;
    const o = JSON.parse(r);
    if (!o || o._rev !== LEVELS_REV) { localStorage.removeItem('prism_lvl_' + i); return null; }
    return o;
  } catch {}
  return null;
};
