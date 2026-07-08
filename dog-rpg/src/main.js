import * as THREE from 'three';
import { Player } from './entities/Player';
import { Human, DogNPC } from './entities/NPC';
import { createWorld } from './World';
import { AudioSys } from './Audio'; // Notice this is ./Audio, not ../Audio

import { createApartment } from './Apartment.js';

import { initTouchControls } from './TouchControls.js';

import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';

import { initVFX, updateVFX, burst } from './vfx.js';

import { showToast } from './ui.js';
import { TOON_RAMP } from './materials.js';



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
initVFX(scene);

// sniff = sound + a little scent puff (ties the new VFX to the interaction)
function doSniff() {
    AudioSys.sniff();
    burst(player.group.position.clone().add(new THREE.Vector3(0, 0.35, 0)), 0xd9c7a0, 10, 2.2, 0.22);
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

    for(let i=0; i<45; i++) {

        const human = new Human(scene, (Math.random()-0.5)*300, (Math.random()-0.5)*300);

        entities.push(human);

    }

    for(let i=0; i<30; i++) {

        const dog = new DogNPC(scene, (Math.random()-0.5)*300, (Math.random()-0.5)*300);

        entities.push(dog);

    }

}

spawnEntities();



// --- INPUTS ---

const keys = { w:false, a:false, s:false, d:false, shift:false };

window.addEventListener('keydown', e => {

    if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;

    if(e.code === 'KeyF') doSniff();

    if(e.code === 'Space') interact();

    if (e.key === 'p') {

        window.location.href = '/easter_egg.html';

    }

});

window.addEventListener('keyup', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });

// bite. real mouse clicks always bite (desktop unchanged, incl. touch+mouse laptops).
// touch/pen taps never bite via the canvas — on touch, bite is the on-screen BITE button only.
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

function interact() {

    let closest = null;

    let dist = 10;

    

    entities.forEach(e => {

        if(e instanceof Human) {

            const d = player.group.position.distanceTo(e.mesh.position);

            if(d < dist) { dist = d; closest = e; }

        }

    });



    const box = document.getElementById('dialogue-box');

    if(closest && dist < 6) {
        AudioSys.speak(closest.storyText, closest.voice, closest.pitch, closest.rate);

        player.group.rotation.x = -0.5; // Tilt up
        setTimeout(() => player.group.rotation.x = 0, 500);

        showToast(closest.introText, 3000);
        
        if(!closest.hasGivenTreat) {
            closest.hasGivenTreat = true;
            setTimeout(() => {
                const t = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({color: 0xFFD700}));
                t.position.copy(closest.mesh.position).add(new THREE.Vector3(0,2,0));
                t.userData = { type: 'treat', value: 0.05 };
                scene.add(t);
                treats.push(t);
                box.innerText += "\n(They dropped a treat!)";
            }, 1000);
        }
    } else {
        AudioSys.whine();
    }

}



function attack() {

    player.group.position.add(player.group.getWorldDirection(new THREE.Vector3()).multiplyScalar(1)); // Lunge

    

    entities.forEach(e => {

        if(e instanceof DogNPC && !e.dead) {

            if(player.group.position.distanceTo(e.mesh.position) < 4 * player.size) {

                const dead = e.takeHit(10 * player.size);

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
        child.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.isLight && obj.shadow && obj.shadow.map) obj.shadow.map.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
            for (const m of mats) {
                for (const key in m) {
                    const val = m[key];
                    if (val && val.isTexture && val !== TOON_RAMP) val.dispose();  // keep the shared toon ramp alive
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
    sniff: doSniff,
});

const btnStart = document.getElementById('btn-start');

if(btnStart) {

    btnStart.addEventListener('click', () => {

        document.getElementById('start-screen').style.display = 'none';

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

    const dt = clock.getDelta();

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

    entities.forEach(e => {

        if (e instanceof DogNPC) e.update(dt, player.group.position, player);

        else e.update(dt);

    });



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

        if (worldData.houseEntryColliders) {

            const playerBox = new THREE.Box3().setFromObject(player.group);

            for (const entry of worldData.houseEntryColliders) {

                if (playerBox.intersectsBox(entry)) {

                    loadApartment();

                    break;

                }

            }

        }

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




