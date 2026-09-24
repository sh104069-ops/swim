'use strict';
/* ==========================================================
   みずあそび チャレンジ  script.js
   ゲーム① およぎゲーム(4泳法・じゃまものよけ)
   ゲーム② 潜水ゲーム(ルーレット+きょりあて)
   ゲーム③ 釣りゲーム(タイミングゲージ)
   操作:マウス / タッチ / スイッチ(Space・Enter・← →)
   ========================================================== */

const W = 960, H = 600, TAU = Math.PI * 2;
const FONT = '"BIZ UDPGothic","Hiragino Maru Gothic ProN","Hiragino Sans","Meiryo",sans-serif';
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- 保存 ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('mizuasobi_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('mizuasobi_' + k, JSON.stringify(v)); } catch (e) { /* 保存できない環境では無視 */ } }
};
const DEFAULT_SETTINGS = { swimControl: 'mouse', scan: true, scanSpeed: 1.5, debounce: 0.3, sound: true, diveLevel: 1, fishLevel: 'normal' };
const settings = Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {}));

/* ---------- 音 ---------- */
let actx = null;
function ensureAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
  if (actx && actx.state === 'suspended') actx.resume();
}
function tone(freq, dur = 0.15, type = 'sine', vol = 0.15, delay = 0, freq2 = 0) {
  if (!settings.sound || !actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
const SFX = {
  select: () => tone(660, 0.08, 'square', 0.06),
  tick: () => tone(1100, 0.03, 'square', 0.03),
  move: () => tone(520, 0.07, 'triangle', 0.12),
  count: () => tone(784, 0.15, 'sine', 0.16),
  go: () => tone(1175, 0.35, 'sine', 0.18),
  hit: () => tone(420, 0.35, 'sawtooth', 0.13, 0, 90),
  splash: () => tone(900, 0.25, 'triangle', 0.12, 0, 200),
  nibble: () => tone(600, 0.04, 'sine', 0.06),
  bite: () => { tone(330, 0.08, 'square', 0.1); tone(495, 0.12, 'square', 0.1, 0.09); },
  good: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.16, i * 0.09)),
  bad: () => { tone(330, 0.18, 'triangle', 0.14); tone(247, 0.3, 'triangle', 0.14, 0.16); },
  over: () => [523, 440, 349, 262].forEach((f, i) => tone(f, 0.22, 'triangle', 0.15, i * 0.16)),
};

/* ---------- 描画ヘルパー ---------- */
function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
function oval(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill(); }
function seg(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function label(c, text, x, y, size = 32, color = '#fff', align = 'center', stroke = 'rgba(0,0,0,.55)') {
  c.font = `bold ${size}px ${FONT}`; c.textAlign = align; c.textBaseline = 'middle';
  c.lineJoin = 'round';
  if (stroke) { c.lineWidth = Math.max(3, size / 6); c.strokeStyle = stroke; c.strokeText(text, x, y); }
  c.fillStyle = color; c.fillText(text, x, y);
}
function panel(c, x, y, w, h, a = 0.45) { c.fillStyle = `rgba(0,30,60,${a})`; rr(c, x, y, w, h, 16); c.fill(); }
function drawHeart(c, x, y, s, on) {
  c.save(); c.translate(x, y); c.scale(s / 30, s / 30);
  c.beginPath(); c.moveTo(0, 12);
  c.bezierCurveTo(-28, -6, -14, -28, 0, -12);
  c.bezierCurveTo(14, -28, 28, -6, 0, 12); c.closePath();
  c.fillStyle = on ? '#e0413a' : 'rgba(255,255,255,.25)'; c.fill();
  c.lineWidth = 2.5; c.strokeStyle = '#fff'; c.stroke();
  c.restore();
}

/* ---------- 共通:カウントダウン ---------- */
class Countdown {
  constructor() { this.t = 2.999; this.last = 4; }
  update(dt) {
    if (this.t <= -0.8) return;
    this.t -= dt;
    const n = Math.ceil(this.t);
    if (n !== this.last) { this.last = n; if (n > 0) SFX.count(); else if (n === 0) SFX.go(); }
  }
  get running() { return this.t > 0; }
  draw(c) {
    if (this.t <= -0.8) return;
    const n = Math.ceil(this.t);
    if (n > 0) label(c, String(n), W / 2, H / 2 - 20, 110 + 50 * (this.t - Math.floor(this.t)), '#fff');
    else label(c, 'スタート!', W / 2, H / 2 - 20, 90, '#ffc62b');
  }
}

/* ==========================================================
   ゲーム① およぎゲーム
   ========================================================== */
const STROKES = {
  crawl:  { name: 'クロール',   html: 'クロール', cap: '#e0413a', suit: '#1e6fd9' },
  breast: { name: 'ひらおよぎ', html: '<ruby>平泳<rt>ひらおよ</rt></ruby>ぎ', cap: '#ffc62b', suit: '#2e9e4f' },
  fly:    { name: 'バタフライ', html: 'バタフライ', cap: '#8e3fc0', suit: '#f28a1c' },
  back:   { name: 'せおよぎ',   html: '<ruby>背泳<rt>せおよ</rt></ruby>ぎ', cap: '#00897b', suit: '#e0407a' },
};
const SKIN = '#f6c9a2';

// 上から見たスイマー(上向きに進む)
function drawSwimmer(c, x, y, stroke, ph, s = 1) {
  const st = STROKES[stroke];
  c.save(); c.translate(x, y); c.scale(s, s);
  c.lineCap = 'round'; c.lineJoin = 'round';
  // あし
  let lx, ly, rx, ry;
  if (stroke === 'fly') { const k = Math.sin(ph * 2) * 5; lx = -4; rx = 4; ly = 44 + k; ry = 44 + k; }
  else if (stroke === 'breast') { const k = Math.max(0, Math.sin(ph + Math.PI)); lx = -6 - k * 14; rx = 6 + k * 14; ly = 44 - k * 8; ry = 44 - k * 8; }
  else { const k = Math.sin(ph * 2) * 5; lx = -6; rx = 6; ly = 44 + k; ry = 44 - k; }
  c.strokeStyle = SKIN; c.lineWidth = 7;
  seg(c, -5, 18, lx, ly); seg(c, 5, 18, rx, ry);
  // からだ
  c.fillStyle = st.suit; oval(c, 0, 6, 13, 19);
  // うで
  let L, R;
  if (stroke === 'fly') {
    const a = Math.cos(ph), sx = 14 + 16 * Math.abs(Math.sin(ph));
    L = [-sx, -8 - 30 * a]; R = [sx, -8 - 30 * a];
  } else if (stroke === 'breast') {
    const k = Math.max(0, Math.sin(ph)), sx = 6 + 24 * k, sy = -40 + 24 * k;
    L = [-sx, sy]; R = [sx, sy];
  } else {
    const a = Math.cos(ph), b = Math.cos(ph + Math.PI), w = stroke === 'back' ? 10 : 2;
    L = [-15 - w * Math.abs(Math.sin(ph)), -8 - 30 * a]; R = [15 + w * Math.abs(Math.sin(ph)), -8 - 30 * b];
  }
  c.strokeStyle = SKIN; c.lineWidth = 7;
  seg(c, -11, -6, L[0], L[1]); seg(c, 11, -6, R[0], R[1]);
  // あたま
  if (stroke === 'back') {
    c.fillStyle = SKIN; circle(c, 0, -18, 11);
    c.fillStyle = st.cap; c.beginPath(); c.arc(0, -18, 11, Math.PI, 0); c.closePath(); c.fill();
    c.fillStyle = '#333'; circle(c, -4, -15, 1.8); circle(c, 4, -15, 1.8);
    c.strokeStyle = '#c0392b'; c.lineWidth = 1.6;
    c.beginPath(); c.arc(0, -12, 3, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  } else {
    c.fillStyle = st.cap; circle(c, 0, -18, 11);
    c.fillStyle = 'rgba(255,255,255,.4)'; circle(c, -3, -22, 3);
  }
  c.restore();
}

function drawObstacle(c, o) {
  c.save(); c.translate(o.x, o.y);
  c.fillStyle = 'rgba(0,40,80,.22)'; oval(c, 5, 7, o.r, o.r * 0.8);
  c.rotate(o.rot);
  if (o.type === 'ball') {
    c.fillStyle = '#fff'; circle(c, 0, 0, o.r);
    const cols = ['#e0413a', '#1e6fd9', '#ffc62b'];
    for (let i = 0; i < 3; i++) {
      c.fillStyle = cols[i]; c.beginPath(); c.moveTo(0, 0);
      c.arc(0, 0, o.r, i * TAU / 3, i * TAU / 3 + TAU / 6); c.closePath(); c.fill();
    }
    c.strokeStyle = '#333'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, o.r, 0, TAU); c.stroke();
  } else if (o.type === 'ring') {
    c.fillStyle = '#ff7043'; c.beginPath(); c.arc(0, 0, o.r, 0, TAU); c.arc(0, 0, o.r * 0.5, 0, TAU, true); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = o.r * 0.45;
    for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(0, 0, o.r * 0.75, k * TAU / 4, k * TAU / 4 + 0.4); c.stroke(); }
  } else if (o.type === 'board') {
    c.fillStyle = '#ffc62b'; rr(c, -26, -20, 52, 40, 10); c.fill();
    c.fillStyle = '#29b6f6'; rr(c, -17, -11, 34, 22, 6); c.fill();
    c.strokeStyle = '#333'; c.lineWidth = 2; rr(c, -26, -20, 52, 40, 10); c.stroke();
  } else if (o.type === 'jelly') {
    c.rotate(-o.rot);
    c.strokeStyle = 'rgba(236,64,122,.8)'; c.lineWidth = 3;
    for (let i = -2; i <= 2; i++) {
      c.beginPath(); c.moveTo(i * 7, 0);
      for (let j = 1; j <= 4; j++) c.lineTo(i * 7 + Math.sin(o.rot * 3 + j + i) * 4, j * 7);
      c.stroke();
    }
    c.fillStyle = 'rgba(236,64,122,.85)'; c.beginPath(); c.arc(0, 0, o.r, Math.PI, 0); c.closePath(); c.fill();
    c.fillStyle = '#fff'; circle(c, -7, -8, 3.5); circle(c, 7, -8, 3.5);
    c.fillStyle = '#333'; circle(c, -7, -8, 1.8); circle(c, 7, -8, 1.8);
  }
  c.restore();
}

const PX_PER_M = 60;
class SwimGame {
  constructor(stroke) {
    this.stroke = stroke; this.control = settings.swimControl;
    this.poolL = 140; this.poolR = W - 140;
    this.x = W / 2; this.targetX = W / 2; this.y = H - 120;
    this.dir = 1; this.left = false; this.right = false;
    this.lives = 3; this.inv = 0; this.dist = 0; this.speed = 160; this.elapsed = 0;
    this.obs = []; this.spawnT = 1.0; this.parts = [];
    this.anim = 0; this.ph = 0; this.shake = 0; this.flash = 0;
    this.lv = 1; this.lvFlash = 0;
    this.cd = new Countdown(); this.over = false; this.overT = 0; this.finished = false;
  }
  keyDown(k) {
    if (this.control === 'switch2') {
      if (k === 'ArrowLeft' || k === ' ' || k === 'Spacebar') { this.left = true; return true; }
      if (k === 'ArrowRight' || k === 'Enter') { this.right = true; return true; }
    } else if (this.control === 'switch1') {
      if (k === 'ArrowLeft') { this.dir = -1; return true; }
      if (k === 'ArrowRight') { this.dir = 1; return true; }
    } else {
      if (k === 'ArrowLeft') { this.left = true; return true; }
      if (k === 'ArrowRight') { this.right = true; return true; }
    }
    return false;
  }
  keyUp(k) {
    const sw2 = this.control === 'switch2';
    if (k === 'ArrowLeft' || (sw2 && (k === ' ' || k === 'Spacebar'))) this.left = false;
    if (k === 'ArrowRight' || (sw2 && k === 'Enter')) this.right = false;
  }
  onSwitch() {
    if (this.control === 'switch1' && !this.over) { this.dir *= -1; SFX.move(); }
  }
  pointerMove(p) { if (this.control === 'mouse') this.targetX = p.x; }
  pointerDown(p) { if (this.control === 'mouse') this.targetX = p.x; }

  spawn() {
    const types = ['ball', 'ring', 'board', 'jelly'];
    const type = types[Math.floor(Math.random() * types.length)];
    const r = { ball: 24, ring: 28, board: 26, jelly: 22 }[type];
    this.obs.push({
      type, r, x: rand(this.poolL + r + 6, this.poolR - r - 6), y: -50,
      vy: rand(0, 40), vx: type === 'jelly' ? rand(-50, 50) : 0,
      rot: rand(0, TAU), spin: type === 'board' ? 0 : rand(-2, 2), hit: false,
    });
  }
  onHit(o) {
    this.lives--; this.inv = 1.6; this.shake = 0.35; this.flash = 0.3;
    SFX.hit();
    o.vx = (o.x >= this.x ? 1 : -1) * 260;
    for (let i = 0; i < 14; i++) this.parts.push({ x: this.x, y: this.y, vx: rand(-160, 160), vy: rand(-160, 160), life: 0.5, max: 0.5, r: rand(3, 8) });
    if (this.lives <= 0) { this.over = true; this.overT = 1.4; SFX.over(); }
  }
  update(dt) {
    this.anim += dt; this.cd.update(dt);
    if (this.shake > 0) this.shake -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.lvFlash > 0) this.lvFlash -= dt;
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.cd.running) return;
    if (this.over) {
      this.overT -= dt;
      if (this.overT <= 0 && !this.finished) { this.finished = true; this.finish(); }
      return;
    }
    this.elapsed += dt;
    this.speed = Math.min(520, 160 + this.elapsed * 5);
    const lv = Math.floor((this.speed - 160) / 60) + 1;
    if (lv !== this.lv) { this.lv = lv; this.lvFlash = 1.5; SFX.move(); }
    this.dist += this.speed * dt / PX_PER_M;
    this.ph += dt * (3 + this.speed / 150);

    // うごき
    const minX = this.poolL + 28, maxX = this.poolR - 28;
    if (this.left || this.right) {
      this.x += ((this.right ? 1 : 0) - (this.left ? 1 : 0)) * 400 * dt; this.targetX = this.x;
    } else if (this.control === 'mouse') {
      const d = this.targetX - this.x, st = 950 * dt; this.x += clamp(d, -st, st);
    } else if (this.control === 'switch1') {
      this.x += this.dir * 270 * dt;
      if (this.x <= minX) this.dir = 1;
      if (this.x >= maxX) this.dir = -1;
    }
    this.x = clamp(this.x, minX, maxX);

    // じゃまもの
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawn();
      if (this.elapsed > 35 && Math.random() < 0.3) this.spawn();
      this.spawnT = Math.max(0.45, 1.2 - this.elapsed * 0.01) * rand(0.75, 1.25);
    }
    for (const o of this.obs) {
      o.y += (this.speed + o.vy) * dt; o.x += o.vx * dt; o.rot += o.spin * dt;
      if (o.x < this.poolL + o.r) { o.x = this.poolL + o.r; o.vx = Math.abs(o.vx); }
      if (o.x > this.poolR - o.r) { o.x = this.poolR - o.r; o.vx = -Math.abs(o.vx); }
    }
    this.obs = this.obs.filter((o) => o.y < H + 80);

    // 水しぶき
    if (Math.random() < dt * 20) this.parts.push({ x: this.x + rand(-10, 10), y: this.y + 40, vx: rand(-20, 20), vy: this.speed * 0.6, life: 0.6, max: 0.6, r: rand(3, 7) });

    // あたりはんてい
    if (this.inv > 0) this.inv -= dt;
    else {
      for (const o of this.obs) {
        if (o.hit) continue;
        const dx = o.x - this.x, dy = o.y - this.y;
        if (dx * dx + dy * dy < (o.r + 20) ** 2) { o.hit = true; this.onHit(o); break; }
      }
    }
  }
  finish() {
    const m = Math.floor(this.dist);
    const best = store.get('swimBest', {}); const prev = best[this.stroke] || 0; const isNew = m > prev;
    if (isNew) { best[this.stroke] = m; store.set('swimBest', best); SFX.good(); }
    const st = STROKES[this.stroke];
    showResult('ゲームオーバー',
      `<p class="result-big">${m}<small> m</small></p>
       <p>${st.html}で ${m}メートル およげたよ!</p>
       ${isNew ? '<p class="result-new">🎉 しんきろく!</p>' : `<p class="result-sub">さいこうきろく ${prev} m</p>`}`,
      () => startSwim(this.stroke));
  }
  draw(c) {
    c.save();
    if (this.shake > 0) { const k = this.shake / 0.35 * 8; c.translate(rand(-k, k), rand(-k, k)); }
    const scroll = this.dist * PX_PER_M;
    // プールサイド
    c.fillStyle = '#dfe7ec'; c.fillRect(-20, -20, W + 40, H + 40);
    c.strokeStyle = '#c3cfd6'; c.lineWidth = 2;
    const off = scroll % 40;
    for (let y = off - 40; y < H + 40; y += 40) { seg(c, 0, y, this.poolL - 14, y); seg(c, this.poolR + 14, y, W, y); }
    c.fillStyle = '#fff'; c.fillRect(this.poolL - 14, -20, this.poolR - this.poolL + 28, H + 40);
    // 水
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#5fd0f2'); g.addColorStop(1, '#0f7fb3');
    c.fillStyle = g; c.fillRect(this.poolL, -20, this.poolR - this.poolL, H + 40);
    const laneW = (this.poolR - this.poolL) / 5;
    c.fillStyle = 'rgba(6,49,77,.22)';
    for (let i = 0; i < 5; i++) c.fillRect(this.poolL + laneW * (i + 0.5) - 5, -20, 10, H + 40);
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const y = ((i * 75 + scroll * 0.8) % (H + 75)) - 40;
      c.beginPath();
      for (let x = this.poolL; x <= this.poolR; x += 20) {
        const yy = y + Math.sin(x * 0.04 + i + this.anim * 2) * 6;
        if (x === this.poolL) c.moveTo(x, yy); else c.lineTo(x, yy);
      }
      c.stroke();
    }
    // 5mごとの線
    for (let m = Math.floor((this.dist - 3) / 5) * 5; m < this.dist + 10; m += 5) {
      if (m <= 0) continue;
      const y = this.y - (m - this.dist) * PX_PER_M;
      if (y < -20 || y > H + 20) continue;
      c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(this.poolL, y - 2, this.poolR - this.poolL, 4);
      label(c, m + 'm', this.poolR + 70, y, 26, '#0a4f7a', 'center', '#fff');
    }
    // コースロープ
    for (let i = 1; i < 5; i++) {
      const x = this.poolL + laneW * i;
      for (let j = -1; j < H / 22 + 2; j++) {
        const y = j * 22 + (scroll % 44) - 22;
        c.fillStyle = (j % 2 === 0) ? '#e0413a' : '#fafafa';
        circle(c, x, y, 7);
      }
    }
    for (const o of this.obs) drawObstacle(c, o);
    for (const p of this.parts) {
      c.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.8; c.fillStyle = '#fff'; circle(c, p.x, p.y, p.r);
    }
    c.globalAlpha = 1;
    const blink = this.inv > 0 && Math.floor(this.inv * 10) % 2 === 0;
    if (!blink) drawSwimmer(c, this.x, this.y, this.stroke, this.ph, 1.4);
    // スイッチ1こ:むきの矢印
    if (this.control === 'switch1' && !this.over) {
      const ax = this.x + this.dir * 62, ay = this.y - 10;
      c.fillStyle = '#ffc62b'; c.strokeStyle = '#0a4f7a'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(ax + this.dir * 20, ay); c.lineTo(ax - this.dir * 6, ay - 18); c.lineTo(ax - this.dir * 6, ay + 18); c.closePath();
      c.fill(); c.stroke();
    }
    c.restore();
    if (this.flash > 0) { c.fillStyle = `rgba(224,65,58,${this.flash})`; c.fillRect(0, 0, W, H); }

    // HUD
    panel(c, 14, 14, 180, 60);
    for (let i = 0; i < 3; i++) drawHeart(c, 50 + i * 54, 46, 40, i < this.lives);
    panel(c, W / 2 - 150, 12, 300, 70);
    label(c, `${Math.floor(this.dist)} m`, W / 2, 48, 50, '#fff');
    label(c, STROKES[this.stroke].name, 70, H - 70, 22, '#0a4f7a', 'center', '#fff');
    label(c, `スピード ${this.lv}`, 70, H - 36, 20, '#e0413a', 'center', '#fff');
    if (this.lvFlash > 0 && this.lv > 1) label(c, 'スピードアップ!', W / 2, 130, 40, '#ffc62b');
    if (this.cd.t > 0) {
      const hint = { mouse: 'マウスや ゆびで ひだり・みぎに うごかそう', switch1: 'スイッチを おすと むきが かわるよ', switch2: 'ひだりスイッチ・みぎスイッチで うごこう' }[this.control];
      label(c, hint, W / 2, H - 36, 28, '#fff');
    }
    this.cd.draw(c);
    if (this.over) label(c, 'ゲームオーバー', W / 2, H / 2, 72, '#ffc62b');
  }
}

/* ==========================================================
   ゲーム② 潜水ゲーム
   ========================================================== */
const DIVE_VALUES = [5, 8, 10, 12, 15, 18, 20, 22];
const DIVE_COLORS = ['#e0413a', '#f28a1c', '#e8b600', '#2e9e4f', '#1e9fd9', '#3f5bc0', '#8e3fc0', '#e0407a'];
const POOL_L = 90, POOL_R = 890, DIVE_PX = (POOL_R - POOL_L) / 25;
const DIVER_LEN = 2.4; // 足がかべにある時の 手の先の位置(m)

function drawDiver(c, hx, y, ph, moving) {
  c.save(); c.translate(hx, y); c.lineCap = 'round';
  const k = moving ? Math.sin(ph * 7) * 8 : Math.sin(ph * 2) * 2;
  c.strokeStyle = SKIN; c.lineWidth = 9;
  seg(c, -50, 0, -64, k * 0.5); seg(c, -64, k * 0.5, -76, k);
  c.fillStyle = '#1e6fd9'; c.beginPath(); c.ellipse(-80, k, 8, 4, 0, 0, TAU); c.fill();
  c.fillStyle = '#e0407a'; oval(c, -38, 0, 16, 10);
  c.lineWidth = 7; seg(c, -26, -7, -2, -5); seg(c, -26, -4, 0, -2);
  c.fillStyle = '#ffc62b'; circle(c, -22, 4, 9);
  c.fillStyle = '#0a4f7a'; c.fillRect(-18, 2, 6, 4);
  c.restore();
}

class DiveGame {
  constructor() {
    this.phase = 'ready'; this.angle = rand(0, TAU); this.w = 0; this.spinT = 0; this.lastSeg = -1;
    this.target = 0; this.t = 0; this.pos = DIVER_LEN; this.speed = 2.0;
    this.level = settings.diveLevel; this.anim = 0; this.bubbles = []; this.cd = null;
    this.hitWall = false; this.finished = false;
  }
  segAt() {
    const sg = TAU / DIVE_VALUES.length;
    let rel = (-Math.PI / 2 - this.angle) % TAU; if (rel < 0) rel += TAU;
    return Math.floor(rel / sg) % DIVE_VALUES.length;
  }
  onSwitch() {
    if (this.phase === 'ready') { this.phase = 'spin'; this.w = 13; this.spinT = 0; SFX.select(); }
    else if (this.phase === 'spin' && this.spinT > 0.5) { this.phase = 'stopping'; SFX.select(); }
    else if (this.phase === 'dive') this.stop(false);
  }
  stop(wall) { this.phase = 'stopped'; this.t = 0; this.hitWall = wall; wall ? SFX.hit() : SFX.move(); }
  update(dt) {
    this.anim += dt;
    if (this.phase === 'spin' || this.phase === 'stopping') {
      this.spinT += dt;
      if (this.phase === 'stopping') {
        this.w *= Math.exp(-1.5 * dt);
        if (this.w < 1.2) this.w = Math.max(0, this.w - 0.9 * dt);
      }
      this.angle += this.w * dt;
      const s = this.segAt(); if (s !== this.lastSeg) { this.lastSeg = s; SFX.tick(); }
      if (this.phase === 'stopping' && this.w <= 0) { this.target = DIVE_VALUES[this.segAt()]; this.phase = 'show'; this.t = 0; SFX.good(); }
    } else if (this.phase === 'show') {
      this.t += dt; if (this.t > 2.4) { this.phase = 'count'; this.cd = new Countdown(); }
    } else if (this.phase === 'count') {
      this.cd.update(dt); if (!this.cd.running) this.phase = 'dive';
    } else if (this.phase === 'dive') {
      this.cd.update(dt);
      this.pos += this.speed * dt;
      if (this.pos >= 25) { this.pos = 25; this.stop(true); }
      if (Math.random() < dt * 8) {
        const hx = POOL_L + this.pos * DIVE_PX;
        this.bubbles.push({ x: hx - 22, y: 372, r: rand(3, 7), vy: rand(40, 80), ph: rand(0, TAU) });
      }
    } else if (this.phase === 'stopped') {
      this.t += dt; if (this.t > 1.8 && !this.finished) { this.finished = true; this.finish(); }
    }
    for (const b of this.bubbles) { b.y -= b.vy * dt; b.x += Math.sin(this.anim * 4 + b.ph) * 0.5; }
    this.bubbles = this.bubbles.filter((b) => b.y > 176);
  }
  finish() {
    const d = Math.round(this.pos * 10) / 10;
    const diff = Math.round(Math.abs(d - this.target) * 10) / 10;
    let stars, word;
    if (diff <= 0.3) { stars = 3; word = 'ぴったり!'; }
    else if (diff <= 1.0) { stars = 2; word = 'すごい!'; }
    else if (diff <= 2.5) { stars = 1; word = 'おしい!'; }
    else { stars = 0; word = 'もうすこし!'; }
    const detail = diff === 0 ? 'ちょうど ぴったり!' : (d < this.target ? `めあてまで あと ${diff.toFixed(1)} m` : `${diff.toFixed(1)} m いきすぎ`);
    showResult(word,
      `<p class="result-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>
       <p>めあて <b>${this.target} m</b> / きろく <b>${d.toFixed(1)} m</b></p>
       <p class="result-sub">${detail}${this.hitWall ? '(かべに ついちゃった)' : ''}</p>`,
      startDive);
    if (stars >= 1) SFX.good();
  }
  draw(c) {
    if (['ready', 'spin', 'stopping', 'show'].includes(this.phase)) this.drawRoulette(c);
    else this.drawPool(c);
  }
  drawRoulette(c) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1e9fd9'); g.addColorStop(1, '#06314d');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) {
      const x = (i * 71 + 40) % W, y = H - ((this.anim * 40 + i * 57) % (H + 40));
      c.fillStyle = 'rgba(255,255,255,.18)'; circle(c, x, y, 4 + (i % 4) * 2);
    }
    const cx = W / 2, cy = 340, R = 200, n = DIVE_VALUES.length, sg = TAU / n;
    c.fillStyle = 'rgba(0,0,0,.25)'; circle(c, cx + 6, cy + 10, R + 12);
    c.fillStyle = '#fff'; circle(c, cx, cy, R + 10);
    for (let i = 0; i < n; i++) {
      const a0 = this.angle + i * sg;
      c.fillStyle = DIVE_COLORS[i];
      c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a0, a0 + sg); c.closePath(); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke();
      const mid = a0 + sg / 2;
      label(c, DIVE_VALUES[i] + 'm', cx + Math.cos(mid) * R * 0.66, cy + Math.sin(mid) * R * 0.66, 34, '#fff', 'center', 'rgba(0,0,0,.45)');
    }
    if (this.phase === 'show' && Math.floor(this.t * 6) % 2 === 0) {
      const a0 = this.angle + this.segAt() * sg;
      c.strokeStyle = '#ffc62b'; c.lineWidth = 10;
      c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a0, a0 + sg); c.closePath(); c.stroke();
    }
    c.fillStyle = '#fff'; circle(c, cx, cy, 30);
    c.fillStyle = '#0a4f7a'; circle(c, cx, cy, 14);
    c.fillStyle = '#ffc62b'; c.strokeStyle = '#06314d'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx - 24, cy - R - 34); c.lineTo(cx + 24, cy - R - 34); c.lineTo(cx, cy - R + 14); c.closePath(); c.fill(); c.stroke();
    const msg = { ready: 'スイッチで ルーレットを まわそう!', spin: 'スイッチで とめよう!', stopping: 'なにが でるかな…', show: `めざせ ${this.target} m!` }[this.phase];
    label(c, msg, cx, 56, this.phase === 'show' ? 54 : 36, this.phase === 'show' ? '#ffc62b' : '#fff');
    label(c, `レベル${this.level}`, 80, H - 32, 22);
  }
  drawPool(c) {
    const S = 170, F = 540;
    const sky = c.createLinearGradient(0, 0, 0, S); sky.addColorStop(0, '#b3e5fc'); sky.addColorStop(1, '#e6f7fd');
    c.fillStyle = sky; c.fillRect(0, 0, W, S);
    const g = c.createLinearGradient(0, S, 0, F); g.addColorStop(0, '#5fd0f2'); g.addColorStop(1, '#0a5f94');
    c.fillStyle = g; c.fillRect(POOL_L, S, POOL_R - POOL_L, F - S);
    // 光のゆらぎ
    c.fillStyle = 'rgba(255,255,255,.08)';
    for (let i = 0; i < 6; i++) {
      const x = POOL_L + ((i * 170 + this.anim * 25) % (POOL_R - POOL_L));
      c.beginPath(); c.moveTo(x, S); c.lineTo(x + 40, S); c.lineTo(x - 40, F); c.lineTo(x - 90, F); c.closePath(); c.fill();
    }
    // そこ
    c.fillStyle = '#9fdcf2'; c.fillRect(POOL_L, F, POOL_R - POOL_L, H - F);
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1;
    for (let x = POOL_L; x <= POOL_R; x += DIVE_PX) seg(c, x, F, x, H);
    // かべ
    c.fillStyle = '#cfd8dc'; c.fillRect(0, S - 16, POOL_L, H); c.fillRect(POOL_R, S - 16, W - POOL_R, H);
    c.fillStyle = '#eef3f5'; c.fillRect(0, S - 22, POOL_L, 8); c.fillRect(POOL_R, S - 22, W - POOL_R, 8);
    // 水面
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 3; c.beginPath();
    for (let x = POOL_L; x <= POOL_R; x += 10) { const y = S + Math.sin(x * 0.05 + this.anim * 3) * 3; if (x === POOL_L) c.moveTo(x, y); else c.lineTo(x, y); }
    c.stroke();
    for (let x = POOL_L + 9, i = 0; x < POOL_R; x += 18, i++) { c.fillStyle = i % 2 ? '#fafafa' : '#e0413a'; circle(c, x, S + 6, 6); }

    // めもり
    const lv = this.phase === 'stopped' ? 1 : this.level;
    for (let m = 0; m <= 25; m++) {
      const big = m % 5 === 0;
      if (lv === 3 && m !== 0) continue;
      if (lv === 2 && !big) continue;
      const x = POOL_L + m * DIVE_PX;
      c.fillStyle = big ? '#06314d' : 'rgba(6,49,77,.55)';
      c.fillRect(x - (big ? 2 : 1), F - (big ? 36 : 16), big ? 4 : 2, big ? 36 : 16);
      if (big) label(c, m + 'm', x, F + 30, 22, '#06314d', 'center', '#fff');
    }
    // めあての はた
    if ((this.level === 1 || this.phase === 'stopped') && this.target) {
      const x = POOL_L + this.target * DIVE_PX;
      c.save(); c.setLineDash([10, 8]); c.strokeStyle = '#e0413a'; c.lineWidth = 3; seg(c, x, S, x, F); c.restore();
      c.strokeStyle = '#5d4037'; c.lineWidth = 4; seg(c, x, S - 70, x, S);
      c.fillStyle = '#e0413a'; c.beginPath(); c.moveTo(x, S - 70); c.lineTo(x + 58, S - 56); c.lineTo(x, S - 42); c.closePath(); c.fill();
      label(c, this.target + 'm', x + 22, S - 56, 16, '#fff', 'center', 'rgba(0,0,0,.4)');
    }
    for (const b of this.bubbles) { c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2; c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.stroke(); }
    const hx = POOL_L + this.pos * DIVE_PX;
    drawDiver(c, hx, 380, this.anim, this.phase === 'dive');
    if (this.phase === 'stopped') {
      c.strokeStyle = '#ffc62b'; c.lineWidth = 4; seg(c, hx, S, hx, F);
      label(c, `きろく ${this.pos.toFixed(1)} m`, clamp(hx, 160, W - 160), F - 60, 30, '#ffc62b');
    }
    // HUD
    panel(c, W / 2 - 170, 12, 340, 64);
    label(c, `めあて ${this.target} m`, W / 2, 44, 40, '#ffc62b');
    label(c, `レベル${this.level}`, 70, 40, 22, '#0a4f7a', 'center', '#fff');
    if (this.phase === 'dive') {
      if (this.level === 1) label(c, `いま ${this.pos.toFixed(1)} m`, W / 2, 108, 30, '#0a4f7a', 'center', '#fff');
      label(c, 'ここだ!と おもったら スイッチ!', W / 2, 220, 30, '#fff');
    }
    if (this.cd) this.cd.draw(c);
  }
}

/* ==========================================================
   ゲーム③ 釣りゲーム
   ========================================================== */
const FISH_TYPES = [
  { name: 'アジ',     pts: 10,  w: 40, zone: 0.30, dur: 2.6, len: 56,  body: '#90a4ae', belly: '#eceff1' },
  { name: 'サバ',     pts: 30,  w: 28, zone: 0.22, dur: 2.2, len: 76,  body: '#3f7cc0', belly: '#e3f2fd', stripe: true },
  { name: 'タイ',     pts: 50,  w: 18, zone: 0.16, dur: 1.9, len: 92,  body: '#e57373', belly: '#ffcdd2' },
  { name: 'マグロ',   pts: 100, w: 8,  zone: 0.11, dur: 1.5, len: 140, body: '#263859', belly: '#cfd8dc', big: true },
  { name: 'ながぐつ', pts: 1,   w: 6,  zone: 0.30, dur: 2.6, len: 50,  boot: true },
];
const FISH_LEVEL = { easy: { zone: 1.6, dur: 1.3 }, normal: { zone: 1, dur: 1 }, hard: { zone: 0.7, dur: 0.85 } };
const CASTS = 5;
const SEA = 230, BX = 640, HOOK_Y = 430;
const TIP = { x: 420, y: 80 }, HAND = { x: 262, y: 134 };

function pickFish() {
  const tot = FISH_TYPES.reduce((s, f) => s + f.w, 0);
  let r = Math.random() * tot;
  for (const f of FISH_TYPES) { r -= f.w; if (r < 0) return f; }
  return FISH_TYPES[0];
}
// face=1 で右むき。sil=true でかげ(シルエット)
function drawFish(c, cx, cy, f, face, ph, sil, alpha = 1) {
  c.save(); c.globalAlpha = alpha; c.translate(cx, cy); c.scale(face, 1);
  const L = f.len, hh = L * 0.38, shadow = 'rgba(6,30,55,.6)';
  if (f.boot) {
    c.fillStyle = sil ? shadow : '#5d4037';
    rr(c, -14, -26, 22, 36, 4); c.fill(); rr(c, -14, 0, 40, 16, 6); c.fill();
    if (!sil) { c.fillStyle = '#8d6e63'; c.fillRect(-14, -26, 22, 6); }
    c.restore(); return;
  }
  const tw = Math.sin(ph * 8) * 0.25;
  c.fillStyle = sil ? shadow : f.body;
  c.beginPath(); c.moveTo(-L * 0.38, 0); c.lineTo(-L * 0.62, -hh * 0.55 + tw * hh); c.lineTo(-L * 0.62, hh * 0.55 + tw * hh); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(-L * 0.1, -hh * 0.4); c.lineTo(L * 0.05, -hh * 0.75); c.lineTo(L * 0.15, -hh * 0.4); c.closePath(); c.fill();
  oval(c, 0, 0, L * 0.45, hh / 2);
  if (!sil) {
    c.fillStyle = f.belly; c.beginPath(); c.ellipse(0, hh * 0.1, L * 0.4, hh * 0.3, 0, 0, Math.PI); c.fill();
    if (f.stripe) {
      c.strokeStyle = 'rgba(10,30,60,.55)'; c.lineWidth = 2;
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * L * 0.08, -hh * 0.42); c.quadraticCurveTo(i * L * 0.08 + 6, -hh * 0.2, i * L * 0.08, -hh * 0.05); c.stroke(); }
    }
    c.fillStyle = '#fff'; circle(c, L * 0.28, -hh * 0.1, Math.max(3, L * 0.05));
    c.fillStyle = '#111'; circle(c, L * 0.29, -hh * 0.1, Math.max(1.5, L * 0.025));
  }
  c.restore();
}
function drawBobber(c, x, y, inWater, s = 1) {
  const draw = () => {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.strokeStyle = '#333'; c.lineWidth = 2; seg(c, 0, -18, 0, -8);
    c.fillStyle = '#fff'; circle(c, 0, 0, 11);
    c.fillStyle = '#e0413a'; c.beginPath(); c.arc(0, 0, 11, Math.PI, 0); c.closePath(); c.fill();
    c.strokeStyle = '#333'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 11, 0, TAU); c.stroke();
    c.restore();
  };
  if (!inWater) { draw(); return; }
  c.save(); c.beginPath(); c.rect(0, 0, W, SEA + 1); c.clip(); draw(); c.restore();
  c.save(); c.beginPath(); c.rect(0, SEA + 1, W, H); c.clip(); c.globalAlpha = 0.35; draw(); c.restore();
}

class FishGame {
  constructor() {
    this.phase = 'ready'; this.t = 0; this.casts = 0; this.score = 0; this.catches = [];
    this.anim = 0; this.fish = null; this.p = 0; this.z0 = 0.5; this.zw = 0.2; this.nibble = 0;
    this.lv = FISH_LEVEL[settings.fishLevel] || FISH_LEVEL.normal;
    this.ripples = []; this.finished = false; this.failKind = '';
    this.amb = Array.from({ length: 5 }, () => ({ x: rand(0, W), y: rand(300, 530), v: rand(30, 70) * (Math.random() < 0.5 ? -1 : 1), len: rand(24, 36), ph: rand(0, TAU) }));
    this.clouds = [{ x: 120, y: 60, s: 1 }, { x: 480, y: 40, s: 0.8 }, { x: 760, y: 110, s: 0.7 }];
  }
  onSwitch() {
    if (this.phase === 'ready') { this.phase = 'cast'; this.t = 0; SFX.select(); }
    else if (this.phase === 'wait') this.fail('early');
    else if (this.phase === 'bite') {
      if (this.p < this.z0) this.fail('early');
      else if (this.p <= this.z0 + this.zw) this.success();
      else this.fail('late');
    }
  }
  startWait() {
    this.phase = 'wait'; this.t = 0; this.fish = pickFish(); this.waitDur = rand(2.5, 5.5);
    const side = Math.random() < 0.5 ? -1 : 1;
    this.fx0 = BX + side * 560; this.fx = this.fx0; this.face = -side;
    this.zw = Math.min(0.5, this.fish.zone * this.lv.zone);
    this.z0 = rand(0.35, Math.max(0.36, 0.9 - this.zw));
    this.dur = this.fish.dur * this.lv.dur; this.p = 0; this.nibble = 0;
  }
  success() { this.phase = 'catch'; this.t = 0; this.score += this.fish.pts; this.catches.push(this.fish); SFX.good(); }
  fail(kind) {
    this.phase = 'fail'; this.t = 0; this.failKind = kind;
    this.fleeDir = this.fx0 < BX ? -1 : 1; this.face = this.fleeDir; SFX.bad();
  }
  next() {
    this.casts++;
    if (this.casts >= CASTS) { this.phase = 'end'; this.t = 0; }
    else { this.phase = 'ready'; this.fish = null; }
  }
  tipPos() {
    let y = TIP.y;
    if (this.phase === 'bite') y += 18 + Math.sin(this.anim * 30) * 3;
    if (this.phase === 'catch') y += 22 * (1 - clamp(this.t / 0.8, 0, 1));
    return { x: TIP.x, y };
  }
  bobberPos(tip) {
    if (this.phase === 'ready' || this.phase === 'end') return { x: tip.x + 4, y: tip.y + 70, inWater: false };
    if (this.phase === 'cast') {
      const k = clamp(this.t / 0.8, 0, 1);
      return { x: lerp(tip.x, BX, k), y: lerp(tip.y + 60, SEA, k) - Math.sin(Math.PI * k) * 110, inWater: false };
    }
    let y = SEA - 2 + Math.sin(this.anim * 2.2) * 3;
    if (this.phase === 'wait' && this.nibble > 0) y += 7 * Math.sin((0.25 - this.nibble) / 0.25 * Math.PI);
    if (this.phase === 'bite') y = SEA + 16 + Math.sin(this.anim * 25) * 3;
    return { x: BX, y, inWater: true };
  }
  update(dt) {
    this.anim += dt;
    for (const a of this.amb) { a.x += a.v * dt; if (a.x < -60) a.x = W + 60; if (a.x > W + 60) a.x = -60; }
    for (const cl of this.clouds) { cl.x += 10 * cl.s * dt; if (cl.x > W + 100) cl.x = -100; }
    for (const r of this.ripples) { r.r += 40 * dt; r.life -= dt * 0.8; }
    this.ripples = this.ripples.filter((r) => r.life > 0);
    switch (this.phase) {
      case 'cast':
        this.t += dt;
        if (this.t >= 0.8) { this.ripples.push({ x: BX, r: 6, life: 1 }); SFX.splash(); this.startWait(); }
        break;
      case 'wait': {
        this.t += dt;
        const k = clamp(this.t / this.waitDur, 0, 1);
        this.fx = this.fx0 + (BX - this.fx0) * (1 - Math.pow(1 - k, 2));
        if (this.nibble > 0) this.nibble -= dt;
        else if (this.t > this.waitDur - 1.6 && Math.random() < dt * 2.5) { this.nibble = 0.25; SFX.nibble(); }
        if (this.t >= this.waitDur) { this.phase = 'bite'; this.p = 0; SFX.bite(); this.ripples.push({ x: BX, r: 6, life: 1 }, { x: BX, r: 20, life: 0.8 }); }
        break;
      }
      case 'bite':
        this.p += dt / this.dur;
        if (this.p >= 1) { this.p = 1; this.fail('late'); }
        break;
      case 'catch':
        this.t += dt; if (this.t > 2.8) this.next();
        break;
      case 'fail':
        this.t += dt; this.fx += this.fleeDir * 420 * dt; if (this.t > 2.0) this.next();
        break;
      case 'end':
        this.t += dt; if (this.t > 0.6 && !this.finished) { this.finished = true; this.finish(); }
        break;
    }
  }
  finish() {
    const best = store.get('fishBest', 0); const isNew = this.score > best;
    if (isNew) store.set('fishBest', this.score);
    const counts = {}; this.catches.forEach((f) => { counts[f.name] = (counts[f.name] || 0) + 1; });
    const list = Object.keys(counts).map((n) => `<li>${n} × ${counts[n]}</li>`).join('') || '<li>つれなかった… つぎは がんばろう!</li>';
    const fishCount = this.catches.filter((f) => !f.boot).length;
    showResult('けっか',
      `<p class="result-big">${this.score}<small> てん</small></p>
       <p>${fishCount}ひき つれたよ!</p>
       <ul class="catch-list">${list}</ul>
       ${isNew ? '<p class="result-new">🎉 しんきろく!</p>' : `<p class="result-sub">さいこうきろく ${best} てん</p>`}`,
      startFish);
    SFX.good();
  }
  draw(c) {
    const tip = this.tipPos();
    // そら
    const sky = c.createLinearGradient(0, 0, 0, SEA); sky.addColorStop(0, '#5fd0f2'); sky.addColorStop(1, '#e6f7fd');
    c.fillStyle = sky; c.fillRect(0, 0, W, SEA);
    c.fillStyle = '#fff59d'; circle(c, 700, 70, 36);
    c.fillStyle = 'rgba(255,255,255,.92)';
    for (const cl of this.clouds) { const s = cl.s; oval(c, cl.x, cl.y, 50 * s, 18 * s); oval(c, cl.x + 30 * s, cl.y - 10 * s, 36 * s, 20 * s); oval(c, cl.x - 30 * s, cl.y - 4 * s, 30 * s, 14 * s); }
    c.fillStyle = '#6fbf73'; c.beginPath(); c.moveTo(760, SEA); c.quadraticCurveTo(850, SEA - 60, 940, SEA); c.closePath(); c.fill();
    // うみ
    const sea = c.createLinearGradient(0, SEA, 0, H); sea.addColorStop(0, '#2fb4e0'); sea.addColorStop(1, '#06314d');
    c.fillStyle = sea; c.fillRect(0, SEA, W, H - SEA);
    c.fillStyle = '#d7b98e'; c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 40) c.lineTo(x, 568 + Math.sin(x * 0.02) * 10);
    c.lineTo(W, H); c.closePath(); c.fill();
    c.strokeStyle = '#2e9e4f'; c.lineWidth = 6; c.lineCap = 'round';
    [80, 110, 820, 860, 890].forEach((x, i) => {
      c.beginPath(); c.moveTo(x, 575);
      for (let j = 1; j <= 5; j++) c.lineTo(x + Math.sin(this.anim * 1.5 + j + i) * 8, 575 - j * 16);
      c.stroke();
    });
    for (const a of this.amb) drawFish(c, a.x, a.y, { len: a.len, body: '#ffffff', belly: '#ffffff' }, Math.sign(a.v), this.anim + a.ph, false, 0.3);
    // ねらいの魚(かげ)
    if (this.fish && (this.phase === 'wait' || this.phase === 'bite' || this.phase === 'fail')) {
      const wig = this.phase === 'bite' ? Math.sin(this.anim * 30) * 4 : 0;
      drawFish(c, this.fx - this.face * this.fish.len * 0.45, HOOK_Y + wig, this.fish, this.face, this.anim, true);
    }
    // 水面
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(0, SEA);
    for (let x = 0; x <= W; x += 16) c.lineTo(x, SEA + Math.sin(x * 0.04 + this.anim * 2) * 3);
    c.lineTo(W, SEA + 8); c.lineTo(0, SEA + 8); c.closePath(); c.fill();
    for (const r of this.ripples) { c.strokeStyle = `rgba(255,255,255,${r.life})`; c.lineWidth = 2; c.beginPath(); c.ellipse(r.x, SEA + 2, r.r, r.r * 0.25, 0, 0, TAU); c.stroke(); }
    // さんばし
    c.fillStyle = '#6d4c41'; [30, 150, 270].forEach((x) => c.fillRect(x, 200, 14, H - 200));
    c.fillStyle = '#8d6e63'; c.fillRect(0, 190, 310, 16);
    c.strokeStyle = '#6d4c41'; c.lineWidth = 2; for (let x = 40; x < 310; x += 40) seg(c, x, 190, x, 206);
    // ひと
    c.lineCap = 'round';
    c.strokeStyle = '#37474f'; c.lineWidth = 10; seg(c, 222, 190, 226, 152); seg(c, 240, 190, 236, 152);
    c.fillStyle = '#f28a1c'; rr(c, 212, 100, 36, 56, 10); c.fill();
    c.fillStyle = SKIN; circle(c, 230, 84, 16);
    c.fillStyle = '#ffc62b'; oval(c, 230, 72, 24, 7); c.beginPath(); c.arc(230, 70, 14, Math.PI, 0); c.fill();
    c.strokeStyle = SKIN; c.lineWidth = 7; seg(c, 240, 112, HAND.x, HAND.y);
    // さお
    c.strokeStyle = '#5d4037'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(HAND.x - 14, HAND.y + 14);
    c.quadraticCurveTo((HAND.x + tip.x) / 2, (HAND.y + tip.y) / 2 - 18 + (tip.y - TIP.y) * 0.8, tip.x, tip.y); c.stroke();
    // いと・うき・つれた魚
    c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 1.6;
    if (this.phase === 'catch') {
      const k = clamp(this.t / 0.8, 0, 1), e = 1 - Math.pow(1 - k, 3);
      const mx = lerp(BX, BX - 40, e) + (k >= 1 ? Math.sin(this.anim * 4) * 6 : 0), my = lerp(HOOK_Y, 130, e);
      seg(c, tip.x, tip.y, mx, my);
      c.save(); c.translate(mx, my); c.rotate(-Math.PI / 2 + Math.sin(this.anim * 8) * 0.15);
      drawFish(c, -this.fish.len * 0.45, 0, this.fish, 1, this.anim, false); c.restore();
    } else {
      const b = this.bobberPos(tip);
      c.beginPath(); c.moveTo(tip.x, tip.y); c.quadraticCurveTo((tip.x + b.x) / 2, (tip.y + b.y) / 2 + (b.inWater ? 30 : 10), b.x, b.y - 18); c.stroke();
      if (b.inWater) {
        c.strokeStyle = 'rgba(255,255,255,.5)'; seg(c, b.x, b.y + 8, b.x, HOOK_Y);
        c.strokeStyle = '#cfd8dc'; c.lineWidth = 2; c.beginPath(); c.arc(b.x - 5, HOOK_Y, 5, 0, Math.PI); c.stroke();
      }
      drawBobber(c, b.x, b.y, b.inWater);
    }
    // HUD
    panel(c, W - 264, H - 102, 250, 88);
    label(c, `とくてん ${this.score}`, W - 248, H - 76, 28, '#fff', 'left');
    label(c, 'のこり', W - 248, H - 38, 20, '#fff', 'left');
    const left = CASTS - this.casts;
    for (let i = 0; i < CASTS; i++) { c.fillStyle = i < left ? '#e0413a' : 'rgba(255,255,255,.3)'; circle(c, W - 168 + i * 28, H - 38, 10); }
    let msg = '';
    if (this.phase === 'ready') msg = 'スイッチで つりざおを なげよう!';
    else if (this.phase === 'wait') msg = 'うきが しずむまで まとう…';
    else if (this.phase === 'bite') msg = 'しずんだ! みどりで スイッチ!';
    if (msg) label(c, msg, W / 2, 36, 30, this.phase === 'bite' ? '#ffc62b' : '#fff');
    if (['wait', 'bite', 'fail'].includes(this.phase)) this.drawGauge(c);
    if (this.phase === 'catch' && this.t > 0.9) {
      const a = clamp((this.t - 0.9) / 0.3, 0, 1);
      c.save(); c.globalAlpha = a;
      c.fillStyle = 'rgba(255,255,255,.96)'; rr(c, W / 2 - 220, 290, 440, 200, 26); c.fill();
      c.strokeStyle = '#ffc62b'; c.lineWidth = 6; rr(c, W / 2 - 220, 290, 440, 200, 26); c.stroke();
      drawFish(c, W / 2 - 100, 400, this.fish, 1, this.anim, false);
      if (this.fish.big) label(c, 'おおもの!', W / 2, 320, 30, '#e0413a', 'center', '#fff');
      label(c, this.fish.boot ? 'ながぐつ…' : `${this.fish.name}!`, W / 2 + 90, 380, 40, '#0a4f7a', 'center', '#fff');
      label(c, `+${this.fish.pts} てん`, W / 2 + 90, 440, 36, '#e0413a', 'center', '#fff');
      c.restore();
    }
    if (this.phase === 'fail') {
      panel(c, W / 2 - 250, 280, 500, 100, 0.6);
      label(c, this.failKind === 'early' ? 'はやすぎ! にげちゃった…' : 'おそすぎ! にげちゃった…', W / 2, 330, 38, '#fff');
    }
  }
  drawGauge(c) {
    const gx = 290, gy = 530, gw = 380, gh = 30;
    panel(c, gx - 24, gy - 56, gw + 48, gh + 72, 0.55);
    label(c, 'ひきあげ ゲージ', gx + gw / 2, gy - 38, 18, '#fff');
    c.save(); rr(c, gx, gy, gw, gh, 10); c.clip();
    c.fillStyle = '#eceff1'; c.fillRect(gx, gy, gw, gh);
    const active = this.phase === 'bite' || (this.phase === 'fail' && this.p > 0);
    if (active) {
      c.fillStyle = '#ffe0b2'; c.fillRect(gx, gy, this.z0 * gw, gh);
      c.fillStyle = '#ef9a9a'; c.fillRect(gx + (this.z0 + this.zw) * gw, gy, (1 - this.z0 - this.zw) * gw, gh);
      c.fillStyle = '#2e9e4f'; c.fillRect(gx + this.z0 * gw, gy, this.zw * gw, gh);
    }
    c.restore();
    if (active) {
      label(c, 'ヒット', gx + (this.z0 + this.zw / 2) * gw, gy + gh / 2, 17, '#fff', 'center', 'rgba(0,0,0,.4)');
      const nx = gx + this.p * gw;
      c.fillStyle = '#06314d'; c.fillRect(nx - 2, gy - 6, 4, gh + 12);
      c.fillStyle = '#ffc62b'; c.strokeStyle = '#06314d'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(nx - 11, gy - 20); c.lineTo(nx + 11, gy - 20); c.lineTo(nx, gy - 6); c.closePath(); c.fill(); c.stroke();
    } else {
      label(c, 'うきが しずむのを まってね', gx + gw / 2, gy + gh / 2, 17, '#607d8b', 'center', null);
    }
    c.strokeStyle = '#fff'; c.lineWidth = 3; rr(c, gx, gy, gw, gh, 10); c.stroke();
  }
}

/* ==========================================================
   画面・入力・スキャン
   ========================================================== */
const canvas = $('#game-canvas');
const ctx = canvas.getContext('2d');
const overlay = $('#overlay');
let game = null, currentScreen = 'title', viewScale = 1;
let scanIndex = 0, scanTimer = 0, lastSwitch = 0, prevAnim = 0, retryFn = null;

function resize() {
  const r = $('#stage').getBoundingClientRect();
  if (!r.width || !r.height) return;
  const s = Math.min(r.width / W, r.height / H);
  const cw = Math.floor(W * s), ch = Math.floor(H * s);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  viewScale = s * dpr;
}
window.addEventListener('resize', () => { if (currentScreen === 'game') resize(); });

function showScreen(name) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
  currentScreen = name;
  if (name === 'game') resize();
  if (name === 'swimSelect') refreshBest();
  resetScan();
}
function overlayActive() { return overlay.classList.contains('active'); }
function showResult(title, html, retry) {
  $('#result-title').textContent = title;
  $('#result-body').innerHTML = html;
  retryFn = retry;
  overlay.classList.add('active');
  resetScan();
}
function hideResult() { overlay.classList.remove('active'); }
function quitToMenu() { hideResult(); game = null; showScreen('title'); }
function startGame(g) { hideResult(); game = g; showScreen('game'); }
function startSwim(stroke) { startGame(new SwimGame(stroke)); }
function startDive() { startGame(new DiveGame()); }
function startFish() { startGame(new FishGame()); }

function refreshBest() {
  const best = store.get('swimBest', {});
  $$('.stroke-btn').forEach((b) => { b.querySelector('.best').textContent = `さいこう ${best[b.dataset.stroke] || 0} m`; });
}

/* --- オートスキャン --- */
function scanContainer() {
  if (overlayActive()) return overlay;
  if (currentScreen !== 'game') return $('#screen-' + currentScreen);
  return null;
}
function scanItems() {
  const c = scanContainer();
  return c ? Array.from(c.querySelectorAll('.scan')).filter((el) => !el.disabled && el.offsetParent !== null) : [];
}
function updateScanFocus() {
  $$('.scan-focus').forEach((e) => e.classList.remove('scan-focus'));
  if (!settings.scan) return;
  const items = scanItems(); if (!items.length) return;
  scanIndex = ((scanIndex % items.length) + items.length) % items.length;
  const el = items[scanIndex];
  el.classList.add('scan-focus');
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function resetScan() { scanIndex = 0; scanTimer = 0; updateScanFocus(); }

/* --- スイッチ(1回おし) --- */
function switchPress() {
  const now = performance.now();
  if (now - lastSwitch < settings.debounce * 1000) return;
  lastSwitch = now;
  ensureAudio();
  const cont = scanContainer();
  if (cont) {
    if (settings.scan) { const items = scanItems(); if (items[scanIndex]) items[scanIndex].click(); }
    else if (document.activeElement && document.activeElement.tagName === 'BUTTON' && cont.contains(document.activeElement)) document.activeElement.click();
    return;
  }
  if (game && game.onSwitch) game.onSwitch();
}

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'Escape') {
    if (currentScreen === 'game' || overlayActive()) quitToMenu();
    else if (currentScreen !== 'title') showScreen('title');
    return;
  }
  const isSwitch = k === ' ' || k === 'Spacebar' || k === 'Enter';
  const isArrow = k === 'ArrowLeft' || k === 'ArrowRight';
  if (!isSwitch && !isArrow) return;
  e.preventDefault();
  if (e.repeat) return;
  ensureAudio();
  const cont = scanContainer();
  if (!cont && game && game.keyDown && game.keyDown(k)) return;
  if (isSwitch) { switchPress(); return; }
  if (cont && settings.scan) {
    scanIndex += k === 'ArrowRight' ? 1 : -1; scanTimer = 0; updateScanFocus(); SFX.tick();
  }
});
window.addEventListener('keyup', (e) => { if (game && game.keyUp) game.keyUp(e.key); });

function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
const stage = $('#stage');
stage.addEventListener('pointerdown', (e) => {
  e.preventDefault(); ensureAudio();
  if (!game || overlayActive()) return;
  if (game.pointerDown) game.pointerDown(toLogical(e));
  switchPress();
});
stage.addEventListener('pointermove', (e) => { if (game && game.pointerMove) game.pointerMove(toLogical(e)); });
document.addEventListener('pointerdown', ensureAudio);

/* --- ボタン --- */
$$('[data-go]').forEach((b) => b.addEventListener('click', () => { SFX.select(); showScreen(b.dataset.go); }));
$$('[data-action]').forEach((b) => b.addEventListener('click', () => { SFX.select(); if (b.dataset.action === 'dive') startDive(); else startFish(); }));
$$('.stroke-btn').forEach((b) => b.addEventListener('click', () => { SFX.select(); startSwim(b.dataset.stroke); }));
$('#btn-quit').addEventListener('click', quitToMenu);
$('#btn-retry').addEventListener('click', () => { SFX.select(); hideResult(); if (retryFn) retryFn(); });
$('#btn-menu').addEventListener('click', () => { SFX.select(); quitToMenu(); });

/* --- せってい --- */
function parseVal(v) { try { return JSON.parse(v); } catch (e) { return v; } }
function refreshOpts() {
  $$('.opts').forEach((g) => {
    const key = g.dataset.key;
    g.querySelectorAll('button').forEach((b) => b.classList.toggle('selected', settings[key] === parseVal(b.dataset.val)));
  });
}
$$('.opts').forEach((g) => {
  const key = g.dataset.key;
  g.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    settings[key] = parseVal(b.dataset.val);
    store.set('settings', settings);
    refreshOpts(); SFX.select();
    if (key === 'scan' || key === 'scanSpeed') { scanTimer = 0; updateScanFocus(); }
  }));
});
refreshOpts();

/* --- 泳法えらびの プレビュー --- */
function drawPreviews(dt) {
  prevAnim += dt;
  $$('.stroke-btn canvas').forEach((cv) => {
    const c = cv.getContext('2d'), w = cv.width, h = cv.height;
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5fd0f2'); g.addColorStop(1, '#0f7fb3');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const y = ((i * 45 + prevAnim * 60) % (h + 45)) - 20;
      c.beginPath();
      for (let x = 0; x <= w; x += 10) { const yy = y + Math.sin(x * 0.06 + i) * 4; if (x) c.lineTo(x, yy); else c.moveTo(x, yy); }
      c.stroke();
    }
    drawSwimmer(c, w / 2, h / 2 + 4, cv.dataset.stroke, prevAnim * 4, w / 110);
  });
}

/* --- メインループ --- */
let lastT = 0;
function loop(t) {
  const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000)); lastT = t;
  if (settings.scan && scanContainer()) {
    scanTimer += dt;
    if (scanTimer >= settings.scanSpeed) { scanTimer = 0; scanIndex++; updateScanFocus(); SFX.tick(); }
  }
  if (currentScreen === 'swimSelect') drawPreviews(dt);
  if (currentScreen === 'game' && game) {
    game.update(dt);
    ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    game.draw(ctx);
  }
  requestAnimationFrame(loop);
}
resetScan();
requestAnimationFrame(loop);
