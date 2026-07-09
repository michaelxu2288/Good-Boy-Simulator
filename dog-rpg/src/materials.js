import * as THREE from 'three';

// ============================================================================
// cel / toon material system  (§01 art direction, §08 materials, §22 shading)
// a shared 3-band gradient ramp + curated pastel palette so this textureless,
// procedural world reads as ONE intentional cel-shaded "cozy suburban afternoon"
// instead of flat-shaded random-colored primitives.
// ============================================================================

// hard 3/4-band toon ramp. NearestFilter => crisp cel steps (no smooth gradient).
function makeRamp() {
    const steps = new Uint8Array([120, 175, 225, 255]);
    const ramp = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
    ramp.minFilter = THREE.NearestFilter;
    ramp.magFilter = THREE.NearestFilter;
    ramp.generateMipmaps = false;
    ramp.needsUpdate = true;
    return ramp;
}
export const TOON_RAMP = makeRamp();

// curated palette. saturation is reserved for gameplay reads (treats / essence /
// hydrant / exit door) so those pop; everything else stays soft + cohesive.
export const PALETTE = {
    house:    [0xead9c2, 0xd9c7e0, 0xc7dbe0, 0xe6cabf, 0xd2e0c7, 0xe7dcb0, 0xcfd3e0],
    roof:     [0x9b6b5a, 0x7a8fb0, 0x8a7fa0, 0xb0895f, 0x6f9a86],
    clothing: [0x5b7fb0, 0xb0685f, 0x6fae7a, 0xd0a24f, 0x8a6fae, 0x4fa0a6, 0xc77f9a],
    pants:    [0x4a4f5a, 0x5a4a3a, 0x3a4a5a, 0x4f4a55, 0x554a3f],
    dogFur:   [0x8a6a4a, 0xc9a06a, 0x6a5a4a, 0xd8c0a0, 0x4a4038, 0xb0805a],
    skin:     0xf0c8a0,
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function pickHouse()    { return pick(PALETTE.house); }
export function pickRoof()     { return pick(PALETTE.roof); }
export function pickClothing() { return pick(PALETTE.clothing); }
export function pickPants()    { return pick(PALETTE.pants); }
export function pickDogFur()   { return pick(PALETTE.dogFur); }

// mark a material so the OutlineEffect skips it (grass instances, the giant sky
// box, the ground plane - outlining those is wasteful or wrong).
export function noOutline(mat) {
    mat.userData.outlineParameters = { visible: false };
    return mat;
}

const _convertible = (m) =>
    m && !m.isMeshToonMaterial &&
    (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial);

// convert a subtree's lit materials to MeshToonMaterial in place, preserving
// color / map / emissive / transparency. deliberately skips ShaderMaterial (Sky)
// and unlit MeshBasicMaterial (glowy essence orbs) so those stay as intended.
// InstancedMesh materials are auto-excluded from outlines. call once after a
// scene or model is built.
export function toonify(root) {
    const cache = new Map();   // source material.uuid -> shared toon material (preserve sharing)
    root.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const conv = (mat) => {
            if (!_convertible(mat)) return mat;
            const hit = cache.get(mat.uuid);
            if (hit) return hit;
            const t = new THREE.MeshToonMaterial({
                color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
                map: mat.map || null,
                gradientMap: TOON_RAMP,
                transparent: !!mat.transparent,
                opacity: mat.opacity != null ? mat.opacity : 1,
                side: mat.side,
                emissive: mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000),
                emissiveIntensity: mat.emissiveIntensity != null ? mat.emissiveIntensity : 1,
            });
            if (t.map) t.map.colorSpace = THREE.SRGBColorSpace;
            if (o.isInstancedMesh) noOutline(t);
            cache.set(mat.uuid, t);
            mat.dispose();
            return t;
        };
        o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
}
