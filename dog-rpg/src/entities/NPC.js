import * as THREE from 'three';
import { AudioSys } from '../Audio'; // This ../ is correct here because we are deep in the entities folder

import { getTerrainHeightAt } from '../World.js';

export class Entity {
    constructor(scene, x, z) {
        this.scene = scene;
        this.mesh = new THREE.Group();
        this.mesh.position.set(x, 0, z);
        this.scene.add(this.mesh);
        this.dead = false;
    }
    update(dt) {}
}

const dialogueParts = {
    intro: ["Greetings.", "Oh a dog!", "Hey!", "Don't bite!", "Lost?", "Who's a good boy?"],
    story: ["I used to be a chef.", "My cat hates you.", "Late for yoga.", "Where are my keys?", "Aliens are real.", "Smell the rain."] //actual tts audio, replace with whatever u want
};

export class Human extends Entity {
    constructor(scene, x, z) {
        super(scene, x, z);
        
        const shirtColor = Math.floor(Math.random()*16777215);
        const pantColor = Math.floor(Math.random()*16777215);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.5), new THREE.MeshStandardMaterial({color: shirtColor}));
        body.position.y = 2.2; body.castShadow=true;
        
        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.5), new THREE.MeshStandardMaterial({color: pantColor}));
        legs.position.y = 0.75; legs.castShadow=true;
        
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({color: 0xffccaa}));
        head.position.y = 3.2; head.castShadow=true;

        this.mesh.add(body, legs, head);
        
        this.target = new THREE.Vector3(x,0,z);
        this.timer = 0;
        this.state = 'IDLE';
        this.hasGivenTreat = false;
        
        this.introText = dialogueParts.intro[Math.floor(Math.random()*dialogueParts.intro.length)];
        this.storyText = dialogueParts.story[Math.floor(Math.random()*dialogueParts.story.length)];
        
        if (AudioSys.voices.length > 0) {
            this.voice = AudioSys.voices[Math.floor(Math.random() * AudioSys.voices.length)];
        }
        this.pitch = 0.8 + Math.random() * 0.4;
        this.rate = 0.8 + Math.random() * 0.4;
    }

    update(dt) {
        if(this.state === 'IDLE') {
            this.timer += dt;
            if(this.timer > 3) {
                this.state = 'WALKING';
                this.target.set((Math.random()-0.5)*300, 0, (Math.random()-0.5)*300);
                this.timer = 0;
            }
        } else if (this.state === 'WALKING') {
            const dir = new THREE.Vector3().subVectors(this.target, this.mesh.position);
            if(dir.length() < 1) {
                this.state = 'IDLE';
            } else {
                dir.normalize();
                this.mesh.lookAt(this.target.x, 0, this.target.z);
                this.mesh.position.add(dir.multiplyScalar(3 * dt));
            }
        }
        this.mesh.position.y = getTerrainHeightAt(this.mesh.position.x, this.mesh.position.z);
    }
}

export class DogNPC extends Entity {
    constructor(scene, x, z) {
        super(scene, x, z);
        
        const color = Math.floor(Math.random()*16777215);
        const scale = 0.8 + Math.random() * 0.7;
        
        const mat = new THREE.MeshStandardMaterial({color: color});
        const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2), mat);
        body.position.y = 1; body.castShadow=true;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat);
        head.position.set(0, 1.8, 1.2); head.castShadow=true;
        
        this.mesh.add(body, head);
        this.mesh.scale.setScalar(scale);
        
        this.scaleVal = scale;
        this.hp = 30 * scale;
        this.damage = 5 * scale;
        this.state = 'WANDER';
        this.target = new THREE.Vector3(x,0,z);
        this.isHostile = false;
        this.attackTimer = 0;
    }

    update(dt, playerPos, playerClass) {
        if(this.dead) return;
        
        const distToPlayer = this.mesh.position.distanceTo(playerPos);

        if(this.isHostile) {
            if(distToPlayer > 2 && distToPlayer < 30) {
                const dir = new THREE.Vector3().subVectors(playerPos, this.mesh.position).normalize();
                this.mesh.lookAt(playerPos.x, 0, playerPos.z);
                this.mesh.position.add(dir.multiplyScalar(6 * dt));
            } else if (distToPlayer <= 2) {
                this.attackTimer += dt;
                if(this.attackTimer > 1.0) {
                    playerClass.takeDamage(this.damage);
                    AudioSys.hit(); 
                    this.mesh.position.add(this.mesh.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.5)); // Lunge
                    this.attackTimer = 0;
                }
            } else {
                this.isHostile = false; 
            }
        } else {
            if(this.state === 'WANDER') {
                const dir = new THREE.Vector3().subVectors(this.target, this.mesh.position);
                if(dir.length() < 1) {
                    this.target.set((Math.random()-0.5)*300, 0, (Math.random()-0.5)*300);
                    this.mesh.lookAt(this.target.x, 0, this.target.z);
                } else {
                    dir.normalize();
                    this.mesh.position.add(dir.multiplyScalar(4 * dt));
                }
            }
        }
        this.mesh.position.y = getTerrainHeightAt(this.mesh.position.x, this.mesh.position.z);
    }

    takeHit(dmg) {
        this.hp -= dmg;
        this.isHostile = true;
        this.mesh.position.add(this.mesh.getWorldDirection(new THREE.Vector3()).multiplyScalar(-2)); // Recoil
        if(this.hp <= 0) {
            this.dead = true;
            this.scene.remove(this.mesh);
            return true; // Dropped Essence
        }
        return false;
    }
}