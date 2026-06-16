import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SUN, PLANETS, DWARFS } from "./data.js";
import {
  planetTexture, cloudTexture, ringTexture, sunTexture,
  earthNightTexture, earthNormalTexture, earthSpecularTexture, moonTexture,
  gasAtmosphereTexture, redSpotTexture,
} from "./textures.js";
import { helioLongitude, earthDistanceAU, sunDistanceAU } from "./ephemeris.js";

// ---------- 基础场景 ----------
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);
camera.position.set(0, 60, 160);

// 移动端(coarse pointer)关闭 MSAA 抗锯齿,改用自适应分辨率,显著减负
const isMobile = window.matchMedia("(pointer: coarse)").matches;
const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
// 自适应分辨率:掉帧时下调像素比保流畅,帧率宽裕时回升保清晰
const perf = {
  cap: Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2),
  min: isMobile ? 0.6 : 0.75,
  dpr: 0, acc: 0, frames: 0,
};
perf.dpr = perf.cap;
renderer.setPixelRatio(perf.dpr);
renderer.xr.enabled = true; // 预留 WebXR：插上头显即可进入沉浸模式
renderer.toneMapping = THREE.ACESFilmicToneMapping; // 电影级色调映射，配合 Bloom 更自然
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// 标签渲染器（DOM 叠加层）
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "fixed";
labelRenderer.domElement.style.top = "0";
labelRenderer.domElement.style.pointerEvents = "none";
document.body.appendChild(labelRenderer.domElement);

// WebXR 进入按钮
document.body.appendChild(VRButton.createButton(renderer));

// ---------- 后期处理：Bloom 辉光（让太阳/恒星更耀眼）----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.85,  // strength：辉光强度
  0.5,   // radius：扩散半径
  0.85   // threshold：仅高亮区域（太阳、光晕）才发光，行星表面不泛白
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass()); // 负责色调映射 + 色彩空间输出

// 相机控制
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 2.5; // 允许贴近小行星细看
controls.maxDistance = 1200;

// ---------- 自由飞行（飞船视角）----------
// 一套自包含的第一人称漫游控制：指针锁定后用鼠标转向，WASD/QE 平移。
// 启用时关闭 OrbitControls，让用户真正驾驶相机在太阳系中飞行、近距离观测行星。
const fly = {
  active: false,
  speed: 40,           // 基础速度（单位/秒）
  yaw: 0,
  pitch: 0,
  keys: Object.create(null),
  vel: new THREE.Vector3(),
};

function enterFlyMode() {
  if (fly.active) return;
  fly.active = true;
  focusTarget = null;            // 解除聚焦跟随
  controls.enabled = false;
  // 用当前相机朝向初始化 yaw/pitch
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
  fly.yaw = e.y;
  fly.pitch = e.x;
  document.getElementById("fly-toggle").classList.add("active");
  document.getElementById("fly-hint").classList.remove("hidden");
  renderer.domElement.requestPointerLock?.();
}

function exitFlyMode() {
  if (!fly.active) return;
  fly.active = false;
  fly.keys = Object.create(null);
  fly.vel.set(0, 0, 0);
  controls.enabled = true;
  controls.target.copy(camera.position).add(
    new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(40)
  );
  document.getElementById("fly-toggle").classList.remove("active");
  document.getElementById("fly-hint").classList.add("hidden");
  if (document.pointerLockElement) document.exitPointerLock();
}

document.addEventListener("pointerlockchange", () => {
  // 用户按 ESC 退出指针锁时，同步退出飞行模式
  if (fly.active && !document.pointerLockElement) exitFlyMode();
});

document.addEventListener("mousemove", (e) => {
  if (!fly.active || !document.pointerLockElement) return;
  const sens = 0.0022;
  fly.yaw -= e.movementX * sens;
  fly.pitch -= e.movementY * sens;
  const lim = Math.PI / 2 - 0.01;
  fly.pitch = Math.max(-lim, Math.min(lim, fly.pitch));
});

window.addEventListener("keydown", (e) => {
  if (!fly.active) return;
  fly.keys[e.code] = true;
});
window.addEventListener("keyup", (e) => {
  fly.keys[e.code] = false;
});

// 飞行时用滚轮调整基础速度
renderer.domElement.addEventListener("wheel", (e) => {
  if (!fly.active) return;
  e.preventDefault();
  fly.speed = Math.max(4, Math.min(400, fly.speed * (e.deltaY < 0 ? 1.15 : 0.87)));
}, { passive: false });

function updateFly(dt) {
  // 朝向：由 yaw/pitch 合成（YXZ 顺序，先偏航后俯仰）
  camera.quaternion.setFromEuler(new THREE.Euler(fly.pitch, fly.yaw, 0, "YXZ"));

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0); // 世界上方向，升降更直观

  const dir = new THREE.Vector3();
  const k = fly.keys;
  if (k.KeyW || k.ArrowUp) dir.add(forward);
  if (k.KeyS || k.ArrowDown) dir.sub(forward);
  if (k.KeyD || k.ArrowRight) dir.add(right);
  if (k.KeyA || k.ArrowLeft) dir.sub(right);
  if (k.KeyE || k.Space) dir.add(up);
  if (k.KeyQ) dir.sub(up);

  const boost = (k.ShiftLeft || k.ShiftRight) ? 4 : 1;
  const target = dir.lengthSq() > 0
    ? dir.normalize().multiplyScalar(fly.speed * boost)
    : new THREE.Vector3();

  // 靠近天体时自动减速，便于细看与环绕
  const near = nearestBody();
  if (near && near.surfaceDist < near.r * 3) {
    target.multiplyScalar(THREE.MathUtils.clamp(near.surfaceDist / (near.r * 3), 0.12, 1));
  }

  // 平滑加减速，手感更顺滑
  fly.vel.lerp(target, Math.min(1, dt * 6));
  camera.position.addScaledVector(fly.vel, dt);

  collideBodies(); // 防止穿模
}

// ---------- 灯光 ----------
scene.add(new THREE.AmbientLight(0x335, 0.55)); // 微弱环境光，避免背面纯黑
// decay=0：关闭距离衰减，让远处的海王星也能被照亮（牺牲物理真实，换取可视性）
const sunLight = new THREE.PointLight(0xfff2d8, 2.6, 0, 0);
scene.add(sunLight); // 置于太阳中心

// ---------- 星空背景 ----------
function createStarfield(count = 6000, radius = 2000) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // 在球壳上均匀撒点
    const r = radius * (0.7 + Math.random() * 0.3);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.4,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
  });
  return new THREE.Points(geo, mat);
}
scene.add(createStarfield(2500)); // 近景星点，叠在银河天空盒之上增加纵深

// ---------- 银河天空盒（真实 Milky Way cubemap）----------
const cubeLoader = new THREE.CubeTextureLoader().setPath("./assets/textures/milkyway/");
const milkyway = cubeLoader.load(
  ["px.jpg", "nx.jpg", "py.jpg", "ny.jpg", "pz.jpg", "nz.jpg"],
  undefined,
  undefined,
  () => { scene.background = new THREE.Color(0x000008); } // 加载失败回退纯黑底
);
milkyway.colorSpace = THREE.SRGBColorSpace;
scene.background = milkyway;

// ---------- 辅助：创建标签 ----------
function makeLabel(text) {
  const div = document.createElement("div");
  div.className = "planet-label";
  div.textContent = text;
  return new CSS2DObject(div);
}

// ---------- 太阳 ----------
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(SUN.radius, 48, 48),
  new THREE.MeshBasicMaterial({ map: sunTexture() })
);
sunMesh.userData = { body: SUN, isFocusable: true };
scene.add(sunMesh);

// 太阳光晕（Sprite 发光）
const glowTexture = makeGlowTexture();
const glow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffdd66,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
glow.scale.set(SUN.radius * 6, SUN.radius * 6, 1);
sunMesh.add(glow);

// 日冕 / 耀斑：更大的橙色additive光层，循环里做「呼吸」脉动与缓慢旋转
const corona = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xff7a2a,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.45,
    rotation: 0,
  })
);
corona.scale.set(SUN.radius * 9, SUN.radius * 9, 1);
sunMesh.add(corona);

const sunLabel = makeLabel(SUN.name);
sunLabel.position.set(0, SUN.radius + 3, 0);
sunMesh.add(sunLabel);

function makeGlowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,240,180,1)");
  grad.addColorStop(0.3, "rgba(255,200,90,0.6)");
  grad.addColorStop(1, "rgba(255,180,50,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// ---------- 行星 ----------
// 层级结构（为支持真实自转轴倾角）：
//   pivot(绕太阳公转) → holder(位于轨道半径处，保持竖直) → tiltGroup(按倾角倾斜)
//     → mesh(绕自身倾斜轴自转) / ring(赤道面) / clouds / moonPivot
const planetObjects = []; // { body, pivot, mesh, clouds, angle, orbit, label }
const focusables = [sunMesh];

// 把 RingGeometry 的 UV 重映射为「沿半径方向」，让环纹理(明暗带/卡西尼缝)正确显示
function remapRingUV(geo, inner, outer) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = Math.hypot(v.x, v.y);
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  uv.needsUpdate = true;
}

const moonMap = moonTexture(); // 所有卫星共用一张月面贴图，避免重复加载

for (const p of [...PLANETS, ...DWARFS]) {
  const pivot = new THREE.Object3D(); // 公转
  scene.add(pivot);

  const holder = new THREE.Object3D(); // 位于轨道半径处，始终竖直（标签用）
  holder.position.x = p.distance;
  pivot.add(holder);

  const tiltGroup = new THREE.Object3D(); // 自转轴倾角
  tiltGroup.rotation.z = THREE.MathUtils.degToRad(p.axialTilt || 0);
  holder.add(tiltGroup);

  const isGiant = p.type === "gasGiant" || p.type === "iceGiant";
  const mat = new THREE.MeshStandardMaterial({
    map: planetTexture(p),
    roughness: isGiant ? 0.65 : 0.95,
    metalness: 0.0,
  });
  // 地球：法线贴图(地形起伏) + 高光贴图(海洋金属反光) + 夜晚灯光(自发光)
  if (p.type === "earth") {
    mat.normalMap = earthNormalTexture();
    mat.normalScale = new THREE.Vector2(0.85, 0.85);
    mat.metalnessMap = earthSpecularTexture(); // 海洋(高光区)更具反光
    mat.metalness = 0.6;
    mat.roughness = 0.7;
    mat.emissiveMap = earthNightTexture();      // 夜半球城市灯光
    mat.emissive = new THREE.Color(0xffdca8);
    mat.emissiveIntensity = 1.4;
  }
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.size, 64, 64), mat);
  mesh.userData = { body: p, isFocusable: true };
  tiltGroup.add(mesh);
  focusables.push(mesh);

  // 地球云层（略大的半透明球）
  let clouds = null;
  if (p.type === "earth") {
    const ct = cloudTexture();
    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(p.size * 1.02, 64, 64),
      new THREE.MeshStandardMaterial({
        map: ct,
        alphaMap: ct, // 用云图自身做透明遮罩，无云处透出地表
        transparent: true,
        depthWrite: false,
        opacity: 0.95,
      })
    );
    mesh.add(clouds);
  }

  // 气态巨行星大气叠层：半透明云带，随本体略有速度差漂移 → 云带/风暴翻涌的流动感
  let atmo = null;
  if (isGiant) {
    atmo = new THREE.Mesh(
      new THREE.SphereGeometry(p.size * 1.015, 64, 64),
      new THREE.MeshStandardMaterial({
        map: gasAtmosphereTexture(p.color, (p.seed || 3) + 100),
        transparent: true,
        depthWrite: false,
        opacity: 0.5,
        roughness: 0.9,
        metalness: 0.0,
      })
    );
    mesh.add(atmo);
  }

  // 大红斑「风暴之眼」：贴在木星表面、随本体公转/自转固定位置，并就地自旋翻涌。
  // 位置用经纬度（度）定位，方便对齐真实贴图后微调：SPOT_LON 调左右、SPOT_LAT 调上下。
  let spot = null;
  if (p.redSpot) {
    const SPOT_LON = 150; // 经度（°）：绕轴左右移动红斑
    const SPOT_LAT = -20; // 纬度（°）：负为南半球（大红斑在木星南半球）
    const lon = THREE.MathUtils.degToRad(SPOT_LON);
    const lat = THREE.MathUtils.degToRad(SPOT_LAT);
    const R = p.size * 1.02;
    const normal = new THREE.Vector3(
      Math.cos(lat) * Math.cos(lon),
      Math.sin(lat),
      Math.cos(lat) * Math.sin(lon)
    );
    spot = new THREE.Mesh(
      new THREE.CircleGeometry(p.size * 0.42, 48),
      new THREE.MeshBasicMaterial({
        map: redSpotTexture(13),
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
      })
    );
    spot.position.copy(normal).multiplyScalar(R);
    spot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal); // 面朝外
    mesh.add(spot);
  }

  // 行星环（土星 / 天王星）——位于赤道面，随倾角一起倾斜
  if (p.ring) {
    const ringGeo = new THREE.RingGeometry(p.ring.inner, p.ring.outer, 160, 1);
    remapRingUV(ringGeo, p.ring.inner, p.ring.outer);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        map: ringTexture(p.ring.color, p.seed || 21),
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2; // 躺平到赤道面
    tiltGroup.add(ring);
  }

  // 卫星（如月球）
  if (p.moons) {
    for (const m of p.moons) {
      const moonPivot = new THREE.Object3D();
      tiltGroup.add(moonPivot);
      const moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(m.size, 24, 24),
        new THREE.MeshStandardMaterial({ map: moonMap, color: m.color, roughness: 0.95 })
      );
      moonMesh.position.x = m.distance;
      moonPivot.add(moonMesh);
      moonPivot.userData = { moon: m, angle: Math.random() * Math.PI * 2 };
      if (!p._moonPivots) p._moonPivots = [];
      p._moonPivots.push(moonPivot);
    }
  }

  // 轨道线
  const orbitGeo = new THREE.RingGeometry(p.distance - 0.05, p.distance + 0.05, 160);
  const orbit = new THREE.Mesh(
    orbitGeo,
    new THREE.MeshBasicMaterial({
      color: 0x4a5070,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    })
  );
  orbit.rotation.x = Math.PI / 2;
  scene.add(orbit);

  // 标签（挂在竖直的 holder 上，始终在行星正上方）
  const label = makeLabel(p.name);
  label.position.set(0, p.size + 1.5, 0);
  holder.add(label);

  planetObjects.push({ body: p, pivot, mesh, clouds, atmo, spot, angle: p.tilt, orbit, label });
}

// ---------- 小行星带（火星 ↔ 木星之间）----------
function createAsteroidBelt(count = 1500, rInner = 48, rOuter = 56) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = rInner + Math.random() * (rOuter - rInner);
    const a = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2.5; // 轻微厚度
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const belt = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0x9b8f7a, size: 0.6, sizeAttenuation: true })
  );
  // 让整条带子缓慢自转
  belt.userData.spin = 0.02;
  return belt;
}
const asteroidBelt = createAsteroidBelt();
scene.add(asteroidBelt);

// ---------- 天体集合 + 邻近/碰撞检测（供自由飞行、雷达、飞抵动画共用）----------
const bodyMeshes = [sunMesh, ...planetObjects.map((o) => o.mesh)];
const _wp = new THREE.Vector3();
const bodyRadius = (mesh) => mesh.geometry.parameters.radius;

// 返回距相机「表面」最近的天体信息
function nearestBody() {
  let best = null;
  for (const mesh of bodyMeshes) {
    mesh.getWorldPosition(_wp);
    const r = bodyRadius(mesh);
    const d = camera.position.distanceTo(_wp) - r;
    if (!best || d < best.surfaceDist) {
      best = { mesh, P: _wp.clone(), r, surfaceDist: d, body: mesh.userData.body };
    }
  }
  return best;
}

// 碰撞：不允许穿入天体，贴着「安全壳」滑动（便于贴地/环绕观测）
function collideBodies() {
  for (const mesh of bodyMeshes) {
    mesh.getWorldPosition(_wp);
    const r = bodyRadius(mesh);
    const shell = r + r * 0.4 + 1.5;
    const dir = camera.position.clone().sub(_wp);
    const d = dir.length();
    if (d > 1e-4 && d < shell) {
      camera.position.copy(_wp).add(dir.multiplyScalar(shell / d));
      fly.vel.multiplyScalar(0.3); // 削掉撞向天体的速度，消除抖动
    }
  }
}

// ---------- 一键飞抵：平滑飞掠到行星并在合适距离悬停 ----------
let flyTo = null;
const _orient = new THREE.Object3D();
function flyToBody(mesh) {
  const r = bodyRadius(mesh);
  mesh.getWorldPosition(_wp);
  const dir = camera.position.clone().sub(_wp);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  flyTo = {
    mesh,
    t: 0,
    dur: 1.6,
    startPos: camera.position.clone(),
    startQuat: camera.quaternion.clone(),
    dir: dir.normalize(),       // 接近方向（行星→相机，世界系）
    standoff: r * 3 + 4,        // 悬停距离随天体大小自适应
  };
  if (!fly.active) controls.enabled = false; // 动画期间接管相机
}
function updateFlyTo(dt) {
  flyTo.t += dt;
  const u = Math.min(1, flyTo.t / flyTo.dur);
  const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; // easeInOutQuad
  flyTo.mesh.getWorldPosition(_wp);
  const endPos = _wp.clone().add(flyTo.dir.clone().multiplyScalar(flyTo.standoff));
  camera.position.lerpVectors(flyTo.startPos, endPos, e);
  // 朝向逐渐看向目标
  _orient.position.copy(camera.position);
  _orient.lookAt(_wp);
  camera.quaternion.copy(flyTo.startQuat).slerp(_orient.quaternion, e);

  if (u >= 1) {
    const mesh = flyTo.mesh;
    flyTo = null;
    if (fly.active) {
      const eu = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      fly.yaw = eu.y;
      fly.pitch = eu.x;
      fly.vel.set(0, 0, 0);
    } else {
      focusTarget = mesh; // 交回 OrbitControls，绕行星环绕观测
      mesh.getWorldPosition(tmpVec);
      controls.target.copy(tmpVec);
      controls.enabled = true;
    }
  }
}

// ---------- 仪表盘 + 小地图雷达 ----------
const hudSpeedEl = document.getElementById("hud-speed");
const hudPosEl = document.getElementById("hud-pos");
const hudNearEl = document.getElementById("hud-near");
const radarCtx = document.getElementById("radar").getContext("2d");
const prevCamPos = camera.position.clone();
let hudAcc = 0;
const colorCss = (c) => "#" + (c >>> 0).toString(16).padStart(6, "0").slice(-6);

function updateHud(dt) {
  const speed = prevCamPos.distanceTo(camera.position) / Math.max(dt, 1e-4);
  prevCamPos.copy(camera.position);
  hudAcc += dt;
  if (hudAcc < 0.1) return; // 文字/雷达约 10Hz 刷新，省开销
  hudAcc = 0;
  hudSpeedEl.textContent = speed.toFixed(1) + " u/s";
  const p = camera.position;
  hudPosEl.textContent = `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}`;
  const near = nearestBody();
  hudNearEl.textContent = near ? `${near.body.name} ${Math.max(0, near.surfaceDist).toFixed(1)}` : "—";
  drawRadar();
  updateInfoLive();
}

function drawRadar() {
  const ctx = radarCtx, S = 170, c = S / 2, CR = 78, RMAX = 160;
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = "rgba(120,140,200,0.18)";
  for (const o of planetObjects) {
    ctx.beginPath();
    ctx.arc(c, c, (o.body.distance / RMAX) * CR, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffcc33"; // 太阳
  ctx.beginPath(); ctx.arc(c, c, 3.5, 0, Math.PI * 2); ctx.fill();
  for (const o of planetObjects) {
    o.mesh.getWorldPosition(_wp);
    ctx.fillStyle = colorCss(o.body.color);
    ctx.beginPath();
    ctx.arc(c + (_wp.x / RMAX) * CR, c + (_wp.z / RMAX) * CR, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // 相机标记 + 朝向箭头
  let cx = (camera.position.x / RMAX) * CR, cy = (camera.position.z / RMAX) * CR;
  const mag = Math.hypot(cx, cy), edge = CR - 2;
  if (mag > edge) { cx = (cx / mag) * edge; cy = (cy / mag) * edge; }
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  ctx.save();
  ctx.translate(c + cx, c + cy);
  ctx.rotate(Math.atan2(fwd.z, fwd.x));
  ctx.fillStyle = "#5dff9b";
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---------- 彗星（椭圆轨道掠日 + 粒子拖尾，背向太阳）----------
function makeGlowSprite(color, size) {
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture, color, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
    })
  );
  sp.scale.set(size, size, 1);
  return sp;
}

const comets = [];
function createComet({ a, e, incline, phase, tailLen, speed, seed = 1 }) {
  const group = new THREE.Object3D();
  group.rotation.x = incline;          // 轨道面倾斜，增加层次
  group.rotation.y = Math.random() * Math.PI * 2;
  scene.add(group);

  const nucleus = makeGlowSprite(0xbfe6ff, 2.2); // 彗核（发光点）
  group.add(nucleus);

  // 拖尾：一束粒子，永远从彗核指向「背离太阳」方向
  const N = 160;
  const pos = new Float32Array(N * 3);
  const tail = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)),
    new THREE.PointsMaterial({
      color: 0x9fd8ff, size: 0.7, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    })
  );
  group.add(tail);

  const rand = (() => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  comets.push({ group, nucleus, tail, a, e, tailLen, speed, nu: phase, N, rand, b: a * Math.sqrt(1 - e * e) });
}
// 两颗风格不同的彗星
createComet({ a: 95, e: 0.82, incline: 0.5, phase: 0.0, tailLen: 26, speed: 0.18, seed: 7 });
createComet({ a: 140, e: 0.9, incline: -0.9, phase: 2.0, tailLen: 40, speed: 0.11, seed: 23 });

const _sunDir = new THREE.Vector3();
function updateComets(dt, dayStep) {
  for (const c of comets) {
    c.nu += dt * c.speed * (0.4 + state.speed / 120); // 越接近近日点视觉越快由轨道半径体现
    // 椭圆参数方程（焦点在太阳=group 原点）
    const x = c.a * (Math.cos(c.nu) - c.e);
    const z = c.b * Math.sin(c.nu);
    c.nucleus.position.set(x, 0, z);
    // 背向太阳方向（局部坐标系下太阳在原点）
    _sunDir.set(x, 0, z).normalize();
    const arr = c.tail.geometry.attributes.position.array;
    for (let i = 0; i < c.N; i++) {
      const f = i / c.N;
      const jitter = (c.rand() - 0.5) * 2.2 * f;
      arr[i * 3] = x + _sunDir.x * c.tailLen * f + jitter;
      arr[i * 3 + 1] = jitter * 0.6;
      arr[i * 3 + 2] = z + _sunDir.z * c.tailLen * f + jitter;
    }
    c.tail.geometry.attributes.position.needsUpdate = true;
  }
}

// ---------- 流星雨（偶发的明亮划痕，自动回收复用）----------
const meteorPool = [];
const METEOR_COUNT = 14;
for (let i = 0; i < METEOR_COUNT; i++) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
  );
  line.visible = false;
  scene.add(line);
  meteorPool.push({ line, life: 0, dur: 1, vel: new THREE.Vector3() });
}
let meteorTimer = 0;
function spawnMeteor() {
  const m = meteorPool.find((x) => !x.line.visible);
  if (!m) return;
  // 在相机周围随机方位生成，确保划过可见的天区（像流星划过夜空）
  const r = 120 + Math.random() * 200;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const start = camera.position.clone().add(new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi)
  ));
  m.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
    .normalize().multiplyScalar(120 + Math.random() * 140);
  m.start = start;
  m.len = 18 + Math.random() * 26;
  m.life = 0;
  m.dur = 0.8 + Math.random() * 0.7;
  m.line.visible = true;
}
function updateMeteors(dt) {
  meteorTimer -= dt;
  if (meteorTimer <= 0) {
    spawnMeteor();
    meteorTimer = 0.6 + Math.random() * 2.2; // 平均每 ~1.5s 一颗
  }
  for (const m of meteorPool) {
    if (!m.line.visible) continue;
    m.life += dt;
    const u = m.life / m.dur;
    if (u >= 1) { m.line.visible = false; continue; }
    const head = m.start.clone().addScaledVector(m.vel, m.life);
    const tail = head.clone().addScaledVector(m.vel.clone().normalize(), -m.len);
    const arr = m.line.geometry.attributes.position.array;
    arr[0] = head.x; arr[1] = head.y; arr[2] = head.z;
    arr[3] = tail.x; arr[4] = tail.y; arr[5] = tail.z;
    m.line.geometry.attributes.position.needsUpdate = true;
    m.line.material.opacity = Math.sin(u * Math.PI); // 渐入渐出
  }
}

// ---------- 时间与播放控制 ----------
const state = { playing: true, speed: 60 }; // speed: 模拟天数/秒 的缩放系数
const clock = new THREE.Clock();

// ---------- 点击聚焦行星 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let focusTarget = null; // 跟随的 mesh
let pointerDownPos = null;

renderer.domElement.addEventListener("pointerdown", (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!pointerDownPos) return;
  const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
  pointerDownPos = null;
  if (moved > 6) return; // 拖拽不算点击

  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(focusables, false);
  if (hits.length) selectBody(hits[0].object);
});

function selectBody(mesh) {
  if (tour.active) stopTour(); // 手动选择即结束自动导览
  flyToBody(mesh); // 平滑飞掠过去并悬停
  showInfo(mesh.userData.body);
}

// ---------- 自动导览 / 语音解说 ----------
const tour = { active: false, paused: false, index: 0, dwell: 0, voice: true, seq: [] };
// 缓存 DOM,避免每帧 getElementById
const tourEls = {
  bar: document.getElementById("tour-bar"),
  step: document.getElementById("tour-step"),
  name: document.getElementById("tour-stop-name"),
  sub: document.getElementById("tour-subtitle"),
  fill: document.getElementById("tour-fill"),
  toggle: document.getElementById("tour-toggle"),
  pause: document.getElementById("tour-pause"),
};
controls.autoRotateSpeed = 0.8; // 导览环绕镜头的转速(温和)

function speak(body) {
  if (!tour.voice || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(`${body.name}。${body.desc}`);
  u.lang = "zh-CN";
  u.rate = 1.0;
  window.speechSynthesis.speak(u);
}

function tourGoto(i) {
  tour.index = i;
  tour.dwell = 0;
  const mesh = tour.seq[i];
  const body = mesh.userData.body;
  flyToBody(mesh);
  showInfo(body);
  speak(body);
  // 更新字幕与进度
  tourEls.step.textContent = `第 ${i + 1} / ${tour.seq.length} 站`;
  tourEls.name.textContent = body.name;
  tourEls.sub.textContent = `${body.name}。${body.desc}`;
}

function setTourProgress(frac) {
  const f = Math.max(0, Math.min(1, frac));
  tourEls.fill.style.width = `${(f * 100).toFixed(1)}%`;
}

function startTour() {
  if (!tour.seq.length) return;
  tour.active = true;
  tour.paused = false;
  tourEls.pause.textContent = "⏸";
  exitFlyMode();
  flyTo = null;
  controls.enabled = true;
  tourEls.toggle.classList.add("active");
  tourEls.bar.classList.remove("hidden");
  tourGoto(0);
}

function stopTour() {
  tour.active = false;
  tour.paused = false;
  tour.dwell = 0;
  controls.autoRotate = false;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  tourEls.toggle.classList.remove("active");
  tourEls.bar.classList.add("hidden");
}

// 播放控制：上一站 / 下一站 / 暂停讲解
function tourPrev() {
  if (!tour.active) return;
  tourGoto(Math.max(0, tour.index - 1));
}
function tourNext() {
  if (!tour.active) return;
  if (tour.index + 1 < tour.seq.length) tourGoto(tour.index + 1);
  else stopTour();
}
function tourTogglePause() {
  if (!tour.active) return;
  tour.paused = !tour.paused;
  tourEls.pause.textContent = tour.paused ? "▶" : "⏸";
  if ("speechSynthesis" in window) {
    if (tour.paused) window.speechSynthesis.pause();
    else window.speechSynthesis.resume();
  }
}

// 每帧推进导览：飞抵动画结束后绕行星环绕讲解约 6 秒，再前往下一个
const TOUR_DWELL = 6;
function updateTour(dt) {
  if (!tour.active) return;
  // 抵达后开启环绕镜头（飞行/飞抵途中关闭）
  controls.autoRotate = !flyTo && !fly.active;
  // 飞行途中进度停在本站起点；悬停讲解时按 dwell 推进本站进度
  const dwellFrac = flyTo ? 0 : Math.min(tour.dwell / TOUR_DWELL, 1);
  setTourProgress((tour.index + dwellFrac) / tour.seq.length);
  if (flyTo || tour.paused) return; // 暂停时镜头仍环绕,但不推进站点
  tour.dwell += dt;
  if (tour.dwell > TOUR_DWELL) tourNext();
}

// ---------- 信息卡片 ----------
const infoCard = document.getElementById("info-card");
const infoName = document.getElementById("info-name");
const infoDesc = document.getElementById("info-desc");
const infoStats = document.getElementById("info-stats");
const infoLive = document.getElementById("info-live");
let currentInfoBody = null; // 当前信息卡对应天体，用于刷新实时距离

function showInfo(body) {
  currentInfoBody = body;
  infoName.textContent = `${body.name} · ${body.enName}`;
  infoDesc.textContent = body.desc;
  infoStats.innerHTML = "";
  for (const [k, v] of body.stats) {
    const li = document.createElement("li");
    li.innerHTML = `${k}<span>${v}</span>`;
    infoStats.appendChild(li);
  }
  infoCard.classList.remove("hidden");
  updateInfoLive();
}

// 实时星历数据：与太阳/地球的真实距离（AU），基于当前真实时刻
function updateInfoLive() {
  const body = currentInfoBody;
  if (!body || infoCard.classList.contains("hidden")) return;
  const en = body.enName;
  if (en === "Sun") { infoLive.classList.add("hidden"); return; }
  const now = new Date();
  const dSun = sunDistanceAU(en, now);
  if (!Number.isFinite(dSun) || dSun === 0) { infoLive.classList.add("hidden"); return; }
  const parts = [`距太阳 ${dSun.toFixed(3)} AU`];
  if (en !== "Earth") parts.push(`距地球 ${earthDistanceAU(en, now).toFixed(3)} AU`);
  infoLive.textContent = `🛰 实时星历（${now.toLocaleDateString("zh-CN")}）｜ ` + parts.join(" · ");
  infoLive.classList.remove("hidden");
}

document.getElementById("info-close").addEventListener("click", () => {
  infoCard.classList.add("hidden");
  currentInfoBody = null;
  focusTarget = null;
});

// ---------- 自适应分辨率（按帧率动态升降像素比）----------
function updateAdaptive(dt) {
  perf.acc += dt;
  perf.frames++;
  if (perf.acc < 1) return; // 每秒评估一次
  const fps = perf.frames / perf.acc;
  perf.acc = 0;
  perf.frames = 0;
  let d = perf.dpr;
  if (fps < 45 && d > perf.min) d = Math.max(perf.min, d - 0.15);
  else if (fps > 58 && d < perf.cap) d = Math.min(perf.cap, d + 0.1);
  if (Math.abs(d - perf.dpr) > 0.001) {
    perf.dpr = d;
    renderer.setPixelRatio(d);
    composer.setPixelRatio?.(d);
  }
}

// ---------- 动画循环 ----------
const tmpVec = new THREE.Vector3();

function animate() {
  const dt = clock.getDelta();

  // 日冕脉动 + 缓慢旋转（耀斑动画）——不受暂停影响，太阳始终「活着」
  const t = clock.elapsedTime;
  corona.material.opacity = 0.4 + Math.sin(t * 1.3) * 0.12;
  corona.material.rotation += dt * 0.05;
  const pulse = 1 + Math.sin(t * 0.9) * 0.06;
  corona.scale.set(SUN.radius * 9 * pulse, SUN.radius * 9 * pulse, 1);
  glow.material.opacity = 0.85 + Math.sin(t * 1.7) * 0.08;

  // 彗星与流星雨（持续运行，不受暂停影响）
  updateComets(dt);
  updateMeteors(dt);

  if (state.playing) {
    const dayStep = dt * state.speed; // 本帧推进的「天数」

    // 太阳自转
    sunMesh.rotation.y += dt * 0.1;
    // 小行星带缓慢公转
    asteroidBelt.rotation.y += dt * asteroidBelt.userData.spin;

    for (const obj of planetObjects) {
      const { body, pivot, mesh, clouds, atmo, spot } = obj;
      // 公转：周期(年) -> 天，角速度 = 2π / (period*365)
      obj.angle += (dayStep * Math.PI * 2) / (body.orbitPeriod * 365);
      pivot.rotation.y = obj.angle;
      // 自转：周期(天)
      mesh.rotation.y += (dayStep * Math.PI * 2) / (body.rotationPeriod * 1);
      // 云层比地表略快地飘动
      if (clouds) clouds.rotation.y += (dayStep * Math.PI * 2) / (body.rotationPeriod * 0.85);
      // 气态巨行星大气叠层：相对本体缓慢反向漂移，营造云带流动/风暴翻涌
      if (atmo) atmo.rotation.y += dayStep * 0.0009;
      // 大红斑就地自旋（绕自身法线），呈现翻涌的风暴之眼
      if (spot) spot.rotateZ(dt * 0.25);

      // 卫星公转
      if (body._moonPivots) {
        for (let i = 0; i < body._moonPivots.length; i++) {
          const mp = body._moonPivots[i];
          const moon = body.moons[i];
          mp.userData.angle += (dayStep * Math.PI * 2) / (moon.orbitPeriod * 365);
          mp.rotation.y = mp.userData.angle;
        }
      }
    }
  }

  // 相机控制优先级：飞抵动画 > 自由飞行 > 轨道环绕
  if (flyTo) {
    updateFlyTo(dt);
  } else if (fly.active) {
    updateFly(dt);
  } else {
    // 跟随聚焦目标
    if (focusTarget) {
      focusTarget.getWorldPosition(tmpVec);
      controls.target.lerp(tmpVec, 0.1);
    }
    controls.update();
  }

  updateTour(dt);
  updateHud(dt);
  updateAdaptive(dt);

  // WebXR 模式下直接渲染（EffectComposer 不支持 XR 多视图）；否则走 Bloom 后期管线
  if (renderer.xr.isPresenting) renderer.render(scene, camera);
  else composer.render();
  labelRenderer.render(scene, camera);
}
renderer.setAnimationLoop(animate); // setAnimationLoop 兼容 WebXR

// ---------- UI 绑定 ----------
const playBtn = document.getElementById("play-toggle");
playBtn.addEventListener("click", () => {
  state.playing = !state.playing;
  playBtn.textContent = state.playing ? "⏸ 暂停" : "▶ 继续";
});

document.getElementById("reset-view").addEventListener("click", () => {
  stopTour();
  exitFlyMode();
  flyTo = null;
  controls.enabled = true;
  focusTarget = null;
  infoCard.classList.add("hidden");
  controls.target.set(0, 0, 0);
  camera.position.set(0, 60, 160);
});

document.getElementById("fly-toggle").addEventListener("click", () => {
  if (tour.active) stopTour();
  if (fly.active) exitFlyMode();
  else enterFlyMode();
});

document.getElementById("tour-toggle").addEventListener("click", () => {
  if (tour.active) stopTour();
  else startTour();
});
document.getElementById("tour-prev").addEventListener("click", tourPrev);
document.getElementById("tour-next").addEventListener("click", tourNext);
document.getElementById("tour-pause").addEventListener("click", tourTogglePause);

document.getElementById("toggle-voice").addEventListener("change", (e) => {
  tour.voice = e.target.checked;
  if (!tour.voice && "speechSynthesis" in window) window.speechSynthesis.cancel();
});

// 真实星历：把每颗行星/矮行星对齐到「今天此刻」的真实日心角位置
document.getElementById("ephemeris-align").addEventListener("click", () => {
  const now = new Date();
  for (const obj of planetObjects) {
    const lon = helioLongitude(obj.body.enName, now);
    if (Number.isFinite(lon)) {
      obj.angle = lon;
      obj.pivot.rotation.y = lon; // 立即生效（即使处于暂停）
    }
  }
  updateInfoLive();
});

const speedInput = document.getElementById("speed");
const speedVal = document.getElementById("speed-val");
speedInput.addEventListener("input", () => {
  state.speed = Number(speedInput.value);
  speedVal.textContent = `${state.speed}×`;
});

document.getElementById("toggle-orbits").addEventListener("change", (e) => {
  for (const obj of planetObjects) obj.orbit.visible = e.target.checked;
});
document.getElementById("toggle-labels").addEventListener("change", (e) => {
  labelRenderer.domElement.style.display = e.target.checked ? "block" : "none";
});

// 快速跳转按钮
const jumpRow = document.getElementById("planet-jump");
const allBodies = [{ name: SUN.name, mesh: sunMesh }, ...planetObjects.map((o) => ({ name: o.body.name, mesh: o.mesh }))];
for (const b of allBodies) {
  const btn = document.createElement("button");
  btn.textContent = b.name;
  btn.addEventListener("click", () => selectBody(b.mesh));
  jumpRow.appendChild(btn);
}

// 触屏设备隐藏「自由飞行」：它依赖指针锁定 + WASD 键盘，移动端无法操作
if (isMobile) {
  document.getElementById("fly-toggle").style.display = "none";
  document.getElementById("fly-hint").style.display = "none";
}

// 导览顺序：太阳 → 八大行星（矮行星不纳入，保持节奏紧凑）
tour.seq = [sunMesh, ...planetObjects.filter((o) => !o.body.dwarf).map((o) => o.mesh)];

// ---------- 自适应窗口 ----------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// 隐藏加载提示
document.getElementById("loading").classList.add("hidden");
