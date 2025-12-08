import * as THREE from 'three';
import { AudioSys } from '../Audio';

export class Player {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();

        // --- DOG MATERIALS ---
        const furMat = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513, 
            roughness: 0.9,
            flatShading: true
        });
        const darkFurMat = new THREE.MeshStandardMaterial({ color: 0x3e1e09 });
        const noseMat = new THREE.MeshStandardMaterial({ color: 0x000000 });

        // --- BODY PARTS ---
        
        // Main Body
        this.body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 2.2), furMat);
        this.body.position.y = 1.2;
        this.body.castShadow = true;
        this.group.add(this.body);

        // Head Group (Neck + Head)
        this.headGroup = new THREE.Group();
        this.headGroup.position.set(0, 2.0, 1.1);
        
        const headMesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), furMat);
        headMesh.castShadow = true;
        
        const snout = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.6), furMat);
        snout.position.set(0, -0.2, 0.6);
        snout.castShadow = true;

        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), noseMat);
        nose.position.set(0, 0.2, 0.35); // On tip of snout
        snout.add(nose);

        const earGeo = new THREE.BoxGeometry(0.3, 0.4, 0.2);
        const earL = new THREE.Mesh(earGeo, darkFurMat);
        earL.position.set(0.4, 0.6, -0.2);
        const earR = new THREE.Mesh(earGeo, darkFurMat);
        earR.position.set(-0.4, 0.6, -0.2);

        this.headGroup.add(headMesh, snout, earL, earR);
        this.group.add(this.headGroup);

        // Tail
        this.tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1.0), darkFurMat);
        this.tail.position.set(0, 1.5, -1.2);
        this.tail.rotation.x = 0.5; // Stick up a bit
        this.group.add(this.tail);

        // Legs
        const legGeo = new THREE.BoxGeometry(0.35, 1.2, 0.35);
        this.legs = [];
        
        // FL, FR, BL, BR
        const legPositions = [
            { x: -0.4, z: 0.9 }, // Front Left
            { x: 0.4, z: 0.9 },  // Front Right
            { x: -0.4, z: -0.9 }, // Back Left
            { x: 0.4, z: -0.9 }   // Back Right
        ];

        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeo, furMat);
            leg.position.set(pos.x, 0.6, pos.z);
            leg.castShadow = true;
            
            // Create a pivot group so they rotate from the top, not center
            const pivot = new THREE.Group();
            pivot.position.set(pos.x, 1.2, pos.z); // Top of leg
            leg.position.set(0, -0.6, 0); // Offset geometry down
            pivot.add(leg);
            
            this.legs.push(pivot);
            this.group.add(pivot);
        });

        this.scene.add(this.group);

        // Stats
        this.hp = 100;
        this.maxHp = 100;
        this.size = 1.0;
        this.xp = 0;
        this.stamina = 100;
        
        // Animation Vars
        this.walkTimer = 0;
    }

    grow(amount) {
        this.size += amount;
        this.maxHp += 20;
        this.hp = this.maxHp;
        this.xp += amount * 100;
        
        this.group.scale.setScalar(this.size);
        
        document.getElementById('xp-bar').style.width = Math.min(100, (this.xp % 1000)/10) + '%';
        document.getElementById('level-display').innerText = `Lvl ${Math.floor(this.xp/100)+1} Beast`;
        AudioSys.powerup();
    }

    takeDamage(amt) {
        this.hp -= amt;
        AudioSys.hit();
        if(this.hp <= 0) {
            this.hp = 0;
            this.group.position.set(0,0,0);
            this.hp = this.maxHp;
            alert("You were knocked out! Waking up at home...");
        }
        document.getElementById('hp-bar').style.width = (this.hp / this.maxHp * 100) + '%';
    }

    update(dt, keys, wallColliders) {
        let isMoving = false;
        let speed = keys.shift ? 15 : 8;
        if(keys.shift) this.stamina -= 10*dt;
        if(this.stamina <= 0) speed = 8;
        
        // Rotation
        const rotSpeed = 3;
        if(keys.a) this.group.rotation.y += rotSpeed * dt;
        if(keys.d) this.group.rotation.y -= rotSpeed * dt;
        
        // Movement
        if(keys.w || keys.s) {
            isMoving = true;
            const dir = new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0), this.group.rotation.y);
            if(keys.s) dir.negate();
            
            const nextPos = this.group.position.clone().add(dir.multiplyScalar(speed * dt));
            
            // Collision Check
            let collide = false;
            const pBox = new THREE.Box3().setFromCenterAndSize(nextPos, new THREE.Vector3(1,2,1));
            for(let w of wallColliders) {
                if(pBox.intersectsBox(w)) { collide = true; break; }
            }
            
            if(!collide) {
                this.group.position.copy(nextPos);
            }
        }

        // --- ANIMATION SYSTEM ---
        if (isMoving) {
            this.walkTimer += dt * speed;
            
            // Leg Swing (Sine Wave)
            this.legs[0].rotation.x = Math.sin(this.walkTimer) * 0.5; // FL
            this.legs[1].rotation.x = Math.sin(this.walkTimer + Math.PI) * 0.5; // FR
            this.legs[2].rotation.x = Math.sin(this.walkTimer + Math.PI) * 0.5; // BL
            this.legs[3].rotation.x = Math.sin(this.walkTimer) * 0.5; // BR
            
            // Head Bob
            this.headGroup.position.y = 2.0 + Math.sin(this.walkTimer * 2) * 0.05;
            
            // Tail Wag (Fast)
            this.tail.rotation.y = Math.sin(this.walkTimer * 3) * 0.5;

        } else {
            // Idle Animation
            this.walkTimer += dt;
            
            // Reset Legs
            this.legs.forEach(leg => leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, 0, 0.1));
            
            // Breathing (Scale body slightly)
            const breathe = 1 + Math.sin(this.walkTimer * 2) * 0.02;
            this.body.scale.set(1, breathe, 1);
            
            // Slow Tail Wag
            this.tail.rotation.y = Math.sin(this.walkTimer) * 0.2;
        }
    }
}