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
            this.tilt.add(this.model);
        });

        this.scene.add(this.group);

        // inner pivot: bob/bank live here so they never leak into group.matrixWorld (camera stays stable)
        this.tilt = new THREE.Group();
        this.group.add(this.tilt);
        this.bobAmt = 0; this.bank = 0; this.groundY = 0;

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
        document.getElementById('level-display').innerText = `Lvl ${Math.floor(this.xp/100)+1} ${this.dogName || 'Beast'}`;
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
        const speed = keys.shift ? this.sprintSpeed : this.baseSpeed;

        // Rotation
        const turn = (keys.a ? 1 : 0) - (keys.d ? 1 : 0);
        this.group.rotation.y += turn * 3 * dt;

        // Movement with axis-separated wall-slide (retry X then Z when the combined step is
        // blocked, so the dog slides along walls instead of dead-stopping).
        if (keys.w || keys.s) {
            isMoving = true;
            const dir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y);
            if (keys.s) dir.negate();
            const step = dir.multiplyScalar(speed * dt);
            const tryAxis = (dx, dz) => {
                const np = this.group.position.clone(); np.x += dx; np.z += dz;
                const b = new THREE.Box3().setFromCenterAndSize(np, new THREE.Vector3(1, 2, 1));
                for (const w of wallColliders) if (b.intersectsBox(w)) return false;
                this.group.position.copy(np); return true;
            };
            if (!tryAxis(step.x, step.z)) { tryAxis(step.x, 0); tryAxis(0, step.z); }
        }

        // Smoothed terrain follow (damps the high-freq hill detail so the dog + camera don't jitter)
        const targetY = getTerrainHeightAt(this.group.position.x, this.group.position.z);
        this.groundY += (targetY - this.groundY) * (1 - Math.exp(-14 * dt));
        this.group.position.y = this.groundY;

        // gait + bank, eased, on the tilt pivot (never on group -> camera unaffected)
        this.bank += ((isMoving ? -turn * 0.28 : 0) - this.bank) * (1 - Math.exp(-8 * dt));
        this.bobAmt += ((isMoving ? 1 : 0) - this.bobAmt) * (1 - Math.exp(-10 * dt));
        if (isMoving) this.walkTimer += dt * (keys.shift ? 15 : 10);
        const gait = 0.5 - 0.5 * Math.cos(this.walkTimer);   // 0..1 bounce
        if (this.tilt) {
            // exaggerated stride: taller bob + a fore/aft rock + a waddle roll layered on the turn bank
            this.tilt.position.y = gait * 0.26 * this.size * this.bobAmt;
            this.tilt.rotation.x = Math.sin(this.walkTimer) * 0.14 * this.bobAmt;              // rock nose down on the push
            this.tilt.rotation.z = this.bank + Math.sin(this.walkTimer * 0.5) * 0.08 * this.bobAmt;  // waddle
        }
    }
}