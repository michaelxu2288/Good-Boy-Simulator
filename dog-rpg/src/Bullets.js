import * as THREE from 'three';
import { noOutline } from './materials.js';
import { burst } from './vfx.js';

// ============================================================================
// pooled projectile system (v1.12) for gun dogs. a fixed pool of glowing tracer
// bullets lives in ONE persistent group that survives scene swaps (disposeScene
// skips userData.persistent), so we never allocate mid-fight. bullets fly straight,
// expire on range/TTL, and damage the player on contact.
// ============================================================================

const POOL = 64;
let _group = null;
let _bullets = [];        // { mesh, vel:Vector3, ttl, damage, active }
let _next = 0;

const _tmp = new THREE.Vector3();

export function initBullets(scene) {
    if (_group) return;
    _group = new THREE.Group();
    _group.userData.persistent = true;   // disposeScene must NOT free this on house entry/exit
    _group.frustumCulled = false;
    scene.add(_group);

    const coreGeo = new THREE.SphereGeometry(0.16, 8, 6);
    const haloGeo = new THREE.SphereGeometry(0.34, 8, 6);
    for (let i = 0; i < POOL; i++) {
        const b = new THREE.Group();
        const core = new THREE.Mesh(coreGeo, noOutline(new THREE.MeshBasicMaterial({ color: 0xfff2a8 })));
        const halo = new THREE.Mesh(haloGeo, noOutline(new THREE.MeshBasicMaterial({
            color: 0xffb020, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
        })));
        core.frustumCulled = false; halo.frustumCulled = false;
        b.add(halo, core);
        b.visible = false;
        b.frustumCulled = false;
        _group.add(b);
        _bullets.push({ mesh: b, vel: new THREE.Vector3(), ttl: 0, damage: 0, active: false });
    }
}

// grab the next pool slot (round-robin; oldest is recycled if all in flight)
export function fireBullet(origin, dir, speed, damage, range) {
    if (!_group) return;
    const b = _bullets[_next];
    _next = (_next + 1) % POOL;
    b.mesh.position.copy(origin);
    b.vel.copy(dir).normalize().multiplyScalar(speed);
    b.ttl = range / speed;
    b.damage = damage;
    b.active = true;
    b.mesh.visible = true;
}

// move bullets, expire on TTL, damage the player on contact. hitRadius scales with player size.
export function updateBullets(dt, playerGroup, playerClass) {
    if (!_group) return;
    const pp = playerGroup.position;
    const hitR = 1.3 * (playerClass?.size || 1);
    for (const b of _bullets) {
        if (!b.active) continue;
        b.mesh.position.addScaledVector(b.vel, dt);
        b.ttl -= dt;
        if (b.mesh.position.distanceTo(pp) < hitR) {
            playerClass.takeDamage(b.damage);
            burst(b.mesh.position.clone(), 0xffc844, 12, 6, 0.28);
            b.active = false; b.mesh.visible = false;
            continue;
        }
        if (b.ttl <= 0) { b.active = false; b.mesh.visible = false; }
    }
}

// deactivate everything (called on scene swap so stray shots don't cross into the apartment)
export function resetBullets() {
    for (const b of _bullets) { b.active = false; b.mesh.visible = false; }
    _next = 0;
}
