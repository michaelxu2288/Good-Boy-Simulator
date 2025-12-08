import * as THREE from 'three';
import { Player } from './entities/Player';
import { Human, DogNPC } from './entities/NPC';
import { createWorld } from './World';
import { AudioSys } from './Audio'; // Notice this is ./Audio, not ../Audio

// --- SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 20, 90);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
document.body.appendChild(renderer.domElement);

// --- LOAD WORLD ---
const worldData = createWorld(scene);
const player = new Player(scene);

// --- SPAWN ENTITIES ---
const entities = [];
const treats = [];

for(let i=0; i<15; i++) {
    entities.push(new Human(scene, (Math.random()-0.5)*300, (Math.random()-0.5)*300));
}
for(let i=0; i<10; i++) {
    entities.push(new DogNPC(scene, (Math.random()-0.5)*300, (Math.random()-0.5)*300));
}

// --- INPUTS ---
const keys = { w:false, a:false, s:false, d:false, shift:false };
window.addEventListener('keydown', e => {
    if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
    if(e.code === 'KeyF') AudioSys.sniff();
    if(e.code === 'Space') interact();
});
window.addEventListener('keyup', e => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousedown', () => attack());
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

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
        AudioSys.bark(1.2); 
        player.group.rotation.x = -0.5; // Tilt up
        setTimeout(() => player.group.rotation.x = 0, 500);

        box.style.display = 'block';
        box.innerText = `${closest.dialogue}`;
        
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
        setTimeout(() => box.style.display = 'none', 3000);
    } else {
        AudioSys.bark(1.0);
    }
}

function attack() {
    player.group.position.add(player.group.getWorldDirection(new THREE.Vector3()).multiplyScalar(1)); // Lunge
    AudioSys.bark(0.8);
    
    entities.forEach(e => {
        if(e instanceof DogNPC && !e.dead) {
            if(player.group.position.distanceTo(e.mesh.position) < 4 * player.size) {
                const dead = e.takeHit(10 * player.size);
                AudioSys.hit();
                if (dead) {
                    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshBasicMaterial({color: 0x00ff00}));
                    orb.position.copy(e.mesh.position);
                    orb.position.y = 1;
                    orb.userData = { type: 'essence', value: e.scaleVal * 0.2 };
                    scene.add(orb);
                    treats.push(orb);
                }
            }
        }
    });
}

const btnStart = document.getElementById('btn-start');
if(btnStart) {
    btnStart.addEventListener('click', () => {
        document.getElementById('start-screen').style.display = 'none';
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
            scene.remove(t);
            treats.splice(i, 1);
        }
    }

    // Camera
    const offset = new THREE.Vector3(0, 6 * player.size, -10 * player.size).applyMatrix4(player.group.matrixWorld);
    camera.position.lerp(offset, 0.1);
    camera.lookAt(player.group.position.clone().add(new THREE.Vector3(0,2,0)));

    renderer.render(scene, camera);
}