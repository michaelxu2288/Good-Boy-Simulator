// ============================================================================
// radar minimap (§33 HUD): a heading-up dish showing nearby dogs, humans, houses
// and the boss around the player. pairs with the off-screen threat arrows so the
// player can read the neighborhood at a glance. duck-types entities (no imports)
// so it survives the production minifier.
// ============================================================================

let cv = null, ctx = null;
const R = 132, RANGE = 95;

export function initMinimap() {
    cv = document.getElementById('minimap-canvas');
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = R * dpr; cv.height = R * dpr;
    ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
}

export function updateMinimap(player, entities, interactables) {
    if (!ctx) return;
    const cx = R / 2, cy = R / 2, rad = R / 2 - 4, scale = rad / RANGE;
    ctx.clearRect(0, 0, R, R);

    // dish + ring
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,18,28,0.55)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.clip();

    const px = player.group.position.x, pz = player.group.position.z, yaw = player.group.rotation.y;
    const sy = Math.sin(yaw), cyw = Math.cos(yaw);
    // rotate world into heading-up map space: forward -> screen up, right -> screen right
    const plot = (wx, wz) => {
        const dx = wx - px, dz = wz - pz;
        const fwd = dx * sy + dz * cyw;
        const rgt = dx * cyw - dz * sy;
        return [cx + rgt * scale, cy - fwd * scale];
    };
    const dot = (x, y, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };

    // houses / doors as small cream squares
    if (interactables) for (const it of interactables) {
        if (it.type !== 'house') continue;
        const [x, y] = plot(it.position.x, it.position.z);
        ctx.fillStyle = 'rgba(230,215,180,0.75)'; ctx.fillRect(x - 2, y - 2, 4, 4);
    }

    // entities: dogs colored by threat, humans faint green, boss big red
    for (const e of entities) {
        if (!e.mesh || e.dead) continue;
        const [x, y] = plot(e.mesh.position.x, e.mesh.position.z);
        const isDog = typeof e.takeHit === 'function';
        if (isDog && e.isBoss) { dot(x, y, 5, '#ff2a2a'); continue; }
        if (isDog) {
            if (!e.isHostile) { dot(x, y, 2, 'rgba(190,190,190,0.55)'); continue; }
            dot(x, y, 2.7, e.isGun ? '#ffffff' : (e.isFly ? '#4a86e8' : '#ff3b30'));
        } else {
            dot(x, y, 2, 'rgba(120,220,140,0.7)');   // human
        }
    }
    ctx.restore();

    // player arrow, fixed at center pointing up
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx - 4.5, cy + 5); ctx.lineTo(cx + 4.5, cy + 5); ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
}
