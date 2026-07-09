import * as THREE from 'three';

// ============================================================================
// tiny pooled particle-burst VFX (§23). points clouds that fly out, fall under
// gravity, and fade. used for eat/level-up sparkles and bite/kill pops.
// ============================================================================

const _bursts = [];
const _flashes = [];   // short bright muzzle flashes (gun dogs)
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

// quick expanding additive flash for gun-dog muzzles (punchy, ~0.12s)
export function muzzleFlash(pos, color = 0xffdf8a) {
    if (!_scene) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    mat.userData.outlineParameters = { visible: false };
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat);
    m.position.copy(pos); m.frustumCulled = false;
    _scene.add(m);
    _flashes.push({ m, life: 0, ttl: 0.12 });
}

// ============================================================================
// bite jaw-clamp VFX (v1.12): a pair of toothy jaws that snap shut in world space
// next to the bitten dog on every bite, then fade. built from a gum bar + cone teeth.
// ============================================================================
const _jaws = [];
const _easeOutBack = (t) => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export function jawSnap(pos, scale = 1, yaw = 0) {
    if (!_scene) return;
    const g = new THREE.Group();
    g.position.copy(pos);
    g.scale.setScalar(scale);
    g.rotation.y = yaw;
    const buildJaw = (isUpper) => {
        const jaw = new THREE.Group();
        const gumMat = new THREE.MeshStandardMaterial({ color: 0xc4495a, roughness: 0.7, transparent: true, opacity: 1 });
        const gum = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 1.0), gumMat);
        gum.position.y = isUpper ? 0.34 : -0.34;   // gum sits on the outer side so teeth meet cleanly at the bite line
        jaw.add(gum);
        for (let i = 0; i < 6; i++) {
            const toothMat = new THREE.MeshStandardMaterial({ color: 0xfffdf5, roughness: 0.45, transparent: true, opacity: 1 });
            const t = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 8), toothMat);
            t.position.set(-0.7 + i * 0.28, isUpper ? -0.42 : 0.42, 0.12);
            if (isUpper) t.rotation.z = Math.PI;   // apex points down for the top row
            t.castShadow = true;
            jaw.add(t);
        }
        return jaw;
    };
    const upper = buildJaw(true);
    const lower = buildJaw(false);
    g.add(upper, lower);
    _scene.add(g);
    _jaws.push({ g, upper, lower, life: 0, ttl: 0.5 });
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
    // muzzle flashes: expand + fade fast
    for (let i = _flashes.length - 1; i >= 0; i--) {
        const f = _flashes[i];
        if (!f.m.parent) { _flashes.splice(i, 1); continue; }
        f.life += dt;
        const t = f.life / f.ttl;
        f.m.scale.setScalar(1 + t * 2.5);
        f.m.material.opacity = Math.max(0, 0.95 * (1 - t));
        if (f.life >= f.ttl) {
            _scene.remove(f.m);
            f.m.geometry.dispose();
            f.m.material.dispose();
            _flashes.splice(i, 1);
        }
    }
    // bite jaws: snap shut (easeOutBack overshoot) then fade
    for (let i = _jaws.length - 1; i >= 0; i--) {
        const j = _jaws[i];
        if (!j.g.parent) { _jaws.splice(i, 1); continue; }
        j.life += dt;
        const ct = Math.min(1, j.life / (j.ttl * 0.5));        // clamp during first half
        const gap = (1 - _easeOutBack(ct)) * 1.0;              // 1.0 apart -> 0 (slight interlock overshoot)
        j.upper.position.y = gap * 0.5;
        j.lower.position.y = -gap * 0.5;
        const op = 1 - Math.max(0, (j.life - j.ttl * 0.6) / (j.ttl * 0.4));  // fade last 40%
        j.g.traverse((o) => { if (o.isMesh) o.material.opacity = op; });
        if (j.life >= j.ttl) {
            _scene.remove(j.g);
            j.g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
            _jaws.splice(i, 1);
        }
    }
}
