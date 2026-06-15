import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { SUN, PLANETS } from "./data.js";
import { planetTexture, cloudTexture, ringTexture, sunTexture } from "./textures.js";

// ---------- 基础场景 ----------
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);
camera.position.set(0, 60, 160);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true; // 预留 WebXR：插上头显即可进入沉浸模式
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

// 相机控制
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 12;
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

  // 平滑加减速，手感更顺滑
  fly.vel.lerp(target, Math.min(1, dt * 6));
  camera.position.addScaledVector(fly.vel, dt);
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
scene.add(createStarfield());

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

for (const p of PLANETS) {
  const pivot = new THREE.Object3D(); // 公转
  scene.add(pivot);

  const holder = new THREE.Object3D(); // 位于轨道半径处，始终竖直（标签用）
  holder.position.x = p.distance;
  pivot.add(holder);

  const tiltGroup = new THREE.Object3D(); // 自转轴倾角
  tiltGroup.rotation.z = THREE.MathUtils.degToRad(p.axialTilt || 0);
  holder.add(tiltGroup);

  const isGiant = p.type === "gasGiant" || p.type === "iceGiant";
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(p.size, 48, 48),
    new THREE.MeshStandardMaterial({
      map: planetTexture(p),
      roughness: isGiant ? 0.65 : 0.95,
      metalness: 0.0,
    })
  );
  mesh.userData = { body: p, isFocusable: true };
  tiltGroup.add(mesh);
  focusables.push(mesh);

  // 地球云层（略大的半透明球）
  let clouds = null;
  if (p.type === "earth") {
    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(p.size * 1.02, 48, 48),
      new THREE.MeshStandardMaterial({
        map: cloudTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
      })
    );
    mesh.add(clouds);
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
        new THREE.SphereGeometry(m.size, 20, 20),
        new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.95 })
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

  planetObjects.push({ body: p, pivot, mesh, clouds, angle: p.tilt, orbit, label });
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
  focusTarget = mesh;
  showInfo(mesh.userData.body);
}

// ---------- 信息卡片 ----------
const infoCard = document.getElementById("info-card");
const infoName = document.getElementById("info-name");
const infoDesc = document.getElementById("info-desc");
const infoStats = document.getElementById("info-stats");

function showInfo(body) {
  infoName.textContent = `${body.name} · ${body.enName}`;
  infoDesc.textContent = body.desc;
  infoStats.innerHTML = "";
  for (const [k, v] of body.stats) {
    const li = document.createElement("li");
    li.innerHTML = `${k}<span>${v}</span>`;
    infoStats.appendChild(li);
  }
  infoCard.classList.remove("hidden");
}
document.getElementById("info-close").addEventListener("click", () => {
  infoCard.classList.add("hidden");
  focusTarget = null;
});

// ---------- 动画循环 ----------
const tmpVec = new THREE.Vector3();

function animate() {
  const dt = clock.getDelta();

  if (state.playing) {
    const dayStep = dt * state.speed; // 本帧推进的「天数」

    // 太阳自转
    sunMesh.rotation.y += dt * 0.1;
    // 小行星带缓慢公转
    asteroidBelt.rotation.y += dt * asteroidBelt.userData.spin;

    for (const obj of planetObjects) {
      const { body, pivot, mesh, clouds } = obj;
      // 公转：周期(年) -> 天，角速度 = 2π / (period*365)
      obj.angle += (dayStep * Math.PI * 2) / (body.orbitPeriod * 365);
      pivot.rotation.y = obj.angle;
      // 自转：周期(天)
      mesh.rotation.y += (dayStep * Math.PI * 2) / (body.rotationPeriod * 1);
      // 云层比地表略快地飘动
      if (clouds) clouds.rotation.y += (dayStep * Math.PI * 2) / (body.rotationPeriod * 0.85);

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

  // 自由飞行：驾驶相机漫游
  if (fly.active) {
    updateFly(dt);
  } else {
    // 跟随聚焦目标
    if (focusTarget) {
      focusTarget.getWorldPosition(tmpVec);
      controls.target.lerp(tmpVec, 0.1);
    }
    controls.update();
  }
  renderer.render(scene, camera);
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
  exitFlyMode();
  focusTarget = null;
  infoCard.classList.add("hidden");
  controls.target.set(0, 0, 0);
  camera.position.set(0, 60, 160);
});

document.getElementById("fly-toggle").addEventListener("click", () => {
  if (fly.active) exitFlyMode();
  else enterFlyMode();
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

// ---------- 自适应窗口 ----------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// 隐藏加载提示
document.getElementById("loading").classList.add("hidden");
