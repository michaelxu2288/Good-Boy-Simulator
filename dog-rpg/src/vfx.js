import * as THREE from 'three';

// ============================================================================
// tiny pooled particle-burst VFX (§23). points clouds that fly out, fall under
// gravity, and fade. used for eat/level-up sparkles and bite/kill pops.
// ============================================================================

const _bursts = [];
let _scene = null;

export function initVFX(scene) { _scene = scene; }

export function burst(pos, color = 0xffffff, count = 16, speed = 6, size = 0.35) {
    if (!_scene) return;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vels = [];
    for (let i = 0; i < count; i++) {
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;
        const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.25, Math.random() - 0.5).normalize();
        vels.push(dir.multiplyScalar(speed * (0.5 + Math.random() * 0.8)));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 1, depthWrite: false });
    mat.userData.outlineParameters = { visible: false };   // never ink-outline particles
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    _scene.add(pts);
    _bursts.push({ pts, vels, life: 0, ttl: 0.75 });
}

export function updateVFX(dt) {
    for (let i = _bursts.length - 1; i >= 0; i--) {
        const b = _bursts[i];
        // dropped by a scene swap (disposeScene detached + freed it): just forget it.
        if (!b.pts.parent) { _bursts.splice(i, 1); continue; }
        b.life += dt;
        const pos = b.pts.geometry.attributes.position;
        for (let j = 0; j < b.vels.length; j++) {
            const v = b.vels[j];
            v.y -= 9 * dt; // gravity
            pos.array[j * 3] += v.x * dt;
            pos.array[j * 3 + 1] += v.y * dt;
            pos.array[j * 3 + 2] += v.z * dt;
        }
        pos.needsUpdate = true;
        b.pts.material.opacity = Math.max(0, 1 - b.life / b.ttl);
        if (b.life >= b.ttl) {
            _scene.remove(b.pts);
            b.pts.geometry.dispose();
            b.pts.material.dispose();
            _bursts.splice(i, 1);
        }
    }
}
