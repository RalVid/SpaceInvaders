// ==== SETUP & GLOBALS ====
const menu            = document.getElementById("menu");
const startBtn        = document.getElementById("startBtn");
const menuHighscore   = document.getElementById("menuHighscore");
const menuLastscore   = document.getElementById("menuLastscore");
const container       = document.getElementById("game-container");
const canvas          = document.getElementById("gameCanvas");
const ctx             = canvas.getContext("2d");
const sprites         = document.getElementById("sprites");
const enemySprites    = document.getElementById("enemySprites");
const leftBtn         = document.getElementById("leftBtn");
const rightBtn        = document.getElementById("rightBtn");
const shootBtn        = document.getElementById("shootBtn");
const mobileControls  = document.getElementById("mobile-controls");

const audioCtx = new (window.AudioContext||window.webkitAudioContext)();

// game state
let keys           = {};
let player, enemies, enemyBullets, shields, explosions, popups;
let score, lives, highscore, lastscore;
let gameOver, wave, enemySpeed, enemyDirection, enemyCols;
const explosionDuration = 20;
const popupDuration     = 60;

// UFO state
let mysteryShip, mysteryTimer, ufoOsc, ufoGain;

// drop cooldown
let dropCooldown = 0;

// logical canvas size
const GAME_W = 500, GAME_H = 600;
let lastTime = 0;

// ==== UTILITIES ====
function getRandomMysteryFrames() {
  return Math.floor((20 + Math.random()*20) * 60);
}

// ==== GAME OVER TUNE & TEXT ====
function playGameOverMelody() {
  if (audioCtx.state==="suspended") audioCtx.resume();
  const now      = audioCtx.currentTime;
  const duration = 1.5;
  const osc = audioCtx.createOscillator();
  const g   = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(200, now+duration);
  g.gain.setValueAtTime(0.2, now);
  g.gain.exponentialRampToValueAtTime(0.001, now+duration);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now+duration);
  return duration;
}
function drawGameOverText(){
  ctx.clearRect(0,0,GAME_W,GAME_H);
  ctx.fillStyle    = "white";
  ctx.font         = "48px monospace";
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("GAME OVER", GAME_W/2, GAME_H/2);
}

// ==== RESPONSIVE SCALING ====
function resizeCanvas(){
  const vw = window.innerWidth, vh = window.innerHeight;
  const scale = Math.min(1, vw/GAME_W, vh/GAME_H);
  container.style.transform = `translate(-50%,-50%) scale(${scale})`;
  container.style.top       = "50%";
  container.style.left      = "50%";
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ==== SPRITES & FRAMES ====
const SPRITES = {
  player:    { sx:0,  sy:0,  w:22, h:16 },
  bullet:    { sx:38, sy:0,  w:3,  h:8  },
  explosion: { sx:41, sy:0,  w:16, h:16 }
};
const FRAME_W=16, FRAME_H=8, TYPES=4, FRAMES=2;
let ENEMY_FRAMES = [];
for(let r=0;r<FRAMES;r++){
  for(let c=0;c<TYPES;c++){
    ENEMY_FRAMES.push({ sx:c*FRAME_W, sy:r*FRAME_H, w:FRAME_W, h:FRAME_H });
  }
}
let enemyFrame=0;
setInterval(()=>enemyFrame=1-enemyFrame,500);

// ==== INPUT HANDLERS ====
document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup",   e => keys[e.key] = false);

// ==== MOBILE BUTTONS VIA POINTER EVENTS ====
function bindControl(btn, key) {
  btn.style.touchAction = "none";
  btn.addEventListener("pointerdown", e => {
    e.preventDefault();
    keys[key] = true;
  });
  btn.addEventListener("pointerup",    () => keys[key] = false);
  btn.addEventListener("pointercancel",() => keys[key] = false);
  btn.addEventListener("pointerleave", () => keys[key] = false);
}
bindControl(leftBtn,  "ArrowLeft");
bindControl(rightBtn, "ArrowRight");
bindControl(shootBtn, " ");

// ==== UNLOCK AUDIO ON FIRST GESTURE ====
function unlockAudio(){
  if (audioCtx.state==="suspended") audioCtx.resume();
  ["click","pointerdown","keydown"].forEach(evt => window.removeEventListener(evt, unlockAudio));
}
["click","pointerdown","keydown"].forEach(evt => window.addEventListener(evt, unlockAudio));

// ==== MAIN MENU START ====
startBtn.onclick = ()=>{
  menu.style.display        = "none";
  container.style.display   = "block";
  canvas.style.display      = "block";
  mobileControls.classList.add("show");
  startGame();
};

// wait for sprites to load
let loaded=0;
[sprites, enemySprites].forEach(img => {
  img.onload = () => {
    if (++loaded === 2) {
      highscore = +localStorage.getItem("highscore") || 0;
      lastscore = +localStorage.getItem("lastscore")  || 0;
      menuHighscore.textContent = highscore.toString().padStart(4,"0");
      menuLastscore.textContent = lastscore.toString().padStart(4,"0");
      menu.style.display = "block";
    }
  };
});

// ==== POPUPS ====
function addPopup(x,y,text){ popups.push({x,y,text,frame:0}); }
function updatePopups(){ popups = popups.filter(p=>++p.frame<=popupDuration); }
function drawPopups(){
  ctx.font="16px monospace"; ctx.textAlign="center";
  popups.forEach(p=>{
    ctx.globalAlpha = 1 - p.frame/popupDuration;
    ctx.fillStyle   = "yellow";
    ctx.fillText(p.text, p.x, p.y - p.frame);
  });
  ctx.globalAlpha = 1;
}

// ==== EXPLOSIONS ====
function addExplosion(x,y){
  explosions.push({x,y,frame:0});
  playExplosionSound();
}

// ==== SOUND FX ====
function playShootSound(){
  if(audioCtx.state==="suspended") audioCtx.resume();
  const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(600, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime+0.1);
  g.gain.setValueAtTime(0.2, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+0.1);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime+0.1);
}

function playExplosionSound(){
  if(audioCtx.state==="suspended") audioCtx.resume();
  const now=audioCtx.currentTime, dur=0.4;
  const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*dur,audioCtx.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i] = (Math.random()*2-1)*(1 - i/d.length);
  const src=audioCtx.createBufferSource(), f=audioCtx.createBiquadFilter(), g=audioCtx.createGain();
  src.buffer = buf;
  f.type = "lowpass";
  f.frequency.setValueAtTime(800, now);
  f.frequency.exponentialRampToValueAtTime(200, now+dur);
  g.gain.setValueAtTime(0.8, now);
  g.gain.exponentialRampToValueAtTime(0.001, now+dur);
  src.connect(f).connect(g).connect(audioCtx.destination);
  src.start(now); src.stop(now+dur);
}

function playHitSound(){
  if(audioCtx.state==="suspended") audioCtx.resume();
  const now=audioCtx.currentTime, dur=0.6;
  const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*dur,audioCtx.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i] = (Math.random()*2-1)*(1 - i/d.length);
  const src=audioCtx.createBufferSource(), f=audioCtx.createBiquadFilter(), g=audioCtx.createGain();
  src.buffer = buf;
  f.type = "lowpass";
  f.frequency.setValueAtTime(1200, now);
  f.frequency.exponentialRampToValueAtTime(300, now+dur);
  g.gain.setValueAtTime(1, now);
  g.gain.exponentialRampToValueAtTime(0.001, now+dur);
  src.connect(f).connect(g).connect(audioCtx.destination);
  src.start(now); src.stop(now+dur);
}

function playUfoHitSound(){
  if(audioCtx.state==="suspended") audioCtx.resume();
  const now=audioCtx.currentTime;
  const osc=audioCtx.createOscillator(), g=audioCtx.createGain();
  osc.type="square";
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now+0.2);
  g.gain.setValueAtTime(0.2, now);
  g.gain.exponentialRampToValueAtTime(0.001, now+0.2);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(now); osc.stop(now+0.2);
}

// ==== PLAYER HIT & GAME OVER ====
function handlePlayerHit(x,y){
  if(gameOver) return;
  addExplosion(x,y);
  playHitSound();
  lives = Math.max(0,lives-1);
  player.blink = 30;
  if(lives===0){
    gameOver = true;
    if(ufoOsc){ufoOsc.stop();ufoOsc=null;ufoGain=null}
    localStorage.setItem("lastscore", score);
    menuHighscore.textContent = highscore.toString().padStart(4,"0");
    menuLastscore.textContent = score.toString().padStart(4,"0");
    const delay = playGameOverMelody()*1000 + 200;
    setTimeout(()=>{
      container.style.display="none";
      menu.style.display="block";
      mobileControls.classList.remove("show");
    }, delay);
  }
}

// ==== GAME INIT ====
function startGame(){
  gameOver    = false;
  score       = 0;
  lives       = 3;
  highscore   = +localStorage.getItem("highscore")||0;
  wave        = 1;
  enemySpeed     = 1;
  enemyDirection = 1;
  mysteryShip    = null;
  mysteryTimer   = getRandomMysteryFrames();
  dropCooldown   = 0;
  if(ufoOsc){ufoOsc.stop();ufoOsc=null;ufoGain=null}

  player = {
    x: GAME_W/2 - 25,
    y: GAME_H - 60,
    width: 50, height: 20,
    speed: 5,
    bullets: [], cooldown: 0,
    blink: 0
  };
  enemies      = [];
  enemyBullets = [];
  shields      = [];
  explosions   = [];
  popups       = [];

  initLevel();
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// ==== LEVEL & SHIELDS ====
function initLevel(){ createEnemies(); shields = createShields(); }
function createEnemies(){
  enemies=[]; const rows=2+wave, cols=6+wave; enemyCols=cols;
  const w=FRAME_W*2, h=FRAME_H*2, gapX=GAME_W/cols;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      enemies.push({ x: gapX*c+(gapX-w)/2, y:40*r+30, width:w, height:h, alive:true });
    }
  }
}
function createShields(){
  const arr=[], COUNT=5, SW=60, SH=30, C=6, R=4;
  const cw=SW/C, ch=SH/R, totalW=COUNT*SW, gap=(GAME_W-totalW)/(COUNT+1);
  for(let i=0;i<COUNT;i++){
    const bx=gap*(i+1)+SW*i, by=GAME_H-120;
    for(let ry=0;ry<R;ry++){
      for(let cx=0;cx<C;cx++){
        arr.push({ x:bx+cx*cw, y:by+ry*ch, width:cw, height:ch });
      }
    }
  }
  return arr;
}

// ==== MYSTERY UFO ====
function spawnMystery(){
  mysteryShip={ x:-50, y:20, width:40, height:16, speed:2 + wave*0.2 };
  audioCtx.resume().then(()=>{
    ufoOsc=audioCtx.createOscillator();
    ufoGain=audioCtx.createGain();
    ufoOsc.type="square";
    ufoOsc.frequency.setValueAtTime(200, audioCtx.currentTime);
    ufoGain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    ufoOsc.connect(ufoGain).connect(audioCtx.destination);
    ufoOsc.start();
  });
}

// ==== SHOOTING & ENEMY SHOOT ====
function shoot(){
  if(player.cooldown>0) return;
  player.bullets.push({
    x: player.x + player.width/2 - 2,
    y: player.y,
    width: SPRITES.bullet.w*2,
    height:SPRITES.bullet.h*2,
    speed:7
  });
  player.cooldown=15;
  playShootSound();
}
function enemyShoot(e){
  enemyBullets.push({
    x: e.x + e.width/2 - 2,
    y: e.y + e.height,
    width:4, height:10, speed:3
  });
}

// ==== MAIN LOOP ====
function gameLoop(timestamp){
  const delta=(timestamp-lastTime)/1000; lastTime=timestamp;
  update(delta); draw();
  if(!gameOver) requestAnimationFrame(gameLoop);
}

// ==== UPDATE ====
function update(delta){
  if(gameOver) return;
  if(player.blink>0) player.blink--;
  updatePopups();

  // UFO
  if(!mysteryShip){
    mysteryTimer--; if(mysteryTimer<=0) spawnMystery();
  } else {
    mysteryShip.x += mysteryShip.speed*delta*60;
    if(ufoOsc){
      const freq = 200 + 300*(mysteryShip.x / GAME_W);
      ufoOsc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    }
    if(mysteryShip.x > GAME_W){
      mysteryShip=null; mysteryTimer=getRandomMysteryFrames();
      if(ufoOsc){ufoOsc.stop();ufoOsc=null;ufoGain=null}
    }
  }

  // fleet move + edge drop
  if(dropCooldown>0) dropCooldown--;
  let needDrop=false;
  enemies.forEach(e=>{
    if(!e.alive) return;
    e.x += enemyDirection*enemySpeed*delta*60;
    if(e.x<=0||e.x+e.width>=GAME_W) needDrop=true;
  });
  if(needDrop&&dropCooldown===0){
    enemyDirection*=-1; enemies.forEach(e=>e.y+=10); dropCooldown=10;
  }

  // enemy fire
  if(Math.random()<0.02){
    const shooters=enemies.filter(e=>e.alive);
    if(shooters.length) enemyShoot(shooters[Math.floor(Math.random()*shooters.length)]);
  }

  // player
  if(keys["ArrowLeft"]&&player.x>0)                 player.x -= player.speed*delta*60;
  if(keys["ArrowRight"]&&player.x+player.width<GAME_W) player.x += player.speed*delta*60;
  if(keys[" "]) shoot();
  if(player.cooldown>0) player.cooldown--;

  // bullets
  player.bullets.forEach((b,i)=>{ b.y -= b.speed*delta*60; if(b.y<0) player.bullets.splice(i,1); });
  enemyBullets.forEach((b,i)=>{ b.y += b.speed*delta*60; if(b.y>GAME_H) enemyBullets.splice(i,1); });

  // explosions
  explosions.forEach((ex,i)=>{ if(++ex.frame>explosionDuration) explosions.splice(i,1); });

  handleCollisions();

  // enemies reach player
  enemies.forEach(e=>{
    if(e.alive&&e.y+e.height>=player.y){
      e.alive=false;
      handlePlayerHit(e.x+e.width/2, e.y+e.height/2);
    }
  });

  // next wave
  if(enemies.every(e=>!e.alive)){ wave++; enemySpeed = 1 + (wave-1)*0.5; initLevel(); }
}

// ==== COLLISIONS ====
function handleCollisions(){
  // player→mystery
  player.bullets = player.bullets.filter(b=>{
    if(mysteryShip &&
       b.x<mysteryShip.x+mysteryShip.width &&
       b.x+b.width>mysteryShip.x &&
       b.y<mysteryShip.y+mysteryShip.height &&
       b.y+b.height>mysteryShip.y){
      const bonus = (1 + Math.floor(Math.random()*5))*50;
      score += bonus;
      if(score>highscore){ highscore=score; localStorage.setItem("highscore",highscore); }
      playUfoHitSound();
      addPopup(b.x, b.y, `+${bonus}`);
      addExplosion(b.x, b.y);
      mysteryShip=null; mysteryTimer=getRandomMysteryFrames();
      if(ufoOsc){ufoOsc.stop();ufoOsc=null;ufoGain=null}
      return false;
    }
    return true;
  });

  // player→enemies
  player.bullets = player.bullets.filter(b=>{
    for(let e of enemies){
      if(e.alive &&
         b.x<e.x+e.width && b.x+b.width>e.x &&
         b.y<e.y+e.height&& b.y+b.height>e.y){
        e.alive=false; score+=10;
        if(score>highscore){ highscore=score; localStorage.setItem("highscore",highscore); }
        addExplosion(b.x,b.y);
        return false;
      }
    }
    return true;
  });

  // enemy→player
  enemyBullets = enemyBullets.filter(b=>{
    if(b.x<player.x+player.width &&
       b.x+b.width>player.x &&
       b.y<player.y+player.height &&
       b.y+b.height>player.y){
      handlePlayerHit(player.x+player.width/2, player.y);
      return false;
    }
    return true;
  });

  // bullets→shields
  function hitShields(arr,list){
    return list.filter(b=>{
      for(let i=0;i<arr.length;i++){
        const s=arr[i];
        if(b.x<s.x+s.width&&b.x+b.width>s.x&&b.y<s.y+s.height&&b.y+b.height>s.y){
          arr.splice(i,1);
          addExplosion(b.x,b.y);
          return false;
        }
      }
      return true;
    });
  }
  player.bullets = hitShields(shields, player.bullets);
  enemyBullets  = hitShields(shields, enemyBullets);
}

// ==== DRAW ====
function draw(){
  if(gameOver){ drawGameOverText(); return; }

  ctx.clearRect(0,0,GAME_W,GAME_H);

  // HUD
  ctx.fillStyle    = "red";
  ctx.font         = "16px monospace";
  ctx.textBaseline = "top";
  const hudY = 10;

  // label + number
  const labelX = 30;
  ctx.fillText("SCORE:", labelX, hudY);
  const numX = labelX + ctx.measureText("SCORE: ").width;
  ctx.fillText(score.toString().padStart(4,"0"), numX, hudY);

  // hi‐score
  const hiText = `HI-SCORE: ${highscore.toString().padStart(4,"0")}`;
  const hiX    = GAME_W/2 - ctx.measureText(hiText).width/2;
  ctx.fillText(hiText, hiX, hudY);

  // lives
  const livesText = `LIVES: ${lives}`;
  const livesX    = GAME_W - ctx.measureText(livesText).width - 30;
  ctx.fillText(livesText, livesX, hudY);

  drawMysteryShip();
  drawEnemies();
  drawPlayer();
  drawShields();
  drawPlayerBullets();
  drawExplosions();
  drawPopups();
}

// ==== DRAW HELPERS ====
// (same as before)


// ==== DRAW HELPERS ====
function drawPlayer(){
  if(player.blink>0&&Math.floor(player.blink/5)%2===0){
    ctx.fillStyle="red";
    ctx.fillRect(player.x,player.y,player.width,player.height);
  } else {
    const sp=SPRITES.player;
    ctx.drawImage(sprites,sp.sx,sp.sy,sp.w,sp.h,player.x,player.y,player.width,player.height);
  }
  const bw=6,bh=12,bx=player.x+player.width/2-bw/2,by=player.y-bh+2;
  ctx.fillStyle="#888";
  ctx.fillRect(bx,by,bw,bh);
}

function drawEnemies(){
  const sp=ENEMY_FRAMES[enemyFrame];
  enemies.forEach((e,i)=>{
    if(!e.alive) return;
    ctx.drawImage(enemySprites,sp.sx,sp.sy,sp.w,sp.h,e.x,e.y,e.width,e.height);
    const row=Math.floor(i/enemyCols),cols=["#ffff66","#66ff66"];
    ctx.globalCompositeOperation="source-atop";
    ctx.fillStyle=cols[row%2];
    ctx.fillRect(e.x,e.y,e.width,e.height);
    ctx.globalCompositeOperation="source-over";
    ctx.strokeStyle="black";ctx.lineWidth=1;
    ctx.strokeRect(e.x,e.y,e.width,e.height);
  });
}

function drawPlayerBullets(){
  const sp=SPRITES.bullet;
  player.bullets.forEach(b=>{
    ctx.drawImage(sprites,sp.sx,sp.sy,sp.w,sp.h,b.x,b.y,b.width,b.height);
  });
  ctx.fillStyle="white";
  enemyBullets.forEach(b=>ctx.fillRect(b.x,b.y,b.width,b.height));
}

function drawShields(){
  ctx.fillStyle="green";
  shields.forEach(s=>ctx.fillRect(s.x,s.y,s.width,s.height));
}

function drawExplosions(){
  const sp=SPRITES.explosion;
  explosions.forEach(ex=>{
    const sz=ex.frame*2;
    ctx.save();
    ctx.globalAlpha=1-ex.frame/explosionDuration;
    ctx.drawImage(sprites,sp.sx,sp.sy,sp.w,sp.h,ex.x-sz/2,ex.y-sz/2,sz,sz);
    ctx.restore();
  });
}

function drawMysteryShip(){
  if(!mysteryShip) return;
  const {x,y,width:w,height:h}=mysteryShip;
  ctx.fillStyle="magenta";
  ctx.beginPath();
  ctx.ellipse(x+w/2,y+h/2+2,w/2,h/2.5,0,0,2*Math.PI);
  ctx.fill();
  ctx.fillStyle="#88ffdd";
  ctx.beginPath();
  ctx.ellipse(x+w/2,y+h/2-4,w/4,h/3,0,0,2*Math.PI);
  ctx.fill();
  ctx.strokeStyle="black";ctx.lineWidth=1;ctx.stroke();
}
