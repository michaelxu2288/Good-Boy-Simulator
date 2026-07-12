import * as THREE from 'three';

// ============================================================================
// game-feel juice (§25): floating combat text. pooled DOM labels that project a
// world position to the screen and rise+fade via the Web Animations API (no
// per-frame JS). used for bite damage numbers, kill score pops, and pickups.
// ============================================================================

let layer = null;
const pool = [];
const _v = new THREE.Vector3();
let _idx = 0;

export function initJuice() {
    layer = document.getElementById('combat-text');
    if (!layer) return;
    for (let i = 0; i < 20; i++) {
        const el = document.createElement('div');
        el.className = 'ctext';
        el.style.display = 'none';
        layer.appendChild(el);
        pool.push({ el, busy: false, anim: null });
    }
}

// pop a floating label at a 3D world position. kind: 'dmg' | 'crit' | 'score' | 'heal'
export function popText(worldPos, camera, text, kind = 'dmg') {
    if (!layer) return;
    _v.copy(worldPos).project(camera);
    if (_v.z > 1) return;   // behind the camera -> skip
    const x = (_v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_v.y * 0.5 + 0.5) * window.innerHeight;

    // round-robin to a free slot; if all busy, steal the next one (cancel its anim first)
    let slot = null;
    for (let i = 0; i < pool.length; i++) {
        const s = pool[(_idx + i) % pool.length];
        if (!s.busy) { slot = s; _idx = (_idx + i + 1) % pool.length; break; }
    }
    if (!slot) { slot = pool[_idx]; _idx = (_idx + 1) % pool.length; if (slot.anim) slot.anim.cancel(); }

    const el = slot.el;
    el.textContent = text;
    el.className = 'ctext ctext-' + kind;
    el.style.display = 'block';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    slot.busy = true;

    const dx = (Math.random() - 0.5) * 44;
    const anim = el.animate([
        { transform: 'translate(-50%,-50%) translate(0px,4px) scale(0.55)', opacity: 0 },
        { transform: `translate(-50%,-50%) translate(${dx * 0.4}px,-26px) scale(1.18)`, opacity: 1, offset: 0.18 },
        { transform: `translate(-50%,-50%) translate(${dx}px,-92px) scale(1)`, opacity: 0 },
    ], { duration: 950, easing: 'cubic-bezier(.18,.7,.28,1)' });
    slot.anim = anim;
    anim.onfinish = () => { el.style.display = 'none'; slot.busy = false; slot.anim = null; };
}
