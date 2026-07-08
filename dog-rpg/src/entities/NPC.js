import * as THREE from 'three';
import { AudioSys } from '../Audio'; // This ../ is correct here because we are deep in the entities folder

import { getTerrainHeightAt } from '../World.js';
import { toonify, pickClothing, pickPants, pickDogFur, PALETTE } from '../materials.js';
import { makeDogClone } from '../dogAsset.js';

export class Entity {
    constructor(scene, x, z) {
        this.scene = scene;
        this.mesh = new THREE.Group();
        this.mesh.position.set(x, 0, z);
        this.scene.add(this.mesh);
        this.dead = false;
    }
    update(dt) {}
}

const dialogueParts = {
    intro: ["Greetings.", "Oh a dog!", "Hey!", "Don't bite!", "Lost?", "Who's a good boy?"],
    story: ["I used to be a chef.", "My cat hates you.", "Late for yoga.", "Where are my keys?", "Aliens are real.", "Smell the rain."] //actual tts audio, replace with whatever u want
};

export class Human extends Entity {
    constructor(scene, x, z) {
        super(scene, x, z);
        
        const shirtColor = pickClothing();
        const pantColor = pickPants();

        const hairColor = [0x2b2118, 0x4a3527, 0x1a1a1a, 0x6b4a2f, 0x8a6a3a][Math.floor(Math.random() * 5)];
        const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor });
        const pantMat = new THREE.MeshStandardMaterial({ color: pantColor });
        const skinMat = new THREE.MeshStandardMaterial({ color: PALETTE.skin });
        const hairMat = new THREE.MeshStandardMaterial({ color: hairColor });
        const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
        const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };

        // torso + head
        this.mesh.add(
            box(0.78, 0.5, 0.46, pantMat, 0, 1.55, 0),     // pelvis
            box(0.86, 1.15, 0.5, shirtMat, 0, 2.45, 0),    // chest
            box(0.22, 0.2, 0.22, skinMat, 0, 3.15, 0),     // neck
            box(0.5, 0.56, 0.5, skinMat, 0, 3.5, 0),       // head
            box(0.56, 0.24, 0.56, hairMat, 0, 3.84, 0),    // hair
        );
        // limbs as joint-pivot groups: segment hangs below the pivot so rotation.x swings it
        const limb = (px, py, w, h, d, mat, footMat) => {
            const g = new THREE.Group();
            g.position.set(px, py, 0);
            g.add(box(w, h, d, mat, 0, -h / 2, 0));
            if (footMat) g.add(box(w + 0.04, 0.2, d + 0.24, footMat, 0, -h + 0.05, 0.1));
            this.mesh.add(g);
            return g;
        };
        this.armL = limb(0.56, 2.95, 0.22, 1.0, 0.28, shirtMat);
        this.armR = limb(-0.56, 2.95, 0.22, 1.0, 0.28, shirtMat);
        this.legL = limb(0.2, 1.5, 0.3, 1.3, 0.32, pantMat, shoeMat);
        this.legR = limb(-0.2, 1.5, 0.3, 1.3, 0.32, pantMat, shoeMat);

        toonify(this.mesh);
        
        this.target = new THREE.Vector3(x,0,z);
        this.timer = 0;
        this.state = 'IDLE';
        this.hasGivenTreat = false;
        this.bobPhase = Math.random() * 6;
        
        this.introText = dialogueParts.intro[Math.floor(Math.random()*dialogueParts.intro.length)];
        this.storyText = dialogueParts.story[Math.floor(Math.random()*dialogueParts.story.length)];
        
        if (AudioSys.voices.length > 0) {
            this.voice = AudioSys.voices[Math.floor(Math.random() * AudioSys.voices.length)];
        }
        this.pitch = 0.8 + Math.random() * 0.4;
        this.rate = 0.8 + Math.random() * 0.4;
    }

    update(dt) {
        if(this.state === 'IDLE') {
            this.timer += dt;
            if(this.timer > 3) {
                this.state = 'WALKING';
                this.target.set((Math.random()-0.5)*300, 0, (Math.random()-0.5)*300);
                this.timer = 0;
            }
        } else if (this.state === 'WALKING') {
            const dir = new THREE.Vector3().subVectors(this.target, this.mesh.position);
            if(dir.length() < 1) {
                this.state = 'IDLE';
            } else {
                dir.normalize();
                this.mesh.lookAt(this.target.x, this.mesh.position.y, this.target.z);   // yaw only — y=0 tilted people on hills
                this.mesh.position.add(dir.multiplyScalar(3 * dt));
            }
        }
        this.mesh.position.y = getTerrainHeightAt(this.mesh.position.x, this.mesh.position.z);

        // limb-swing walk cycle (arms/legs swing opposite) + gentle bob; ease to rest when idle
        if (this.state === 'WALKING') {
            this.bobPhase += dt * 9;
            const sw = Math.sin(this.bobPhase * 0.7) * 0.7;
            this.armL.rotation.x = sw; this.armR.rotation.x = -sw;
            this.legL.rotation.x = -sw; this.legR.rotation.x = sw;
            this.mesh.position.y += Math.abs(Math.sin(this.bobPhase)) * 0.06;
        } else {
            this.armL.rotation.x *= 0.85; this.armR.rotation.x *= 0.85;
            this.legL.rotation.x *= 0.85; this.legR.rotation.x *= 0.85;
        }
    }
}

export class DogNPC extends Entity {
    constructor(scene, x, z) {
        super(scene, x, z);
        
        const color = pickDogFur();
        const scale = 0.8 + Math.random() * 0.7;
        
        const clone = makeDogClone(color);
        if (clone) {
            clone.scale.setScalar(0.02);
            clone.rotation.x = -Math.PI / 2;   // stand upright, exactly like the player dog
            clone.position.y = 0.1;
            const wrap = new THREE.Group();    // spin the wrapper (clean vertical) for facing — avoids the Euler upside-down flip
            wrap.rotation.y = Math.PI;
            wrap.add(clone);
            this.mesh.add(wrap);
            this.mesh.scale.setScalar(scale);
        } else {
            // fallback box dog if the GLB didn't load
            const mat = new THREE.MeshStandardMaterial({color: color});
            const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2), mat);
            body.position.y = 1; body.castShadow=true;
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat);
            head.position.set(0, 1.8, 1.2); head.castShadow=true;
            this.mesh.add(body, head);
            this.mesh.scale.setScalar(scale);
            toonify(this.mesh);
        }
        
        this.scaleVal = scale;
        this.hp = 30 * scale;
        this.damage = 5 * scale;
        this.state = 'WANDER';
        this.target = new THREE.Vector3(x,0,z);
        this.isHostile = false;
        this.attackTimer = 0;
        this.bobPhase = Math.random() * 6;
    }

    update(dt, playerPos, playerClass) {
        if(this.dead) return;
        
        const distToPlayer = this.mesh.position.distanceTo(playerPos);

        if(this.isHostile) {
            if(distToPlayer > 2 && distToPlayer < 30) {
                const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position).normalize();
                this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z);   // yaw only — y=0 pitched the dog nose-down into hills
                this.mesh.position.add(dir.multiplyScalar(6 * dt));
            } else if (distToPlayer <= 2) {
                this.attackTimer += dt;
                if(this.attackTimer > 1.0) {
                    playerClass.takeDamage(this.damage);
                    AudioSys.hit(); 
                    this.mesh.position.add(this.mesh.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.5)); // Lunge
                    this.attackTimer = 0;
                }
            } else {
                this.isHostile = false; 
            }
        } else {
            if(this.state === 'WANDER') {
                const dir = new THREE.Vector3().subVectors(this.target, this.mesh.position);
                if(dir.length() < 1) {
                    this.target.set((Math.random()-0.5)*300, 0, (Math.random()-0.5)*300);
                    this.mesh.lookAt(this.target.x, this.mesh.position.y, this.target.z);   // yaw only — y=0 pitched the dog into the terrain
                } else {
                    dir.normalize();
                    this.mesh.position.add(dir.multiplyScalar(4 * dt));
                }
            }
        }
        this.mesh.position.y = getTerrainHeightAt(this.mesh.position.x, this.mesh.position.z);

        // bob while active (chasing or wandering)
        if (!this.dead && (this.isHostile || this.state === 'WANDER')) {
            this.bobPhase += dt * 11;
            this.mesh.position.y += Math.abs(Math.sin(this.bobPhase)) * 0.1 * this.scaleVal;
        }
    }

    takeHit(dmg) {
        this.hp -= dmg;
        this.isHostile = true;
        this.mesh.position.add(this.mesh.getWorldDirection(new THREE.Vector3()).multiplyScalar(-2)); // Recoil
        if(this.hp <= 0) {
            this.dead = true;
            this.scene.remove(this.mesh);
            return true; // Dropped Essence
        }
        return false;
    }
}