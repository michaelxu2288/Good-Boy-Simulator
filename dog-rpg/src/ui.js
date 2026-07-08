// shared single-timer toast: one #dialogue-box timer used by BOTH main.js and Player.js
// so overlapping messages (beg / kill / sniff / death) never cut each other off early.
let _toastTimer = null;
export function showToast(msg, ms = 3000) {
    const box = document.getElementById('dialogue-box');
    if (!box) return;
    box.style.display = 'block';
    box.innerText = msg;
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { box.style.display = 'none'; _toastTimer = null; }, ms);
}
