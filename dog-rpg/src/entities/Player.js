import * as THREE from 'three';
import { AudioSys } from '../Audio';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { getTerrainHeightAt } from '../World.js';
import { toonify } from '../materials.js';
import { showToast } from '../ui.js';

export class Player {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.model = null;

        const loader = new GLTFLoader();
        loader.load('/assets/3d_dog_cute.glb', (gltf) => {
            this.model = gltf.scene;
            this.model.scale.set(0.02, 0.02, 0.02); // Make it smaller
            this.model.rotation.x = -Math.PI / 2; // Rotate 90 degrees forward
            this.model.position.y = 0.1; // Adjust position to sit on the ground
            this.model.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            toonify(this.model);   // cel-shade the dog to match the world
            this.group.add(this.model);
        });

        this.scene.add(this.group);

        // Stats
        this.hp = 100;
        this.maxHp = 100;
        this.size = 1.0;
        this.xp = 0;
        this.stamina = 100;
        this.baseSpeed = 15;
        this.sprintSpeed = 30;
        
        // Animation Vars
        this.walkTimer = 0;
    }

    increaseSpeed(amount) {
        this.baseSpeed += amount;
        this.sprintSpeed += amount;
    }

    grow(amount) {
        this.size += amount;
        this.maxHp += 20;
        this.hp = this.maxHp;
        this.xp += amount * 100;
        
        if (this.model) {
            this.model.scale.setScalar(0.02 * this.size);
        }
        
        // xp bar shows progress within the current level (100 xp/level), matching the
        // level counter below (was /1000, so the bar desynced from levels).
        document.getElementById('xp-bar').style.width = (this.xp % 100) + '%';
        document.getElementById('level-display').innerText = `Lvl ${Math.floor(this.xp/100)+1} Beast`;
        AudioSys.powerup();
    }

    takeDamage(amt) {
        this.hp -= amt;
        AudioSys.hit();
        if(this.hp <= 0) {
            this.hp = 0;
            this.group.position.set(0,0,0);
            this.hp = this.maxHp;
            // non-blocking notice via the shared single-timer toast.
            showToast('You were knocked out! Waking up at home...', 2500);
        }
        document.getElementById('hp-bar').style.width = (this.hp / this.maxHp * 100) + '%';
    }

    update(dt, keys, wallColliders) {
        let isMoving = false;
        let speed = keys.shift ? this.sprintSpeed : this.baseSpeed;
        
        // Rotation
        const rotSpeed = 3;
        if(keys.a) this.group.rotation.y += rotSpeed * dt;
        if(keys.d) this.group.rotation.y -= rotSpeed * dt;
        
        // Movement
        if(keys.w || keys.s) {
            isMoving = true;
            const dir = new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0), this.group.rotation.y);
            if(keys.s) dir.negate();
            
            const nextPos = this.group.position.clone().add(dir.multiplyScalar(speed * dt));
            
            // Collision Check
            let collide = false;
            const pBox = new THREE.Box3().setFromCenterAndSize(nextPos, new THREE.Vector3(1,2,1));
            for(let w of wallColliders) {
                if(pBox.intersectsBox(w)) { collide = true; break; }
            }
            
            if(!collide) {
                this.group.position.copy(nextPos);
            }
        }

        // Terrain Following
        this.group.position.y = getTerrainHeightAt(this.group.position.x, this.group.position.z);

        // procedural bounce so the (un-rigged) dog looks alive while moving — advances a
        // gait timer and hops the model on |sin|. faster + higher while sprinting.
        if (this.model) {
            if (isMoving) this.walkTimer += dt * (keys.shift ? 16 : 11);
            const bob = isMoving ? Math.abs(Math.sin(this.walkTimer)) * 0.22 * this.size : 0;
            this.model.position.y = 0.1 + bob;
        }
    }
}