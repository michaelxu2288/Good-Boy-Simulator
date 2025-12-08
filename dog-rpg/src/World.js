import * as THREE from 'three';

export function createWorld(scene) {
    const wallColliders = [];

import { Sky } from 'three/examples/jsm/objects/Sky.js';

export function createWorld(scene) {
    const wallColliders = [];

    // --- 1. ATMOSPHERE & LIGHTING ---
    const sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);

    const sun = new THREE.Vector3();

    const effectController = {
        turbidity: 10,
        rayleigh: 3,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.7,
        elevation: 2,
        azimuth: 180,
    };

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(100, 150, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 4096;
    dirLight.shadow.mapSize.height = 4096;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.left = -150;
    dirLight.shadow.camera.right = 150;
    dirLight.shadow.camera.top = 150;
    dirLight.shadow.camera.bottom = -150;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    function updateSky() {
        const uniforms = sky.material.uniforms;
        uniforms['turbidity'].value = effectController.turbidity;
        uniforms['rayleigh'].value = effectController.rayleigh;
        uniforms['mieCoefficient'].value = effectController.mieCoefficient;
        uniforms['mieDirectionalG'].value = effectController.mieDirectionalG;

        const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
        const theta = THREE.MathUtils.degToRad(effectController.azimuth);

        sun.setFromSphericalCoords(1, phi, theta);

        uniforms['sunPosition'].value.copy(sun);
        
        dirLight.position.copy(sun).multiplyScalar(150);
    }

    updateSky();


    // --- 2. TERRAIN ---
    const groundGeo = new THREE.PlaneGeometry(500, 500, 32, 32);
    
    // Slight uneven terrain
    const posAttribute = groundGeo.attributes.position;
    for (let i = 0; i < posAttribute.count; i++) {
        const x = posAttribute.getX(i);
        const y = posAttribute.getY(i);
        // Add gentle noise
        const z = Math.sin(x * 0.05) * Math.cos(y * 0.05) * 2; 
        posAttribute.setZ(i, z);
    }
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({ 
        color: 0x5c8f38, 
        roughness: 0.8,
        flatShading: true
    });
    const floor = new THREE.Mesh(groundGeo, groundMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // --- 3. MASSIVE GRASS SYSTEM (InstancedMesh for Performance) ---
    const grassCount = 8000;
    const grassGeo = new THREE.ConeGeometry(0.15, 0.8, 3);
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x7ebf5a });
    const grassField = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    
    const dummy = new THREE.Object3D();
    for (let i = 0; i < grassCount; i++) {
        dummy.position.set((Math.random() - 0.5) * 400, 0, (Math.random() - 0.5) * 400);
        
        // Don't put grass on roads (center area)
        if(Math.abs(dummy.position.x) < 22 || Math.abs(dummy.position.z) < 22) continue;

        dummy.scale.setScalar(0.5 + Math.random() * 0.5);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.rotation.x = (Math.random() - 0.5) * 0.2; // Random tilt
        dummy.updateMatrix();
        grassField.setMatrixAt(i, dummy.matrix);
    }
    grassField.receiveShadow = true;
    scene.add(grassField);

    // --- 4. ROADS & SIDEWALKS ---
    const roadGroup = new THREE.Group();
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x999999 });

    function createRoadSegment(w, h, x, z) {
        // Asphalt
        const r = new THREE.Mesh(new THREE.PlaneGeometry(w, h), roadMat);
        r.rotation.x = -Math.PI/2;
        r.position.set(x, 0.05, z);
        r.receiveShadow = true;
        roadGroup.add(r);

        // Sidewalk curbs
        if (w > h) { // Horizontal road
            const curb1 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, 1), sidewalkMat);
            curb1.position.set(x, 0.1, z - h/2 - 0.5);
            curb1.castShadow = true;
            curb1.receiveShadow = true;
            const curb2 = curb1.clone();
            curb2.position.set(x, 0.1, z + h/2 + 0.5);
            roadGroup.add(curb1, curb2);
        } else { // Vertical road
            const curb1 = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, h), sidewalkMat);
            curb1.position.set(x - w/2 - 0.5, 0.1, z);
            curb1.castShadow = true;
            curb1.receiveShadow = true;
            const curb2 = curb1.clone();
            curb2.position.set(x + w/2 + 0.5, 0.1, z);
            roadGroup.add(curb1, curb2);
        }
    }

    createRoadSegment(400, 20, 0, 0); 
    createRoadSegment(20, 400, 0, 0);
    scene.add(roadGroup);

    // --- 5. PROCEDURAL TREES & HOUSES ---
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 3, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
    const leavesGeo = new THREE.IcosahedronGeometry(2.5, 0);
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, flatShading: true });

    // Decorations
    const hydrantGeo = new THREE.CylinderGeometry(0.3, 0.3, 1, 8);
    const hydrantMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });

    for(let i=0; i<50; i++) {
        const x = (Math.random() - 0.5) * 360;
        const z = (Math.random() - 0.5) * 360;

        // Avoid roads
        if(Math.abs(x) < 25 || Math.abs(z) < 25) continue;

        const type = Math.random();

        if (type > 0.4) {
            // -- HOUSE --
            const w = 8 + Math.random() * 8;
            const h = 8 + Math.random() * 6;
            const d = 8 + Math.random() * 8;
            
            const houseGroup = new THREE.Group();
            
            // Walls
            const houseBody = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, d),
                new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff })
            );
            houseBody.position.y = h/2;
            houseBody.castShadow = true;
            houseBody.receiveShadow = true;
            
            // Roof
            const roof = new THREE.Mesh(
                new THREE.ConeGeometry(Math.max(w,d) * 0.8, 5, 4),
                new THREE.MeshStandardMaterial({ color: 0x333333 })
            );
            roof.position.y = h + 2.5;
            roof.rotation.y = Math.PI/4;
            roof.castShadow = true;
            
            // Door
            const door = new THREE.Mesh(
                new THREE.BoxGeometry(2, 4, 0.5),
                new THREE.MeshStandardMaterial({ color: 0x4a3c31 })
            );
            door.position.set(0, 2, d/2);

            houseGroup.add(houseBody, roof, door);
            houseGroup.position.set(x, 0, z);
            // Random rotation 0, 90, 180, 270
            houseGroup.rotation.y = Math.floor(Math.random() * 4) * (Math.PI/2);
            
            scene.add(houseGroup);
            wallColliders.push(new THREE.Box3().setFromObject(houseBody));

        } else if (type > 0.1) {
            // -- TREE --
            const treeGroup = new THREE.Group();
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.y = 1.5;
            trunk.castShadow = true;
            trunk.receiveShadow = true;
            
            const leaves = new THREE.Mesh(leavesGeo, leavesMat);
            leaves.position.y = 4;
            leaves.castShadow = true;
            leaves.receiveShadow = true;
            
            // Random foliage scale
            leaves.scale.setScalar(0.8 + Math.random() * 0.6);

            treeGroup.add(trunk, leaves);
            treeGroup.position.set(x, 0, z);
            treeGroup.scale.setScalar(1 + Math.random() * 0.5);
            scene.add(treeGroup);
            wallColliders.push(new THREE.Box3().setFromObject(trunk));
        } else {
            // -- FIRE HYDRANT --
            const hydrant = new THREE.Mesh(hydrantGeo, hydrantMat);
            hydrant.position.set(x, 0.5, z);
            hydrant.castShadow = true;
            scene.add(hydrant);
        }
    }

    return { wallColliders };
}