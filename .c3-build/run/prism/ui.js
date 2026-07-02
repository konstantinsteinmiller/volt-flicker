// ui.js — DOM overlay over the canvas. VOLT header (bar 0–100 + %), level name,
// pause/levels, mute; touch controls (move pad + JUMP / DASH / BEAM-hold /
// BURST-hold); transient overlays + a level-select modal. All vw/vh/clamp +
// safe-area → fully responsive. game.js wires the callbacks.

const CSS = `
.vf-ui,.vf-ui *{box-sizing:border-box;font-family:'Segoe UI',system-ui,sans-serif;-webkit-tap-highlight-color:transparent;user-select:none}
.vf-ui{position:fixed;inset:0;pointer-events:none;z-index:2147483600;color:#dff1ff}
.vf-ui button{pointer-events:auto;cursor:pointer;color:inherit;font:inherit}
.vf-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:1.6vmin;
  padding:calc(1.2vmin + env(safe-area-inset-top)) calc(2vmin + env(safe-area-inset-right)) 1.2vmin calc(2vmin + env(safe-area-inset-left))}
.vf-icn{pointer-events:auto;width:clamp(36px,6.5vmin,52px);height:clamp(36px,6.5vmin,52px);border-radius:14%;
  display:flex;align-items:center;justify-content:center;background:rgba(10,18,40,.6);border:2px solid #7fd8ff;
  box-shadow:0 0 12px rgba(127,216,255,.4);color:#7fd8ff;font-size:clamp(15px,3.2vmin,24px)}
.vf-icn:active{transform:scale(.9)}
.vf-center{flex:1;display:flex;flex-direction:column;gap:.6vmin;min-width:0}
.vf-row{display:flex;align-items:center;gap:1.2vmin}
.vf-name{font-weight:800;letter-spacing:.2em;text-transform:uppercase;font-size:clamp(11px,2.3vmin,18px);color:#9fe6ff;
  text-shadow:0 0 8px rgba(127,216,255,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vf-volt{font-weight:900;font-size:clamp(12px,2.6vmin,20px);color:#ffe23a;text-shadow:0 0 8px rgba(255,226,58,.6);min-width:3.5em;text-align:right}
.vf-bar{flex:1;height:clamp(10px,1.8vmin,16px);border-radius:99px;background:rgba(8,16,34,.8);
  border:1px solid rgba(127,216,255,.5);overflow:hidden;box-shadow:inset 0 0 6px rgba(0,0,0,.6)}
.vf-fill{height:100%;width:100%;border-radius:99px;transition:width .12s linear,background .2s}
.vf-bar.debt{border-color:#ff3b4e;box-shadow:0 0 12px rgba(255,59,78,.8),inset 0 0 6px rgba(255,59,78,.5);animation:vfDebt .5s ease-in-out infinite}
@keyframes vfDebt{0%,100%{opacity:.55}50%{opacity:1}}
.vf-bar.over{border-color:#ffe23a;box-shadow:0 0 16px rgba(255,226,58,.95),inset 0 0 8px rgba(255,226,58,.6);animation:vfOver .3s ease-in-out infinite}
@keyframes vfOver{0%,100%{opacity:.7;transform:scale(1)}50%{opacity:1;transform:scale(1.02)}}
.vf-msg{position:absolute;left:0;right:0;top:42%;transform:translateY(-50%);text-align:center;pointer-events:none;
  display:flex;flex-direction:column;align-items:center;gap:1.4vmin;padding:0 5vw}
.vf-msg .big{font-weight:900;letter-spacing:.12em;text-transform:uppercase;font-size:clamp(28px,8vmin,72px);text-shadow:0 0 18px rgba(127,216,255,.8),0 4px 0 rgba(0,0,0,.5)}
.vf-msg .sub{font-weight:700;letter-spacing:.16em;text-transform:uppercase;font-size:clamp(12px,3vmin,22px);color:#9fe6ff;opacity:.9;animation:vfP 1.3s ease-in-out infinite}
.vf-msg .win{color:#aef2ff}.vf-msg .lose{color:#ff7a8a}
@keyframes vfP{0%,100%{opacity:.4}50%{opacity:1}}
.vf-acts{display:flex;gap:1.8vmin;pointer-events:auto;margin-top:1vmin;flex-wrap:wrap;justify-content:center}
.vf-btn{pointer-events:auto;padding:1.3vmin 3.4vmin;border-radius:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  font-size:clamp(13px,2.8vmin,20px);background:linear-gradient(180deg,#7fd8ff,#2f8fd0);color:#04121f;border:2px solid #cdeeff;box-shadow:0 0 16px rgba(127,216,255,.6)}
.vf-btn:active{transform:scale(.94)}.vf-btn.alt{background:linear-gradient(180deg,#2a3450,#161d2e);color:#cfe6ff;border-color:#3b557a}
.vf-ui.vf-no-touch .vf-controls{display:none}
.vf-keymap{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(2vmin + env(safe-area-inset-bottom));
  display:flex;gap:1.4vmin;align-items:flex-end;justify-content:center;flex-wrap:wrap;pointer-events:none;max-width:96vw;
  background:rgba(6,12,24,.55);border:1px solid rgba(127,216,255,.28);border-radius:12px;padding:1vmin 1.6vmin}
.vf-keymap.hide{display:none}
.vf-km{display:flex;flex-direction:column;align-items:center;gap:.5vmin}
.vf-km .lbl{font-size:clamp(7px,1.4vmin,10px);letter-spacing:.08em;text-transform:uppercase;color:#9fc0d8;white-space:nowrap}
.vf-km .keys{display:flex;gap:.4vmin;align-items:center}
.vf-km .plus{color:#7fa0c0;font-weight:700;font-size:clamp(8px,1.6vmin,12px)}
.vf-cap{min-width:clamp(20px,4.2vmin,34px);height:clamp(20px,4.2vmin,34px);padding:0 .6vmin;border-radius:6px;
  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:clamp(8px,1.7vmin,13px);
  background:rgba(20,32,56,.92);border:2px solid #3b557a;color:#cfe6ff;box-shadow:0 2px 0 rgba(0,0,0,.4);transition:background .07s,border-color .07s,box-shadow .07s}
.vf-cap.on{background:#37d67a;border-color:#aef0c8;color:#04140a;box-shadow:0 0 12px rgba(55,214,122,.85)}
.vf-controls{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;align-items:flex-end;
  padding:calc(2vmin + env(safe-area-inset-left)) calc(2vmin + env(safe-area-inset-right)) calc(2.2vmin + env(safe-area-inset-bottom))}
.vf-pad{display:flex;gap:1.4vmin}
.vf-key{pointer-events:auto;width:clamp(50px,11vmin,80px);height:clamp(50px,11vmin,80px);border-radius:18%;display:flex;align-items:center;justify-content:center;
  font-size:clamp(18px,4.2vmin,30px);font-weight:800;background:rgba(10,18,40,.5);border:2px solid rgba(127,216,255,.55);color:#bfe9ff;box-shadow:0 0 10px rgba(127,216,255,.25)}
.vf-key:active,.vf-key.on{transform:scale(.93);background:rgba(127,216,255,.22)}
.vf-right{display:grid;grid-template-columns:repeat(2,auto);gap:1.2vmin}
.vf-act{pointer-events:auto;width:clamp(56px,12vmin,88px);height:clamp(56px,12vmin,88px);border-radius:22%;display:flex;flex-direction:column;align-items:center;justify-content:center;
  font-weight:900;font-size:clamp(10px,2.1vmin,15px);letter-spacing:.04em;border:3px solid #d8f4ff;color:#04121f}
.vf-act:active{transform:scale(.92)}
.vf-jump{background:radial-gradient(circle at 50% 35%,#aef0ff,#3f9fd0)}
.vf-dash{background:radial-gradient(circle at 50% 35%,#c0a0ff,#6a3fd0);color:#0a0420;border-color:#e6d8ff}
.vf-beam{background:radial-gradient(circle at 50% 35%,#fff0a0,#d0a030);color:#1a1400;border-color:#fff3c8}
.vf-burst{background:radial-gradient(circle at 50% 35%,#b08bff,#7a3fd0);color:#0a0420;border-color:#e6d8ff}
.vf-modal{position:absolute;inset:0;background:rgba(4,8,18,.82);backdrop-filter:blur(6px);pointer-events:auto;display:none;
  flex-direction:column;align-items:center;justify-content:center;gap:3vmin;padding:calc(3vmin + env(safe-area-inset-top)) 4vw calc(3vmin + env(safe-area-inset-bottom))}
.vf-modal.open{display:flex}
.vf-modal h2{margin:0;font-weight:900;letter-spacing:.2em;text-transform:uppercase;font-size:clamp(22px,6vmin,44px);color:#9fe6ff;text-shadow:0 0 18px rgba(127,216,255,.8)}
.vf-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2.2vmin;width:min(92vw,560px)}
.vf-lvl{pointer-events:auto;aspect-ratio:1;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6vmin;
  background:rgba(10,18,40,.7);border:2px solid #7fd8ff;color:#d6f1ff;box-shadow:0 0 14px rgba(127,216,255,.35);font-weight:800}
.vf-lvl .n{font-size:clamp(22px,6vmin,40px)}.vf-lvl .nm{font-size:clamp(8px,1.7vmin,11px);letter-spacing:.06em;text-transform:uppercase;opacity:.8;text-align:center;padding:0 1vmin}
.vf-lvl.locked{opacity:.35;filter:grayscale(.7);border-color:#3b557a;box-shadow:none}
`;

export class UI {
  constructor() { this.cb = {}; this.held = { left: false, right: false }; }

  mount(root, cb) {
    this.cb = cb || {};
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    // Touch devices keep the on-screen pad + skill buttons; desktop (fine pointer,
    // no touch) hides them — keyboard/mouse only.
    const isTouch = (navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);
    const el = document.createElement('div'); el.className = 'vf-ui' + (isTouch ? '' : ' vf-no-touch'); el.innerHTML = `
      <div class="vf-top">
        <button class="vf-icn" data-act="levels" title="Levels">▦</button>
        <div class="vf-center">
          <div class="vf-name" data-id="name">LEVEL 1</div>
          <div class="vf-row"><div class="vf-bar"><div class="vf-fill" data-id="fill"></div></div><div class="vf-volt" data-id="volt">100%</div></div>
        </div>
        <button class="vf-icn" data-act="editor" title="Level Editor (F2)">✎</button>
        <button class="vf-icn" data-act="mute" title="Sound">♪</button>
        <button class="vf-icn" data-act="pause" title="Pause">⏸</button>
      </div>
      <div class="vf-msg" data-id="msg" style="display:none">
        <div class="big" data-id="msgbig"></div><div class="sub" data-id="msgsub"></div>
        <div class="vf-acts" data-id="acts"></div>
      </div>
      <div class="vf-controls">
        <div class="vf-pad">
          <button class="vf-key" data-pad="left">◀</button>
          <button class="vf-key" data-pad="right">▶</button>
        </div>
        <div class="vf-right">
          <button class="vf-act vf-beam" data-hold="beam">BEAM</button>
          <button class="vf-act vf-burst" data-hold="burst">BURST</button>
          <button class="vf-act vf-dash" data-tap="dash">DASH</button>
          <button class="vf-act vf-jump" data-tap="jump">JUMP</button>
        </div>
      </div>
      <div class="vf-keymap hide" data-id="keymap">
        <div class="vf-km"><div class="keys"><span class="vf-cap" data-k="left">A</span><span class="vf-cap" data-k="right">D</span></div><div class="lbl">Move</div></div>
        <div class="vf-km"><div class="keys"><span class="vf-cap" data-k="jump">Space</span></div><div class="lbl">Jump</div></div>
        <div class="vf-km"><div class="keys"><span class="vf-cap" data-k="dash">E</span></div><div class="lbl">Dash</div></div>
        <div class="vf-km"><div class="keys"><span class="vf-cap" data-k="beam">LMB</span><span class="plus">+</span><span class="vf-cap" data-k="beam">Shift</span></div><div class="lbl">Charge Shot</div></div>
        <div class="vf-km"><div class="keys"><span class="vf-cap" data-k="radial">RMB</span><span class="plus">+</span><span class="vf-cap" data-k="radial">Ctrl</span></div><div class="lbl">Discharge</div></div>
      </div>
      <div class="vf-modal" data-id="modal">
        <h2>Select Level</h2><div class="vf-grid" data-id="grid"></div>
        <button class="vf-btn alt" data-act="closeModal">Close</button>
      </div>`;
    root.appendChild(el);
    this.el = el; this.$ = (id) => el.querySelector(`[data-id="${id}"]`);

    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this._act(b.getAttribute('data-act')); }));
    el.querySelectorAll('[data-pad]').forEach((b) => {
      const dir = b.getAttribute('data-pad');
      const dn = (e) => { e.preventDefault(); e.stopPropagation(); this.held[dir] = true; b.classList.add('on'); this._move(); };
      const up = (e) => { e.stopPropagation(); this.held[dir] = false; b.classList.remove('on'); this._move(); };
      b.addEventListener('pointerdown', dn); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
    });
    el.querySelectorAll('[data-tap]').forEach((b) => {
      const act = b.getAttribute('data-tap');
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (act === 'jump') this.cb.jump && this.cb.jump(); else this.cb.dash && this.cb.dash(); });
    });
    el.querySelectorAll('[data-hold]').forEach((b) => {
      const which = b.getAttribute('data-hold');
      const dn = (e) => { e.preventDefault(); e.stopPropagation(); this.cb.hold && this.cb.hold(which, true); b.classList.add('on'); };
      const up = (e) => { e.stopPropagation(); this.cb.hold && this.cb.hold(which, false); b.classList.remove('on'); };
      b.addEventListener('pointerdown', dn); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
    });
  }

  _act(a) {
    if (a === 'levels' || a === 'pause') this.cb.openLevels && this.cb.openLevels();
    else if (a === 'closeModal') this.closeModal();
    else if (a === 'editor') this.cb.openEditor && this.cb.openEditor();
    else if (a === 'mute') this.cb.toggleMute && this.cb.toggleMute();
  }
  _move() { const d = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0); this.cb.move && this.cb.move(d); }

  update(m) {
    this.$('name').textContent = `LVL ${m.levelNum} · ${m.levelName}`;
    const v = m.volt;
    const f = this.$('fill'); f.style.width = `${Math.max(0, Math.min(100, v))}%`;
    const bar = this.el.querySelector('.vf-bar');
    const vt = this.$('volt');
    if (bar) { bar.classList.remove('debt'); bar.classList.remove('over'); }
    if (v < 0) {
      // VOLT DEBT (feature #4): borrowed power — bar empty + pulsing red overdraft
      f.style.background = '#ff3b4e';
      if (bar) bar.classList.add('debt');
      vt.textContent = `DEBT ${Math.ceil(v)}%`; vt.style.color = '#ff5b6a';
    } else if (v > 100) {
      // OVERCHARGE / OVERPOWERED (roadmap #20): lightning-yellow overextended bar
      f.style.background = 'linear-gradient(90deg,#ffd23c,#fff7c0,#ffe23a)';
      if (bar) bar.classList.add('over');
      vt.textContent = `${Math.ceil(v)}%${m.over ? ' ⚡' : ''}`; vt.style.color = '#fff2a0';
    } else {
      f.style.background = v <= 25 ? 'linear-gradient(90deg,#ff3b4e,#ff7a3c)' : v <= 55 ? 'linear-gradient(90deg,#7fd8ff,#ffe23a)' : 'linear-gradient(90deg,#7fd8ff,#aef2ff,#ffe23a)';
      vt.textContent = `${Math.ceil(v)}%`; vt.style.color = v <= 25 ? '#ff5b6a' : '#ffe23a';
    }
    const mb = this.el.querySelector('[data-act="mute"]'); if (mb) mb.textContent = m.muted ? '♪̸' : '♪';
  }

  showKeymap(show) { this.$('keymap').classList.toggle('hide', !show); }
  // map: { left, right, jump, dash, beam, radial } booleans → green key-caps
  setActive(map) {
    if (!this._caps) this._caps = [...this.el.querySelectorAll('.vf-cap[data-k]')];
    for (const c of this._caps) {
      const on = !!map[c.getAttribute('data-k')];
      if (c.classList.contains('on') !== on) c.classList.toggle('on', on);
    }
  }

  showMessage(big, sub, cls, actions) {
    const msg = this.$('msg');
    this.$('msgbig').textContent = big; this.$('msgbig').className = 'big ' + (cls || '');
    this.$('msgsub').textContent = sub || '';
    const ac = this.$('acts'); ac.innerHTML = '';
    (actions || []).forEach((a) => { const b = document.createElement('button'); b.className = 'vf-btn ' + (a.alt ? 'alt' : ''); b.textContent = a.label; b.addEventListener('click', (e) => { e.stopPropagation(); a.onClick(); }); ac.appendChild(b); });
    msg.style.display = 'flex';
  }
  hideMessage() { this.$('msg').style.display = 'none'; }

  openModal(levels, unlocked) {
    const grid = this.$('grid'); grid.innerHTML = '';
    levels.forEach((lv, i) => {
      const locked = i >= unlocked; const b = document.createElement('button');
      b.className = 'vf-lvl' + (locked ? ' locked' : '');
      b.innerHTML = `<div class="n">${i + 1}</div><div class="nm">${lv.name}</div>`;
      if (!locked) b.addEventListener('click', (e) => { e.stopPropagation(); this.closeModal(); this.cb.selectLevel && this.cb.selectLevel(i); });
      grid.appendChild(b);
    });
    this.$('modal').classList.add('open');
  }
  closeModal() { this.$('modal').classList.remove('open'); }
  isModalOpen() { return this.$('modal').classList.contains('open'); }
}
