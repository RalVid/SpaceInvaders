// ==== SETUP & GLOBALS ====
const menu           = document.getElementById("menu");
const startBtn       = document.getElementById("startBtn");
const menuHighscore  = document.getElementById("menuHighscore");
const menuLastscore  = document.getElementById("menulastscore");
const canvas         = document.getElementById("gameCanvas");
const ctx            = canvas.getContext("2d");
const sprites        = document.getElementById("sprites");
const enemySprites   = document.getElementById("enemySprites");

const audioCtx = new (window.AudioContext||window.webkitAudioContext)();

let keys = {};
let player, enemies, enemyBullets, shields, explosions;
let score, lives, highscore, lastscore;
let gameOver, paused, wave, enemySpeed, enemyDirection, enemyCols;
const explosionDuration = 20;

// logical game dimensions
const GAME_W = 500, GAME_H = 600;

// ==== MYSTERY SHIP & UFO STATE ====
let mysteryShip, mysteryTimer, ufoOsc, ufoGain;
function getRandomMysteryFrames() {
  return Math.floor((20 + Math.random()*20) * 60);
}

// ==== GAME OVER MELODY & TEXT ====
function playGameOverMelody() {
  if (audioCtx.state==="suspended") audioCtx.resume();
  const now = audioCtx.currentTime;
  const notes = [
    { f:523.25, t:0.00, d:0.15 },
    { f:440.00, t:0.15, d:0.15 },
    { f:349.23, t:0.30, d:0.30 }
  ];
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.4, now);
  g.connect(audioCtx.destination);
  for (let n of notes) {
    const o = audioCtx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(n.f, now + n.t);
    o.connect(g);
    o.start(now + n.t);
    o.stop(now + n.t + n.d);
  }
  return notes[notes.length-1].t + notes[notes.length-1].d;
}

function drawGameOverText() {
  ctx.clearRect(0,0,GAME_W,GAME_H);
  ctx.fillStyle = "white";
  ctx.font = "48px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("GAME OVER", GAME_W/2, GAME_H/2);
}

// ==== RESPONSIVE SCALING ====
function resizeCanvas() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const scale = Math.min(vw/GAME_W, vh/GAME_H);
  canvas.style.transform = `scale(${scale})`;
  canvas.style.transformOrigin = "top left";
  canvas.style.marginLeft = `${(vw - GAME_W*scale)/2}px`;
  canvas.style.marginTop  = `${(vh - GAME_H*scale)/2}px`;
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
let ENEMY_FRAMES=[];
for (let r=0;r<FRAMES;r++){
  for (let c=0;c<TYPES;c++){
    ENEMY_FRAMES.push({ sx:c*FRAME_W, sy:r*FRAME_H, w:FRAME_W, h:FRAME_H });
  }
}
let enemyFrame=0;
setInterval(()=>enemyFrame=1-enemyFrame,500);

// ==== INPUT HANDLERS ====
document.addEventListener("keydown", e=>keys[e.key]=true);
document.addEventListener("keyup",   e=>keys[e.key]=false);

// ==== UNLOCK AUDIO ====
function unlockAudio(){
  if(audioCtx.state==="suspended") audioCtx.resume();
  ["click","touchstart","keydown"].forEach(evt=>window.removeEventListener(evt,unlockAudio));
}
["click","touchstart","keydown"].forEach(evt=>window.addEventListener(evt,unlockAudio));

// ==== TOUCH CONTROL ZONES ====
// Bottom zone (y >= player.y): steer left/right by half-screen
// Top zone    (y <  player.y): shoot
canvas.addEventListener("touchstart", handleTouchZone, { passive:false });
canvas.addEventListener("touchmove",  handleTouchZone, { passive:false });
canvas.addEventListener("touchend",   e=>{
  e.preventDefault();
  keys["ArrowLeft"]=false;
  keys["ArrowRight"]=false;
  keys[" "]=false;
}, { passive:false });

function handleTouchZone(e){
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  let steerLeft=false, steerRight=false, shootZone=false;
  for(let t of e.touches){
    const tx = (t.clientX - rect.left) * (canvas.width  / rect.width);
    const ty = (t.clientY - rect.top ) * (canvas.height / rect.height);
    if(ty >= player.y){
      if(tx < GAME_W/2) steerLeft = true;
      else              steerRight = true;
    } else {
      shootZone = true;
    }
  }
  keys["ArrowLeft"]  = steerLeft;
  keys["ArrowRight"] = steerRight;
  keys[" "]          = shootZone;
}

// ==== MAIN MENU START BUTTON ====
startBtn.onclick = ()=>{
  menu.style.display   = "none";
  canvas.style.display = "block";
  startGame();
};

// ==== WAIT FOR SPRITES TO LOAD ====
let loaded=0;
[sprites,enemySprites].forEach(img=>{
  img.onload=()=>{
    if(++loaded===2){
      highscore = +localStorage.getItem("highscore")||0;
      lastscore = +localStorage.getItem("lastscore")  ||0;
      menuHighscore.textContent = highscore.toString().padStart(4,"0");
      menuLastscore.textContent = lastscore.toString().padStart(4,"0");
      menu.style.display="block";
    }
  };
});

// ==== PLAYER HIT & GAME OVER SEQUENCE ====
function handlePlayerHit(x,y){
  if(gameOver) return;
  addExplosion(x,y);
  playHitSound();
  lives = Math.max(0,lives-1);
  paused = true;
  setTimeout(()=>{
    paused=false;
    if(lives===0){
      gameOver=true;
      if(ufoOsc){ufoOsc.stop();ufoOsc=null;ufoGain=null;}
      localStorage.setItem("lastscore",score);
      menuHighscore.textContent = highscore.toString().padStart(4,"0");
      menuLastscore.textContent = score.toString().padStart(4,"0");
      const delay = playGameOverMelody()*1000+200;
      setTimeout(()=>{
        canvas.style.display="none";
        menu.style.display="block";
      }, delay);
    }
  }, 500);
}

// ==== GAME INIT ====
function startGame(){
  paused=false;
  gameOver=false;
  score=0; lives=3;
  highscore = +localStorage.getItem("highscore")||0;
  wave=1; enemySpeed=1; enemyDirection=1;
  mysteryShip=null;
  mysteryTimer=getRandomMysteryFrames();
  if(ufoOsc){ufoOsc.stop();ufoOsc=null;ufoGain=null;}
  player={ x:GAME_W/2-25, y:GAME_H-60, width:50, height:20, speed:5, bullets:[], cooldown:0 };
  enemies=[]; enemyBullets=[]; shields=[]; explosions=[];
  initLevel();
  requestAnimationFrame(gameLoop);
}

// ==== LEVEL & SHIELDS ====
function initLevel(){
  createEnemies();
  shields=createShields();
}
function createEnemies(){
  enemies=[];
  const rows=2+wave, cols=6+wave;
  enemyCols=cols;
  const w=FRAME_W*2, h=FRAME_H*2, gapX=GAME_W/cols;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      enemies.push({ x:gapX*c+(gapX-w)/2, y:40*r+30, width:w, height:h, alive:true });
    }
  }
}
function createShields(){
  const arr=[], COUNT=5, SW=60, SH=30, C=6, R=4;
  const cw=SW/C, ch=SH/R, totalW=COUNT*SW, gap=(GAME_W-totalW)/(COUNT+1);
  for(let i=0;i<COUNT;i++){
    const bx=gap*(i+1)+SW*i, by=GAME_H-120;
    for(let ry=0;ry<R;ry++) for(let cx=0;cx<C;cx++){
      arr.push({ x:bx+cx*cw, y:by+ry*ch, width:cw, height:ch });
    }
  }
  return arr;
}

// ==== MYSTERY UFO & SIREN ====
function spawnMystery(){
  mysteryShip={ x:-50, y:20, width:40, height:16, speed:2+wave*0.2 };
  audioCtx.resume().then(()=>{
    ufoOsc=audioCtx.createOscillator();
    ufoGain=audioCtx.createGain();
    ufoOsc.type="square";
    ufoOsc.frequency.setValueAtTime(200,audioCtx.currentTime);
    ufoGain.gain.setValueAtTime(0.1,audioCtx.currentTime);
    ufoOsc.connect(ufoGain).connect(audioCtx.destination);
    ufoOsc.start();
  });
}

// ==== SHOOTING & SOUNDS ====
function shoot(){
  if(player.cooldown>0) return;
  player.bullets.push({
    x:player.x+player.width/2-2,
    y:player.y,
    width:SPRITES.bullet.w*2,
    height:SPRITES.bullet.h*2,
    speed:7
  });
  player.cooldown=15;
  playShootSound();
}
function enemyShoot(e){
  enemyBullets.push({
    x:e.x+e.width/2-2,
    y:e.y+e.height,
    width:4, height:10, speed:3
  });
}
function playShootSound(){
  if(audioCtx.state==="suspended") audioCtx.resume();
  const o=audioCtx.createOscillator(), g=audioCtx.createGain();
  o.type="square";
  o.frequency.setValueAtTime(600,audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(200,audioCtx.currentTime+0.1);
  g.gain.setValueAtTime(0.2,audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.1);
  o.connect(g).connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime+0.1);
}
function playExplosionSound(){
  if(audioCtx.state==="suspended") audioCtx.resume();
  const now=audioCtx.currentTime, dur=0.4;
  const len=audioCtx.sampleRate*dur;
  const buf=audioCtx.createBuffer(1,len,audioCtx.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
  const src=audioCtx.createBufferSource(), f=audioCtx.createBiquadFilter(), g=audioCtx.createGain();
  src.buffer=buf;
  f.type="lowpass";
  f.frequency.setValueAtTime(800,now);
  f.frequency.exponentialRampToValueAtTime(200,now+dur);
  f.Q.setValueAtTime(0.7,now);
  g.gain.setValueAtTime(0.8,now);
  g.gain.exponentialRampToValueAtTime(0.001,now+dur);
  src.connect(f).connect(g).connect(audioCtx.destination);
  src.start(now); src.stop(now+dur);
}
function playHitSound(){
  if(audioCtx.state==="suspended") audioCtx.resume();
  const now=audioCtx.currentTime, dur=0.6;
  const len=audioCtx.sampleRate*dur;
  const buf=audioCtx.createBuffer(1,len,audioCtx.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
  const src=audioCtx.createBufferSource(), f=audioCtx.createBiquadFilter(), g=audioCtx.createGain();
  src.buffer=buf;
  f.type="lowpass";
  f.frequency.setValueAtTime(1200,now);
  f.frequency.exponentialRampToValueAtTime(300,now+dur);
  f.Q.setValueAtTime(0.7,now);
  g.gain.setValueAtTime(1,now);
  g.gain.exponentialRampToValueAtTime(0.001,now+dur);
  src.connect(f).connect(g).connect(audioCtx.destination);
  src.start(now); src.stop(now+dur);
}
function addExplosion(x,y){
  explosions.push({x,y,frame:0});
  playExplosionSound();
}

// ==== MAIN LOOP ====
function gameLoop(){
  update();
  draw();
  if(!gameOver) requestAnimationFrame(gameLoop);
}

// ==== UPDATE LOGIC ====
function update(){
  if(paused||gameOver) return;

  // UFO
  if(!mysteryShip){
    mysteryTimer--;
    if(mysteryTimer<=0) spawnMystery();
  } else {
    mysteryShip.x += mysteryShip.speed;
    if(ufoOsc){
      const f = 200 + 300*(mysteryShip.x/GAME_W);
      ufoOsc.frequency.setValueAtTime(f,audioCtx.currentTime);
    }
    if(mysteryShip.x>GAME_W){
      mysteryShip=null;
      mysteryTimer=getRandomMysteryFrames();
      if(ufoOsc){ufoOsc.stop();ufoOsc=null;ufoGain=null;}
    }
  }

  // move & shoot
  if(keys["ArrowLeft"]  && player.x>0)                    player.x -= player.speed;
  if(keys["ArrowRight"] && player.x+player.width<GAME_W) player.x += player.speed;
  if(keys[" "]) shoot();
  if(player.cooldown>0) player.cooldown--;

  // bullets
  player.bullets.forEach((b,i)=>{b.y-=b.speed; if(b.y<0)player.bullets.splice(i,1);});
  enemyBullets.forEach((b,i)=>{b.y+=b.speed; if(b.y>GAME_H)enemyBullets.splice(i,1);});

  // enemies
  let down=false;
  enemies.forEach(e=>{ if(!e.alive) return; e.x += enemyDirection*enemySpeed;
    if(e.x<=0||e.x+e.width>=GAME_W) down=true;
  });
  if(down){ enemyDirection*=-1; enemies.forEach(e=>e.y+=10); }
  if(Math.random()<0.02){
    const a=enemies.filter(e=>e.alive);
    if(a.length) enemyShoot(a[Math.floor(Math.random()*a.length)]);
  }

  // explosions
  explosions.forEach((ex,i)=>{if(++ex.frame>explosionDuration)explosions.splice(i,1);});

  handleCollisions();

  // enemy reach
  enemies.forEach(e=>{ if(e.alive&&e.y+e.height>=player.y){
    e.alive=false;
    handlePlayerHit(e.x+e.width/2,e.y+e.height/2);
  }});
  if(enemies.every(e=>!e.alive)){
    wave++;
    enemySpeed = 1 + (wave-1)*0.5;
    initLevel();
  }
}

// ==== COLLISION HANDLING ====
function handleCollisions(){
  // player→mystery
  player.bullets = player.bullets.filter(b=>{
    if(mysteryShip &&
       b.x<mysteryShip.x+mysteryShip.width&&
       b.x+b.width>mysteryShip.x&&
       b.y<mysteryShip.y+mysteryShip.height&&
       b.y+b.height>mysteryShip.y){
      const bonus=(1+Math.floor(Math.random()*5))*50;
      score+=bonus;
      if(score>highscore){ highscore=score; localStorage.setItem("highscore",highscore); }
      addExplosion(b.x,b.y);
      mysteryShip=null;
      mysteryTimer=getRandomMysteryFrames();
      if(ufoOsc){ufoOsc.stop();ufoOsc=null;ufoGain=null;}
      return false;
    }
    return true;
  });

  // player→enemies
  player.bullets = player.bullets.filter(b=>{
    for(let e of enemies){
      if(e.alive&&
         b.x<e.x+e.width&&b.x+b.width>e.x&&
         b.y<e.y+e.height&&b.y+b.height>e.y){
        e.alive=false;
        score+=10;
        if(score>highscore){ highscore=score; localStorage.setItem("highscore",highscore); }
        addExplosion(b.x,b.y);
        return false;
      }
    }
    return true;
  });

  // enemy→player
  enemyBullets = enemyBullets.filter(b=>{
    if(b.x<player.x+player.width&&b.x+b.width>player.x&&
       b.y<player.y+player.height&&b.y+b.height>player.y){
      handlePlayerHit(player.x+player.width/2,player.y);
      return false;
    }
    return true;
  });

  // bullets→shields
  player.bullets = player.bullets.filter(b=>{
    for(let i=0;i<shields.length;i++){
      const s=shields[i];
      if(b.x<s.x+s.width&&b.x+b.width>s.x&&
         b.y<s.y+s.height&&b.y+b.height>s.y){
        shields.splice(i,1);
        addExplosion(b.x,b.y);
        return false;
      }
    }
    return true;
  });
  enemyBullets = enemyBullets.filter(b=>{
    for(let i=0;i<shields.length;i++){
      const s=shields[i];
      if(b.x<s.x+s.width&&b.x+b.width>s.x&&
         b.y<s.y+s.height&&b.y+b.height>s.y){
        shields.splice(i,1);
        addExplosion(b.x,b.y);
        return false;
      }
    }
    return true;
  });
}

// ==== DRAW FUNCTIONS ====
function draw(){
  if(gameOver){ drawGameOverText(); return; }
  ctx.clearRect(0,0,GAME_W,GAME_H);
  ctx.fillStyle="red";
  ctx.font="16px monospace";
  ctx.textBaseline="top";
  ctx.fillText(`SCORE: ${score.toString().padStart(4,"0")}`,10,10);
  const hi=`HI-SCORE: ${highscore.toString().padStart(4,"0")}`,
        hiX=GAME_W/2 - ctx.measureText(hi).width/2;
  ctx.fillText(hi,hiX,10);
  ctx.fillText(`LIVES: ${lives}`,GAME_W-100,10);

  drawMysteryShip();
  drawEnemies();
  drawPlayer();
  drawShields();
  drawPlayerBullets();
  drawExplosions();
}

function drawPlayer(){
  const sp=SPRITES.player;
  ctx.drawImage(sprites,sp.sx,sp.sy,sp.w,sp.h,
                player.x,player.y,player.width,player.height);
  const bw=6,bh=12,
        bx=player.x+player.width/2-bw/2,
        by=player.y-bh+2;
  ctx.fillStyle="#888";
  ctx.fillRect(bx,by,bw,bh);
}
function drawEnemies(){
  const sp=ENEMY_FRAMES[enemyFrame];
  enemies.forEach((e,i)=>{
    if(!e.alive) return;
    ctx.drawImage(enemySprites,sp.sx,sp.sy,sp.w,sp.h,e.x,e.y,e.width,e.height);
    const row=Math.floor(i/enemyCols), cols=["#ffff66","#66ff66"];
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
  player.bullets.forEach(b=>
    ctx.drawImage(sprites,sp.sx,sp.sy,sp.w,sp.h,b.x,b.y,b.width,b.height)
  );
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
    ctx.save();ctx.globalAlpha=1-ex.frame/explosionDuration;
    ctx.drawImage(sprites,sp.sx,sp.sy,sp.w,sp.h,ex.x-sz/2,ex.y-sz/2,sz,sz);
    ctx.restore();
  });
}
function drawMysteryShip(){
  if(!mysteryShip) return;
  const {x,y,width:w,height:h}=mysteryShip;
  ctx.fillStyle="magenta";ctx.beginPath();
  ctx.ellipse(x+w/2,y+h/2+2,w/2,h/2.5,0,0,2*Math.PI);ctx.fill();
  ctx.fillStyle="#88ffdd";ctx.beginPath();
  ctx.ellipse(x+w/2,y+h/2-4,w/4,h/3,0,0,2*Math.PI);ctx.fill();
  ctx.strokeStyle="black";ctx.lineWidth=1;ctx.stroke();
}
