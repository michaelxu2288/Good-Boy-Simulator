// src/difficulty.js - single source of truth for v1.12 difficulty scaling.
// easy == exact pre-v1.12 behavior (all muls 1, no on-sight aggro, no gun dogs, 30 dogs).
// medium/hard scale speed, HP, damage, size, aggression, spawn counts, and gun-dog count.
export const DIFFICULTY = {
    easy: {
        key: 'easy', label: 'Easy',
        speedMul: 1, hpMul: 1, damageMul: 1, scaleBonus: 0, evilOnSpawn: false, gait: 1,
        chargeOnSight: false, aggroRange: 0, chaseRange: 30, attackInterval: 1.0,
        dogCount: 30, humanCount: 45, gunDogCount: 0, flyDogCount: 4,
        fireInterval: 1.4, bulletDamage: 6, bulletSpeed: 55, fireRange: 42,
    },
    medium: {
        key: 'medium', label: 'Medium',
        speedMul: 1.4, hpMul: 1.15, damageMul: 1.7, scaleBonus: 0.22, evilOnSpawn: false, gait: 1.15,
        chargeOnSight: true, aggroRange: 16, chaseRange: 45, attackInterval: 0.8,
        dogCount: 44, humanCount: 40, gunDogCount: 6, flyDogCount: 6,
        fireInterval: 1.1, bulletDamage: 9, bulletSpeed: 62, fireRange: 46,
    },
    hard: {
        key: 'hard', label: 'Hard',
        speedMul: 1.9, hpMul: 1.4, damageMul: 3.0, scaleBonus: 0.5, evilOnSpawn: true, gait: 1.3,
        chargeOnSight: true, aggroRange: 34, chaseRange: 70, attackInterval: 0.55,
        dogCount: 60, humanCount: 32, gunDogCount: 18, flyDogCount: 10,
        fireInterval: 0.7, bulletDamage: 14, bulletSpeed: 72, fireRange: 56,
    },
};
const LS = 'gbs_difficulty';
let _cur = 'easy';
try { const s = localStorage.getItem(LS); if (s && DIFFICULTY[s]) _cur = s; } catch { /* no storage */ }
export function setDifficulty(k) { if (DIFFICULTY[k]) { _cur = k; try { localStorage.setItem(LS, k); } catch { /* */ } } }
export function getDifficultyKey() { return _cur; }
export function getDifficulty() { return DIFFICULTY[_cur]; }
