// 行星纹理：优先加载 assets/textures/ 下的真实位图（NASA / 公共素材，已随仓库打包，离线可用）；
// 若加载失败则自动回退到 Canvas 程序化纹理，保证任何环境下都能正常显示。
import * as THREE from "three";

// ---------- 真实位图加载（含程序化回退）----------
const loader = new THREE.TextureLoader();
const TEX = "./assets/textures/";

// 加载一张真实贴图；onError 时把图像换成 fallback() 生成的程序化纹理
function realTex(file, { srgb = true, fallback = null } = {}) {
  const tex = loader.load(TEX + file, undefined, undefined, () => {
    if (fallback) {
      const fb = fallback();
      tex.image = fb.image;
      tex.colorSpace = fb.colorSpace;
      tex.needsUpdate = true;
    }
  });
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// 行星色彩贴图文件名（按英文名映射）
const PLANET_FILE = {
  Mercury: "mercury.jpg", Venus: "venus.jpg", Earth: "earth_day.jpg",
  Mars: "mars.jpg", Jupiter: "jupiter.jpg", Saturn: "saturn.jpg",
  Uranus: "uranus.jpg", Neptune: "neptune.jpg",
};

// 确定性随机（mulberry32），保证每次生成的行星样子一致
function rng(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 把一个 0xRRGGBB 颜色按 amt(-1..1) 变暗(<0)或变亮(>0)
function shade(color, amt) {
  let r = (color >> 16) & 255,
    g = (color >> 8) & 255,
    b = color & 255;
  const target = amt < 0 ? 0 : 255;
  const t = Math.min(1, Math.abs(amt));
  r = Math.round(r + (target - r) * t);
  g = Math.round(g + (target - g) * t);
  b = Math.round(b + (target - b) * t);
  return `rgb(${r},${g},${b})`;
}

// 岩石行星：基色 + 斑块 + 极冠（水星/金星/火星）
function rockyTexture(base, seed) {
  return canvasTex(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = shade(base, 0);
    ctx.fillRect(0, 0, w, h);
    const rand = rng(seed);
    for (let i = 0; i < 1500; i++) {
      const x = rand() * w,
        y = rand() * h,
        r = 2 + rand() * 24;
      ctx.fillStyle = shade(base, (rand() - 0.5) * 0.5);
      ctx.globalAlpha = 0.18 + rand() * 0.3;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.6 + rand() * 0.7), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 极冠
    const capH = h * 0.09;
    ctx.fillStyle = "rgba(235,238,248,0.55)";
    ctx.fillRect(0, 0, w, capH);
    ctx.fillRect(0, h - capH, w, capH);
  });
}

// 地球：海洋 + 大陆 + 沙漠 + 冰盖
function earthTexture(seed) {
  return canvasTex(1024, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0a2a4a");
    g.addColorStop(0.5, "#15549a");
    g.addColorStop(1, "#0a2a4a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rand = rng(seed);
    for (let i = 0; i < 28; i++) {
      const cx = rand() * w,
        cy = h * 0.16 + rand() * h * 0.68;
      const blobs = 8 + ((rand() * 12) | 0);
      ctx.fillStyle = rand() < 0.5 ? "#3d7a37" : "#5a7d3a";
      ctx.globalAlpha = 0.85;
      for (let b = 0; b < blobs; b++) {
        const x = cx + (rand() - 0.5) * 130,
          y = cy + (rand() - 0.5) * 90,
          r = 8 + rand() * 42;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 沙漠点缀
    ctx.globalAlpha = 1;
    for (let i = 0; i < 320; i++) {
      const x = rand() * w,
        y = h * 0.3 + rand() * h * 0.4,
        r = 4 + rand() * 14;
      ctx.fillStyle = "rgba(190,158,96,0.25)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 冰盖
    ctx.fillStyle = "rgba(245,250,255,0.92)";
    ctx.fillRect(0, 0, w, h * 0.07);
    ctx.fillRect(0, h * 0.93, w, h * 0.07);
  });
}

// 地球云层（带透明通道，贴在略大的球上）——真实贴图优先，回退到程序化
export function cloudTexture() {
  return realTex("earth_clouds.png", { srgb: true, fallback: proceduralClouds });
}
function proceduralClouds(seed = 13) {
  return canvasTex(1024, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const rand = rng(seed);
    for (let i = 0; i < 440; i++) {
      const x = rand() * w,
        y = rand() * h,
        r = 10 + rand() * 48;
      ctx.fillStyle = `rgba(255,255,255,${0.05 + rand() * 0.22})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// 气态巨行星：横向条纹 + 湍流 +（木星）大红斑
function gasGiantTexture(base, seed, redSpot) {
  return canvasTex(1024, 512, (ctx, w, h) => {
    const rand = rng(seed);
    let y = 0;
    while (y < h) {
      const bh = 6 + rand() * 30;
      ctx.fillStyle = shade(base, (rand() - 0.5) * 0.55);
      ctx.fillRect(0, y, w, bh + 1);
      y += bh;
    }
    // 湍流：波浪状细线
    for (let i = 0; i < 2400; i++) {
      const yy = rand() * h;
      ctx.strokeStyle = shade(base, (rand() - 0.5) * 0.4);
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      const freq = 1 + rand() * 3;
      for (let x = 0; x <= w; x += 48) {
        ctx.lineTo(x, yy + Math.sin((x / w) * Math.PI * 2 * freq) * 4);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (redSpot) {
      const x = w * 0.7,
        yc = h * 0.62;
      const rg = ctx.createRadialGradient(x, yc, 2, x, yc, 64);
      rg.addColorStop(0, "#d05a3e");
      rg.addColorStop(0.6, "#b5462f");
      rg.addColorStop(1, "rgba(180,70,47,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(x, yc, 72, 34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// 气态巨行星大气叠层：半透明的纬向云带条纹（带状波动），叠在本体外、以微小速度差漂移，
// 让木星/土星的云带与风暴区看起来在「流动、翻涌」。用 canvas 自身 alpha 做透明。
export function gasAtmosphereTexture(base, seed) {
  return canvasTex(1024, 512, (ctx, w, h) => {
    const rand = rng(seed);
    ctx.clearRect(0, 0, w, h); // 透明底，只画云丝
    // 多条沿纬度的波浪云带
    for (let i = 0; i < 220; i++) {
      const yy = rand() * h;
      const amp = 2 + rand() * 6;
      const freq = 1 + rand() * 4;
      const phase = rand() * Math.PI * 2;
      ctx.strokeStyle = shade(base, (rand() - 0.5) * 0.6);
      ctx.globalAlpha = 0.04 + rand() * 0.1;
      ctx.lineWidth = 1 + rand() * 3;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      for (let x = 0; x <= w; x += 24) {
        ctx.lineTo(x, yy + Math.sin((x / w) * Math.PI * 2 * freq + phase) * amp);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

// 大红斑涡旋：透明底上的旋臂状风暴(红赭色),贴在木星表面并自旋 → 翻涌的「风暴之眼」
export function redSpotTexture(seed = 13) {
  return canvasTex(256, 256, (ctx, w, h) => {
    const rand = rng(seed);
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    // 椭圆软边底色
    const rg = ctx.createRadialGradient(cx, cy, 2, cx, cy, w / 2);
    rg.addColorStop(0, "rgba(214,96,62,0.95)");
    rg.addColorStop(0.55, "rgba(176,64,40,0.8)");
    rg.addColorStop(0.85, "rgba(150,58,40,0.35)");
    rg.addColorStop(1, "rgba(150,58,40,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2 - 2, h / 2 * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
    // 旋臂：从中心向外的对数螺旋细丝,营造涡旋
    for (let s = 0; s < 5; s++) {
      const off = (s / 5) * Math.PI * 2;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.12) {
        const r = 6 + a * 7.5;
        if (r > w / 2 - 4) break;
        const x = cx + Math.cos(a + off) * r;
        const y = cy + Math.sin(a + off) * r * 0.78;
        a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = s % 2 ? "rgba(245,200,160,0.35)" : "rgba(120,40,26,0.4)";
      ctx.lineWidth = 2 + rand() * 2;
      ctx.stroke();
    }
    // 高亮内核
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.18);
    core.addColorStop(0, "rgba(240,180,140,0.6)");
    core.addColorStop(1, "rgba(240,180,140,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.18, 0, Math.PI * 2);
    ctx.fill();
  });
}

// 冰巨行星：平滑渐变 + 少量淡带（天王星/海王星）
function iceGiantTexture(base, seed) {
  return canvasTex(1024, 512, (ctx, w, h) => {
    const rand = rng(seed);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, shade(base, 0.2));
    g.addColorStop(0.5, shade(base, -0.05));
    g.addColorStop(1, shade(base, 0.16));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) {
      const yy = rand() * h,
        bh = 10 + rand() * 26;
      ctx.fillStyle = shade(base, (rand() - 0.5) * 0.25);
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, yy, w, bh);
    }
    ctx.globalAlpha = 1;
  });
}

// 地球附加贴图：夜晚灯光（自发光）、法线（地形起伏）、高光（海洋反光）
export function earthNightTexture() {
  return realTex("earth_night.png", { srgb: true });
}
export function earthNormalTexture() {
  return realTex("earth_normal.jpg", { srgb: false });
}
export function earthSpecularTexture() {
  return realTex("earth_specular.jpg", { srgb: false });
}
// 月球真实贴图
export function moonTexture() {
  return realTex("moon.jpg", { srgb: true });
}

// 太阳：真实贴图优先，回退到程序化颗粒纹理
export function sunTexture() {
  return realTex("sun.jpg", { srgb: true, fallback: proceduralSun });
}
function proceduralSun(seed = 99) {
  return canvasTex(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = "#ff9a1e";
    ctx.fillRect(0, 0, w, h);
    const rand = rng(seed);
    for (let i = 0; i < 3200; i++) {
      const x = rand() * w,
        y = rand() * h,
        r = 2 + rand() * 16;
      ctx.globalAlpha = 0.05 + rand() * 0.12;
      ctx.fillStyle = rand() < 0.5 ? "#ffd86b" : "#ff6a00";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

// 行星环（沿半径方向的明暗带 + 卡西尼缝），配合自定义 UV 使用
export function ringTexture(base, seed = 21) {
  return canvasTex(512, 8, (ctx, w, h) => {
    const rand = rng(seed);
    for (let x = 0; x < w; x++) {
      const t = x / w;
      let a = 0.85;
      if (t > 0.46 && t < 0.53) a = 0.08; // 卡西尼缝
      if (t > 0.72 && t < 0.75) a = 0.22; // 恩克缝
      if (t < 0.04) a = 0.0;
      ctx.fillStyle = shade(base, (rand() - 0.5) * 0.25);
      ctx.globalAlpha = a * (0.7 + rand() * 0.3);
      ctx.fillRect(x, 0, 1, h);
    }
    ctx.globalAlpha = 1;
  });
}

// 程序化纹理（作为真实贴图加载失败时的回退）
function proceduralPlanetTexture(p) {
  switch (p.type) {
    case "earth":
      return earthTexture(7);
    case "gasGiant":
      return gasGiantTexture(p.color, p.seed || 3, p.redSpot);
    case "iceGiant":
      return iceGiantTexture(p.color, p.seed || 5);
    case "rocky":
    default:
      return rockyTexture(p.color, p.seed || 1);
  }
}

// 行星色彩贴图：真实位图优先，失败回退程序化
export function planetTexture(p) {
  const file = PLANET_FILE[p.enName];
  if (!file) return proceduralPlanetTexture(p);
  return realTex(file, { srgb: true, fallback: () => proceduralPlanetTexture(p) });
}
