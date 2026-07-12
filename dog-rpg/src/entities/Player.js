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
        this.bobAmt = 0; this.bank = 0;
        this.vy = 0; this.grounded = true;   // jump physics (flat ground)
        this.squashT = 999; this.squashAmt = 0;   // squash-and-stretch impulse (damped spring on the tilt pivot)

        // Stats
        this.hp = 100;
        this.maxHp = 100;
        this.size = 1.0;
        this.xp = 0;
        this.stamina = 100;
        this.baseSpeed = 15;
        this.sprintSpeed = 30;
        this.speedBuffT = 0;   // powerup timers
        this.shieldT = 0;

        // Animation Vars
        this.walkTimer = 0;
    }

    increaseSpeed(amount) {
        this.baseSpeed += amount;
        this.sprintSpeed += amount;
    }

    // apply a picked-up powerup: speed boost / temp shield / heal
    applyPowerup(type) {
        if (type === 'speed') this.speedBuffT = 8;
        else if (type === 'shield') this.shieldT = 6;
        else if (type === 'heal') {
            this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.6);
            document.getElementById('hp-bar').style.width = (this.hp / this.maxHp * 100) + '%';
        }
        AudioSys.powerup();
    }

    // normal-physics jump (only off the ground); gravity in update() brings it back down
    jump() {
        if (this.grounded) {
            this.vy = 14; this.grounded = false;
            this.squashT = 0; this.squashAmt = -0.16;   // stretch tall on launch
            AudioSys.jumpSfx();
        }
    }

    grow(amount) {
        this.size += amount;
        this.maxHp += 15;
        // partial heal on grow (was a full reset, which made every kill trivialize combat).
        // a kill/treat now tops you up ~45% so hard stays tense but rewards aggression.
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.45);
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
        if (this.shieldT > 0) { AudioSys.hit(); return; }   // shielded: absorb, no damage
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
        if (this.speedBuffT > 0) this.speedBuffT -= dt;
        if (this.shieldT > 0) this.shieldT -= dt;
        let isMoving = false;
        const speed = (keys.shift ? this.sprintSpeed : this.baseSpeed) * (this.speedBuffT > 0 ? 1.7 : 1);

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
            // unstick: if we're already wedged inside a collider (shoved there by a hit/recoil/spawn),
            // move freely so the dog can walk back out instead of being permanently frozen.
            const curBox = new THREE.Box3().setFromCenterAndSize(this.group.position, new THREE.Vector3(1, 2, 1));
            let stuck = false;
            for (const w of wallColliders) if (curBox.intersectsBox(w)) { stuck = true; break; }
            const tryAxis = (dx, dz) => {
                const np = this.group.position.clone(); np.x += dx; np.z += dz;
                if (!stuck) {
                    const b = new THREE.Box3().setFromCenterAndSize(np, new THREE.Vector3(1, 2, 1));
                    for (const w of wallColliders) if (b.intersectsBox(w)) return false;
                }
                this.group.position.copy(np); return true;
            };
            if (!tryAxis(step.x, step.z)) { tryAxis(step.x, 0); tryAxis(0, step.z); }
        }

        // vertical physics: flat fixed ground + jump arc (gravity pulls back to ground level)
        const groundLevel = getTerrainHeightAt(this.group.position.x, this.group.position.z);
        this.vy -= 34 * dt;                                   // gravity
        let ny = this.group.position.y + this.vy * dt;
        const wasAir = !this.grounded;
        if (ny <= groundLevel) {
            const impact = this.vy;                           // negative falling velocity at touchdown
            ny = groundLevel; this.vy = 0;
            if (wasAir && impact < -5) {                      // squash on landing, scaled by impact speed
                this.squashT = 0; this.squashAmt = Math.min(0.42, -impact * 0.02);
                AudioSys.landSfx(Math.min(0.18, -impact * 0.008));
            }
            this.grounded = true;
        } else { this.grounded = false; }
        this.group.position.y = ny;

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

            // squash-and-stretch: a damped oscillation off the jump/land impulse (settles to 1)
            this.squashT += dt;
            const s = this.squashT < 0.6 ? this.squashAmt * Math.cos(this.squashT * 26) * Math.exp(-this.squashT * 7) : 0;
            this.tilt.scale.set(1 + s * 0.5, 1 - s, 1 + s * 0.5);
        }
    }
}