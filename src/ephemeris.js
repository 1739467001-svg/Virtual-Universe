// 简易行星星历：基于 NASA/JPL「主要行星近似位置开普勒根数」表（适用 1800–2050 年）。
// 计算各天体在某一时刻的日心黄道坐标（AU），用于：
//   1) 把场景里行星对齐到「此刻真实角位置」；
//   2) 计算行星与地球/太阳的真实距离（AU）。
// 参考：https://ssd.jpl.nasa.gov/planets/approx_pos.html

const DEG = Math.PI / 180;

// 每项：[值@J2000, 每儒略世纪变化率]，单位：a(AU)，其余(度)
// 顺序：a, e, I, L(平黄经), ϖ(近日点黄经), Ω(升交点黄经)
const ELEMENTS = {
  Mercury: { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], I: [7.00497902, -0.00594749], L: [252.25032350, 149472.67411175], peri: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081] },
  Venus:   { a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107], I: [3.39467605, -0.00078890], L: [181.97909950, 58517.81538729], peri: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418] },
  Earth:   { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0.0, 0.0] },
  Mars:    { a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882], I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343] },
  Jupiter: { a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775], peri: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106] },
  Saturn:  { a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201], peri: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794] },
  Uranus:  { a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939], L: [313.23810451, 428.48202785], peri: [170.95427630, 0.40805281], node: [74.01692503, 0.04240589] },
  Neptune: { a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], I: [1.77004347, 0.00035372], L: [-55.12002969, 218.45945325], peri: [44.96476227, -0.32241464], node: [131.78422574, -0.00508664] },
  Pluto:   { a: [39.48211675, -0.00031596], e: [0.24882730, 0.00005170], I: [17.14001206, 0.00004818], L: [238.92903833, 145.20780515], peri: [224.06891629, -0.04062942], node: [110.30393684, -0.01183482] },
  // 谷神星（矮行星，低精度近似根数；仅 L 随时间变化）
  Ceres:   { a: [2.7691, 0], e: [0.0760, 0], I: [10.594, 0], L: [248.9, 7822.6], peri: [153.9, 0], node: [80.305, 0] },
};

function julianCenturies(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  return (jd - 2451545.0) / 36525;
}

function norm360(x) {
  return ((x % 360) + 360) % 360;
}

function solveKepler(M, e) {
  // M 弧度，返回偏近点角 E
  let E = M;
  for (let i = 0; i < 8; i++) {
    E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return E;
}

// 日心黄道直角坐标（AU），J2000 黄道面
export function helioPos(name, date) {
  const el = ELEMENTS[name];
  if (!el) return { x: 0, y: 0, z: 0 };
  const T = julianCenturies(date);
  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const I = (el.I[0] + el.I[1] * T) * DEG;
  const L = el.L[0] + el.L[1] * T;
  const peri = el.peri[0] + el.peri[1] * T;
  const node = el.node[0] + el.node[1] * T;
  const w = (peri - node) * DEG;               // 近日点幅角
  let M = norm360(L - peri);
  if (M > 180) M -= 360;
  M *= DEG;
  const E = solveKepler(M, e);
  // 轨道平面内坐标
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const Om = node * DEG;
  const cw = Math.cos(w), sw = Math.sin(w);
  const cO = Math.cos(Om), sO = Math.sin(Om);
  const cI = Math.cos(I), sI = Math.sin(I);
  // 旋转到黄道坐标
  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = (sw * sI) * xp + (cw * sI) * yp;
  return { x, y, z };
}

// 日心黄经（弧度），用于把场景行星对齐到真实角位置
export function helioLongitude(name, date) {
  const p = helioPos(name, date);
  return Math.atan2(p.y, p.x);
}

export function sunDistanceAU(name, date) {
  const p = helioPos(name, date);
  return Math.hypot(p.x, p.y, p.z);
}

export function earthDistanceAU(name, date) {
  const p = helioPos(name, date);
  const e = helioPos("Earth", date);
  return Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
}

export const EPHEMERIS_BODIES = Object.keys(ELEMENTS);
