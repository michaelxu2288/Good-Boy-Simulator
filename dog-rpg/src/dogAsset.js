import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toonify } from './materials.js';

// load the shipped dog GLB ONCE, cel-shade the prototype, cache it, and hand out
// tinted clones for NPC dogs so they match the player instead of being two boxes.
let _proto = null;
let _loading = null;
export const DOG_TEXTURES = new Set();   // textures owned by the persistent proto — never dispose on scene swap

export function preloadDog() {
    if (_proto) return Promise.resolve(_proto);
    if (_loading) return _loading;
    _loading = new Promise((resolve) => {
        new GLTFLoader().load(
            '/assets/3d_dog_cute.glb',
            (gltf) => {
                _proto = gltf.scene; toonify(_proto);
                _proto.traverse((o) => {
                    if (!o.isMesh || !o.material) return;
                    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
                        for (const k in m) { const v = m[k]; if (v && v.isTexture) DOG_TEXTURES.add(v); }
                    });
                });
                resolve(_proto);
            },
            undefined,
            () => resolve(null),   // on error, callers fall back to a box dog
        );
    });
    return _loading;
}

// shared geometry, per-clone materials so each dog can be tinted independently.
export function makeDogClone(tintHex) {
    if (!_proto) return null;
    const clone = _proto.clone(true);
    clone.traverse((o) => {
        if (o.isMesh && o.material) {
            o.geometry = o.geometry.clone();   // own geometry so scene-swap disposal won't free the shared proto buffers
            o.material = o.material.clone();
            if (tintHex != null && o.material.color) o.material.color.setHex(tintHex);
            o.castShadow = true;
        }
    });
    return clone;
}
