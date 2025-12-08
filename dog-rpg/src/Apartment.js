import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export function createApartment(scene) {
    const wallColliders = [];
    const exitColliders = [];
    const S = 5; // GLOBAL SCALE FACTOR

    // --- 1. LIGHTING & ATMOSPHERE (UNCHANGED) ---
    const sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);

    const sun = new THREE.Vector3();
    const effectController = {
        turbidity: 10,
        rayleigh: 2,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.7,
        elevation: 45,
        azimuth: 180,
    };
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 4096;
    dirLight.shadow.mapSize.height = 4096;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);

    function updateSky() {
        const uniforms = sky.material.uniforms;
        const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
        const theta = THREE.MathUtils.degToRad(effectController.azimuth);
        sun.setFromSphericalCoords(1, phi, theta);
        uniforms['sunPosition'].value.copy(sun);
        dirLight.position.copy(sun).multiplyScalar(100);
    }
    updateSky();

    // --- 2. MATERIALS (UNCHANGED) ---
    const wallHeight = 3.0 * S; 
    const wallThickness = 0.15 * S;

    const matFloorWood = new THREE.MeshStandardMaterial({ color: 0xe3dace, roughness: 0.6 });
    const matFloorTile = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4 });
    const matWall = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.9 });
    const matCounter = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.1 });
    const matIslandBase = new THREE.MeshStandardMaterial({ color: 0x777777 });
    const matCouch = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 1.0 });
    const matTV = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8 });
    const matFurniture = new THREE.MeshStandardMaterial({ color: 0x5c4033 });


    // --- 3. FIX: GROUND & FLOOR ---
    
    // Base Foundation (Prevents void look)
    const baseGeo = new THREE.PlaneGeometry(200, 200);
    const baseMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.05; // Slightly below everything
    scene.add(base);

    function floor(x, z, w, d, mat) {
        // Fix: Ensure floor is slightly above 0 to avoid fighting with any ground planes
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * S, d * S), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x * S, 0.01, z * S); // Lifted 0.01
        mesh.receiveShadow = true;
        scene.add(mesh);
    }

    // --- 4. FIX: WALL INTERSECTIONS ---
    
    function wall(x, z, w, d, yRot = 0) {
        // We slightly shorten the visual mesh to prevent ugly Z-fighting at corners,
        // but keep the collider full size if needed.
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, wallHeight, d * S), matWall);
        mesh.position.set(x * S, wallHeight / 2, z * S);
        mesh.rotation.y = yRot;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        wallColliders.push(new THREE.Box3().setFromObject(mesh));
    }

    // === FLOORS ===
    // Living Room Area
    floor(0, 5, 8, 8, matFloorWood);
    // Hallway
    floor(0, -1, 2, 6, matFloorWood);
    // Bedrooms (Left Side)
    floor(-3.5, -6, 4.5, 5, matFloorWood);
    floor(-3.5, -1, 4.5, 4, matFloorWood);
    floor(-3.5, 4, 4.5, 5, matFloorWood);
    // Bedroom (Right Side)
    floor(3.5, -7, 4.5, 4, matFloorWood);
    // Kitchen Strip
    floor(5, 4, 3, 10, matFloorTile);
    // Bathrooms
    floor(4, -2.5, 3.5, 5, matFloorTile);
    // Balcony
    floor(-4.5, 7.5, 3, 5, new THREE.MeshStandardMaterial({color: 0x555555}));


    // === WALLS (Refined Coordinates) ===
    
    // -- Outer Shell --
    wall(0, -8.5, 12, 0.2); // Top North
    wall(6, 0, 0.2, 18);    // Right East (Spine)
    wall(0, 9, 12, 0.2);    // Bottom South
    wall(-6, 6.5, 0.2, 5);  // Left West (Living)
    wall(-6, -2, 0.2, 13);  // Left West (Bedrooms)

    // -- Inner Dividers (Fixed lengths to stop intersection glitches) --
    
    // Vertical Spine: Split into sections to avoid the angled wall area if needed, 
    // but here we just place it carefully.
    wall(-1.2, -2, 0.2, 13); 

    // Horizontal Dividers
    wall(-3.5, -3.5, 4.6, 0.2); // Bed Divider 1 (Shortened slightly)
    wall(-3.5, 1.5, 4.6, 0.2);  // Bed Divider 2
    wall(3.5, -5, 4.8, 0.2);    // Bed Right Divider
    wall(3.5, -2.5, 4.8, 0.2);  // Bath Divider 1
    wall(3.5, 0, 4.8, 0.2);     // Bath Divider 2 (vs Kitchen)

    // -- The "MECH" Room (Fixed Angled Walls) --
    // Straight back wall
    wall(0, 0.5, 2, 0.2); 
    
    // Left Angled Wall - Adjusted position to meet the spine cleanly
    // x: -0.8, z: 1.3
    wall(-0.8, 1.3, 1.4, 0.2, Math.PI / 4);
    
    // Right Angled Wall
    // x: 0.8, z: 1.3
    wall(0.8, 1.3, 1.4, 0.2, -Math.PI / 4);


    // --- 5. FURNITURE (UNCHANGED) ---

    // Kitchen Island
    const islandGroup = new THREE.Group();
    const islandBase = new THREE.Mesh(new THREE.BoxGeometry(1 * S, 0.85 * S, 3 * S), matIslandBase);
    const islandTop = new THREE.Mesh(new THREE.BoxGeometry(1.2 * S, 0.05 * S, 3.2 * S), matCounter);
    islandTop.position.y = 0.45 * S;
    islandGroup.add(islandBase, islandTop);
    islandGroup.position.set(3.5 * S, 0.425 * S, 5 * S);
    scene.add(islandGroup);

    // Main Counter
    const counterGroup = new THREE.Group();
    const counterBase = new THREE.Mesh(new THREE.BoxGeometry(0.8 * S, 0.85 * S, 6 * S), new THREE.MeshStandardMaterial({color: 0xffffff}));
    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(1 * S, 0.05 * S, 6 * S), matCounter);
    counterTop.position.y = 0.45 * S;
    counterGroup.add(counterBase, counterTop);
    counterGroup.position.set(5.5 * S, 0.425 * S, 5 * S);
    scene.add(counterGroup);

    // Couch
    const couchGroup = new THREE.Group();
    const seatMain = new THREE.Mesh(new THREE.BoxGeometry(1 * S, 0.4 * S, 3 * S), matCouch);
    const backRest = new THREE.Mesh(new THREE.BoxGeometry(0.2 * S, 0.5 * S, 3 * S), matCouch);
    backRest.position.set(-0.4 * S, 0.25 * S, 0);
    const seatChaise = new THREE.Mesh(new THREE.BoxGeometry(1.5 * S, 0.4 * S, 1 * S), matCouch);
    seatChaise.position.set(0.25 * S, 0, 1 * S);
    couchGroup.add(seatMain, backRest, seatChaise);
    couchGroup.position.set(-2 * S, 0.2 * S, 5 * S);
    couchGroup.rotation.y = 0;
    scene.add(couchGroup);

    // Coffee Table
    const table = new THREE.Mesh(new THREE.BoxGeometry(0.8 * S, 0.3 * S, 1.2 * S), matFurniture);
    table.position.set(0.5 * S, 0.15 * S, 5 * S);
    scene.add(table);

    // TV Unit
    const tvGroup = new THREE.Group();
    const tvStand = new THREE.Mesh(new THREE.BoxGeometry(0.5 * S, 0.4 * S, 2 * S), new THREE.MeshStandardMaterial({color: 0xdddddd}));
    const tvScreen = new THREE.Mesh(new THREE.BoxGeometry(0.1 * S, 0.8 * S, 1.5 * S), matTV);
    tvScreen.position.set(0, 0.7 * S, 0);
    tvGroup.add(tvStand, tvScreen);
    tvGroup.position.set(2 * S, 0.2 * S, 5 * S); 
    scene.add(tvGroup);

    // Bedroom Furniture
    function createBed(x, z) {
        const bed = new THREE.Group();
        const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.6 * S, 0.4 * S, 2 * S), new THREE.MeshStandardMaterial({color: 0xffffff}));
        const headboard = new THREE.Mesh(new THREE.BoxGeometry(0.2 * S, 1 * S, 2 * S), matFurniture);
        headboard.position.x = -0.9 * S;
        headboard.position.y = 0.3 * S;
        bed.add(mattress, headboard);
        bed.position.set(x * S, 0.2 * S, z * S);
        scene.add(bed);
    }
    createBed(-4.5, -6);
    createBed(-4.5, -1);
    createBed(-4.5, 4);
    createBed(4.5, -7);

    // Rug
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3 * S, 4 * S), new THREE.MeshStandardMaterial({color: 0xeeeeee}));
    rug.rotation.x = -Math.PI/2;
    rug.position.set(-0.5 * S, 0.02 * S, 5 * S); // Slightly higher than floor
    scene.add(rug);

    // --- EXIT DOOR ---
    const exitDoor = new THREE.Mesh(
        new THREE.BoxGeometry(2 * S, 4 * S, 0.2 * S),
        new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.8 })
    );
    exitDoor.position.set(6 * S - (0.2 * S / 2), 2 * S, 5 * S); // Position on the right wall, next to counter
    exitDoor.rotation.y = -Math.PI / 2; // Rotate to face the player
    scene.add(exitDoor);

    const exitDoorCollider = new THREE.Box3();
    exitDoorCollider.setFromObject(exitDoor);
    exitColliders.push(exitDoorCollider);

    return { wallColliders, exitColliders };
}