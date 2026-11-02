/* ============================================================
   躲避游戏 3D · Three.js（视觉增强版 + 掉落物）
   玩法：WASD 在场地内移动，躲开从四面八方飞来的红色能量球，
        撑过 180 秒即通关；被击中扣 1 条命。
   掉落物：三种增益随机掉落，碰到即拾取——
        ◆ 生命晶体（绿）生命 +1（上限 4）
        ◆ 护盾核心（金）抵挡一次伤害
        ◆ 时间碎片（蓝）剩余时间 +15 秒
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 参数 ---------------- */
  const ARENA = 16;                 // 场地半边长
  const PLAYER_SPEED = 9.5;         // 玩家速度（单位/秒）
  const BULLET_SPEED = 7.2;         // 能量球速度
  const SPAWN_RADIUS = 25;          // 生成半径（场地外圈）
  const HIT_RADIUS = 1.15;          // 碰撞判定半径
  const TOTAL_TIME = 180;
  const START_LIVES = 3;
  const MAX_LIVES = 4;              // 生命上限（掉落物可突破初始 3）
  const INVINCIBLE_MS = 1200;
  const SPAWN_INTERVAL = 0.42;      // 生成间隔（秒）
  const TRAIL_LEN = 9;              // 拖尾历史点数

  /* 掉落物 */
  const PICKUP_MIN_GAP = 8;         // 最短生成间隔（秒）
  const PICKUP_MAX_GAP = 14;        // 最长生成间隔（秒）
  const PICKUP_LIFETIME = 9;        // 掉落物存活时间（秒）
  const PICKUP_RADIUS = 1.45;       // 拾取判定半径
  const PICKUP_MIN_DIST = 6;        // 距玩家最短生成距离
  const TIME_BONUS = 15;            // 时间碎片奖励（秒）

  /* ---------------- DOM ---------------- */
  const timeEl = document.getElementById('timeText');
  const timeBar = document.getElementById('timeBar');
  const livesBox = document.getElementById('livesBox');
  const shieldMark = document.getElementById('shieldMark');
  const tipEl = document.getElementById('pickupTip');
  const hudEl = document.getElementById('hud');
  const modal = document.getElementById('gameModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalSub = document.getElementById('modalSub');
  const restartBtn = document.getElementById('restartBtn');

  /* ---------------- 渲染器 ---------------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
  if ('toneMapping' in renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
  }
  document.getElementById('stage').appendChild(renderer.domElement);

  /* ---------------- 通用辉光贴图 ---------------- */
  function makeGlowTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.35, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }
  const glowRedTex = makeGlowTexture('rgba(255,220,225,1)', 'rgba(255,60,90,0.55)');
  const glowCyanTex = makeGlowTexture('rgba(225,250,255,1)', 'rgba(60,190,255,0.5)');
  const glowWhiteTex = makeGlowTexture('rgba(255,255,255,1)', 'rgba(170,200,255,0.4)');
  const glowGreenTex = makeGlowTexture('rgba(225,255,240,1)', 'rgba(60,230,140,0.55)');
  const glowGoldTex = makeGlowTexture('rgba(255,244,220,1)', 'rgba(255,190,70,0.55)');
  const glowBlueTex = makeGlowTexture('rgba(225,240,255,1)', 'rgba(90,160,255,0.55)');

  /* ---------------- 场景 / 相机 ---------------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);
  scene.fog = new THREE.FogExp2(0x05070f, 0.015);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    400
  );
  camera.position.set(0, 32, 27);
  camera.lookAt(0, 0, 0);

  /* ---------------- 环绕星尘 ---------------- */
  let stars;
  (function makeStars() {
    const COUNT = 550;
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const r = 30 + Math.pow(Math.random(), 1.6) * 75;
      const theta = Math.random() * Math.PI * 2;
      pos[i * 3] = r * Math.cos(theta);
      pos[i * 3 + 1] = 0.5 + Math.pow(Math.random(), 2) * 26;
      pos[i * 3 + 2] = r * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 3.2,
      map: glowWhiteTex,
      color: 0xa9c4f0,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
      fog: false
    });
    stars = new THREE.Points(geo, mat);
    scene.add(stars);
  })();

  /* ---------------- 灯光 ---------------- */
  scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x050810, 0.55));

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.95);
  keyLight.position.set(16, 28, 14);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  const sc = keyLight.shadow.camera;
  sc.left = -26;
  sc.right = 26;
  sc.top = 26;
  sc.bottom = -26;
  sc.near = 1;
  sc.far = 90;
  scene.add(keyLight);

  const coolLight = new THREE.PointLight(0x2a6cff, 1.6, 100);
  coolLight.position.set(-20, 14, -18);
  scene.add(coolLight);

  const warmLight = new THREE.PointLight(0x18b598, 1.1, 100);
  warmLight.position.set(22, 10, 20);
  scene.add(warmLight);

  /* ---------------- 场地 ---------------- */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA * 2, ARENA * 2),
    new THREE.MeshStandardMaterial({
      color: 0x060b17,
      roughness: 0.72,
      metalness: 0.42
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(ARENA * 2, 16, 0x2ad4ff, 0x1d4266);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  grid.position.y = 0.012;
  scene.add(grid);

  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(ARENA * 2, 0.1, ARENA * 2)),
    new THREE.LineBasicMaterial({
      color: 0x2ad4ff,
      transparent: true,
      opacity: 0.6
    })
  );
  border.position.y = 0.06;
  scene.add(border);

  // 四角信标柱
  const beaconGeo = new THREE.CylinderGeometry(0.14, 0.22, 3.2, 10);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x0d2036,
    emissive: 0x2ad4ff,
    emissiveIntensity: 0.9,
    roughness: 0.3,
    metalness: 0.5
  });
  const cornerGlowMat = new THREE.SpriteMaterial({
    map: glowCyanTex,
    color: 0x54e0ff,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const beacons = [];
  [[-ARENA, -ARENA], [ARENA, -ARENA], [-ARENA, ARENA], [ARENA, ARENA]].forEach(function (p) {
    const pillar = new THREE.Mesh(beaconGeo, beaconMat);
    pillar.position.set(p[0], 1.6, p[1]);
    scene.add(pillar);
    const glow = new THREE.Sprite(cornerGlowMat.clone());
    glow.scale.set(3.4, 3.4, 1);
    glow.position.set(p[0], 3.4, p[1]);
    scene.add(glow);
    beacons.push(glow);
  });

  /* ---------------- 玩家 ---------------- */
  const player = new THREE.Group();
  player.position.set(0, 0, 0);
  scene.add(player);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x3d6fd0,
    roughness: 0.35,
    metalness: 0.65
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.15, 0.85), bodyMat);
  body.position.y = 0.95;
  body.castShadow = true;
  player.add(body);

  const shoulderMat = new THREE.MeshStandardMaterial({
    color: 0x27509e,
    roughness: 0.4,
    metalness: 0.7
  });
  [-1, 1].forEach(function (dir) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.7), shoulderMat);
    pad.position.set(dir * 0.62, 1.15, 0);
    pad.castShadow = true;
    player.add(pad);
  });

  const headMat = new THREE.MeshStandardMaterial({
    color: 0xa8cdf5,
    emissive: 0x2b66d0,
    emissiveIntensity: 0.55,
    roughness: 0.25,
    metalness: 0.55
  });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.46, 0.62), headMat);
  head.position.y = 1.76;
  head.castShadow = true;
  player.add(head);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.54, 0.12, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x74f4ff })
  );
  visor.position.set(0, 1.77, 0.33);
  player.add(visor);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1.02, 40),
    new THREE.MeshBasicMaterial({
      color: 0x39d0ff,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  player.add(ring);

  // 引擎辉光
  const engineGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowCyanTex,
    color: 0x66e4ff,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  engineGlow.scale.set(1.6, 1.6, 1);
  engineGlow.position.set(0, 0.5, -0.8);
  player.add(engineGlow);

  // 玩家随身点光
  const playerLight = new THREE.PointLight(0x39d0ff, 1.5, 12, 2);
  playerLight.position.set(0, 3.2, 0);
  player.add(playerLight);

  // 护盾可视化：半透明金色球壳
  const shieldMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.25, 20, 20),
    new THREE.MeshBasicMaterial({
      color: 0xffc94d,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  shieldMesh.position.y = 1.1;
  shieldMesh.visible = false;
  player.add(shieldMesh);

  /* ---------------- 能量球 ---------------- */
  const bulletCoreGeo = new THREE.SphereGeometry(0.34, 14, 14);
  const bulletCoreMat = new THREE.MeshBasicMaterial({ color: 0xff5064 });
  const bulletGlowMat = new THREE.SpriteMaterial({
    map: glowRedTex,
    color: 0xff3344,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const bullets = [];

  function spawnBullet() {
    const angle = Math.random() * Math.PI * 2;
    const sx = Math.cos(angle) * SPAWN_RADIUS;
    const sz = Math.sin(angle) * SPAWN_RADIUS;

    const obj = new THREE.Group();
    obj.add(new THREE.Mesh(bulletCoreGeo, bulletCoreMat));
    const glow = new THREE.Sprite(bulletGlowMat.clone());
    glow.scale.set(2.3, 2.3, 1);
    obj.add(glow);
    obj.position.set(sx, 0.9, sz);
    scene.add(obj);

    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(TRAIL_LEN * 3);
    for (let i = 0; i < TRAIL_LEN; i++) {
      trailPos[i * 3] = sx;
      trailPos[i * 3 + 1] = 0.9;
      trailPos[i * 3 + 2] = sz;
    }
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
      color: 0xff4a5e,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    scene.add(trail);

    const dx = player.position.x - sx;
    const dz = player.position.z - sz;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;

    bullets.push({
      obj: obj,
      trail: trail,
      vx: (dx / len) * BULLET_SPEED,
      vz: (dz / len) * BULLET_SPEED
    });
  }

  function removeBullet(index) {
    const b = bullets[index];
    if (!b) return;
    scene.remove(b.obj);
    scene.remove(b.trail);
    b.trail.geometry.dispose();
    b.trail.material.dispose();
    bullets.splice(index, 1);
  }

  function clearBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
      scene.remove(bullets[i].obj);
      scene.remove(bullets[i].trail);
      bullets[i].trail.geometry.dispose();
      bullets[i].trail.material.dispose();
    }
    bullets.length = 0;
  }

  /* ---------------- 爆炸粒子（可换色） ---------------- */
  const P_COUNT = 64;
  const pPos = new Float32Array(P_COUNT * 3);
  const pVel = new Float32Array(P_COUNT * 3);
  const pLife = new Float32Array(P_COUNT);
  for (let i = 0; i < P_COUNT; i++) pPos[i * 3 + 1] = -100;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    size: 0.55,
    map: glowRedTex,
    color: 0xff6a7c,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const particles = new THREE.Points(pGeo, pMat);
  particles.frustumCulled = false;
  scene.add(particles);
  let pCursor = 0;

  function burst(x, y, z, count, color) {
    if (color) pMat.color.setHex(color);
    for (let n = 0; n < count; n++) {
      const i = pCursor;
      pCursor = (pCursor + 1) % P_COUNT;
      pPos[i * 3] = x;
      pPos[i * 3 + 1] = y;
      pPos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const up = 0.5 + Math.random() * 2.2;
      const sp = 2.5 + Math.random() * 4.5;
      pVel[i * 3] = Math.cos(a) * sp;
      pVel[i * 3 + 1] = up;
      pVel[i * 3 + 2] = Math.sin(a) * sp;
      pLife[i] = 1;
    }
  }

  function updateParticles(dt) {
    let alive = false;
    for (let i = 0; i < P_COUNT; i++) {
      if (pLife[i] <= 0) continue;
      alive = true;
      pLife[i] -= dt * 1.5;
      pVel[i * 3 + 1] -= 7 * dt;
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      if (pPos[i * 3 + 1] < 0.05) {
        pPos[i * 3 + 1] = 0.05;
        pVel[i * 3 + 1] *= -0.35;
        pVel[i * 3] *= 0.7;
        pVel[i * 3 + 2] *= 0.7;
      }
      if (pLife[i] <= 0) pPos[i * 3 + 1] = -100;
    }
    if (alive) pGeo.attributes.position.needsUpdate = true;
  }

  /* ---------------- 掉落物 ---------------- */
  const PICKUP_DEFS = {
    life: {
      label: '生命 +1',
      cls: 't-life',
      color: 0x35e07f,
      glow: glowGreenTex,
      burst: 0x4ff0a0,
      geo: new THREE.OctahedronGeometry(0.46, 0)
    },
    shield: {
      label: '护盾已激活',
      cls: 't-shield',
      color: 0xffc94d,
      glow: glowGoldTex,
      burst: 0xffd070,
      geo: new THREE.IcosahedronGeometry(0.44, 0)
    },
    time: {
      label: '时间 +15s',
      cls: 't-time',
      color: 0x5a9cff,
      glow: glowBlueTex,
      burst: 0x7db8ff,
      geo: new THREE.TorusGeometry(0.36, 0.13, 10, 24)
    }
  };

  const pickups = [];
  let pickupTimer = 5;              // 开局 5 秒出第一个

  function spawnPickup() {
    const types = Object.keys(PICKUP_DEFS);
    // 生命满了就不掉生命晶体
    let type;
    do {
      type = types[Math.floor(Math.random() * types.length)];
    } while (type === 'life' && lives >= MAX_LIVES);

    // 随机位置，避开玩家周围
    let x, z, tries = 0;
    do {
      x = (Math.random() * 2 - 1) * (ARENA - 3);
      z = (Math.random() * 2 - 1) * (ARENA - 3);
      tries++;
    } while (
      tries < 20 &&
      Math.hypot(x - player.position.x, z - player.position.z) < PICKUP_MIN_DIST
    );

    const def = PICKUP_DEFS[type];
    const obj = new THREE.Group();

    const core = new THREE.Mesh(def.geo, new THREE.MeshStandardMaterial({
      color: def.color,
      emissive: def.color,
      emissiveIntensity: 0.75,
      roughness: 0.3,
      metalness: 0.45
    }));
    core.castShadow = true;
    obj.add(core);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: def.glow,
      color: def.color,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    glow.scale.set(2.6, 2.6, 1);
    obj.add(glow);

    // 底部光环
    const base = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.75, 32),
      new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
      })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.95;
    obj.add(base);

    obj.position.set(x, 1.1, z);
    scene.add(obj);

    pickups.push({
      obj: obj,
      core: core,
      glow: glow,
      base: base,
      type: type,
      age: 0
    });
  }

  function removePickup(index) {
    const p = pickups[index];
    if (!p) return;
    scene.remove(p.obj);
    p.core.material.dispose();
    p.glow.material.dispose();
    p.base.geometry.dispose();
    p.base.material.dispose();
    pickups.splice(index, 1);
  }

  function clearPickups() {
    for (let i = pickups.length - 1; i >= 0; i--) {
      scene.remove(pickups[i].obj);
    }
    pickups.length = 0;
  }

  /* ---------------- 状态 ---------------- */
  let state = 'playing';
  let lives = START_LIVES;
  let timeLeft = TOTAL_TIME;
  let invincible = false;
  let invincibleEnd = 0;
  let spawnTimer = 0;
  let elapsed = 0;
  let shake = 0;
  let shield = false;

  const keys = Object.create(null);

  window.addEventListener('keydown', function (e) {
    keys[e.key.toLowerCase()] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(e.key.toLowerCase()) >= 0) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', function (e) {
    keys[e.key.toLowerCase()] = false;
  });

  /* ---------------- HUD ---------------- */
  const pips = [];
  for (let i = 0; i < MAX_LIVES; i++) {
    const pip = document.createElement('span');
    pip.className = 'life-pip';
    livesBox.appendChild(pip);
    pips.push(pip);
  }

  function syncLives() {
    for (let i = 0; i < pips.length; i++) {
      pips[i].className = 'life-pip' + (i < lives ? '' : ' lost');
    }
  }

  function syncShield() {
    shieldMark.className = 'shield-mark' + (shield ? ' on' : '');
    shieldMesh.visible = shield;
  }

  function syncTime() {
    const t = Math.max(0, Math.ceil(timeLeft));
    timeEl.textContent = t;
    if (timeBar) {
      timeBar.style.width = Math.min(100, Math.max(0, (timeLeft / TOTAL_TIME) * 100)) + '%';
    }
    if (t <= 10 && state === 'playing') {
      timeEl.classList.add('danger');
      if (hudEl) hudEl.classList.add('danger');
    } else {
      timeEl.classList.remove('danger');
      if (hudEl) hudEl.classList.remove('danger');
    }
  }

  let tipTimer = 0;
  function showTip(text, cls) {
    tipEl.textContent = text;
    tipEl.className = '';
    void tipEl.offsetWidth;              // 重启动画
    tipEl.className = 'show ' + cls;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () { tipEl.className = ''; }, 1700);
  }

  /* ---------------- 拾取 ---------------- */
  function collectPickup(p) {
    const def = PICKUP_DEFS[p.type];
    burst(p.obj.position.x, p.obj.position.y, p.obj.position.z, 32, def.burst);
    showTip(def.label, def.cls);

    if (p.type === 'life') {
      lives = Math.min(MAX_LIVES, lives + 1);
      syncLives();
    } else if (p.type === 'shield') {
      shield = true;
      syncShield();
    } else if (p.type === 'time') {
      timeLeft += TIME_BONUS;
      syncTime();
    }
  }

  /* ---------------- 玩法 ---------------- */
  function hitPlayer() {
    if (invincible || state !== 'playing') return;

    invincible = true;
    invincibleEnd = performance.now() + (shield ? 900 : INVINCIBLE_MS);
    shake = 1;
    clearBullets();

    if (shield) {
      // 护盾抵挡：破盾但不扣命
      shield = false;
      syncShield();
      burst(player.position.x, 1.2, player.position.z, 36, 0xffd070);
      showTip('护盾抵挡了一次', 't-shield');
      return;
    }

    lives -= 1;
    syncLives();
    burst(player.position.x, 1.2, player.position.z, 40, 0xff6a7c);

    if (lives <= 0) endGame(false);
  }

  function endGame(win) {
    if (state === 'over') return;
    state = 'over';
    clearBullets();
    clearPickups();
    if (hudEl) hudEl.classList.remove('danger');

    if (win) {
      modalTitle.textContent = '时间到，你撑住了';
      modalSub.textContent = '180 秒全身而退，反应力不错。';
    } else {
      modalTitle.textContent = '生命耗尽';
      modalSub.textContent = '被能量球击中 ' + START_LIVES + ' 次。再来一局试试。';
    }
    modal.classList.add('show');
  }

  function resetGame() {
    clearBullets();
    clearPickups();
    player.position.set(0, 0, 0);
    player.rotation.y = 0;
    player.rotation.z = 0;
    player.visible = true;

    state = 'playing';
    lives = START_LIVES;
    timeLeft = TOTAL_TIME;
    invincible = false;
    invincibleEnd = 0;
    spawnTimer = 0;
    elapsed = 0;
    shake = 0;
    shield = false;
    pickupTimer = 5;

    syncLives();
    syncShield();
    syncTime();
    modal.classList.remove('show');
  }

  restartBtn.addEventListener('click', resetGame);

  /* ---------------- 每帧更新 ---------------- */
  function update(dt, now) {
    // --- 计时 ---
    timeLeft -= dt;
    syncTime();
    if (timeLeft <= 0) {
      endGame(true);
      return;
    }

    // --- 无敌闪烁 ---
    if (invincible) {
      if (now >= invincibleEnd) {
        invincible = false;
        player.visible = true;
      } else {
        player.visible = Math.floor(now / 90) % 2 === 0;
      }
    }

    // --- 移动 ---
    let mx = 0;
    let mz = 0;
    if (keys['w'] || keys['arrowup']) mz -= 1;
    if (keys['s'] || keys['arrowdown']) mz += 1;
    if (keys['a'] || keys['arrowleft']) mx -= 1;
    if (keys['d'] || keys['arrowright']) mx += 1;

    if (mx !== 0 || mz !== 0) {
      const inv = 1 / Math.sqrt(mx * mx + mz * mz);
      mx *= inv;
      mz *= inv;

      player.position.x += mx * PLAYER_SPEED * dt;
      player.position.z += mz * PLAYER_SPEED * dt;

      const limit = ARENA - 0.9;
      player.position.x = Math.max(-limit, Math.min(limit, player.position.x));
      player.position.z = Math.max(-limit, Math.min(limit, player.position.z));

      const target = Math.atan2(mx, mz);
      let diff = target - player.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.rotation.y += diff * Math.min(1, dt * 12);

      player.rotation.z += (mx * -0.28 - player.rotation.z) * Math.min(1, dt * 8);
    } else {
      player.rotation.z += (0 - player.rotation.z) * Math.min(1, dt * 8);
    }

    // --- 悬浮 + 光环旋转 ---
    player.position.y = Math.sin(now * 0.0022) * 0.06;
    ring.rotation.z -= dt * (invincible ? 3.2 : 0.9);
    engineGlow.material.opacity = 0.5 + Math.sin(now * 0.02) * 0.25 + (mx || mz ? 0.25 : 0);
    if (shield) {
      shieldMesh.material.opacity = 0.13 + Math.sin(now * 0.005) * 0.05;
      shieldMesh.rotation.y += dt * 0.8;
    }

    // --- 生成能量球 ---
    spawnTimer += dt;
    while (spawnTimer >= SPAWN_INTERVAL) {
      spawnTimer -= SPAWN_INTERVAL;
      spawnBullet();
    }

    // --- 掉落物生成 ---
    pickupTimer -= dt;
    if (pickupTimer <= 0) {
      spawnPickup();
      pickupTimer = PICKUP_MIN_GAP + Math.random() * (PICKUP_MAX_GAP - PICKUP_MIN_GAP);
    }

    // --- 掉落物更新 + 拾取 ---
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.age += dt;
      p.core.rotation.y += dt * 1.6;
      p.core.rotation.x += dt * 0.9;
      p.base.rotation.z -= dt * 1.2;

      p.obj.position.y = 1.1 + Math.sin(now * 0.003 + i * 2.1) * 0.14;

      // 即将消失：闪烁
      const remain = PICKUP_LIFETIME - p.age;
      if (remain < 3) {
        p.obj.visible = Math.sin(now * 0.012) > -0.2;
      }
      if (remain <= 0) {
        removePickup(i);
        continue;
      }

      // 拾取判定
      const dx = p.obj.position.x - player.position.x;
      const dz = p.obj.position.z - player.position.z;
      if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
        collectPickup(p);
        removePickup(i);
      }
    }

    // --- 更新能量球 ---
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.obj.position.x += b.vx * dt;
      b.obj.position.z += b.vz * dt;

      const pulse = 1 + Math.sin(now * 0.008 + i) * 0.09;
      b.obj.scale.setScalar(pulse);

      const tp = b.trail.geometry.attributes.position.array;
      for (let k = TRAIL_LEN - 1; k > 0; k--) {
        tp[k * 3] = tp[(k - 1) * 3];
        tp[k * 3 + 1] = tp[(k - 1) * 3 + 1];
        tp[k * 3 + 2] = tp[(k - 1) * 3 + 2];
      }
      tp[0] = b.obj.position.x;
      tp[1] = b.obj.position.y;
      tp[2] = b.obj.position.z;
      b.trail.geometry.attributes.position.needsUpdate = true;

      const dx = b.obj.position.x - player.position.x;
      const dz = b.obj.position.z - player.position.z;
      if (dx * dx + dz * dz < HIT_RADIUS * HIT_RADIUS) {
        hitPlayer();
        break;
      }

      if (
        Math.abs(b.obj.position.x) > SPAWN_RADIUS + 6 ||
        Math.abs(b.obj.position.z) > SPAWN_RADIUS + 6
      ) {
        removeBullet(i);
      }
    }
  }

  /* ---------------- 主循环 ---------------- */
  let last = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);

    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (state === 'playing') {
      elapsed += dt;
      update(dt, now);
    }
    updateParticles(dt);

    // 场地氛围动画
    grid.material.opacity = 0.4 + Math.sin(now * 0.0016) * 0.16;
    if (stars) stars.rotation.y += dt * 0.006;
    for (let i = 0; i < beacons.length; i++) {
      const s = 3 + Math.sin(now * 0.003 + i * 1.7) * 0.6;
      beacons[i].scale.set(s, s, 1);
    }

    // 相机呼吸 + 受击震动
    camera.position.x = Math.sin(elapsed * 0.18) * 1.4;
    camera.position.y = 32 + Math.sin(elapsed * 0.5) * 0.7;
    if (shake > 0.01) {
      camera.position.x += (Math.random() - 0.5) * shake * 1.6;
      camera.position.y += (Math.random() - 0.5) * shake * 1.2;
      camera.position.z = 27 + (Math.random() - 0.5) * shake * 1.6;
      shake *= 0.88;
    } else {
      camera.position.z = 27;
    }
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  /* ---------------- 自适应 ---------------- */
  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---------------- 启动 ---------------- */
  syncLives();
  syncShield();
  syncTime();
  requestAnimationFrame(animate);

  // 供调试用
  window.__GAME__ = {
    get state() { return state; },
    get lives() { return lives; },
    get timeLeft() { return timeLeft; },
    get bullets() { return bullets.length; },
    get pickups() { return pickups.length; },
    get shield() { return shield; },
    spawnNow: function () { spawnPickup(); },
    reset: resetGame
  };
})();
