import * as THREE from 'three';
import { Player } from './entities/Player';
import { Human, DogNPC } from './entities/NPC';
import { createWorld } from './World';
import { AudioSys } from './Audio'; // Notice this is ./Audio, not ../Audio

import { createApartment } from './Apartment.js';



// --- SETUP ---

const scene = new THREE.Scene();



const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({antialias: true});

renderer.setSize(window.innerWidth, window.innerHeight);

renderer.shadowMap.enabled = true;

renderer.shadowMap.type = THREE.PCFSoftShadowMap; 

renderer.outputColorSpace = THREE.SRGBColorSpace;

renderer.toneMapping = THREE.ACESFilmicToneMapping;

renderer.toneMappingExposure = 0.5;

document.body.appendChild(renderer.domElement);



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

    if(e.code === 'KeyF') AudioSys.sniff();

    if(e.code === 'Space') interact();

    if (e.key === 'p') {

        window.location.href = '/easter_egg.html';

    }

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
        AudioSys.speak(closest.storyText, closest.voice, closest.pitch, closest.rate);

        player.group.rotation.x = -0.5; // Tilt up
        setTimeout(() => player.group.rotation.x = 0, 500);

        box.style.display = 'block';
        box.innerText = closest.introText;
        
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

                if (dead) {
                    player.increaseSpeed(5);
                    const box = document.getElementById('dialogue-box');
                    box.style.display = 'block';
                    box.innerText = 'u slimed a dog, +5 speed, +5 sprint';
                    setTimeout(() => box.style.display = 'none', 3000);

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



let inApartment = false;

function loadApartment() {

    if (inApartment) return;

    inApartment = true;



    lastWorldPosition = player.group.position.clone();



    // Clear the scene

    while(scene.children.length > 0){ 

        scene.remove(scene.children[0]); 

    }



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



    // Clear the scene

    while(scene.children.length > 0){ 

        scene.remove(scene.children[0]); 

    }



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

    } else {

        const offset = new THREE.Vector3(0, 6 * player.size, -10 * player.size).applyMatrix4(player.group.matrixWorld);

        camera.position.lerp(offset, 0.1);

        camera.lookAt(player.group.position.clone().add(new THREE.Vector3(0,2,0)));

    }



    renderer.render(scene, camera);

}




