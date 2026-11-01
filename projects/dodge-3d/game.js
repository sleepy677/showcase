/* ============================================================
   躲避游戏 3D · Three.js
   玩法：WASD 在场地内移动，躲开从四面八方飞来的红色能量球，
        撑过 180 秒即通关；被击中扣 1 条命，共 3 条命。
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
  const INVINCIBLE_MS = 1200;
  const SPAWN_INTERVAL = 0.42;      // 生成间隔（秒）

  /* ---------------- DOM ---------------- */
  const timeEl = document.getElementById('timeText');
  const livesBox = document.getElementById('livesBox');
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
  document.getElementById('stage').appendChild(renderer.domElement);

  /* ---------------- 场景 / 相机 ---------------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b18);
  scene.fog = new THREE.FogExp2(0x070b18, 0.014);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    400
  );
  camera.position.set(0, 32, 27);
  camera.lookAt(0, 0, 0);

  /* ---------------- 灯光 ---------------- */
  scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x050810, 0.62));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
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

  const coolLight = new THREE.PointLight(0x2a6cff, 1.4, 90);
  coolLight.position.set(-20, 14, -18);
  scene.add(coolLight);

  const warmLight = new THREE.PointLight(0x1d6b58, 1.0, 90);
  warmLight.position.set(22, 10, 20);
  scene.add(warmLight);

  /* ---------------- 场地 ---------------- */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA * 2, ARENA * 2),
    new THREE.MeshStandardMaterial({
      color: 0x081020,
      roughness: 0.92,
      metalness: 0.12
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
      opacity: 0.45
    })
  );
  border.position.y = 0.06;
  scene.add(border);

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

  /* ---------------- 能量球 ---------------- */
  const bulletCoreGeo = new THREE.SphereGeometry(0.34, 14, 14);
  const bulletGlowGeo = new THREE.SphereGeometry(0.56, 14, 14);
  const bulletCoreMat = new THREE.MeshBasicMaterial({ color: 0xff5064 });
  const bulletGlowMat = new THREE.MeshBasicMaterial({
    color: 0xff2244,
    transparent: true,
    opacity: 0.22
  });

  const bullets = [];

  function spawnBullet() {
    const angle = Math.random() * Math.PI * 2;
    const sx = Math.cos(angle) * SPAWN_RADIUS;
    const sz = Math.sin(angle) * SPAWN_RADIUS;

    const obj = new THREE.Group();
    obj.add(new THREE.Mesh(bulletCoreGeo, bulletCoreMat));
    obj.add(new THREE.Mesh(bulletGlowGeo, bulletGlowMat));
    obj.position.set(sx, 0.9, sz);
    scene.add(obj);

    // 朝玩家当前位置定向，生成后沿直线飞行（不追踪）
    const dx = player.position.x - sx;
    const dz = player.position.z - sz;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;

    bullets.push({
      obj: obj,
      vx: (dx / len) * BULLET_SPEED,
      vz: (dz / len) * BULLET_SPEED
    });
  }

  function removeBullet(index) {
    const b = bullets[index];
    if (!b) return;
    scene.remove(b.obj);
    bullets.splice(index, 1);
  }

  function clearBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
      scene.remove(bullets[i].obj);
    }
    bullets.length = 0;
  }

  /* ---------------- 状态 ---------------- */
  let state = 'playing';
  let lives = START_LIVES;
  let timeLeft = TOTAL_TIME;
  let invincible = false;
  let invincibleEnd = 0;
  let spawnTimer = 0;
  let elapsed = 0;

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
  for (let i = 0; i < START_LIVES; i++) {
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

  function syncTime() {
    timeEl.textContent = Math.max(0, Math.ceil(timeLeft));
  }

  /* ---------------- 玩法 ---------------- */
  function hitPlayer() {
    if (invincible || state !== 'playing') return;

    lives -= 1;
    syncLives();
    clearBullets();
    invincible = true;
    invincibleEnd = performance.now() + INVINCIBLE_MS;

    if (lives <= 0) endGame(false);
  }

  function endGame(win) {
    if (state === 'over') return;
    state = 'over';
    clearBullets();

    if (win) {
      modalTitle.textContent = '时间到，你撑住了';
      modalSub.textContent = '180 秒全身而退，反应力不错。';
    } else {
      modalTitle.textContent = '生命耗尽';
      modalSub.textContent = '被能量球击中 3 次。再来一局试试。';
    }
    modal.classList.add('show');
  }

  function resetGame() {
    clearBullets();
    player.position.set(0, 0, 0);
    player.rotation.y = 0;
    player.visible = true;

    state = 'playing';
    lives = START_LIVES;
    timeLeft = TOTAL_TIME;
    invincible = false;
    invincibleEnd = 0;
    spawnTimer = 0;
    elapsed = 0;

    syncLives();
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

      // 平滑转向移动方向
      const target = Math.atan2(mx, mz);
      let diff = target - player.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.rotation.y += diff * Math.min(1, dt * 12);
    }

    // --- 悬浮 + 光环旋转 ---
    player.position.y = Math.sin(now * 0.0022) * 0.06;
    ring.rotation.z -= dt * 0.9;

    // --- 生成能量球 ---
    spawnTimer += dt;
    while (spawnTimer >= SPAWN_INTERVAL) {
      spawnTimer -= SPAWN_INTERVAL;
      spawnBullet();
    }

    // --- 更新能量球 ---
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.obj.position.x += b.vx * dt;
      b.obj.position.z += b.vz * dt;

      const pulse = 1 + Math.sin(now * 0.008 + i) * 0.09;
      b.obj.scale.setScalar(pulse);

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

    // 相机轻微呼吸，增加空间感
    camera.position.x = Math.sin(elapsed * 0.18) * 1.4;
    camera.position.y = 32 + Math.sin(elapsed * 0.5) * 0.7;
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
  syncTime();
  requestAnimationFrame(animate);

  // 供调试用
  window.__GAME__ = {
    get state() { return state; },
    get lives() { return lives; },
    get timeLeft() { return timeLeft; },
    get bullets() { return bullets.length; },
    reset: resetGame
  };
})();
