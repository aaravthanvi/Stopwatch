// Canvas setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Game constants
const W = canvas.width, H = canvas.height;
const LANES = [W*0.25, W*0.5, W*0.75];  // x positions of 3 lanes
const LANE_INDEX_MIN = 0, LANE_INDEX_MAX = 2;
const GROUND_Y = H - 120;
const GRAVITY = 2200;        // px/s^2
const JUMP_VY = -1100;       // px/s
const SLIDE_TIME = 0.5;      // s
const PLAYER_SPEED = 420;    // world scroll speed px/s
const SPAWN_EVERY = 1.0;     // seconds between obstacles start
const OBSTACLE_SPEED = PLAYER_SPEED;
const PLAYER_W = 80, PLAYER_H = 120;
const PLAYER_H_SLIDE = 70;
const LANE_SWITCH_TIME = 0.15; // s smooth slide between lanes

// State
let running = true;
let score = 0;
let lastTime = 0;
let laneIndex = 1;           // start center
let laneProgress = 0;        // 0..1 for smooth lateral move
let laneFrom = 1, laneTo = 1;

let y = GROUND_Y - PLAYER_H;
let vy = 0;
let sliding = false;
let slideTimer = 0;

const obstacles = [];
let spawnTimer = 0;

const scoreEl = document.getElementById('score');
const restartBtn = document.getElementById('restart');

// Helpers
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function reset() {
  running = true;
  score = 0;
  lastTime = 0;
  laneIndex = 1; laneFrom = 1; laneTo = 1; laneProgress = 1;
  y = GROUND_Y - PLAYER_H;
  vy = 0;
  sliding = false; slideTimer = 0;
  obstacles.length = 0;
  spawnTimer = 0;
  restartBtn.hidden = true;
  scoreEl.textContent = 'Score: 0';
  requestAnimationFrame(loop);
}

// Swipe detection (touch)
let touchStartX = 0, touchStartY = 0, touchStartT = 0;
const SWIPE_MIN_DIST = 30; // px
const SWIPE_MAX_TIME = 600; // ms

canvas.addEventListener('touchstart', (e) => {
  const t = e.changedTouches;
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchStartT = performance.now();
}, {passive:true});

canvas.addEventListener('touchend', (e) => {
  const t = e.changedTouches;
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const dt = performance.now() - touchStartT;

  if (dt <= SWIPE_MAX_TIME) {
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_MIN_DIST) {
      if (dx < 0) moveLeft(); else moveRight();
    } else if (Math.abs(dy) > SWIPE_MIN_DIST) {
      if (dy < 0) jump(); else slide();
    }
  }
}, {passive:true});

// Keyboard for desktop testing
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') moveLeft();
  else if (e.key === 'ArrowRight' || e.key === 'd') moveRight();
  else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') jump();
  else if (e.key === 'ArrowDown' || e.key === 's') slide();
  else if (e.key === 'r') reset();
});

// Lane moves
function beginLaneMove(newIndex) {
  newIndex = clamp(newIndex, LANE_INDEX_MIN, LANE_INDEX_MAX);
  if (newIndex === laneTo) return;
  laneFrom = laneIndex;
  laneTo = newIndex;
  laneIndex = newIndex;
  laneProgress = 0;
}
function moveLeft(){ beginLaneMove(laneIndex - 1); }
function moveRight(){ beginLaneMove(laneIndex + 1); }

// Jump/Slide
function onGround() { return y >= GROUND_Y - currentPlayerH(); }
function currentPlayerH(){ return sliding ? PLAYER_H_SLIDE : PLAYER_H; }

function jump(){
  if (onGround() && running) {
    sliding = false;
    vy = JUMP_VY;
  }
}
function slide(){
  if (!running) return;
  if (!sliding && onGround()) {
    sliding = true;
    slideTimer = SLIDE_TIME;
  }
}

// Obstacles
function spawnObstacle(){
  // Randomly pick lane and kind (tall or low)
  const lane = Math.floor(Math.random()*3);
  const kind = Math.random() < 0.5 ? 'low' : 'tall';
  const w = 80;
  const h = (kind === 'low') ? 70 : 120;
  const x = W + 100;
  const yBase = GROUND_Y - h;
  obstacles.push({x, y:yBase, w, h, kind});
}

// Collision AABB
function collides(ax,ay,aw,ah,bx,by,bw,bh){
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Render
function drawPlayer(px, py, w, h){
  ctx.fillStyle = '#4cc9f0';
  ctx.fillRect(px - w/2, py, w, h);
}
function drawObstacle(o){
  ctx.fillStyle = o.kind === 'low' ? '#f72585' : '#b5179e';
  ctx.fillRect(o.x - o.w/2, o.y, o.w, o.h);
}
function drawGround(){
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  // lane lines
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.setLineDash([10,10]);
  ctx.beginPath();
  ctx.moveTo(W*0.375, 0); ctx.lineTo(W*0.375, H);
  ctx.moveTo(W*0.625, 0); ctx.lineTo(W*0.625, H);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Game loop
function loop(ts){
  if (!lastTime) lastTime = ts;
  const dt = Math.min(0.032, (ts - lastTime)/1000); // clamp dt
  lastTime = ts;

  // Update score
  if (running) score += Math.floor(200 * dt);
  scoreEl.textContent = 'Score: ' + score;

  // Clear
  ctx.fillStyle = '#151515';
  ctx.fillRect(0,0,W,H);

  drawGround();

  // Smooth lane interpolation
  if (laneProgress < 1){
    laneProgress = Math.min(1, laneProgress + dt / LANE_SWITCH_TIME);
  }
  const laneX = LANES[laneFrom] + (LANES[laneTo]-LANES[laneFrom]) * easeOutCubic(laneProgress);

  // Physics: jump/slide
  vy += GRAVITY * dt;
  y += vy * dt;
  const groundTop = GROUND_Y - currentPlayerH();
  if (y > groundTop){ y = groundTop; vy = 0; }

  if (sliding){
    slideTimer -= dt;
    if (slideTimer <= 0) sliding = false;
  }

  // Obstacles update
  spawnTimer += dt;
  if (spawnTimer >= SPAWN_EVERY){
    spawnTimer = 0;
    spawnObstacle();
  }
  for (let i=obstacles.length-1; i>=0; i--){
    const o = obstacles[i];
    o.x -= OBSTACLE_SPEED * dt;
    if (o.x < -150) obstacles.splice(i,1);
  }

  // Draw obstacles
  obstacles.forEach(drawObstacle);

  // Player box
  const pw = PLAYER_W;
  const ph = currentPlayerH();
  drawPlayer(laneX, y, pw, ph);

  // Collisions
  if (running){
    for (const o of obstacles){
      if (collides(laneX - pw/2, y, pw, ph, o.x - o.w/2, o.y, o.w, o.h)){
        running = false;
        restartBtn.hidden = false;
        break;
      }
    }
  }

  if (running) requestAnimationFrame(loop);
}

function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

restartBtn.addEventListener('click', reset);

// Start
reset();
