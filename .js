/*
  INSANE RIFT RUNNER
  A single-file Three.js game you can use with a plain HTML file.
  No npm, no build step. Just load Three.js from a CDN in your index.html,
  then include this file with <script src="insane_threejs_game.js"></script>

  Expected HTML is minimal, but this file also builds its own HUD if missing.
*/

(() => {
  'use strict';

  if (!window.THREE) {
    console.error('Three.js not found. Add a CDN script tag before this file.');
    return;
  }

  const THREE = window.THREE;

  const CONFIG = {
    lanes: [-2.3, 0, 2.3],
    worldSpeedStart: 18,
    worldSpeedMax: 56,
    worldSpeedRamp: 0.75,
    spawnDistance: 220,
    despawnZ: 18,
    shardChance: 0.42,
    obstacleChance: 0.48,
    portalChance: 0.08,
    boostChance: 0.12,
    laneChangeSpeed: 14,
    jumpVelocity: 14,
    gravity: 34,
    dashForce: 34,
    dashDuration: 0.16,
    invulnDuration: 0.9,
    trailMax: 24,
    shakeDecay: 9,
    floorSegmentLength: 18,
    floorSegments: 16,
  };

  const state = {
    running: false,
    gameOver: false,
    paused: false,
    score: 0,
    best: Number(localStorage.getItem('rift_runner_best') || 0),
    shards: 0,
    distance: 0,
    multiplier: 1,
    worldSpeed: CONFIG.worldSpeedStart,
    timeScale: 1,
    targetLane: 1,
    currentLane: 1,
    laneOffset: 0,
    y: 0,
    vy: 0,
    onGround: true,
    dashTimer: 0,
    invulnTimer: 0,
    shake: 0,
    portalTimer: 0,
    boostTimer: 0,
    turboMeter: 0,
    shield: 0,
    spawnCursor: -CONFIG.spawnDistance,
    nextEventAt: 0,
    elapsed: 0,
    touchStartX: 0,
    touchStartY: 0,
    swipeLocked: false,
  };

  const keys = new Set();
  let renderer, scene, camera, clock;
  let player, playerCore, playerGlow, playerShield;
  let hud, hudScore, hudBest, hudInfo, hudMsg, startOverlay, startBtn, restartBtn;
  let container;
  let floorGroup, decorGroup, entityGroup, particleGroup;
  let floorSegments = [];
  let obstacles = [];
  let shards = [];
  let boosts = [];
  let portals = [];
  let particles = [];
  let trailPoints = [];
  let dashBurst = 0;
  let arenaRadius = 18;
  let backgroundStars;

  const tmpVec = new THREE.Vector3();
  const tmpVec2 = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpColor = new THREE.Color();
  const raycaster = new THREE.Raycaster();

  init();
  animate();

  function init() {
    injectStyles();
    ensureHUD();
    container = document.getElementById('three-root') || document.body;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050816, 16, 190);
    scene.background = new THREE.Color(0x050816);

    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1200);
    camera.position.set(0, 4.2, 10.5);
    camera.lookAt(0, 2, -10);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.id = 'rift-canvas';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    buildLights();
    buildWorld();
    buildPlayer();
    buildDecor();
    buildBackgroundStars();
    buildInput();
    buildUI();

    resetGame(false);
    window.addEventListener('resize', onResize);
    onResize();
  }

  function injectStyles() {
    if (document.getElementById('rift-style')) return;
    const style = document.createElement('style');
    style.id = 'rift-style';
    style.textContent = `
      html, body { margin:0; width:100%; height:100%; overflow:hidden; background:#050816; touch-action:none; }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      #rift-hud {
        position: fixed; inset: 0; pointer-events: none; color: #eaf1ff; z-index: 10;
        text-shadow: 0 2px 10px rgba(0,0,0,.5);
      }
      .rift-topbar {
        position:absolute; left: 16px; right: 16px; top: 14px; display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
      }
      .rift-pill {
        backdrop-filter: blur(10px);
        background: rgba(8, 16, 32, .35);
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 18px;
        padding: 10px 14px;
        box-shadow: 0 12px 30px rgba(0,0,0,.22);
      }
      .rift-score { font-weight: 900; font-size: 18px; letter-spacing:.4px; }
      .rift-sub { opacity: .88; font-size: 12px; margin-top: 3px; }
      .rift-center {
        position:absolute; left:50%; top:52%; transform:translate(-50%,-50%); text-align:center; width:min(92vw, 620px);
      }
      .rift-title { font-size: clamp(30px, 5vw, 56px); font-weight: 950; margin: 0; letter-spacing: 1px; }
      .rift-desc { opacity:.92; margin: 10px 0 0; line-height:1.5; font-size: 14px; }
      .rift-button-row { display:flex; gap:12px; justify-content:center; margin-top: 18px; flex-wrap:wrap; }
      .rift-btn {
        pointer-events: auto;
        cursor: pointer;
        border: 0;
        color: #081020;
        background: linear-gradient(135deg, #b6fffe, #98b6ff 55%, #e6a8ff);
        font-weight: 900;
        border-radius: 18px;
        padding: 14px 18px;
        font-size: 15px;
        box-shadow: 0 18px 40px rgba(0,0,0,.25);
      }
      .rift-btn.secondary {
        background: rgba(255,255,255,.08);
        color: #ecf2ff;
        border: 1px solid rgba(255,255,255,.13);
      }
      .rift-footer {
        position:absolute; left: 16px; right: 16px; bottom: 16px; display:flex; justify-content:space-between; gap:12px; align-items:flex-end;
      }
      .rift-info { max-width: 540px; }
      .rift-msg { font-size: 13px; opacity: .9; line-height:1.45; }
      .rift-controls {
        display:none;
        position: absolute; left: 0; right: 0; bottom: 18px; gap: 12px; justify-content: center; align-items: center;
        pointer-events:none;
      }
      .rift-touch-btn {
        pointer-events:auto;
        width: 64px; height: 64px; border-radius: 20px; border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.08); color: white; font-size: 22px; font-weight: 900;
        backdrop-filter: blur(10px);
      }
      .rift-touch-wide { width: 104px; }
      .rift-health {
        width: 180px; height: 12px; border-radius: 999px; overflow:hidden; background: rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.12);
        margin-top: 8px;
      }
      .rift-health > div { height:100%; width:100%; background: linear-gradient(90deg, #7afcff, #9cff7a, #ffe97a, #ff7a7a); transform-origin:left center; }
      @media (max-width: 720px) {
        .rift-controls { display:flex; }
        .rift-footer { bottom: 96px; }
      }
      canvas { display:block; }
    `;
    document.head.appendChild(style);
  }

  function ensureHUD() {
    hud = document.getElementById('rift-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'rift-hud';
      hud.innerHTML = `
        <div class="rift-topbar">
          <div class="rift-pill">
            <div class="rift-score" id="rift-score">0</div>
            <div class="rift-sub" id="rift-best">Best 0</div>
            <div class="rift-health"><div id="rift-shield-fill"></div></div>
          </div>
          <div class="rift-pill">
            <div class="rift-score" id="rift-speed">18x</div>
            <div class="rift-sub" id="rift-shards">Shards 0</div>
          </div>
        </div>
        <div class="rift-center" id="rift-overlay">
          <h1 class="rift-title">RIFT RUNNER</h1>
          <p class="rift-desc">Slash through a collapsing neon tunnel. Dodge split obstacles, grab shards, chain boosts, and survive the speed spiral. Arrow keys / WASD. Space to jump. X or Shift to dash. Swipe on mobile.</p>
          <div class="rift-button-row">
            <button class="rift-btn" id="rift-start">Start Run</button>
            <button class="rift-btn secondary" id="rift-restart">Restart</button>
          </div>
        </div>
        <div class="rift-footer">
          <div class="rift-pill rift-info">
            <div class="rift-msg" id="rift-message">Collect shards to charge turbo. Hitting an obstacle ends the run unless you have shield or invulnerability. Portals bend the camera and speed up everything in a delightfully unfair way.</div>
          </div>
          <div class="rift-pill">
            <div class="rift-msg">Tap buttons, or swipe left/right/up. Double-tap for dash on some devices.</div>
          </div>
        </div>
        <div class="rift-controls" id="rift-controls">
          <button class="rift-touch-btn" id="btn-left">◀</button>
          <button class="rift-touch-btn rift-touch-wide" id="btn-jump">JUMP</button>
          <button class="rift-touch-btn" id="btn-right">▶</button>
          <button class="rift-touch-btn rift-touch-wide" id="btn-dash">DASH</button>
        </div>
      `;
      document.body.appendChild(hud);
    }

    hudScore = document.getElementById('rift-score');
    hudBest = document.getElementById('rift-best');
    hudInfo = document.getElementById('rift-shards');
    hudMsg = document.getElementById('rift-message');
    startOverlay = document.getElementById('rift-overlay');
    startBtn = document.getElementById('rift-start');
    restartBtn = document.getElementById('rift-restart');

    startBtn.addEventListener('click', () => startGame());
    restartBtn.addEventListener('click', () => resetGame(true));
  }

  function buildLights() {
    const ambient = new THREE.AmbientLight(0x8db3ff, 0.65);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xb4d7ff, 0x06111f, 1.7);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(5, 10, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 60;
    key.shadow.camera.left = -18;
    key.shadow.camera.right = 18;
    key.shadow.camera.top = 18;
    key.shadow.camera.bottom = -18;
    scene.add(key);

    const rim = new THREE.PointLight(0x64ffff, 2.8, 120, 2);
    rim.position.set(0, 6, 16);
    scene.add(rim);

    const magenta = new THREE.PointLight(0xff6ef2, 2.0, 90, 2);
    magenta.position.set(-8, 3, -40);
    scene.add(magenta);
  }

  function buildWorld() {
    floorGroup = new THREE.Group();
    decorGroup = new THREE.Group();
    entityGroup = new THREE.Group();
    particleGroup = new THREE.Group();
    scene.add(floorGroup, decorGroup, entityGroup, particleGroup);

    const floorGeom = new THREE.BoxGeometry(7.8, 0.38, CONFIG.floorSegmentLength);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x10192f, metalness: 0.3, roughness: 0.65 });
    const lineMat = new THREE.MeshStandardMaterial({ color: 0x48f2ff, emissive: 0x0f5f88, emissiveIntensity: 1.2, metalness: 0.2, roughness: 0.5 });

    for (let i = 0; i < CONFIG.floorSegments; i++) {
      const z = -i * CONFIG.floorSegmentLength;
      const seg = new THREE.Group();
      const base = new THREE.Mesh(floorGeom, floorMat);
      base.receiveShadow = true;
      seg.add(base);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.9, 0.06, 0.16), lineMat);
      stripe.position.set(0, 0.24, 0);
      seg.add(stripe);

      const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, CONFIG.floorSegmentLength), lineMat.clone());
      leftRail.position.set(-3.95, 0.22, 0);
      const rightRail = leftRail.clone();
      rightRail.position.x = 3.95;
      seg.add(leftRail, rightRail);

      seg.position.set(0, 0, z);
      floorGroup.add(seg);
      floorSegments.push(seg);
    }

    const skyRingGeom = new THREE.TorusGeometry(42, 0.22, 12, 220);
    const skyRingMat = new THREE.MeshBasicMaterial({ color: 0x2a3f75, transparent: true, opacity: 0.25 });
    for (let i = 0; i < 8; i++) {
      const ring = new THREE.Mesh(skyRingGeom, skyRingMat.clone());
      ring.rotation.x = Math.PI / 2;
      ring.position.z = -40 - i * 90;
      ring.scale.setScalar(1 + i * 0.08);
      decorGroup.add(ring);
    }

    const tunnelMat = new THREE.MeshStandardMaterial({
      color: 0x0a1020,
      metalness: 0.55,
      roughness: 0.25,
      emissive: 0x08142b,
      emissiveIntensity: 0.9,
      side: THREE.BackSide,
    });
    const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(18, 20, 1200, 18, 48, true), tunnelMat);
    tunnel.rotation.x = Math.PI / 2;
    tunnel.position.z = -560;
    decorGroup.add(tunnel);
  }

  function buildPlayer() {
    player = new THREE.Group();
    player.position.set(0, 1.1, 3.5);
    scene.add(player);

    const coreGeom = new THREE.IcosahedronGeometry(0.62, 1);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xdffaff,
      emissive: 0x55dfff,
      emissiveIntensity: 1.4,
      metalness: 0.85,
      roughness: 0.15,
    });
    playerCore = new THREE.Mesh(coreGeom, coreMat);
    playerCore.castShadow = true;
    player.add(playerCore);

    const glowGeom = new THREE.SphereGeometry(1.2, 24, 24);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x57f6ff, transparent: true, opacity: 0.12 });
    playerGlow = new THREE.Mesh(glowGeom, glowMat);
    player.add(playerGlow);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 12, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    ring.rotation.x = Math.PI / 2;
    player.add(ring);

    playerShield = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x87ffef, transparent: true, opacity: 0.0, wireframe: true })
    );
    player.add(playerShield);
  }

  function buildDecor() {
    const pylGeom = new THREE.CylinderGeometry(0.18, 0.4, 6.5, 7);
    const pylMat = new THREE.MeshStandardMaterial({ color: 0x16264a, metalness: 0.3, roughness: 0.4, emissive: 0x0b1f41, emissiveIntensity: 0.7 });
    const orbGeom = new THREE.SphereGeometry(0.24, 10, 10);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0x8ffcff });

    for (let i = 0; i < 28; i++) {
      const left = new THREE.Mesh(pylGeom, pylMat);
      const right = new THREE.Mesh(pylGeom, pylMat);
      const orbL = new THREE.Mesh(orbGeom, orbMat.clone());
      const orbR = new THREE.Mesh(orbGeom, orbMat.clone());
      const z = -i * 24 - 16;
      left.position.set(-5.8, 3.2, z);
      right.position.set(5.8, 3.2, z - 8);
      orbL.position.set(-5.8, 6.4, z);
      orbR.position.set(5.8, 6.4, z - 8);
      decorGroup.add(left, right, orbL, orbR);
    }
  }

  function buildBackgroundStars() {
    const positions = [];
    for (let i = 0; i < 1600; i++) {
      const radius = 220 + Math.random() * 520;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
      positions.push(
        Math.sin(phi) * Math.cos(theta) * radius,
        Math.cos(phi) * radius * 0.55,
        Math.sin(phi) * Math.sin(theta) * radius - 320
      );
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xbfd8ff, size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0.95 });
    backgroundStars = new THREE.Points(starGeom, starMat);
    scene.add(backgroundStars);
  }

  function buildInput() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const controls = document.getElementById('rift-controls');
    const leftBtn = document.getElementById('btn-left');
    const rightBtn = document.getElementById('btn-right');
    const jumpBtn = document.getElementById('btn-jump');
    const dashBtn = document.getElementById('btn-dash');

    const hold = (btn, action) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        action();
      });
    };
    hold(leftBtn, () => laneLeft());
    hold(rightBtn, () => laneRight());
    hold(jumpBtn, () => jump());
    hold(dashBtn, () => dash());

    renderer.domElement.addEventListener('pointerdown', onPointerDown, { passive: false });
    renderer.domElement.addEventListener('pointerup', onPointerUp, { passive: false });
    renderer.domElement.addEventListener('pointermove', onPointerMove, { passive: false });
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) state.paused = true;
    });
  }

  function buildUI() {
    hudBest.textContent = `Best ${state.best}`;
    hudScore.textContent = '0';
    hudInfo.textContent = 'Shards 0';
    hudMsg.textContent = 'Collect shards to charge turbo. Hitting an obstacle ends the run unless you have shield or invulnerability. Portals bend the camera and speed up everything in a delightfully unfair way.';
  }

  function onKeyDown(e) {
    keys.add(e.code);
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) e.preventDefault();

    if (e.code === 'Enter' && !state.running) startGame();
    if (e.code === 'KeyR') resetGame(true);
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') laneLeft();
    if (e.code === 'ArrowRight' || e.code === 'KeyD') laneRight();
    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') jump();
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyX') dash();
    if (e.code === 'KeyP') togglePause();
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onPointerDown(e) {
    if (!state.running && !state.gameOver) startGame();
    state.touchStartX = e.clientX;
    state.touchStartY = e.clientY;
    state.swipeLocked = false;
  }

  function onPointerMove(e) {
    if (state.swipeLocked) return;
    if (e.buttons === 0) return;
    const dx = e.clientX - state.touchStartX;
    const dy = e.clientY - state.touchStartY;
    if (Math.abs(dx) > 32 || Math.abs(dy) > 32) {
      state.swipeLocked = true;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) laneRight();
        else laneLeft();
      } else {
        if (dy < 0) jump();
        else dash();
      }
    }
  }

  function onPointerUp(e) {
    const dx = e.clientX - state.touchStartX;
    const dy = e.clientY - state.touchStartY;
    if (!state.swipeLocked && Math.hypot(dx, dy) < 12) {
      jump();
    }
  }

  function startGame() {
    state.running = true;
    state.gameOver = false;
    startOverlay.style.opacity = '0';
    startOverlay.style.transform = 'translate(-50%,-50%) scale(0.98)';
    setTimeout(() => {
      if (!state.gameOver) startOverlay.style.display = 'none';
    }, 180);
    hudMsg.textContent = 'Run started. Dodge, drift lanes, and chain pickups.';
  }

  function togglePause() {
    if (!state.running || state.gameOver) return;
    state.paused = !state.paused;
    hudMsg.textContent = state.paused ? 'Paused' : 'Back in the rift.';
  }

  function resetGame(keepStartHidden = false) {
    state.running = false;
    state.gameOver = false;
    state.paused = false;
    state.score = 0;
    state.shards = 0;
    state.distance = 0;
    state.multiplier = 1;
    state.worldSpeed = CONFIG.worldSpeedStart;
    state.timeScale = 1;
    state.targetLane = 1;
    state.currentLane = 1;
    state.laneOffset = 0;
    state.y = 0;
    state.vy = 0;
    state.onGround = true;
    state.dashTimer = 0;
    state.invulnTimer = 0;
    state.shake = 0;
    state.portalTimer = 0;
    state.boostTimer = 0;
    state.turboMeter = 0;
    state.shield = 0;
    state.spawnCursor = -CONFIG.spawnDistance;
    state.nextEventAt = 0;
    state.elapsed = 0;

    clearEntities();
    player.position.set(0, 1.1, 3.5);
    player.rotation.set(0, 0, 0);
    playerShield.material.opacity = 0.0;
    if (!keepStartHidden) {
      startOverlay.style.display = 'block';
      startOverlay.style.opacity = '1';
      startOverlay.style.transform = 'translate(-50%,-50%) scale(1)';
    }
    hudMsg.textContent = 'Press Start Run. Then survive the speed spiral.';
    updateHUD();
  }

  function endGame() {
    state.running = false;
    state.gameOver = true;
    state.best = Math.max(state.best, Math.floor(state.score));
    localStorage.setItem('rift_runner_best', String(state.best));
    hudBest.textContent = `Best ${state.best}`;
    startOverlay.style.display = 'block';
    startOverlay.style.opacity = '1';
    startOverlay.style.transform = 'translate(-50%,-50%) scale(1)';
    hudMsg.textContent = 'Crash. Tap Restart or press R. The rift was rude today.';
    state.shake = 0.7;
  }

  function clearEntities() {
    for (const arr of [obstacles, shards, boosts, portals, particles]) {
      for (const obj of arr) obj.parent && obj.parent.remove(obj);
      arr.length = 0;
    }
    trailPoints.length = 0;
    for (const child of [...entityGroup.children]) entityGroup.remove(child);
    for (const child of [...particleGroup.children]) particleGroup.remove(child);
    for (const child of [...decorGroup.children]) {
      if (child.userData && child.userData.dynamic) decorGroup.remove(child);
    }
  }

  function laneLeft() {
    if (!state.running || state.gameOver || state.paused) return;
    state.targetLane = Math.max(0, state.targetLane - 1);
  }

  function laneRight() {
    if (!state.running || state.gameOver || state.paused) return;
    state.targetLane = Math.min(2, state.targetLane + 1);
  }

  function jump() {
    if (!state.running || state.gameOver || state.paused) return;
    if (state.onGround) {
      state.vy = CONFIG.jumpVelocity;
      state.onGround = false;
      burst(player.position.x, 0.4, player.position.z, 16, 0x9fffff, 0.6);
      hudMsg.textContent = 'Leap!';
    }
  }

  function dash() {
    if (!state.running || state.gameOver || state.paused) return;
    if (state.dashTimer <= 0 && state.turboMeter > 0.28) {
      state.dashTimer = CONFIG.dashDuration;
      state.invulnTimer = Math.max(state.invulnTimer, CONFIG.invulnDuration * 0.42);
      state.turboMeter = Math.max(0, state.turboMeter - 0.28);
      burst(player.position.x, player.position.y, player.position.z, 32, 0xffd56b, 1.15);
      state.shake = Math.max(state.shake, 0.18);
      hudMsg.textContent = 'Dash burst!';
    }
  }

  function updateHUD() {
    hudScore.textContent = String(Math.floor(state.score));
    hudBest.textContent = `Best ${state.best}`;
    hudInfo.textContent = `Shards ${state.shards}`;
    const shieldFill = document.getElementById('rift-shield-fill');
    if (shieldFill) {
      const pct = Math.max(0, Math.min(1, state.shield / 3));
      shieldFill.style.transform = `scaleX(${pct})`;
      shieldFill.style.opacity = pct > 0 ? '1' : '0.25';
    }
    const sp = Math.floor(state.worldSpeed);
    document.getElementById('rift-speed').textContent = `${sp}x`;
  }

  function animate() {
    requestAnimationFrame(animate);
    const rawDt = Math.min(clock.getDelta(), 0.033);
    if (!state.running || state.paused) {
      spinIdle(rawDt);
      renderer.render(scene, camera);
      return;
    }
    update(rawDt);
    renderer.render(scene, camera);
  }

  function spinIdle(dt) {
    player.rotation.y += dt * 0.8;
    player.rotation.x = Math.sin(performance.now() * 0.001) * 0.12;
    backgroundStars.rotation.y += dt * 0.01;
  }

  function update(dt) {
    state.elapsed += dt;
    const speedBoost = state.boostTimer > 0 ? 1.28 : 1;
    const portalBoost = state.portalTimer > 0 ? 1.18 : 1;
    const dashBoost = state.dashTimer > 0 ? 1.38 : 1;
    const speedMul = speedBoost * portalBoost * dashBoost;

    state.worldSpeed = Math.min(CONFIG.worldSpeedMax, CONFIG.worldSpeedStart + state.distance * 0.022 * CONFIG.worldSpeedRamp);
    const moveSpeed = state.worldSpeed * speedMul;
    state.distance += moveSpeed * dt * 0.1;
    state.score += moveSpeed * dt * state.multiplier;

    state.targetLane = Math.max(0, Math.min(2, state.targetLane));
    const targetX = CONFIG.lanes[state.targetLane];
    state.laneOffset += (targetX - state.laneOffset) * Math.min(1, dt * CONFIG.laneChangeSpeed);
    state.currentLane += (state.targetLane - state.currentLane) * Math.min(1, dt * 14);

    player.position.x = state.laneOffset;

    if (!state.onGround) {
      state.vy -= CONFIG.gravity * dt;
      state.y += state.vy * dt;
      if (state.y <= 0) {
        state.y = 0;
        state.vy = 0;
        state.onGround = true;
        burst(player.position.x, 0.02, player.position.z, 12, 0x7affd5, 0.55);
      }
    }
    player.position.y = 1.1 + state.y;

    state.dashTimer = Math.max(0, state.dashTimer - dt);
    state.invulnTimer = Math.max(0, state.invulnTimer - dt);
    state.portalTimer = Math.max(0, state.portalTimer - dt);
    state.boostTimer = Math.max(0, state.boostTimer - dt);
    state.shake = Math.max(0, state.shake - CONFIG.shakeDecay * dt);

    if (state.turboMeter < 1) state.turboMeter = Math.min(1, state.turboMeter + dt * 0.09 + (state.shards * 0.0008));

    updatePlayerVisuals(dt, moveSpeed);
    updateWorld(dt, moveSpeed);
    updateEntities(dt, moveSpeed);
    updateParticles(dt, moveSpeed);
    maybeSpawn(moveSpeed);
    maybeEvent(moveSpeed);
    doCollisions(dt);
    applyCamera(dt);
    updateHUD();
    if (state.score > state.best) {
      state.best = Math.floor(state.score);
    }
  }

  function updatePlayerVisuals(dt, moveSpeed) {
    const wobble = Math.sin(state.elapsed * 6) * 0.08;
    playerCore.rotation.x += dt * (2.2 + moveSpeed * 0.02);
    playerCore.rotation.y += dt * (2.7 + moveSpeed * 0.03);
    player.rotation.z = THREE.MathUtils.lerp(player.rotation.z, (state.targetLane - 1) * -0.16 + wobble, 0.08);
    playerGlow.scale.setScalar(1 + Math.sin(state.elapsed * 6.8) * 0.08 + state.shake * 0.4);
    playerShield.material.opacity = state.shield > 0 ? 0.18 + Math.sin(state.elapsed * 12) * 0.08 : 0.0;
  }

  function updateWorld(dt, moveSpeed) {
    for (let i = 0; i < floorSegments.length; i++) {
      const seg = floorSegments[i];
      seg.position.z += moveSpeed * dt;
      seg.rotation.z = Math.sin(state.elapsed * 1.3 + i) * 0.008;
      if (seg.position.z > CONFIG.floorSegmentLength) {
        const minZ = Math.min(...floorSegments.map(s => s.position.z));
        seg.position.z = minZ - CONFIG.floorSegmentLength;
      }
    }

    backgroundStars.position.z += moveSpeed * dt * 0.35;
    backgroundStars.rotation.y += dt * 0.02;

    decorGroup.position.z += moveSpeed * dt * 0.45;
    if (decorGroup.position.z > 30) decorGroup.position.z -= 120;

    for (let i = 0; i < decorGroup.children.length; i++) {
      const c = decorGroup.children[i];
      if (c.geometry && c.geometry.type === 'TorusGeometry') {
        c.rotation.z += dt * 0.2;
      } else if (c.geometry && c.geometry.type === 'SphereGeometry') {
        c.material.opacity = 0.72 + Math.sin(state.elapsed * 2 + i) * 0.14;
      }
    }
  }

  function maybeSpawn(moveSpeed) {
    state.spawnCursor += moveSpeed * 0.75;
    if (state.spawnCursor < 0) return;

    const spacing = THREE.MathUtils.randFloat(6.5, 12.5) * (moveSpeed > 30 ? 0.88 : 1);
    state.spawnCursor = -spacing;

    const roll = Math.random();
    const lane = Math.floor(Math.random() * 3);
    const x = CONFIG.lanes[lane];
    const z = -CONFIG.spawnDistance;

    if (roll < CONFIG.portalChance && state.distance > 60) {
      spawnPortal(x, z);
      return;
    }
    if (roll < CONFIG.portalChance + CONFIG.boostChance) {
      spawnBoost(x, z);
      return;
    }
    if (roll < CONFIG.portalChance + CONFIG.boostChance + CONFIG.shardChance) {
      spawnShard(x, z);
      if (Math.random() < 0.35) spawnShard(CONFIG.lanes[(lane + 1) % 3], z - 4);
      return;
    }

    spawnObstaclePattern(lane, z);
  }

  function maybeEvent(moveSpeed) {
    if (state.elapsed < state.nextEventAt) return;
    if (state.distance < 30) {
      state.nextEventAt = state.elapsed + 4 + Math.random() * 4;
      return;
    }
    if (Math.random() < 0.16) {
      state.portalTimer = 2.7;
      state.worldSpeed = Math.min(CONFIG.worldSpeedMax, state.worldSpeed + 6);
      burst(0, 1.5, -28, 18, 0xb85cff, 0.8);
      hudMsg.textContent = 'Rift distortion!';
    } else if (Math.random() < 0.2) {
      state.boostTimer = 2.0;
      state.multiplier = Math.min(4, state.multiplier + 0.5);
      hudMsg.textContent = 'Surge mode!';
    }
    state.nextEventAt = state.elapsed + THREE.MathUtils.randFloat(7, 12);
  }

  function spawnObstaclePattern(lane, z) {
    const pattern = Math.random();
    if (pattern < 0.24) {
      spawnObstacle(CONFIG.lanes[lane], 0.7, z, 1.1, 1.2, 1.1, 0xff475f, 'block');
    } else if (pattern < 0.46) {
      spawnObstacle(CONFIG.lanes[lane], 1.2, z, 0.7, 2.3, 0.7, 0xff9e5f, 'pillar');
    } else if (pattern < 0.66) {
      const x1 = CONFIG.lanes[Math.max(0, lane - 1)];
      const x2 = CONFIG.lanes[Math.min(2, lane + 1)];
      spawnObstacle(x1, 0.55, z, 0.9, 1.0, 0.9, 0xff5378, 'block');
      spawnObstacle(x2, 0.55, z, 0.9, 1.0, 0.9, 0xff5378, 'block');
    } else if (pattern < 0.83) {
      spawnObstacle(CONFIG.lanes[lane], 2.3, z, 2.8, 0.42, 1.2, 0x7a68ff, 'bar');
      spawnShard(CONFIG.lanes[lane], z - 4);
    } else {
      spawnObstacle(CONFIG.lanes[0], 0.55, z, 0.8, 0.9, 0.8, 0xff417d, 'block');
      spawnObstacle(CONFIG.lanes[1], 2.0, z - 2, 2.5, 0.4, 1.1, 0x6dffb4, 'bar');
      spawnObstacle(CONFIG.lanes[2], 0.55, z - 4, 0.8, 0.9, 0.8, 0xff417d, 'block');
    }
  }

  function spawnObstacle(x, y, z, sx, sy, sz, color, kind) {
    const geom = new THREE.BoxGeometry(sx, sy, sz);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
      metalness: 0.25,
      roughness: 0.35,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    mesh.userData = { type: 'obstacle', kind, radius: Math.max(sx, sz) * 0.45 };
    entityGroup.add(mesh);
    obstacles.push(mesh);
    return mesh;
  }

  function spawnShard(x, z) {
    const group = new THREE.Group();
    const geom = new THREE.OctahedronGeometry(0.28, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xdff9ff,
      emissive: 0x62fff0,
      emissiveIntensity: 1.8,
      metalness: 1,
      roughness: 0.05,
    });
    const mesh = new THREE.Mesh(geom, mat);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.52, 16, 16), new THREE.MeshBasicMaterial({ color: 0x65ffff, transparent: true, opacity: 0.13 }));
    group.add(halo, mesh);
    group.position.set(x, 1.2 + Math.sin(state.elapsed * 5) * 0.05, z);
    group.userData = { type: 'shard', radius: 0.55, spin: 1 + Math.random() * 2 };
    entityGroup.add(group);
    shards.push(group);
    return group;
  }

  function spawnBoost(x, z) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.14, 10, 24), new THREE.MeshStandardMaterial({ color: 0xffd86e, emissive: 0xffb84d, emissiveIntensity: 1.5, metalness: 0.7, roughness: 0.25 }));
    ring.rotation.x = Math.PI / 2;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 18), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    group.add(ring, core);
    group.position.set(x, 1.25, z);
    group.userData = { type: 'boost', radius: 0.85 };
    entityGroup.add(group);
    boosts.push(group);
    return group;
  }

  function spawnPortal(x, z) {
    const group = new THREE.Group();
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.16, 12, 32), new THREE.MeshStandardMaterial({ color: 0x9d5bff, emissive: 0x8d31ff, emissiveIntensity: 2.2, metalness: 0.45, roughness: 0.12 }));
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 12, 32), new THREE.MeshStandardMaterial({ color: 0x66f8ff, emissive: 0x66f8ff, emissiveIntensity: 2.0, metalness: 0.3, roughness: 0.1 }));
    ring1.rotation.x = ring2.rotation.y = Math.PI / 2;
    group.add(ring1, ring2);
    group.position.set(x, 2.2, z);
    group.userData = { type: 'portal', radius: 1.65, spin: 1.7 };
    entityGroup.add(group);
    portals.push(group);
    return group;
  }

  function updateEntities(dt, moveSpeed) {
    const dz = moveSpeed * dt;
    const updateList = (list, extraFn) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const obj = list[i];
        obj.position.z += dz;
        if (extraFn) extraFn(obj, i);
        if (obj.position.z > CONFIG.despawnZ) {
          obj.parent && obj.parent.remove(obj);
          list.splice(i, 1);
        }
      }
    };

    updateList(obstacles, (obj) => {
      obj.rotation.x += dt * 0.8;
      obj.rotation.y += dt * 0.6;
    });
    updateList(shards, (obj) => {
      obj.rotation.x += dt * 2.5;
      obj.rotation.y += dt * 1.8;
      obj.position.y = 1.2 + Math.sin(state.elapsed * 7 + obj.position.z * 0.1) * 0.12;
    });
    updateList(boosts, (obj) => {
      obj.rotation.z += dt * 2.8;
      obj.scale.setScalar(1 + Math.sin(state.elapsed * 5 + obj.position.z * 0.15) * 0.08);
    });
    updateList(portals, (obj) => {
      obj.rotation.z += dt * 1.8;
      const pulse = 1 + Math.sin(state.elapsed * 5 + obj.position.z * 0.1) * 0.1;
      obj.scale.setScalar(pulse);
      if (Math.random() < 0.08) {
        const p = makeParticle(obj.position.x + THREE.MathUtils.randFloatSpread(1.3), obj.position.y + THREE.MathUtils.randFloatSpread(1.3), obj.position.z, 0x9d5bff, 0.7, 10);
        particleGroup.add(p);
        particles.push(p);
      }
    });
  }

  function doCollisions() {
    const playerRadius = 0.85;
    const px = player.position.x;
    const py = player.position.y;
    const pz = player.position.z;

    const collided = (obj, r = 1) => {
      const dx = px - obj.position.x;
      const dy = py - obj.position.y;
      const dz = pz - obj.position.z;
      return (dx * dx + dy * dy + dz * dz) < (playerRadius + r) * (playerRadius + r);
    };

    for (let i = shards.length - 1; i >= 0; i--) {
      const obj = shards[i];
      if (collided(obj, obj.userData.radius)) {
        shards.splice(i, 1);
        obj.parent && obj.parent.remove(obj);
        state.shards++;
        state.score += 90;
        state.turboMeter = Math.min(1, state.turboMeter + 0.18);
        burst(obj.position.x, obj.position.y, obj.position.z, 18, 0x8dfffb, 0.8);
        hudMsg.textContent = 'Shard collected!';
      }
    }

    for (let i = boosts.length - 1; i >= 0; i--) {
      const obj = boosts[i];
      if (collided(obj, obj.userData.radius)) {
        boosts.splice(i, 1);
        obj.parent && obj.parent.remove(obj);
        state.boostTimer = 2.35;
        state.multiplier = Math.min(4, state.multiplier + 0.75);
        state.shield = Math.min(3, state.shield + 1);
        burst(obj.position.x, obj.position.y, obj.position.z, 24, 0xffd56b, 1.0);
        hudMsg.textContent = 'Boost pickup! Shield gained.';
      }
    }

    for (let i = portals.length - 1; i >= 0; i--) {
      const obj = portals[i];
      if (collided(obj, obj.userData.radius)) {
        portals.splice(i, 1);
        obj.parent && obj.parent.remove(obj);
        state.portalTimer = 3.2;
        state.worldSpeed = Math.min(CONFIG.worldSpeedMax, state.worldSpeed + 8);
        state.shake = Math.max(state.shake, 0.4);
        state.multiplier = Math.min(5, state.multiplier + 1);
        burst(obj.position.x, obj.position.y, obj.position.z, 42, 0xb85cff, 1.5);
        hudMsg.textContent = 'Portal hit. Reality is now optional.';
      }
    }

    if (state.invulnTimer > 0 || state.shield > 0) {
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obj = obstacles[i];
        if (collided(obj, obj.userData.radius || 1)) {
          obstacles.splice(i, 1);
          obj.parent && obj.parent.remove(obj);
          state.invulnTimer = Math.max(0.12, state.invulnTimer * 0.7);
          if (state.shield > 0) state.shield--;
          state.shake = Math.max(state.shake, 0.24);
          burst(obj.position.x, obj.position.y, obj.position.z, 24, 0xff7a7a, 0.9);
          hudMsg.textContent = 'Impact absorbed!';
        }
      }
      return;
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obj = obstacles[i];
      if (collided(obj, obj.userData.radius || 1)) {
        if (Math.random() < 0.3) {
          // tiny last-second mercy from the rift
          state.invulnTimer = 0.25;
          state.shake = Math.max(state.shake, 0.2);
          burst(obj.position.x, obj.position.y, obj.position.z, 18, 0xffffff, 0.8);
          hudMsg.textContent = 'Barely survived.';
          obstacles.splice(i, 1);
          obj.parent && obj.parent.remove(obj);
        } else {
          burst(obj.position.x, obj.position.y, obj.position.z, 34, 0xff4f7e, 1.2);
          endGame();
          return;
        }
      }
    }
  }

  function burst(x, y, z, count, color, strength) {
    for (let i = 0; i < count; i++) {
      const p = makeParticle(x, y, z, color, strength, THREE.MathUtils.randFloat(0.12, 0.4));
      p.userData.vx = THREE.MathUtils.randFloatSpread(10) * strength;
      p.userData.vy = THREE.MathUtils.randFloat(1.5, 11) * strength;
      p.userData.vz = THREE.MathUtils.randFloat(8, 18) * strength;
      particleGroup.add(p);
      particles.push(p);
    }
  }

  function makeParticle(x, y, z, color, strength, size) {
    const geom = new THREE.SphereGeometry(size, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y, z);
    mesh.userData = {
      vx: THREE.MathUtils.randFloatSpread(4) * strength,
      vy: THREE.MathUtils.randFloat(-1, 8) * strength,
      vz: THREE.MathUtils.randFloat(5, 16) * strength,
      life: THREE.MathUtils.randFloat(0.25, 0.8),
      age: 0,
    };
    return mesh;
  }

  function updateParticles(dt, moveSpeed) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const d = p.userData;
      d.age += dt;
      p.position.x += (d.vx || 0) * dt * 0.12;
      p.position.y += (d.vy || 0) * dt * 0.12;
      p.position.z += moveSpeed * dt + (d.vz || 0) * dt * 0.1;
      p.material.opacity = 1 - d.age / d.life;
      p.scale.setScalar(1 - d.age / d.life * 0.3);
      if (d.age >= d.life) {
        p.parent && p.parent.remove(p);
        particles.splice(i, 1);
      }
    }

    // trail particles
    const tailZ = player.position.z + 1.2;
    trailPoints.push({ x: player.position.x, y: player.position.y - 0.15, z: tailZ, age: 0 });
    if (trailPoints.length > CONFIG.trailMax) trailPoints.shift();
    for (const t of trailPoints) t.age += dt;

    if (Math.random() < 0.5) {
      const t = trailPoints[trailPoints.length - 1];
      if (t) {
        const p = makeParticle(t.x, t.y, t.z, 0x69efff, 0.35, 0.08);
        particleGroup.add(p);
        particles.push(p);
      }
    }
  }

  function applyCamera(dt) {
    const target = new THREE.Vector3(
      player.position.x * 0.24,
      4.1 + player.position.y * 0.2,
      10.5 + Math.min(2.3, state.worldSpeed * 0.02)
    );
    camera.position.x += (target.x - camera.position.x) * Math.min(1, dt * 2.8);
    camera.position.y += (target.y - camera.position.y) * Math.min(1, dt * 2.8);
    camera.position.z += (target.z - camera.position.z) * Math.min(1, dt * 2.8);

    const look = new THREE.Vector3(player.position.x * 0.35, 1.9 + player.position.y * 0.08, -10 - state.shake * 0.5);
    camera.lookAt(look);

    if (state.shake > 0.001) {
      const s = state.shake * 0.055;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.position.z += (Math.random() - 0.5) * s;
    }

    // slight world bend during portal/boost moments
    const bend = Math.sin(state.elapsed * (state.portalTimer > 0 ? 10 : 2.3)) * (state.portalTimer > 0 ? 0.02 : 0.004);
    scene.rotation.z = THREE.MathUtils.lerp(scene.rotation.z, bend, 0.06);
  }

  function onResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

})();
