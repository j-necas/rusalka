// Animals V13: the original approved drawing (V8) of every animal in motion – a port of the set's behavior.js
// (timing: the eyes choose a target before the head, three idle families with seeded timing, gestures, damped ears,
// fur and feathers), mouth.js (the mouth opens below the original smile line; the owl and the penguin open their
// beak) and natural.js (WebGL: one original texture bent over a fine mesh with head and soft-part weights; the paws
// and the lower outline stay fixed; the lids close over a clean plate inside a small eye mask). sample() must match
// the set's behavior.js exactly (tests/natural.test.mjs). Coordinates are px of the 512 px portrait. In the app the
// frame is drawn into the animal's canvas with the margin OKRAJ around it (the canvas is larger than the picture).
import { RIG, CASTI, OBLASTI } from '../animals/v13.js';

export const DRUHY = Object.keys(RIG);
export const GESTA = ['turn', 'listen', 'curious', 'wave', 'happy', 'pet', 'eyes', 'blink'];
/** margin around the drawing as a share of its size: the canvas is (1 + 2 OKRAJ)× larger, so turned ears aren't cut off */
export const OKRAJ = 0.08;

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { v = clamp((v - a) / (b - a)); return v * v * (3 - 2 * v); };

// ---------------------------------------------------------------- timing (behavior.js)
const PROFILY = {
  kralik: { delay: 0.14, headSpeed: 0.52, eyeSpeed: 0.090, blinkSpeed: 0.9, tempo: 1 },
  pejsek: { delay: 0.18, headSpeed: 0.64, eyeSpeed: 0.10, blinkSpeed: 1.05, tempo: 1.04 },
  sova: { delay: 0.12, headSpeed: 0.34, eyeSpeed: 0.075, blinkSpeed: 0.9, tempo: 1.08 },
  lenochod: { delay: 0.22, headSpeed: 0.95, eyeSpeed: 0.14, blinkSpeed: 1.35, tempo: 0.75 },
  liska: { delay: 0.13, headSpeed: 0.43, eyeSpeed: 0.085, blinkSpeed: 0.95, tempo: 1.1, perk: true },
  jezek: { delay: 0.17, headSpeed: 0.55, eyeSpeed: 0.1, blinkSpeed: 1.1, tempo: 0.95 },
  kocka: { delay: 0.14, headSpeed: 0.48, eyeSpeed: 0.09, blinkSpeed: 1, tempo: 1.05, perk: true },
  'panda-cervena': { delay: 0.15, headSpeed: 0.55, eyeSpeed: 0.095, blinkSpeed: 1.05, tempo: 1 },
  vydra: { delay: 0.13, headSpeed: 0.48, eyeSpeed: 0.09, blinkSpeed: 1, tempo: 1.05, idleSmile: 0.14 },
  tucnak: { delay: 0.16, headSpeed: 0.58, eyeSpeed: 0.1, blinkSpeed: 1.05, tempo: 0.95 },
  kapybara: { delay: 0.22, headSpeed: 0.85, eyeSpeed: 0.12, blinkSpeed: 1.2, tempo: 0.8 },
  axolotl: { delay: 0.18, headSpeed: 0.7, eyeSpeed: 0.11, blinkSpeed: 1.15, tempo: 0.9 },
  veverka: { delay: 0.12, headSpeed: 0.4, eyeSpeed: 0.08, blinkSpeed: 0.9, tempo: 1.12, perk: true },
  myval: { delay: 0.14, headSpeed: 0.5, eyeSpeed: 0.09, blinkSpeed: 1, tempo: 1.04, perk: true },
  medvidek: { delay: 0.18, headSpeed: 0.7, eyeSpeed: 0.1, blinkSpeed: 1.1, tempo: 0.9, idleSmile: 0.12 },
  koala: { delay: 0.2, headSpeed: 0.78, eyeSpeed: 0.12, blinkSpeed: 1.2, tempo: 0.85 },
  zabka: { delay: 0.13, headSpeed: 0.48, eyeSpeed: 0.08, blinkSpeed: 1, tempo: 1.05 },
  ovecka: { delay: 0.18, headSpeed: 0.7, eyeSpeed: 0.11, blinkSpeed: 1.15, tempo: 0.9 },
};
const DELKY = { alive: 14, 'alive-b': 13.2, 'alive-c': 14.4, turn: 6.8, listen: 5.2, curious: 5.2, wave: 4.6, happy: 5, pet: 5.6, eyes: 4.6, blink: 1.4, still: 0 };

function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const random = (id, seed, n) => (hash(id + ':' + seed + ':' + n) % 100000) / 100000;
/** eye (or head) target over time: events [time, x, y, head?]; the head follows with a delay and less amplitude */
function move(events, t, speed, delay = 0, head = false) {
  let old = [0, 0];
  for (const e of events) {
    if (head && e[3] === false) continue;
    const at = e[0] + delay;
    if (t < at) return old;
    const next = [e[1] * (head ? 0.82 : 1), e[2] * (head ? 0.40 : 1)];
    if (t < at + speed) { const f = ease((t - at) / speed); return [mix(old[0], next[0], f), mix(old[1], next[1], f)]; }
    old = next;
  }
  return old;
}
function track(keys, t) {
  let old = keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) return mix(old, keys[i][1], ease((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
    old = keys[i][1];
  }
  return old;
}
function blink(t, at, speed = 1, hold = 0.045) {
  const u = (t - at) / speed;
  if (u < 0 || u > 0.07 + hold + 0.11) return 0;
  if (u < 0.07) return ease(u / 0.07);
  if (u < 0.07 + hold) return 1;
  return 1 - ease((u - 0.07 - hold) / 0.11);
}
function idleEvents(id, variant, seed) {
  let e = variant === 0 ? [[1, -0.70, 0.03], [3.0, 0, 0], [4.7, 0.60, -0.16], [6.9, 0.12, 0.12, false], [8.6, 0, 0]]
    : variant === 1 ? [[0.8, 0.22, -0.42, false], [1.7, 0.85, -0.08], [3.9, -0.65, 0.12], [5.4, -0.20, -0.20, false], [6.5, 0, 0], [8.3, 0.35, 0.03, false], [9.0, 0, 0]]
      : [[1.2, -0.25, 0.25, false], [2.7, -0.58, 0.10], [4.5, 0, 0], [5.7, 0.76, 0.04], [8, 0, 0]];
  e = e.map((v, n) => [v[0] + (random(id, seed, n) - 0.5) * 0.32, v[1] * (0.92 + random(id, seed, n + 20) * 0.16), v[2], v[3]]);
  if (id === 'sova' && variant === 0) { e[1][0] += 0.7; e[2][0] += 0.5; }
  return e;
}

/** the main pose (eyes, head, lids, smile) of motion kind at time (s), without the soft parts */
function primary(id, kind, time, intensity = 1, input = null) {
  const profile = PROFILY[id], amount = clamp(intensity, 0, 1.3);
  let t = time, variant = 0, seed = 0, events = [], blinks = [], smile = 0, roll = 0, nod = 0, squint = 0, sniff = 0, earPerk = 0;
  const isIdle = kind === 'alive' || kind === 'alive-b' || kind === 'alive-c';
  if (kind.startsWith('portrait-')) {
    const tag = kind.slice(9);
    return { id, kind, time, eyeX: 0, eyeY: 0, headX: 0, headY: 0, roll: 0, smile: tag === 'happy' ? 1 : tag === 'wink' ? 0.2 : 0, lids: tag === 'blink' ? [1, 1] : tag === 'wink' ? [0, 1] : [0, 0], sniff: 0, earPerk: 0, amount };
  }
  if (time < 0 && !isIdle) return { id, kind, time, eyeX: 0, eyeY: 0, headX: 0, headY: 0, roll: 0, smile: 0, lids: [0, 0], sniff: 0, earPerk: 0, amount };
  if (isIdle) {
    if (kind === 'alive') { seed = Math.floor(t / 14); t = ((t % 14) + 14) % 14; variant = hash(id + ':' + seed) % 3; } else { variant = kind === 'alive-b' ? 1 : 2; seed = variant + 11; }
    events = idleEvents(id, variant, seed);
    if (profile.perk) earPerk = 0.7 * track([[0, 0], [2.9, 0], [3.2, 1], [3.6, 0.4], [4.1, 0], [14, 0]], t);
    if (profile.idleSmile) smile = profile.idleSmile * track([[0, 0], [5, 0], [5.8, 1], [7, 1], [8, 0], [14, 0]], t);
    blinks = [1.9 + (random(id, seed, 70) - 0.5) * 0.3, 5.9 + (random(id, seed, 71) - 0.5) * 0.5, 10.1];
    if (variant === 1 && id === 'kralik') blinks.push(2.18);
    if (id === 'pejsek') {
      smile = 0.22 * track([[0, 0], [4.5, 0], [5.6, 1], [7.1, 1], [8, 0]], t);
      if (variant === 1) sniff = track([[0, 0], [1, 0], [1.12, 1], [1.27, -0.5], [1.43, 0.7], [1.6, 0], [14, 0]], t);
    }
    if (id === 'kralik') earPerk = track([[0, 0], [0.45, 0], [0.7, 1], [0.95, 0.4], [1.3, 0], [14, 0]], t);
  } else if (kind === 'turn') { events = [[0.35, -0.96, 0.02], [2.2, 0, 0], [3.1, 0.96, -0.02], [5.1, 0, 0]]; blinks = [1.65, 4.55]; }
  else if (kind === 'listen' || kind === 'curious') {
    const s = kind === 'curious' ? -1 : 1;
    events = [[0.35, s * 0.82, -0.08], [3.45, 0, 0]]; blinks = [2.3, 4.4];
    roll = track([[0, 0], [0.6, 0], [1.2, s * 2.7], [2.9, s * 2.7], [4.3, 0]], t);
    squint = 0.15 * track([[0, 0], [1.1, 0], [1.6, 1], [2.7, 1], [3.4, 0]], t);
    earPerk = track([[0, 0], [0.15, 0], [0.38, 1], [0.9, 0.45], [1.8, 0]], t);
    if (id === 'pejsek') sniff = track([[0, 0], [0.55, 0], [0.67, 1], [0.82, -0.5], [0.99, 0.8], [1.15, 0]], t);
  } else if (kind === 'eyes') { events = [[0.45, -0.88, 0, false], [1.5, 0.88, 0, false], [2.55, 0, -0.5, false], [3.65, 0, 0, false]]; blinks = [4.1]; }
  else if (kind === 'wave') {
    events = [[0.3, 0.52, -0.04], [2.8, 0, 0]];
    roll = track([[0, 0], [0.6, -1.8], [1.7, -1.8], [3.2, 0]], t);
    nod = track([[0, 0], [0.65, -1], [0.95, 1], [1.4, 0]], t);
    smile = 0.3 * track([[0, 0], [0.6, 1], [2.5, 1], [3.5, 0]], t);
    blinks = [3.6];
  } else if (kind === 'happy') {
    events = [[0.25, 0.30, -0.08], [1.4, -0.25, -0.03], [3.1, 0, 0]];
    smile = track([[0, 0], [0.2, 0], [0.7, 1], [2.8, 1], [3.8, 0]], t);
    nod = track([[0, 0], [0.4, 1], [0.8, -2], [1.15, 0], [1.55, -1], [2.2, 0]], t);
    roll = track([[0, 0], [0.8, -1.4], [1.6, 0.8], [2.5, 0]], t);
    squint = smile * 0.22; blinks = [2.25, 4.15];
  } else if (kind === 'pet') {
    events = [[0.3, -0.42, 0.20], [3.6, 0, 0]];
    smile = 0.75 * track([[0, 0], [0.4, 0], [1.1, 1], [3.2, 1], [4.3, 0]], t);
    roll = track([[0, 0], [1.1, 2.5], [3.3, 2.5], [4.6, 0]], t);
    nod = track([[0, 0], [1.1, 2.5], [3.2, 2.5], [4.6, 0]], t);
    squint = 0.30 * track([[0, 0], [0.7, 0], [1.3, 1], [3.3, 1], [4.1, 0]], t);
    blinks = [1.7, 4.7];
  } else if (kind === 'blink') blinks = [0.28];
  const eye = move(events, t, profile.eyeSpeed, 0, false), head = move(events, t, profile.headSpeed, profile.delay, true);
  let common = 0;
  for (const at of blinks) common = Math.max(common, blink(t, at, profile.blinkSpeed));
  const lids = [Math.max(common, squint), Math.max(common, squint * 0.96)];
  if (kind === 'wave') lids[1] = Math.max(lids[1], blink(t, 0.95, 1, 0.52));
  let eyeX = eye[0] * amount, eyeY = eye[1] * amount, headX = head[0] * amount;
  const headY = head[1] * amount;
  roll = (roll + headX * 0.6) * amount; nod = (nod + headY * 2) * amount;
  if (input && input.weight > 0) {
    const w = clamp(input.weight);
    eyeX = mix(eyeX, input.eyeX * 0.95, w); eyeY = mix(eyeY, input.eyeY * 0.45, w); headX = mix(headX, input.headX * 0.78, w); nod = mix(nod, input.headY * 0.8, w);
  }
  return { id, kind, time, eyeX: clamp(eyeX, -1, 1), eyeY: clamp(eyeY, -0.65, 0.65), headX: clamp(headX, -0.98, 0.98), headY: nod, roll, smile: clamp(smile), lids, sniff: sniff * amount, earPerk: earPerk * amount, amount };
}

const jadra = new Map();
/** weights of the damped spring of one soft part over the last 1.45 s */
function kernel(b) {
  const key = [b.frequency, b.damping, b.delay].join(':');
  if (jadra.has(key)) return jadra.get(key);
  const omega = 2 * Math.PI * b.frequency, z = b.damping, wd = omega * Math.sqrt(1 - z * z), dt = 1.45 / 22, out = [];
  let sum = 0;
  for (let n = 0; n < 22; n++) { const age = (n + 0.5) * dt, w = omega * omega / wd * Math.exp(-z * omega * age) * Math.sin(wd * age) * dt; out.push([age + b.delay, w]); sum += w; }
  for (const v of out) v[1] /= sum;
  jadra.set(key, out);
  return out;
}
const drive = p => p.headX * 16 * 0.65 + p.roll + p.headY * 0.35;

/** the pose of animal id in motion kind at time (s): primary() plus the angles of the soft parts (ears, fur, feathers) */
export function sample(id, kind, time, intensity = 1, input = null) {
  const p = primary(id, kind, time, intensity, input), cfg = OBLASTI[id], current = drive(primary(id, kind, time, intensity, null)), history = new Map();
  p.secondaryAngles = cfg.bones.map((b, n) => {
    let lag = 0;
    for (const [age, w] of kernel(b)) {
      if (!history.has(age)) history.set(age, drive(primary(id, kind, time - age, intensity, null)));
      lag += history.get(age) * w;
    }
    let a = (lag - current) * b.gain;
    if (b.type === 'ear' || b.type === 'earTip') a += p.earPerk * (n === 0 ? 2.4 : 1.1) * b.side;
    if (input?.headVX) a -= clamp(input.headVX, -4, 4) * 0.4;
    const limit = b.maxDegrees * p.amount;
    let value = limit > 0 ? limit * Math.tanh(a / limit) : 0;
    value *= 0.68 * (cfg.motionScale || 1);
    if (kind !== 'alive') value *= 1 - ease((time - (duration(id, kind) - 0.55)) / 0.5);
    return value;
  });
  return p;
}
export const duration = (id, kind) => DELKY[kind] ?? 0;

/** a blend of two poses (w = share of b), for cross-fading between the idle loop and a gesture */
export function smichej(a, b, w) {
  const out = { ...a };
  for (const k of ['eyeX', 'eyeY', 'headX', 'headY', 'roll', 'smile', 'sniff', 'earPerk']) out[k] = mix(a[k], b[k], w);
  out.lids = a.lids.map((v, i) => mix(v, b.lids[i], w));
  out.secondaryAngles = (a.secondaryAngles || []).map((v, i) => mix(v, (b.secondaryAngles || [])[i] || 0, w));
  return out;
}

// ---------------------------------------------------------------- the mesh (natural.js)
const N = 96;
const pole = new Map();
/** mesh points of the portrait with their head weight (paws and the lower outline fixed) and soft-part weights */
function geometry(id) {
  if (pole.has(id)) return pole.get(id);
  const rig = CASTI[id], bones = OBLASTI[id].bones, result = [];
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
    const px = x * 512 / N, py = y * 512 / N;
    let mobile = 1;
    for (const limb of rig.limbs) mobile *= smooth(0.60, 1.60, Math.hypot((px - limb.center[0]) / limb.radius[0], (py - limb.center[1]) / limb.radius[1]));
    const weight = mobile * (1 - smooth(337, 414, py));
    let guard = weight;
    for (const [ex, ey] of rig.eyes) guard *= smooth(0.72, 1.6, Math.hypot((px - ex) / 65, (py - ey) / 63));
    const mx = (rig.eyes[0][0] + rig.eyes[1][0]) / 2, my = (rig.eyes[0][1] + rig.eyes[1][1]) / 2 + 40;
    guard *= smooth(0.80, 1.2, Math.hypot((px - mx) / 82, (py - my) / 74));
    const appendages = bones.map(b => {
      const dx = b.center[0] - b.anchor[0], dy = b.center[1] - b.anchor[1], along = ((px - b.anchor[0]) * dx + (py - b.anchor[1]) * dy) / (dx * dx + dy * dy);
      const d = Math.hypot((px - b.center[0]) / b.radius[0], (py - b.center[1]) / b.radius[1]);
      return [px - b.anchor[0], py - b.anchor[1], guard * smooth(0, 0.7, along) * (1 - smooth(0.8, b.type === 'ear' || b.type === 'earTip' ? 2.1 : 1.45, d))];
    });
    result.push({ point: [px, py], weight, appendages });
  }
  pole.set(id, result);
  return result;
}

/** the mesh points moved by pose p: soft parts turn, the face turns on a shallow dome (yaw), the head rolls and nods */
export function project(id, p) {
  const a = RIG[id], rig = CASTI[id], co = Math.cos(a.eyeAngle), si = Math.sin(a.eyeAngle);
  const yaw = clamp(p.headX, -1, 1) * 15 * Math.PI / 180, cs = Math.cos(yaw), roll = clamp(p.roll * 1.15, -4.3, 4.3) * Math.PI / 180, cr = Math.cos(roll), sr = Math.sin(roll);
  const secondary = (p.secondaryAngles || []).map(v => { const an = clamp(v * 0.70, -3.6, 3.6) * Math.PI / 180; return [Math.cos(an) - 1, Math.sin(an)]; });
  const eyeCenter = [(rig.eyes[0][0] + rig.eyes[1][0]) / 2, (rig.eyes[0][1] + rig.eyes[1][1]) / 2];
  const distance = Math.hypot(rig.eyes[1][0] - rig.eyes[0][0], rig.eyes[1][1] - rig.eyes[0][1]);
  const faceCenter = [eyeCenter[0] - si * distance * 0.18, eyeCenter[1] + co * distance * 0.18], rx = distance * 1.30, ry = rx * 0.95;
  const depthAt = (xx, yy) => {
    const du = (xx - faceCenter[0]) * co + (yy - faceCenter[1]) * si, dv = -(xx - faceCenter[0]) * si + (yy - faceCenter[1]) * co;
    return Math.pow(Math.max(0, 1 - (du / rx) ** 2 - (dv / ry) ** 2), 1.18) * rx * 0.61;
  };
  const muzzle = [eyeCenter[0] - si * distance * 0.35, eyeCenter[1] + co * distance * 0.35];
  return geometry(id).map(f => {
    const [ox, oy] = f.point;
    let x = ox, y = oy;
    for (let j = 0; j < f.appendages.length; j++) {
      const [dx, dy, w] = f.appendages[j];
      if (w < 1e-8) continue;
      const [c, s] = secondary[j] || [0, 0];
      x += w * (c * dx - s * dy); y += w * (c * dy + s * dx);
    }
    const u = (x - faceCenter[0]) * co + (y - faceCenter[1]) * si;
    let z = depthAt(x, y);
    const md = Math.hypot((x - muzzle[0]) / (distance * 0.34), (y - muzzle[1]) / (distance * 0.26)), mw = 1 - smooth(0.65, 1.30, md);
    z = z * (1 - mw) + depthAt(...muzzle) * mw;
    for (const eye of a.eyes) {
      const ddx = x - eye.center[0], ddy = y - eye.center[1];
      const d = Math.hypot((ddx * co + ddy * si) / (eye.radius[0] * 1.12), (-ddx * si + ddy * co) / (eye.radius[1] * 1.12)), ew = 1 - smooth(0.85, 1.40, d);
      z = z * (1 - ew) + depthAt(...eye.center) * ew;
    }
    const shift = (cs - 1) * u + Math.sin(yaw) * z;
    x += shift * co; y += shift * si;
    const dx = x - rig.headAnchor[0], dy = y - rig.headAnchor[1];
    const tx = rig.headAnchor[0] + cr * dx - sr * dy, ty = rig.headAnchor[1] + sr * dx + cr * dy + clamp(p.headY, -3, 3) * 0.55;
    return [ox + (tx - ox) * f.weight, oy + (ty - oy) * f.weight];
  });
}

// ---------------------------------------------------------------- the mouth (mouth.js)
const mixB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function split(c, t) { const a = mixB(c[0], c[1], t), b = mixB(c[1], c[2], t), d = mixB(c[2], c[3], t), e = mixB(a, b, t), f = mixB(b, d, t), g = mixB(e, f, t); return [[c[0], a, e, g], [g, f, d, c[3]]]; }
const cubic = (p, c) => p.bezierCurveTo(...c[1], ...c[2], ...c[3]);
/** the open mouth (amount 0–1) on a transparent 512 px layer: a cavity with a tongue below the original smile line */
function pusa(ctx, asset, amount) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 512, 512);
  amount = clamp(amount);
  if (amount < 0.001) return;
  const m = asset.a.mouth;
  ctx.save(); ctx.translate(...m.origin); ctx.rotate(m.angle);
  ctx.fillStyle = m.cavity || '#66351f'; ctx.strokeStyle = m.color; ctx.lineWidth = m.stroke; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (m.type === 'beak') {
    const c = m.upper, dy = m.depth * amount, reverse = [c[3], c[2], c[1], c[0]].map(q => [q[0], q[1] + dy]), gap = new Path2D();
    gap.moveTo(...c[0]); cubic(gap, c); gap.lineTo(...reverse[0]); cubic(gap, reverse); gap.closePath(); ctx.fill(gap);
    ctx.save(); ctx.clip(gap); ctx.fillStyle = m.tongue;
    const center = split(c, 0.5)[0][3];
    ctx.beginPath(); ctx.ellipse(center[0], center[1] + dy + 1, (c[3][0] - c[0][0]) * 0.38, dy * 0.62, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // the lower beak: the original drawing below the beak line, moved down
    ctx.save(); ctx.translate(0, dy);
    const outline = new Path2D();
    m.beakOutline.forEach((q, n) => (n ? outline.lineTo(...q) : outline.moveTo(...q))); outline.closePath(); ctx.clip(outline);
    const lower = new Path2D();
    lower.moveTo(...c[0]); cubic(lower, c); lower.lineTo(50, 90); lower.lineTo(-50, 90); lower.closePath(); ctx.clip(lower);
    ctx.rotate(-m.angle); ctx.translate(-m.origin[0], -m.origin[1]); ctx.drawImage(asset.image, 0, 0); ctx.restore();
  } else {
    const left = m.left, right = m.right, center = left[3], ul = split(left, m.split)[1], ur = split(right, 1 - m.split)[0], half = (ur[3][0] - ul[0][0]) / 2, bottom = [center[0], center[1] + m.depth];
    const lr = [ur[3], mixB(ur[2], [ur[3][0], bottom[1] - m.depth * 0.16], amount), mixB(ur[1], [center[0] + half * 0.55, bottom[1]], amount), mixB(center, bottom, amount)];
    const ll = [lr[3], mixB(ul[2], [center[0] - half * 0.55, bottom[1]], amount), mixB(ul[1], [ul[0][0], bottom[1] - m.depth * 0.16], amount), ul[0]];
    const cavity = new Path2D();
    cavity.moveTo(...ul[0]); cubic(cavity, ul); cubic(cavity, ur); cubic(cavity, lr); cubic(cavity, ll); cavity.closePath(); ctx.fill(cavity);
    ctx.save(); ctx.clip(cavity); ctx.fillStyle = m.tongue;
    ctx.beginPath(); ctx.ellipse(center[0] + half * 0.05, center[1] + m.depth * amount + 1, half * 1.05, m.depth * 0.65 * amount, -0.04, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    const jaw = new Path2D();
    jaw.moveTo(...lr[0]); cubic(jaw, lr); cubic(jaw, ll); ctx.lineWidth = m.stroke * amount; ctx.stroke(jaw);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- loading and drawing
const nahrane = new Map();
const bitmapa = async zdroj => {                       // premultiplied for clean edges; plain where the option isn't supported
  try { return await createImageBitmap(zdroj, { premultiplyAlpha: 'premultiply' }); } catch { return zdroj; }
};
async function obrazek(src) { const i = new Image(); i.src = src; await i.decode(); return bitmapa(i); }

/** loads the original drawing and the clean plate of one animal once (a promise; null for an unknown animal) */
export function nacti(id) {
  if (!RIG[id]) return null;
  if (nahrane.has(id)) return nahrane.get(id);
  const ukol = (async () => {
    const a = RIG[id], [image, clean] = await Promise.all([obrazek(a.source), obrazek(a.cleanPlate || a.source)]);
    return { id, a, image, clean };
  })();
  ukol.catch(() => nahrane.delete(id));                 // a failed load may be tried again
  nahrane.set(id, ukol);
  return ukol;
}

const VERTEX = 'attribute vec2 p;attribute vec2 uv;varying vec2 v;void main(){v=uv;gl_Position=vec4(p.x/256.0-1.0,1.0-p.y/256.0,0.,1.);}';
const FRAGMENT = `
precision highp float;varying vec2 v;uniform sampler2D image,cleanPlate,mouthLayer;uniform vec4 eyeA,eyeB;uniform vec2 direction,lids;uniform float angle;
vec2 rotateEye(vec2 p){return vec2(cos(angle)*p.x-sin(angle)*p.y,sin(angle)*p.x+cos(angle)*p.y);}
vec4 tex(vec2 p){return texture2D(image,p/512.0);}
vec4 ocular(vec4 base,vec4 eye,float f){vec2 q=vec2(cos(angle)*(v.x*512.-eye.x)+sin(angle)*(v.y*512.-eye.y),-sin(angle)*(v.x*512.-eye.x)+cos(angle)*(v.y*512.-eye.y));vec2 r=eye.zw;float radial=length(q/(r+vec2(9.,5.)));float patch=1.-smoothstep(1.0,1.14,radial);if(patch<.001)return base;vec2 gaze=direction*vec2(7.4,4.2);vec4 original=tex(v*512.-rotateEye(gaze));
vec4 skin=texture2D(cleanPlate,v);skin*=base.a/max(skin.a,.001);
float edge=sqrt(max(0.,1.-pow(clamp(q.x/(r.x+8.),-1.,1.),2.))),closed=.18*r.y*(1.-pow(clamp(q.x/(r.x+8.),-1.,1.),2.)),top=mix(-(r.y+5.)*edge,closed,f),bottom=mix((r.y+5.)*edge,closed,f),opening=smoothstep(top-.7,top+.7,q.y)*(1.-smoothstep(bottom-.7,bottom+.7,q.y));if(f<.0001)opening=1.;opening*=1.-smoothstep(.96,1.,f);float shiftedMask=1.-smoothstep(.98,1.12,length((q-gaze)/r));vec4 ocularOriginal=mix(skin,original,shiftedMask);vec4 result=mix(skin,ocularOriginal,opening);float line=(1.-smoothstep(1.0,2.0,abs(q.y-closed)))*(1.-smoothstep(.80,.97,abs(q.x/r.x)))*smoothstep(.82,1.,f);result=mix(result,vec4(.32,.19,.09,1.),line);return mix(base,result,patch);}
void main(){vec4 base=texture2D(image,v);base=ocular(base,eyeA,lids.x);base=ocular(base,eyeB,lids.y);vec4 mouth=texture2D(mouthLayer,v);base=mouth+base*(1.-mouth.a);gl_FragColor=base;}`;

/**
 * The shared WebGL renderer (throws without WebGL). kresli(ctx, asset, pose) draws one frame of a loaded animal
 * (asset from nacti, pose from sample() or smichej()) into a 2D context filling its canvas: the 512 px portrait in
 * the middle with the margin OKRAJ around it. The rest pose is the original drawing itself.
 */
export function kreslic() {
  const mouth = document.createElement('canvas');
  mouth.width = mouth.height = 512;
  const mouthCtx = mouth.getContext('2d');
  const surface = document.createElement('canvas');
  surface.width = surface.height = 512;
  const gl = surface.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: true });
  if (!gl) throw new Error('WebGL is not available');
  const shader = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const count = (N + 1) * (N + 1), uv = new Float32Array(count * 2), positions = new Float32Array(count * 2), indices = [];
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) { const i = (y * (N + 1) + x) * 2; uv[i] = x / N; uv[i + 1] = y / N; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const a = y * (N + 1) + x, b = a + 1, c = a + N + 1, d = c + 1; indices.push(a, c, b, b, c, d); }
  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer); gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
  const pa = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(pa); gl.vertexAttribPointer(pa, 2, gl.FLOAT, false, 0, 0);
  const uvBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  const ua = gl.getAttribLocation(program, 'uv');
  gl.enableVertexAttribArray(ua); gl.vertexAttribPointer(ua, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  gl.disable(gl.BLEND); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const textures = new WeakMap(), uniform = n => gl.getUniformLocation(program, n);
  const texture = im => {
    if (textures.has(im)) return textures.get(im);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    textures.set(im, t);
    return t;
  };

  function kresli(ctx, asset, p) {
    const a = asset.a, w = ctx.canvas.width, okraj = w * OKRAJ / (1 + 2 * OKRAJ), v = w - 2 * okraj;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, ctx.canvas.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const quiet = Math.abs(p.headX) + Math.abs(p.headY) + Math.abs(p.roll) + Math.abs(p.eyeX) + Math.abs(p.eyeY) + (p.secondaryAngles || []).reduce((s, n) => s + Math.abs(n), 0) + p.lids[0] + p.lids[1] + p.smile;
    if (quiet < 1e-8) { ctx.drawImage(asset.image, okraj, okraj, v, v); ctx.restore(); return; }   // the original drawing as it is
    project(asset.id, p).forEach((q, n) => { positions[n * 2] = q[0]; positions[n * 2 + 1] = q[1]; });
    gl.viewport(0, 0, 512, 512); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture(asset.image)); gl.uniform1i(uniform('image'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texture(asset.clean)); gl.uniform1i(uniform('cleanPlate'), 1);
    for (const [n, name] of ['eyeA', 'eyeB'].entries()) gl.uniform4f(uniform(name), ...a.eyes[n].center, ...a.eyes[n].radius);
    gl.uniform1f(uniform('angle'), a.eyeAngle);
    gl.uniform2f(uniform('direction'), clamp(p.eyeX - p.headX, -1, 1), clamp(p.eyeY, -0.6, 0.6));
    gl.uniform2f(uniform('lids'), ...p.lids);
    pusa(mouthCtx, asset, p.smile);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texture(mouth));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mouth); gl.uniform1i(uniform('mouthLayer'), 2);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    ctx.drawImage(surface, 0, 0, 512, 512, okraj, okraj, v, v);
    ctx.restore();
  }
  return { kresli, surface };
}
