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
let elapsed = 0;
let graceTimer = 0;   // startup grace: dogs stay passive for a few seconds so you don't die on spawn
const BITE_COOLDOWN = 1.0;   // seconds between bites (shown as a radial timer on the mobile BITE button)
let biteCd = 0;
initVFX(scene);
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

    if (e.key === 'p') {

        window.location.href = '/easter_egg.html';

    }

});

window.addEventListener('keyup', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });

// bite. real mouse clicks always bite (desktop unchanged, incl. touch+mouse laptops).
// touch/pen taps never bite via the canvas - on touch, bite is the on-screen BITE button only.
window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (e.target && e.target.closest && e.target.closest('#touch-controls')) return;
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

                const dead = e.takeHit(15 * player.size);

                AudioSys.bark();

                addTrauma(0.3);

                if (dead) {
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

    const dt = Math.min(clock.getDelta(), 0.1);   // clamp: a startup/tab-stall spike must not teleport physics or burn the grace

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

            burst(t.position.clone(), t.userData.type === 'essence' ? 0x39d353 : 0xffd23f, 16, 5.5);

            scene.remove(t);

            treats.splice(i, 1);

        }

    }



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

        // subtle FOV kick while sprinting for a sense of speed

        const targetFov = keys.shift ? 66 : 60;

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




