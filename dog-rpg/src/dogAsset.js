import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toonify } from './materials.js';

// load the shipped dog GLB ONCE, cel-shade the prototype, cache it, and hand out
// tinted clones for NPC dogs so they match the player instead of being two boxes.
let _proto = null;
let _loading = null;

export function preloadDog() {
    if (_proto) return Promise.resolve(_proto);
    if (_loading) return _loading;
    _loading = new Promise((resolve) => {
        new GLTFLoader().load(
            '/assets/3d_dog_cute.glb',
            (gltf) => { _proto = gltf.scene; toonify(_proto); resolve(_proto); },
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
            o.material = o.material.clone();
            if (tintHex != null && o.material.color) o.material.color.setHex(tintHex);
            o.castShadow = true;
        }
    });
    return clone;
}
