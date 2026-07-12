import * as THREE from 'three';
import { Player } from './entities/Player';
import { Human, DogNPC } from './entities/NPC';
import { createWorld } from './World';
import { AudioSys } from './Audio'; // Notice this is ./Audio, not ../Audio

import { createApartment } from './Apartment.js';

import { initTouchControls } from './TouchControls.js';

import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';

import { initVFX, updateVFX, burst } from './vfx.js';
import { jawSnap } from './vfx.js';

import { initJuice, popText } from './juice.js';

import { initMinimap, updateMinimap } from './minimap.js';

import { initBullets, updateBullets, resetBullets } from './Bullets.js';

import { showToast } from './ui.js';
import { TOON_RAMP } from './materials.js';
import { preloadDog, DOG_TEXTURES } from './dogAsset.js';
import { getDifficulty, setDifficulty, getDifficultyKey } from './difficulty.js';



// --- SETUP ---

const scene = new THREE.Scene();



const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 320);

const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'});

// clamp device pixel ratio: the game never set it, so it rendered at 1x and was
// browser-upscaled. 2x on desktop for sharpness, 1.5x on mobile to protect fill-rate.
// setSize() preserves this ratio, so the resize handler doesn't need to re-apply it.
const _dprCap = (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) ? 1.5 : 2;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, _dprCap));

renderer.setSize(window.innerWidth, window.innerHeight);

renderer.shadowMap.enabled = true;

renderer.shadowMap.type = THREE.PCFSoftShadowMap;

renderer.outputColorSpace = THREE.SRGBColorSpace;

// Neutral tone mapping at exposure 1.0 (was ACES @0.5, which crushed everything dark).
renderer.toneMapping = THREE.NeutralToneMapping;

renderer.toneMappingExposure = 1.0;

document.body.appendChild(renderer.domElement);

// cel ink-outline wrapper: renders the scene with inverted-hull outlines for the toon look.
const outline = new OutlineEffect(renderer, { defaultThickness: 0.008, defaultColor: [0.05, 0.04, 0.05], defaultAlpha: 0.9 });
// outline does a 2nd full render pass; keep it desktop-only so mobile (coarse pointer) stays fast.
outline.enabled = !(matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);

// camera juice: trauma-based screen shake (decays each frame)
let trauma = 0;
function addTrauma(amount) { trauma = Math.min(1, trauma + amount); }
let fovPunch = 0;                          // transient FOV widen on a bite (eases back to 0)
let hitStopT = 0;                          // brief slow-mo "chunk" on impactful hits
function hitStop(sec) { hitStopT = Math.max(hitStopT, sec); }
let elapsed = 0;
let graceTimer = 0;   // startup grace: dogs stay passive for a few seconds so you don't die on spawn
const BITE_COOLDOWN = 1.0;   // seconds between bites (shown as a radial timer on the mobile BITE button)
let biteCd = 0;
let lowHpTimer = 0;   // spacing for the low-HP heartbeat cue
let score = 0;
let best = 0;
try { best = Math.max(0, +(localStorage.getItem('gbs_best') || 0)) || 0; } catch { /* no storage */ }
const GOAL_SCORE = 1500;
let bossActive = false, won = false;
initVFX(scene);
initJuice();
initMinimap();
initBullets(scene);   // persistent pooled projectiles for gun dogs (survives scene swaps)

// sniff = sound + a little scent puff (ties the new VFX to the interaction)
function doSniff() {
    AudioSys.sniff();
    burst(player.group.position.clone().add(new THREE.Vector3(0, 0.35, 0)), 0xd9c7a0, 10, 2.2, 0.22);
}

// SNIFF also enters a house, but only when you're right at its door AND you press it (replaces the
// old auto-enter-on-touch, which fired accidentally). the door prompt shows only while nearDoor is set.
let nearDoor = null;
const doorPrompt = document.getElementById('door-prompt');
function onSniff() {
    if (!inApartment && nearDoor) { AudioSys.sniff(); loadApartment(); return; }
    doSniff();
}

// audio mute toggle (button + M key) and the low-HP red vignette
const btnMute = document.getElementById('btn-mute');
const lowHpVignette = document.getElementById('lowhp-vignette');
function updateMute() { if (btnMute) btnMute.textContent = AudioSys.muted ? '🔇' : '🔊'; }
function toggleMute() { AudioSys.toggleMute(); updateMute(); }
if (btnMute) btnMute.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });

// active-buff badges HUD
const buffsEl = document.getElementById('buffs');
function updateBuffs() {
    if (!buffsEl) return;
    let html = '';
    if (player.speedBuffT > 0) html += `<span class="buff buff-speed">⚡ ${Math.ceil(player.speedBuffT)}</span>`;
    if (player.shieldT > 0) html += `<span class="buff buff-shield">🛡 ${Math.ceil(player.shieldT)}</span>`;
    buffsEl.innerHTML = html;
}

// --- THREAT INDICATOR ARROWS: edge arrows pointing at nearby off-screen hostile dogs ---
const arrowLayer = document.getElementById('threat-arrows');
const arrowPool = [];
if (arrowLayer) for (let i = 0; i < 8; i++) {
    const a = document.createElement('div');
    a.className = 'threat-arrow'; a.textContent = '➤'; a.style.display = 'none';
    arrowLayer.appendChild(a); arrowPool.push(a);
}
const _proj = new THREE.Vector3();
function updateThreatArrows() {
    if (!arrowLayer) return;
    if (inApartment) { for (const a of arrowPool) a.style.display = 'none'; return; }
    const W = window.innerWidth, H = window.innerHeight, cx = W / 2, cy = H / 2;
    const threats = [];
    for (const e of entities) {
        if (!(e instanceof DogNPC) || e.dead || !e.isHostile) continue;
        const d = player.group.position.distanceTo(e.mesh.position);
        if (d < 55) threats.push({ e, d });
    }
    threats.sort((a, b) => a.d - b.d);
    let n = 0;
    for (const { e } of threats) {
        if (n >= arrowPool.length) break;
        _proj.copy(e.mesh.position); _proj.y += 1.5; _proj.project(camera);
        const behind = _proj.z > 1;
        let x = _proj.x, y = _proj.y;
        if (behind) { x = -x; y = -y; }
        if (!behind && Math.abs(_proj.x) <= 0.98 && Math.abs(_proj.y) <= 0.98) continue;  // on-screen -> visible already
        const mag = Math.max(Math.abs(x), Math.abs(y)) || 1;
        x = x / mag * 0.86; y = y / mag * 0.86;   // clamp onto the edge box
        const sx = (x * 0.5 + 0.5) * W, sy = (-y * 0.5 + 0.5) * H;
        const ang = Math.atan2(sy - cy, sx - cx);
        const a = arrowPool[n++];
        a.style.display = 'block';
        a.style.left = sx + 'px'; a.style.top = sy + 'px';
        a.style.transform = `translate(-50%, -50%) rotate(${ang}rad)`;
        a.style.color = e.isGun ? '#ffffff' : (e.isFly ? '#4a86e8' : '#ff3b30');
    }
    for (; n < arrowPool.length; n++) arrowPool[n].style.display = 'none';
}

// --- SCORE / GOAL / ALPHA BOSS ---
const scoreEl = document.getElementById('score-display');
function updateScore() { if (scoreEl) scoreEl.textContent = `Score ${score} · Best ${best}`; }
function addScore(n) {
    score += n;
    if (score > best) { best = score; try { localStorage.setItem('gbs_best', String(best)); } catch { /* */ } }
    updateScore();
}
function spawnBoss() {
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.group.rotation.y);
    const bp = player.group.position.clone().add(fwd.multiplyScalar(14));
    entities.push(new DogNPC(scene, bp.x, bp.z, { boss: true }));
    addTrauma(0.7);
    showToast('🐺 THE ALPHA HAS ARRIVED. Take it down to become TOP DOG!', 4200);
}
function win() {
    if (won) return;
    won = true;
    const ws = document.getElementById('win-screen');
    const st = document.getElementById('win-stats');
    if (st) st.textContent = `Final score ${score}  ·  Best ${best}`;
    if (ws) ws.style.display = 'flex';
    AudioSys.powerup();
}
document.getElementById('btn-again')?.addEventListener('click', () => location.reload());
{ const sb = document.getElementById('start-best'); if (sb) sb.textContent = best > 0 ? `🏆 Best score: ${best}` : ''; }

// nearest-beggable-human highlight: subtle gold emissive tell (§27 feedback)
let highlighted = null;
function setGlow(entity, on) {
    if (!entity) return;
    entity.mesh.traverse((o) => {
        if (o.material && o.material.emissive) o.material.emissive.setHex(on ? 0x3a2f0e : 0x000000);
    });
}

// single-timer toast lives in ./ui.js (shared with Player.js death notice)



// --- LOAD WORLD ---

let worldData = createWorld(scene);

let lastWorldPosition = null;



const player = new Player(scene);

player.group.position.set(0, 0.1, 5);



// --- SPAWN ENTITIES ---

let entities = [];

const treats = [];

// --- POWERUPS ---
const powerups = [];
const POWERUP_DEFS = {
    speed:  { color: 0x33ddff, label: '⚡ Speed boost!' },
    shield: { color: 0xffd23f, label: '🛡 Shield up!' },
    heal:   { color: 0x39d353, label: '❤ Healed!' },
};
function spawnPowerup(pos, type) {
    const def = POWERUP_DEFS[type];
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: def.color }));
    const haloMat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
    haloMat.userData.outlineParameters = { visible: false };
    const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), haloMat);
    g.add(halo, core);
    g.position.set(pos.x, 1.3, pos.z);
    g.userData = { type };
    scene.add(g);
    powerups.push(g);
}



function spawnEntities() {
    const d = getDifficulty();
    for (let i = 0; i < d.humanCount; i++) {
        entities.push(new Human(scene, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300));
    }
    for (let i = 0; i < d.dogCount; i++) {
        entities.push(new DogNPC(scene, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, { gun: i < d.gunDogCount }));
    }
    for (let i = 0; i < (d.flyDogCount || 0); i++) {
        entities.push(new DogNPC(scene, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, { fly: true }));
    }
}

const dogReady = preloadDog();   // spawn is deferred to the WAKE UP handler so difficulty is locked first



// --- INPUTS ---

const keys = { w:false, a:false, s:false, d:false, shift:false };

window.addEventListener('keydown', e => {

    if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;

    if(e.code === 'KeyF') onSniff();

    if(e.code === 'Space') { e.preventDefault(); player.jump(); }   // Space now jumps

    if(e.code === 'KeyE') interact();                               // beg/sniff moved to E

    if (e.key === 'm') toggleMute();

    if (e.key === 'p') {

        window.location.href = '/easter_egg.html';

    }

});

window.addEventListener('keyup', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });

// bite. real mouse clicks always bite (desktop unchanged, incl. touch+mouse laptops).
// touch/pen taps never bite via the canvas - on touch, bite is the on-screen BITE button only.
window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (e.target !== renderer.domElement) return;   // only the canvas bites; ignore HUD buttons
    attack();
});

// block iOS pinch-zoom (Safari ignores user-scalable=no; gesturestart is the real lever).
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

function onViewportResize() {
    // use visualViewport (reflects the real on-screen size on iOS as the URL bar
    // shows/hides); fall back to innerWidth/innerHeight -> identical numbers on desktop.
    const vv = window.visualViewport;
    const w = vv ? vv.width : window.innerWidth;
    const h = vv ? vv.height : window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

window.addEventListener('resize', onViewportResize);

if (window.visualViewport) window.visualViewport.addEventListener('resize', onViewportResize);

window.addEventListener('orientationchange', () => setTimeout(onViewportResize, 300));



// --- GAMEPLAY LOGIC ---

const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);   // horizontal distance so hills don't eat reach

function sniffProp(kind, prop) {
    doSniff();
    if (kind === 'hydrant') {
        if (!prop.sniffed) { prop.sniffed = true; player.grow(0.02); showToast('You marked your territory! +size', 2200); }
        else showToast('Sniff… another dog was here.', 1800);
    } else if (kind === 'tree') {
        showToast('Sniff sniff… smells like squirrels.', 1800);
    } else {
        showToast('Someone lives here. Smells like dinner.', 1800);
    }
}

function interact() {
    const p = player.group.position;
    let best = null, bestD = Infinity;
    for (const e of entities) {
        if (!(e instanceof Human)) continue;
        const d = distXZ(p, e.mesh.position);
        if (d < 6 * player.size && d < bestD) { bestD = d; best = { kind: 'human', ent: e }; }
    }
    for (const it of (worldData.interactables || [])) {
        const d = distXZ(p, it.position);
        if (d < it.radius + 3.5 * player.size && d < bestD) { bestD = d; best = { kind: it.type, prop: it }; }
    }
    if (!best) { AudioSys.whine(); showToast('Nothing to sniff here…', 1200); return; }
    if (best.kind !== 'human') return sniffProp(best.kind, best.prop);

    const closest = best.ent;
    const box = document.getElementById('dialogue-box');
    AudioSys.speak(closest.storyText, closest.voice, closest.pitch, closest.rate);
    if (player.tilt) { player.tilt.rotation.x = -0.5; setTimeout(() => { if (player.tilt) player.tilt.rotation.x = 0; }, 500); }  // beg tilt on the pivot (camera stays put)
    showToast(closest.introText, 3000);
    if (!closest.hasGivenTreat) {
        closest.hasGivenTreat = true;
        setTimeout(() => {
            const t = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: 0xFFD700 }));
            t.position.copy(closest.mesh.position).add(new THREE.Vector3(0, 2, 0));
            t.userData = { type: 'treat', value: 0.05 };
            scene.add(t);
            treats.push(t);
            if (box) box.innerText += "\n(They dropped a treat!)";
        }, 1000);
    }
}



function attack() {

    if (biteCd > 0) return;                       // on cooldown -> ignore the bite
    biteCd = BITE_COOLDOWN;
    touch.biteCooldown(BITE_COOLDOWN);            // start the radial timer on the mobile BITE button

    fovPunch = 5;                                 // quick FOV whip for bite snap

    player.group.position.add(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.group.rotation.y)); // lunge forward

    // jaw-clamp VFX: a toothy chomp snaps shut just ahead of the dog's snout on every bite
    {
        const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.group.rotation.y);
        const jp = player.group.position.clone().add(fwd.multiplyScalar(2.0 * player.size));
        jp.y += 1.6 * player.size;
        jawSnap(jp, 0.95 * player.size, player.group.rotation.y);
    }

    entities.forEach(e => {

        if(e instanceof DogNPC && !e.dead) {

            if(distXZ(player.group.position, e.mesh.position) < 4 * player.size) {

                const dmg = 15 * player.size;
                const dead = e.takeHit(dmg);

                AudioSys.bark();

                addTrauma(0.3);

                // floating damage number above the bitten dog
                const dmgPos = e.mesh.position.clone(); dmgPos.y += 2.6;
                popText(dmgPos, camera, String(Math.round(dmg)), player.size >= 2 ? 'crit' : 'dmg');

                if (dead) {
                    const pts = Math.round(12 + e.scaleVal * 18 + (e.isGun ? 30 : 0) + (e.isFly ? 24 : 0) + (e.isBoss ? 1000 : 0));
                    addScore(pts);
                    const scorePos = e.mesh.position.clone(); scorePos.y += 3.4;
                    popText(scorePos, camera, '+' + pts, 'score');
                    hitStop(e.isBoss ? 0.13 : 0.07);   // punchy freeze on a kill
                    if (e.isBoss) win();
                    addTrauma(0.45);
                    player.increaseSpeed(5);
                    showToast('u slimed a dog, +5 speed, +5 sprint', 3000);

                    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshBasicMaterial({color: 0x00ff00}));
                    orb.position.copy(e.mesh.position);
                    orb.position.y = 1;
                    orb.userData = { type: 'essence', value: e.scaleVal * 0.2 };
                    scene.add(orb);
                    treats.push(orb);
                    burst(orb.position.clone(), 0x9be7a0, 22, 8);

                    // ~35% chance to also drop a powerup
                    if (Math.random() < 0.35) {
                        const types = ['speed', 'shield', 'heal'];
                        spawnPowerup(e.mesh.position, types[Math.floor(Math.random() * types.length)]);
                    }
                }

            }

        }

    });

}



// free GPU resources (geometry / materials / textures) for everything under a node, then
// detach it. fixes the scene-swap leak that grew GPU memory on every house entry/exit and
// could crash the WebGL context on mobile Safari. the player.group is skipped so the dog
// model survives the swap.
function disposeScene(root) {
    for (let i = root.children.length - 1; i >= 0; i--) {
        const child = root.children[i];
        if (child === player.group) continue;
        if (child.userData && child.userData.persistent) continue;   // keep the pooled-bullet group across swaps
        child.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.isLight && obj.shadow && obj.shadow.map) obj.shadow.map.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
            for (const m of mats) {
                for (const key in m) {
                    const val = m[key];
                    if (val && val.isTexture && val !== TOON_RAMP && !DOG_TEXTURES.has(val)) val.dispose();  // keep shared toon ramp + dog proto textures
                }
                m.dispose();
            }
            if (obj.isInstancedMesh) obj.dispose();  // frees instanceMatrix/instanceColor GL buffers
        });
        root.remove(child);
    }
}

let inApartment = false;

function loadApartment() {

    if (inApartment) return;

    inApartment = true;



    lastWorldPosition = player.group.position.clone();



    // free the old scene's GPU resources (disposeScene keeps the player's model) + drop stale orbs

    disposeScene(scene);

    treats.length = 0;
    powerups.length = 0;
    highlighted = null;
    resetBullets();   // drop any in-flight shots so they don't cross the scene boundary

    nearDoor = null;
    if (doorPrompt) doorPrompt.style.display = 'none';   // hide the door prompt while indoors



    // Clear entities

    entities = [];



    // Create the apartment

    worldData = createApartment(scene);



    // Add player to the new scene

    scene.add(player.group);



    // Move player to apartment start

    player.group.position.set(0, 0.1, 25);

}



function loadWorld() {

    if (!inApartment) return;

    inApartment = false;



    // free the old scene's GPU resources (disposeScene keeps the player's model) + drop stale orbs

    disposeScene(scene);

    treats.length = 0;
    powerups.length = 0;
    highlighted = null;
    resetBullets();   // drop any in-flight shots so they don't cross the scene boundary



    // Create the world

    worldData = createWorld(scene);



    // Respawn entities

    spawnEntities();



    // Add player to the new scene

    scene.add(player.group);



    // Move player to last world position or default

    if (lastWorldPosition) {
        player.group.position.copy(lastWorldPosition);
        const offset = player.group.getWorldDirection(new THREE.Vector3());
        player.group.position.add(offset.multiplyScalar(5));
    } else {
        player.group.position.set(0, 0.1, 5);
    }

}



const touch = initTouchControls({
    keys,
    interact,
    attack,
    sniff: onSniff,
    jump: () => player.jump(),
});

// difficulty selector on the start screen
(() => {
    const btns = [...document.querySelectorAll('.diff-btn')];
    const paint = (k) => btns.forEach((b) => { const on = b.dataset.diff === k; b.classList.toggle('selected', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    paint(getDifficultyKey());
    btns.forEach((b) => b.addEventListener('click', () => { setDifficulty(b.dataset.diff); paint(b.dataset.diff); }));
})();

const btnStart = document.getElementById('btn-start');

if(btnStart) {

    btnStart.addEventListener('click', () => {

        document.getElementById('start-screen').style.display = 'none';

        player.dogName = 'Stray';

        score = 0; updateScore();

        dogReady.then(() => { spawnEntities(); graceTimer = 3; });   // grace starts once the pack has actually spawned (3s of passive dogs)

        if (getDifficultyKey() !== 'easy') showToast('The block is calm. That lasts about 3 seconds.', 2800);

        touch.show();   // shows only on touch devices; audio user-gesture already satisfied

        AudioSys.init();

        AudioSys.resume();

        animate();

    });

}



// --- MAIN LOOP ---

const clock = new THREE.Clock();

function animate() {

    requestAnimationFrame(animate);

    const realDt = Math.min(clock.getDelta(), 0.1);   // clamp: a startup/tab-stall spike must not teleport physics or burn the grace
    let dt = realDt;
    if (hitStopT > 0) { hitStopT -= realDt; dt = realDt * 0.06; }   // hit-stop: brief slow-mo on impactful hits

    elapsed += dt;

    updateVFX(dt);

    if (worldData.update) worldData.update(elapsed);

    // highlight the nearest beggable human (gold emissive tell)
    {
        let _nh = null, _nd = 6;
        for (const e of entities) { if (e instanceof Human) { const d = player.group.position.distanceTo(e.mesh.position); if (d < _nd) { _nd = d; _nh = e; } } }
        if (highlighted !== _nh) { setGlow(highlighted, false); setGlow(_nh, true); highlighted = _nh; }
    }



    touch.update();   // rewrite w/a/s/d from the joystick while it's held (no-op when idle)

    player.update(dt, keys, worldData.wallColliders);



    // Update Entities

    if (graceTimer > 0) graceTimer -= dt;
    const grace = graceTimer > 0;   // during grace, dogs don't aggro/charge/attack/fire
    if (biteCd > 0) biteCd -= dt;   // bite cooldown

    // low-HP warning: heartbeat cue + red vignette when under 25%
    const lowHp = !inApartment && player.hp / player.maxHp < 0.25;
    if (lowHp) {
        lowHpTimer -= dt;
        if (lowHpTimer <= 0) { AudioSys.heartbeat(); lowHpTimer = 0.9; }
    } else lowHpTimer = 0;
    if (lowHpVignette) lowHpVignette.classList.toggle('active', lowHp);

    entities.forEach(e => {

        if (e instanceof DogNPC) e.update(dt, player.group.position, player, grace);

        else e.update(dt);

    });

    // advance gun-dog projectiles + apply hits to the player
    updateBullets(dt, player.group, player);



    // Update Treats

    for(let i=treats.length-1; i>=0; i--) {

        const t = treats[i];

        t.position.y = Math.max(0.5, t.position.y - 5*dt); // Gravity

        t.rotation.y += dt;

        

        if(player.group.position.distanceTo(t.position) < 2 * player.size) {

            player.grow(t.userData.value);

            if (t.userData.type !== 'essence') addScore(8);   // treats add a little score (kills already scored)

            popText(t.position.clone().add(new THREE.Vector3(0, 1.4, 0)), camera, t.userData.type === 'essence' ? '+size' : '+8', t.userData.type === 'essence' ? 'heal' : 'score');

            burst(t.position.clone(), t.userData.type === 'essence' ? 0x39d353 : 0xffd23f, 16, 5.5);

            scene.remove(t);

            treats.splice(i, 1);

        }

    }



    // Powerups: bob + spin, pick up on contact
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        p.rotation.y += dt * 1.6;
        p.position.y = 1.3 + Math.sin(elapsed * 2.2 + i) * 0.22;
        if (player.group.position.distanceTo(p.position) < 2.4 * player.size) {
            player.applyPowerup(p.userData.type);
            burst(p.position.clone(), POWERUP_DEFS[p.userData.type].color, 20, 6.5);
            popText(p.position.clone().add(new THREE.Vector3(0, 0.6, 0)), camera, POWERUP_DEFS[p.userData.type].label, 'heal');
            showToast(POWERUP_DEFS[p.userData.type].label, 1500);
            scene.remove(p);
            p.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
            powerups.splice(i, 1);
        }
    }
    updateBuffs();
    updateThreatArrows();

    // radar minimap (outdoors only)
    const mm = document.getElementById('minimap');
    if (inApartment) { if (mm) mm.style.display = 'none'; }
    else { if (mm) mm.style.display = 'block'; updateMinimap(player, entities, worldData.interactables); }

    // goal: once you rack up enough score, the Alpha boss shows up. beat it to win.
    if (!bossActive && !won && !inApartment && score >= GOAL_SCORE) { bossActive = true; spawnBoss(); }



    // Collision Detection

    if (inApartment) {

        if (worldData.exitColliders) {

            const playerBox = new THREE.Box3().setFromObject(player.group);

            for (const entry of worldData.exitColliders) {

                if (playerBox.intersectsBox(entry)) {

                    loadWorld();

                    break;

                }

            }

        }

    } else {

        // no more auto-enter: find the nearest house door within reach and show the SNIFF-to-enter prompt.
        // actual entry happens in onSniff() when nearDoor is set.

        let door = null, dd = Infinity;

        for (const it of (worldData.interactables || [])) {

            if (it.type !== 'house') continue;

            const d = distXZ(player.group.position, it.position);

            if (d < it.radius + 2 && d < dd) { dd = d; door = it; }

        }

        nearDoor = door;

        if (doorPrompt) doorPrompt.style.display = door ? 'block' : 'none';

    }





    // Camera

    if (inApartment) {

        camera.position.set(player.group.position.x, player.group.position.y + 50, player.group.position.z);

        camera.lookAt(player.group.position);

        if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }   // reset any sprint FOV kick indoors

    } else {

        const offset = new THREE.Vector3(0, 6 * player.size, -10 * player.size).applyMatrix4(player.group.matrixWorld);

        // framerate-independent smoothing (was a fixed 0.1 lerp, which sped up at high FPS)

        camera.position.lerp(offset, 1 - Math.exp(-9 * dt));

        camera.lookAt(player.group.position.clone().add(new THREE.Vector3(0,2,0)));

        // subtle FOV kick while sprinting for a sense of speed, plus a transient bite whip

        const targetFov = (keys.shift ? 66 : 60) + fovPunch;

        fovPunch += (0 - fovPunch) * (1 - Math.exp(-11 * dt));   // ease the bite punch back to 0

        camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-6 * dt));

        camera.updateProjectionMatrix();

    }

    // trauma-based screen shake (squared falloff = punchy), applied after framing

    if (trauma > 0) {

        const s = trauma * trauma * 0.6;

        camera.position.x += (Math.random() - 0.5) * s;

        camera.position.y += (Math.random() - 0.5) * s;

        camera.position.z += (Math.random() - 0.5) * s;

        trauma = Math.max(0, trauma - dt * 1.8);

    }



    outline.render(scene, camera);

}




