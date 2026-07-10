import * as THREE from 'three';
import { AudioSys } from '../Audio'; // This ../ is correct here because we are deep in the entities folder

import { getTerrainHeightAt } from '../World.js';
import { toonify, noOutline, pickClothing, pickPants, pickDogFur, PALETTE } from '../materials.js';
import { makeDogClone } from '../dogAsset.js';
import { getDifficulty } from '../difficulty.js';
import { fireBullet } from '../Bullets.js';
import { muzzleFlash } from '../vfx.js';

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

const _dummy = new THREE.Object3D();
const _v = new THREE.Vector3();
const _mw = new THREE.Vector3();    // gun-dog: muzzle world position
const _aim = new THREE.Vector3();   // gun-dog: aim direction
// ease heading toward a target using the SAME lookAt convention (yaw-only), slerped so
// turns are smooth instead of an instant snap.
function faceSmooth(mesh, tx, tz, rate, dt) {
    _dummy.position.copy(mesh.position);
    _dummy.lookAt(tx, mesh.position.y, tz);
    mesh.quaternion.slerp(_dummy.quaternion, Math.min(1, rate * dt));
}
// pick a gentle nearby wander target that stays inside the world (was rand*300 -> NPCs
// marched in straight lines up the far edge hills).
function pickWander(out, pos) {
    const a = Math.random() * Math.PI * 2, dist = 10 + Math.random() * 40;
    let x = pos.x + Math.sin(a) * dist, z = pos.z + Math.cos(a) * dist;
    const r = Math.hypot(x, z); if (r > 170) { x *= 170 / r; z *= 170 / r; }
    out.set(x, 0, z);
}

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
                pickWander(this.target, this.mesh.position);
                this.timer = 0;
            }
        } else if (this.state === 'WALKING') {
            const dir = new THREE.Vector3().subVectors(this.target, this.mesh.position);
            if(dir.length() < 1) {
                this.state = 'IDLE';
            } else {
                dir.normalize();
                faceSmooth(this.mesh, this.target.x, this.target.z, 6, dt);   // smooth yaw (was an instant lookAt snap)
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
    constructor(scene, x, z, opts = {}) {
        super(scene, x, z);

        const diff = getDifficulty();
        this.diff = diff;
        this.isGun = !!opts.gun;
        this.isFly = !!opts.fly;
        this.isBoss = !!opts.boss;
        const color = opts.boss ? 0x2a0a0a : (opts.gun ? 0xf2f2ee : (opts.fly ? 0x3a6fd6 : pickDogFur()));   // boss dark, gun white, fly blue
        const scale = opts.boss ? 5.0 : Math.min(2.6, (0.8 + Math.random() * 0.7) * (1 + diff.scaleBonus));

        const clone = makeDogClone(color);
        if (clone) {
            clone.scale.setScalar(0.02);
            clone.rotation.x = -Math.PI / 2;   // stand upright, exactly like the player dog
            clone.position.y = 0.1;
            const wrap = new THREE.Group();
            wrap.add(clone);
            this.mesh.add(wrap);
            this.mesh.scale.setScalar(scale);
            this._wrap = wrap;
            this._furColor = color;
            // gun/fly/boss dogs: strip the brown labrador texture so the solid body color shows
            if (this.isGun || this.isFly || this.isBoss) clone.traverse((o) => {
                if (o.isMesh && o.material) { o.material.map = null; o.material.color.setHex(color); o.material.needsUpdate = true; }
            });
            this._eyes = this._buildEvilEyes(wrap);   // hidden until provoked
            if (this.isGun) this._buildGun(wrap);      // white gun dogs carry a detailed rifle
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
        this.targetScale = scale;
        this.hp = 30 * scale * diff.hpMul;
        this.damage = 5 * scale * diff.damageMul;
        this.state = 'WANDER';
        this.target = new THREE.Vector3(x,0,z);
        this.isHostile = false;
        this.attackTimer = 0;
        this.fireTimer = Math.random() * (diff.fireInterval || 1);   // desync gun volleys
        this.bobPhase = Math.random() * 6;
        if (this.isFly) {   // flying blue dog: hovers high, spins + flaps when idle, dives to attack
            this.hoverY = 15 + Math.random() * 8;   // way up in the sky
            this._flyY = this.hoverY;
            this.mesh.position.y = this.hoverY;
            this.spinPhase = Math.random() * Math.PI * 2;
            this._wingPhase = Math.random() * Math.PI * 2;
            if (this._wrap) this._buildWings(this._wrap);
        }
        if (this.isBoss) {   // the Alpha: huge, tanky, always hostile, capped damage so it's a fight not a one-shot
            this.hp = 500;
            this.damage = 22;
            this.isHostile = true;
            this.setEvil(true);
        }
        if (clone && diff.evilOnSpawn) this.setEvil(true);   // hard: born evil
    }

    // white flapping wings for the fly dog: a flat feathered silhouette on each shoulder, on a
    // pivot so rotation.z beats it up/down. built on the wrap so it scales with the dog.
    _buildWings(wrap) {
        // unlit white so the wings always read WHITE regardless of angle/lighting (the ink
        // outline still gives them cel edges). angled MeshStandard wings went dark green from
        // the ground-bounce light.
        const wingMat = new THREE.MeshBasicMaterial({ color: 0xf6f7ff, side: THREE.DoubleSide });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
            0, 0, 0.35,  1.6, 0, 0.55,  1.7, 0, -0.35,
            0, 0, 0.35,  1.7, 0, -0.35, 0, 0, -0.45,
            1.6, 0, 0.55, 2.5, 0, 0.15, 1.7, 0, -0.35,
        ]), 3));
        geo.computeVertexNormals();
        const rWing = new THREE.Mesh(geo, wingMat); rWing.castShadow = true;
        const lWing = new THREE.Mesh(geo, wingMat); lWing.castShadow = true; lWing.scale.x = -1;   // mirror
        const rPivot = new THREE.Group(); rPivot.position.set(0.26, 1.75, 0.05); rPivot.add(rWing);
        const lPivot = new THREE.Group(); lPivot.position.set(-0.26, 1.75, 0.05); lPivot.add(lWing);
        wrap.add(rPivot, lPivot);
        this._wingR = rPivot; this._wingL = lPivot;
    }

    // detailed cel-friendly rifle built from primitives, mounted on the dog's shoulder pointing
    // forward (+z = nose direction). kept as MeshStandard so the ink outline gives it crisp edges.
    _buildGun(wrap) {
        const gun = new THREE.Group();
        const metal = new THREE.MeshStandardMaterial({ color: 0x3b4147, metalness: 0.85, roughness: 0.32 });
        const black = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.5, roughness: 0.5 });
        const tan   = new THREE.MeshStandardMaterial({ color: 0xb59a5f, metalness: 0.2, roughness: 0.7 });
        const box = (w, h, d, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; return m; };
        const cyl = (r, h, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; return m; };
        gun.add(
            box(0.20, 0.24, 0.95, metal, 0, 0, 0.05),          // receiver body
            box(0.16, 0.16, 0.55, black, 0, -0.01, 0.55),      // handguard
            cyl(0.05, 0.72, metal, 0, 0.02, 0.9),              // barrel
            cyl(0.085, 0.16, black, 0, 0.02, 1.28),            // muzzle brake
            box(0.12, 0.44, 0.22, black, 0, -0.30, 0.12, 0.20),// curved magazine (angled)
            box(0.15, 0.22, 0.5, tan, 0, -0.02, -0.42),        // stock
            box(0.11, 0.30, 0.15, black, 0, -0.22, -0.06, -0.28), // pistol grip
            box(0.07, 0.10, 0.36, black, 0, 0.18, 0.16),       // top rail
            box(0.05, 0.15, 0.06, black, 0, 0.29, 0.02),       // rear sight
            box(0.05, 0.12, 0.05, black, 0, 0.27, 0.62),       // front sight post
        );
        // muzzle marker (bullet spawn) at the tip of the brake
        const muzzle = new THREE.Object3D();
        muzzle.position.set(0, 0.02, 1.4);
        gun.add(muzzle);
        this._muzzle = muzzle;
        // mount on the right shoulder, pushed clear of the body, cocked forward like it's slung and aimed
        gun.position.set(0.62, 1.72, 0.35);
        gun.rotation.z = -0.08;
        gun.scale.setScalar(1.15);
        wrap.add(gun);
        this._gun = gun;
    }

    _buildEvilEyes(wrap) {
        // fixed dog-local coords (the clone is ~1-2u tall after its 0.02 scale; head is front-top, +Z).
        // wrap is scaled by this.mesh.scale, so the eyes scale with the dog automatically.
        const coreMat = noOutline(new THREE.MeshBasicMaterial({ color: 0xff2200, depthTest: false }));
        const haloMat = noOutline(new THREE.MeshBasicMaterial({ color: 0xff3010, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
        const coreGeo = new THREE.SphereGeometry(0.06, 8, 6);
        const haloGeo = new THREE.SphereGeometry(0.12, 8, 6);
        const eyes = new THREE.Group();
        eyes.renderOrder = 4;   // glow over the head geometry so the evil eyes always read
        for (const sx of [-1, 1]) {
            const eye = new THREE.Group();
            eye.position.set(sx * 0.16, 2.4, 1.15);   // sits on the model's eye sockets (verified via screenshot)
            const core = new THREE.Mesh(coreGeo, coreMat); core.frustumCulled = false; core.renderOrder = 5;
            const halo = new THREE.Mesh(haloGeo, haloMat); halo.frustumCulled = false; halo.renderOrder = 4;
            eye.add(halo, core);
            eyes.add(eye);
        }
        eyes.visible = false;
        wrap.add(eyes);
        return eyes;
    }

    setEvil(on) {
        if (this._isEvil === on) return;
        this._isEvil = on;
        if (this._eyes) this._eyes.visible = on;
        // gun/fly dogs stay their solid body color when evil (white / blue); regular dogs darken to a bloody brown.
        if (!this.isGun && !this.isFly && this._wrap && this._wrap.children[0]) this._wrap.children[0].traverse((o) => {
            if (!o.isMesh || !o.material || !o.material.color) return;
            if (on) {
                o.material.color.set(this._furColor).lerp(new THREE.Color(0x3a0e0a), 0.5);
                if (o.material.emissive) o.material.emissive.setHex(0x330000);
            } else {
                o.material.color.setHex(this._furColor);
                if (o.material.emissive) o.material.emissive.setHex(0x000000);
            }
        });
        if (on) this.targetScale = this.scaleVal * 1.12;
    }

    update(dt, playerPos, playerClass, grace = false) {
        if(this.dead) return;
        const d = this.diff;
        if (this.isFly) { this._updateFly(dt, playerPos, playerClass, grace, d); return; }
        const distToPlayer = this.mesh.position.distanceTo(playerPos);

        // startup grace: dogs mill about but won't aggro/charge/attack/fire yet
        if (grace) this.isHostile = false;

        // gun dogs spot you from their full firing range; melee dogs only within aggroRange.
        const sightRange = this.isGun ? Math.max(d.aggroRange, d.fireRange) : d.aggroRange;
        // charge-on-sight aggro (medium/hard). easy: aggroRange 0 & no gun dogs -> never fires.
        if (!grace && d.chargeOnSight && !this.isHostile && distToPlayer < sightRange) this.isHostile = true;

        if (this.isHostile) {
            if (distToPlayer > 2 && distToPlayer < d.chaseRange) {          // CHASE
                const dir = _v.subVectors(playerPos, this.mesh.position).normalize();
                faceSmooth(this.mesh, playerPos.x, playerPos.z, 10, dt);
                this.mesh.position.add(dir.multiplyScalar(6 * d.speedMul * dt));
            } else if (distToPlayer <= 2) {                                // ATTACK
                faceSmooth(this.mesh, playerPos.x, playerPos.z, 12, dt);
                this.attackTimer += dt;
                if (this.attackTimer >= d.attackInterval) {
                    playerClass.takeDamage(this.damage);
                    AudioSys.hit();
                    this.mesh.position.add(this.mesh.getWorldDirection(_v).multiplyScalar(0.5)); // lunge
                    this.attackTimer = 0;
                }
            } else {                                                       // lost the player
                if (!d.chargeOnSight || distToPlayer > sightRange) this.isHostile = false;
            }
        } else if (this.state === 'WANDER') {
            const dir = _v.subVectors(this.target, this.mesh.position);
            if (dir.length() < 1) {
                pickWander(this.target, this.mesh.position);
            } else {
                dir.normalize();
                faceSmooth(this.mesh, this.target.x, this.target.z, 5, dt);
                this.mesh.position.add(dir.multiplyScalar(4 * d.speedMul * dt));
            }
        }

        // gun dogs: fire aimed tracers while the player is in range (they still chase for melee too)
        if (!grace && this.isGun && this._muzzle && this.isHostile && distToPlayer < d.fireRange) {
            this.fireTimer += dt;
            if (this.fireTimer >= d.fireInterval) {
                this.fireTimer = 0;
                this._muzzle.getWorldPosition(_mw);
                _aim.copy(playerPos); _aim.y += 0.8; _aim.sub(_mw);   // aim at torso height
                fireBullet(_mw, _aim, d.bulletSpeed, d.bulletDamage, d.fireRange + 12);
                muzzleFlash(_mw.clone());
                if (distToPlayer < 45) AudioSys.gunshot(Math.max(0.05, 0.22 * (1 - distToPlayer / 45)));   // quieter with distance
            }
        }

        // menace-pop size lerp (evil dogs swell a touch)
        if (this._wrap && Math.abs(this.mesh.scale.x - this.targetScale) > 0.001) {
            const s = this.mesh.scale.x + (this.targetScale - this.mesh.scale.x) * Math.min(1, 10 * dt);
            this.mesh.scale.setScalar(s);
        }

        this.mesh.position.y = getTerrainHeightAt(this.mesh.position.x, this.mesh.position.z);

        // bob while active (chasing or wandering) - exaggerated stride: taller bounce + a body
        // rock (fore/aft gallop) + a side-to-side waddle on the wrap pivot so the dog visibly strides.
        const moving = this.isHostile || this.state === 'WANDER';
        if (moving) this.bobPhase += dt * 11 * d.gait;
        if (this._wrap) {
            const amp = moving ? 1 : 0;
            this._wrap.rotation.x = Math.sin(this.bobPhase) * 0.16 * d.gait * amp;         // fore/aft gallop rock
            this._wrap.rotation.z = Math.sin(this.bobPhase * 0.5) * 0.1 * d.gait * amp;    // side-to-side waddle
        }
        if (moving) this.mesh.position.y += Math.abs(Math.sin(this.bobPhase)) * 0.16 * this.scaleVal * d.gait;
    }

    // flying blue dog: hovers and spin-idles, then dives at the player in full 3D but slower than
    // ground dogs. y is driven by a smoothed base height (_flyY) plus a hover bob (set, not added).
    _updateFly(dt, playerPos, playerClass, grace, d) {
        const distToPlayer = this.mesh.position.distanceTo(playerPos);
        const sightRange = Math.max(d.aggroRange, 38);   // generous so they spot you from high up and dive
        if (grace) this.isHostile = false;
        else if (d.chargeOnSight && !this.isHostile && distToPlayer < sightRange) this.isHostile = true;
        else if (this.isHostile && (!d.chargeOnSight || distToPlayer > sightRange + 8)) this.isHostile = false;

        const groundY = getTerrainHeightAt(this.mesh.position.x, this.mesh.position.z);
        const flySpeed = 3.8 * d.speedMul;   // slower than ground dogs (they chase at 6 * speedMul)

        if (this.isHostile && !grace) {
            const targetY = Math.max(playerPos.y + 1.2, groundY + 1.5);
            if (distToPlayer > 2.4) {                       // DIVE down at the player from the sky
                const dx = playerPos.x - this.mesh.position.x, dz = playerPos.z - this.mesh.position.z;
                const dm = Math.hypot(dx, dz) || 1;
                this.mesh.position.x += (dx / dm) * flySpeed * dt;
                this.mesh.position.z += (dz / dm) * flySpeed * dt;
                this._flyY += (targetY - this._flyY) * Math.min(1, 5 * dt);   // commit the descent
                faceSmooth(this.mesh, playerPos.x, playerPos.z, 8, dt);
            } else {                                        // ATTACK
                faceSmooth(this.mesh, playerPos.x, playerPos.z, 10, dt);
                this.attackTimer += dt;
                if (this.attackTimer >= d.attackInterval) { playerClass.takeDamage(this.damage); AudioSys.hit(); this.attackTimer = 0; }
            }
        } else {                                            // IDLE: fast 360 spin + slow drift + climb back up high
            this.spinPhase += dt * 14;
            this.mesh.rotation.y = this.spinPhase;
            const dx = this.target.x - this.mesh.position.x, dz = this.target.z - this.mesh.position.z;
            const dm = Math.hypot(dx, dz);
            if (dm < 2) pickWander(this.target, this.mesh.position);
            else { this.mesh.position.x += (dx / dm) * 1.8 * dt; this.mesh.position.z += (dz / dm) * 1.8 * dt; }
            this._flyY += (groundY + this.hoverY - this._flyY) * Math.min(1, 2.5 * dt);
        }

        // fast white wing flap (always)
        this._wingPhase += dt * 22;
        const flap = Math.sin(this._wingPhase) * 0.6 + 0.15;
        if (this._wingR) this._wingR.rotation.z = flap;
        if (this._wingL) this._wingL.rotation.z = -flap;

        // menace-pop scale lerp (shared with ground dogs)
        if (this._wrap && Math.abs(this.mesh.scale.x - this.targetScale) > 0.001) {
            const s = this.mesh.scale.x + (this.targetScale - this.mesh.scale.x) * Math.min(1, 10 * dt);
            this.mesh.scale.setScalar(s);
        }
        // hover bob as a per-frame offset (no accumulation)
        this.bobPhase += dt * 3;
        this.mesh.position.y = this._flyY + Math.sin(this.bobPhase) * 0.25;
    }

    takeHit(dmg) {
        this.hp -= dmg;
        this.isHostile = true;
        this.setEvil(true);   // provoked -> red eyes + menace
        this.mesh.position.add(this.mesh.getWorldDirection(new THREE.Vector3()).multiplyScalar(-2)); // Recoil
        if(this.hp <= 0) {
            this.dead = true;
            this.scene.remove(this.mesh);
            return true; // Dropped Essence
        }
        return false;
    }
}