import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonify, noOutline, pickHouse, pickRoof, TOON_RAMP } from './materials.js';

// --- stylized house builder helpers (merged vertex-colored geometry = 1 draw call/house) ---
function _paint(geo, hex) {
    const c = new THREE.Color(hex);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    return geo;
}
function _part(geo, hex) { return _paint(geo.index ? geo.toNonIndexed() : geo, hex); }
function _gableRoof(w, d, rh) {
    const hw = w / 2, hd = d / 2;
    const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [0, rh, -hd], D = [-hw, 0, hd], E = [hw, 0, hd], F = [0, rh, hd];
    const t = (...p) => p.flat();
    const v = [...t(A, B, C), ...t(D, F, E), ...t(A, C, F), ...t(A, F, D), ...t(B, E, F), ...t(B, F, C)];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
}
function makeBlade() {
    const h = 0.85, bw = 0.05, bend = 0.28;
    const m = h * 0.5, mb = bend * 0.4, mw = bw * 0.55;
    const P = [
        -bw, 0, 0, bw, 0, 0, mw, m, mb,
        -bw, 0, 0, mw, m, mb, -mw, m, mb,
        -mw, m, mb, mw, m, mb, 0, h, bend,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const cols = [];
    for (let i = 0; i < P.length; i += 3) { const ao = 0.62 + (P[i + 1] / h) * 0.38; cols.push(ao, ao, ao); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return g;
}
function makeTuft() {
    const blades = [];
    for (let i = 0; i < 3; i++) {
        const b = makeBlade();
        b.rotateY(i * 2.1 + Math.random() * 0.7);
        b.rotateZ((Math.random() - 0.5) * 0.35);
        blades.push(b);
    }
    return mergeGeometries(blades, false);
}

// --- day/night grading (§09): sky/light/fog palettes keyed by sun height (-1..1) ---
const DAY_LENGTH = 300;   // seconds for a full sun cycle (slow + ambient)
const SUN_AZ = 2.35;      // fixed compass azimuth the sun arcs along
const _SKY_NIGHT = { zen: 0x0a1230, hor: 0x1b2846, sun: 0x9fb4e6, fog: 0x131d33, dir: 0x9fb4e6, dirI: 0.30, hemiS: 0x2b3b64, hemiG: 0x171f33, hemiI: 0.35 };
const _SKY_DUSK  = { zen: 0x33508e, hor: 0xff9d5c, sun: 0xffb066, fog: 0xdf9f77, dir: 0xffb076, dirI: 1.05, hemiS: 0x8ea6d6, hemiG: 0x6b5f43, hemiI: 0.50 };
const _SKY_DAY   = { zen: 0x6ba0dd, hor: 0xf3ead9, sun: 0xfff2d6, fog: 0xf3ead9, dir: 0xffffff, dirI: 1.50, hemiS: 0xbcd4ff, hemiG: 0x6b7f4a, hemiI: 0.60 };
const _smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _gz = new THREE.Color(), _gh = new THREE.Color(), _gs = new THREE.Color(), _gf = new THREE.Color(), _gd = new THREE.Color(), _ghs = new THREE.Color(), _ghg = new THREE.Color(), _gtmp = new THREE.Color();
const _grade = { zen: _gz, hor: _gh, sun: _gs, fog: _gf, dir: _gd, hemiS: _ghs, hemiG: _ghg, dirI: 1.5, hemiI: 0.6 };
function gradeSky(s) {
    let a, b, f;
    if (s <= -0.2) { a = b = _SKY_NIGHT; f = 0; }
    else if (s < 0.05) { a = _SKY_NIGHT; b = _SKY_DUSK; f = _smooth(-0.2, 0.05, s); }
    else if (s < 0.35) { a = _SKY_DUSK; b = _SKY_DAY; f = _smooth(0.05, 0.35, s); }
    else { a = b = _SKY_DAY; f = 1; }
    _gz.setHex(a.zen).lerp(_gtmp.setHex(b.zen), f);
    _gh.setHex(a.hor).lerp(_gtmp.setHex(b.hor), f);
    _gs.setHex(a.sun).lerp(_gtmp.setHex(b.sun), f);
    _gf.setHex(a.fog).lerp(_gtmp.setHex(b.fog), f);
    _gd.setHex(a.dir).lerp(_gtmp.setHex(b.dir), f);
    _ghs.setHex(a.hemiS).lerp(_gtmp.setHex(b.hemiS), f);
    _ghg.setHex(a.hemiG).lerp(_gtmp.setHex(b.hemiG), f);
    _grade.dirI = a.dirI + (b.dirI - a.dirI) * f;
    _grade.hemiI = a.hemiI + (b.hemiI - a.hemiI) * f;
    return _grade;
}

export function getTerrainHeightAt(x, z) {
    // flat neighborhood CORE, rolling hills toward the EDGES. the core (the main play area +
    // roads) stays perfectly flat so movement is clean; the outer ring has real xyz terrain that
    // entities follow correctly (the player's jump physics snap up onto rising ground and fall
    // off drops, so no more sink/float jank). openness ramps 0 in the core -> 1 far out.
    const r = Math.hypot(x, z);
    const openness = Math.min(1, Math.max(0, (r - 78) / 55));
    if (openness <= 0) return 0;
    const base = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 6;
    const big = Math.sin(x * 0.019 + 0.6) * Math.cos(z * 0.022 - 0.4) * 14;
    const detail = Math.sin(x * 0.13) * Math.cos(z * 0.11 + 1.1) * 2.2;
    return (base + big + detail) * openness;
}

export function createWorld(scene) {
    const wallColliders = [];
    const houseEntryColliders = [];

    // --- 1. ATMOSPHERE & LIGHTING ---
    // gradient sky dome (view-based, far-plane pinned) replaces the washed physical sky.
    const HORIZON = new THREE.Color(0xf3ead9);
    const ZENITH = new THREE.Color(0x6ba0dd);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(58), THREE.MathUtils.degToRad(135));
    const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
        uniforms: {
            uZenith: { value: ZENITH }, uHorizon: { value: HORIZON },
            uSunDir: { value: sunDir.clone() }, uSunCol: { value: new THREE.Color(0xfff2d6) },
        },
        vertexShader: `varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
        fragmentShader: `varying vec3 vW; uniform vec3 uZenith,uHorizon,uSunCol,uSunDir; void main(){ vec3 d = normalize(vW - cameraPosition); float h = clamp(d.y * 1.3 + 0.08, 0.0, 1.0); vec3 c = mix(uHorizon, uZenith, pow(h, 0.55)); float s = max(dot(d, normalize(uSunDir)), 0.0); c += uSunCol * (pow(s, 260.0) + pow(s, 8.0) * 0.22); gl_FragColor = vec4(c, 1.0); }`,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16), skyMat);
    dome.frustumCulled = false;
    dome.renderOrder = -1;
    noOutline(skyMat);
    scene.add(dome);

    // hemisphere fill (sky/ground bounce) instead of flat ambient - stops toon
    // shadow bands from going dead grey and adds free color grading.
    const hemiLight = new THREE.HemisphereLight(0xbcd4ff, 0x6b7f4a, 0.6);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.copy(sunDir).multiplyScalar(150);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.left = -150;
    dirLight.shadow.camera.right = 150;
    dirLight.shadow.camera.top = 150;
    dirLight.shadow.camera.bottom = -150;
    dirLight.shadow.bias = -0.0001;
    dirLight.shadow.normalBias = 0.03;
    dirLight.shadow.radius = 3.5;
    scene.add(dirLight);

    // (sun direction is fixed above; the dome and dirLight both use sunDir)

    // stylized drifting clouds (cheap camera-facing billboards, fog-exempt, no outline)
    function makeCloudTexture() {
        const c = document.createElement('canvas'); c.width = 128; c.height = 128;
        const cx2 = c.getContext('2d');
        for (let i = 0; i < 6; i++) {
            const x = 28 + Math.random() * 72, y = 44 + Math.random() * 40, r = 18 + Math.random() * 30;
            const g = cx2.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(255,255,255,0.95)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            cx2.fillStyle = g; cx2.beginPath(); cx2.arc(x, y, r, 0, Math.PI * 2); cx2.fill();
        }
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    }
    const cloudTex = makeCloudTexture();
    const clouds = [];
    for (let i = 0; i < 12; i++) {
        const cm = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
        cm.userData.outlineParameters = { visible: false };
        const s = new THREE.Sprite(cm);
        s.frustumCulled = false;
        s.userData.baseX = (Math.random() - 0.5) * 380;
        s.userData.driftX = 1.2 + Math.random() * 2.2;
        s.position.set(s.userData.baseX, 58 + Math.random() * 34, (Math.random() - 0.5) * 380);
        const sc = 55 + Math.random() * 55; s.scale.set(sc, sc * 0.6, 1);
        scene.add(s); clouds.push(s);
    }

    // night starfield (fades in after dusk) - screen-constant points high on the dome
    const starN = 700;
    const starGeo = new THREE.BufferGeometry();
    const sPos = new Float32Array(starN * 3);
    const _sv = new THREE.Vector3();
    for (let i = 0; i < starN; i++) {
        _sv.randomDirection().multiplyScalar(560);
        sPos[i * 3] = _sv.x; sPos[i * 3 + 1] = Math.abs(_sv.y) * 0.85 + 30; sPos[i * 3 + 2] = _sv.z;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    noOutline(starMat);
    const stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false; stars.renderOrder = -0.5;
    scene.add(stars);

    // drifting ambient motes (pollen by day) - gentle floating specks that catch the light (§17)
    const moteN = 150;
    const moteGeo = new THREE.BufferGeometry();
    const motePos = new Float32Array(moteN * 3);
    const moteBase = [];
    for (let i = 0; i < moteN; i++) {
        const bx = (Math.random() - 0.5) * 270, by = 3 + Math.random() * 34, bz = (Math.random() - 0.5) * 270, ph = Math.random() * 6.28;
        moteBase.push({ bx, by, bz, ph });
        motePos[i * 3] = bx; motePos[i * 3 + 1] = by; motePos[i * 3 + 2] = bz;
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    const moteMat = new THREE.PointsMaterial({ color: 0xfff6d8, size: 0.5, transparent: true, opacity: 0.3, depthWrite: false, fog: true });
    noOutline(moteMat);
    const motes = new THREE.Points(moteGeo, moteMat);
    motes.frustumCulled = false;
    scene.add(motes);


    // --- 2. TERRAIN ---
    function createGrassTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext('2d');
        
        context.fillStyle = 'rgb(40, 80, 40)';
        context.fillRect(0, 0, 512, 512);
        
        for (let i = 0; i < 20000; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const length = Math.random() * 10 + 5;
            const angle = Math.random() * Math.PI * 2;
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
            const brightness = Math.random() * 0.2 + 0.8;
            context.strokeStyle = `rgba(60, 120, 60, ${brightness})`;
            context.stroke();
        }
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;   // color map; without this the ground reads desaturated
        return tex;
    }

    // high segment count so the visual ground closely matches getTerrainHeightAt on the hills;
    // a coarse mesh flat-interpolates between vertices and entities (which sample the exact
    // height) then appear to sink/float on slopes.
    const groundGeo = new THREE.PlaneGeometry(500, 500, 256, 256);
    
    // Slight uneven terrain
    const posAttribute = groundGeo.attributes.position;
    for (let i = 0; i < posAttribute.count; i++) {
        const x = posAttribute.getX(i);
        const y = posAttribute.getY(i);
        const z = getTerrainHeightAt(x, y); 
        posAttribute.setZ(i, z);
    }
    groundGeo.computeVertexNormals();

    // per-vertex ground color variation: grass patches + dirt near roads + height tint
    const gColors = [];
    const gTmp = new THREE.Color();
    const gp = groundGeo.attributes.position;
    for (let i = 0; i < gp.count; i++) {
        const vx = gp.getX(i), vy = gp.getY(i), h = gp.getZ(i);
        if (Math.abs(vx) < 13 || Math.abs(vy) < 13) {
            gTmp.setHex(0xa89066);                 // dirt shoulder near the roads
        } else {
            const n = Math.sin(vx * 0.13) * Math.cos(vy * 0.11) * 0.5 + 0.5; // 0..1 patchiness
            gTmp.setHSL(0.30 - n * 0.05, 0.40 + n * 0.14, 0.52 + h * 0.012 + n * 0.06);
        }
        gColors.push(gTmp.r, gTmp.g, gTmp.b);
    }
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(gColors, 3));

    const grassTexture = createGrassTexture();
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(100, 100);

    const groundMat = new THREE.MeshStandardMaterial({ 
        map: grassTexture, 
        roughness: 0.8,
        flatShading: false
    });
    const floor = new THREE.Mesh(groundGeo, groundMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);


    // --- 3. MASSIVE GRASS SYSTEM (InstancedMesh for Performance) ---
    const grassCount = 11000;
    const grassGeo = makeTuft();
    const grassMat = new THREE.MeshToonMaterial({ color: 0x9ccb6f, vertexColors: true, gradientMap: TOON_RAMP, side: THREE.DoubleSide });
    const grassField = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    
    const dummy = new THREE.Object3D();
    const gcol = new THREE.Color();
    for (let i = 0; i < grassCount; i++) {
        const x = (Math.random() - 0.5) * 400;
        const z = (Math.random() - 0.5) * 400;
        dummy.position.set(x, getTerrainHeightAt(x, z), z);

        // hide grass on the roads (center strips) with a zero-scale instance
        if(Math.abs(dummy.position.x) < 22 || Math.abs(dummy.position.z) < 22) {
            dummy.scale.setScalar(0);
            dummy.updateMatrix();
            grassField.setMatrixAt(i, dummy.matrix);
            continue;
        }

        dummy.scale.setScalar(0.5 + Math.random() * 0.6);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.rotation.x = (Math.random() - 0.5) * 0.2; // Random tilt
        dummy.updateMatrix();
        grassField.setMatrixAt(i, dummy.matrix);
        grassField.setColorAt(i, gcol.setScalar(0.72 + Math.random() * 0.33)); // per-blade brightness variation
    }
    grassField.receiveShadow = true;
    if (grassField.instanceColor) grassField.instanceColor.needsUpdate = true;
    scene.add(grassField);

    // --- 4. ROADS & SIDEWALKS ---
    const roadGroup = new THREE.Group();
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x646973, roughness: 0.9 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x999999 });

    function createRoadSegment(w, h, x, z) {
        // Asphalt
        const roadGeo = new THREE.PlaneGeometry(w, h, 50, 10);
        const r = new THREE.Mesh(roadGeo, roadMat);
        
        const pos = r.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const worldX = pos.getX(i) + x;
            const worldZ = pos.getY(i) + z; // Plane's y corresponds to world z
            pos.setZ(i, getTerrainHeightAt(worldX, worldZ) + 0.3); // Set plane's z (world y)
        }
        r.geometry.computeVertexNormals();

        r.rotation.x = -Math.PI/2;
        r.position.set(x, 0, z); // Position is handled by vertex manipulation, but set group position
        r.receiveShadow = true;
        roadGroup.add(r);

        // Sidewalk curbs
        const curbHeight = 0.2;
        const curbWidth = 1;
        const curbSegmentLength = 5;

        if (w > h) { // Horizontal road
            const numSegments = Math.floor(w / curbSegmentLength);
            for(let i = 0; i < numSegments; i++) {
                const segX = x - w/2 + (i + 0.5) * curbSegmentLength;
                
                // Top curb
                const z1 = z - h/2 - curbWidth/2;
                const y1 = getTerrainHeightAt(segX, z1) + curbHeight/2;
                const curb1 = new THREE.Mesh(new THREE.BoxGeometry(curbSegmentLength, curbHeight, curbWidth), sidewalkMat);
                curb1.position.set(segX, y1, z1);
                roadGroup.add(curb1);

                // Bottom curb
                const z2 = z + h/2 + curbWidth/2;
                const y2 = getTerrainHeightAt(segX, z2) + curbHeight/2;
                const curb2 = new THREE.Mesh(new THREE.BoxGeometry(curbSegmentLength, curbHeight, curbWidth), sidewalkMat);
                curb2.position.set(segX, y2, z2);
                roadGroup.add(curb2);
            }
        } else { // Vertical road
            const numSegments = Math.floor(h / curbSegmentLength);
             for(let i = 0; i < numSegments; i++) {
                const segZ = z - h/2 + (i + 0.5) * curbSegmentLength;

                // Left curb
                const x1 = x - w/2 - curbWidth/2;
                const y1 = getTerrainHeightAt(x1, segZ) + curbHeight/2;
                const curb1 = new THREE.Mesh(new THREE.BoxGeometry(curbWidth, curbHeight, curbSegmentLength), sidewalkMat);
                curb1.position.set(x1, y1, segZ);
                roadGroup.add(curb1);

                // Right curb
                const x2 = x + w/2 + curbWidth/2;
                const y2 = getTerrainHeightAt(x2, segZ) + curbHeight/2;
                const curb2 = new THREE.Mesh(new THREE.BoxGeometry(curbWidth, curbHeight, curbSegmentLength), sidewalkMat);
                curb2.position.set(x2, y2, segZ);
                roadGroup.add(curb2);
            }
        }
    }

    createRoadSegment(400, 20, 0, 0); 
    createRoadSegment(20, 400, 0, 0);
    scene.add(roadGroup);

    // house materials (per-world so scene-swap disposal is clean); toon so toonify() skips them
    const HOUSE_BODY_MAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: TOON_RAMP });
    const HOUSE_GLASS_MAT = new THREE.MeshToonMaterial({ color: 0xdfeaf5, emissive: 0xffe6a8, emissiveIntensity: 0.35, gradientMap: TOON_RAMP });
    noOutline(HOUSE_GLASS_MAT);
    function buildHouse(w, h, d) {
        const bodyHex = pickHouse(), roofHex = pickRoof(), trimHex = 0xf3ece0;
        const opaque = [], glass = [];
        opaque.push(_part(new THREE.BoxGeometry(w + 0.4, 1.0, d + 0.4).translate(0, 0.5, 0), 0x6f6559));      // foundation
        opaque.push(_part(new THREE.BoxGeometry(w, h, d).translate(0, h / 2 + 0.6, 0), bodyHex));             // walls
        opaque.push(_part(new THREE.BoxGeometry(w + 0.15, 0.4, d + 0.15).translate(0, h + 0.5, 0), trimHex)); // eave trim
        opaque.push(_part(_gableRoof(w + 0.8, d + 0.8, Math.max(w, d) * 0.36).translate(0, h + 0.6, 0), roofHex));
        opaque.push(_part(new THREE.BoxGeometry(0.9, h * 0.4 + 1.5, 0.9).translate(w * 0.25, h + 1.2, -d * 0.15), 0x7a6a5a)); // chimney
        // front door + frame (protruding so the outline inks it)
        const dw = 1.6, dh = 3.2, dy = dh / 2 + 0.6;
        opaque.push(_part(new THREE.BoxGeometry(dw + 0.4, dh + 0.35, 0.25).translate(0, dy, d / 2 + 0.13), trimHex));
        opaque.push(_part(new THREE.BoxGeometry(dw, dh, 0.2).translate(0, dy, d / 2 + 0.22), 0x5a4a3a));
        // windows: protruding trim frame + emissive glass pane
        const winY = h * 0.55 + 0.6;
        const addWin = (x, y, z, ry) => {
            const f = new THREE.BoxGeometry(1.5, 1.5, 0.22); if (ry) f.rotateY(ry); f.translate(x, y, z);
            opaque.push(_part(f, trimHex));
            const g = new THREE.BoxGeometry(1.1, 1.1, 0.14); if (ry) g.rotateY(ry); g.translate(x, y, z);
            glass.push(g);
        };
        addWin(-w * 0.28, winY, d / 2 + 0.11, 0);
        addWin(w * 0.28, winY, d / 2 + 0.11, 0);
        addWin(w / 2 + 0.11, winY, d * 0.15, Math.PI / 2);
        addWin(-w / 2 - 0.11, winY, -d * 0.15, Math.PI / 2);
        addWin(0, winY, -d / 2 - 0.11, Math.PI);
        const bodyMesh = new THREE.Mesh(mergeGeometries(opaque, false), HOUSE_BODY_MAT);
        bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
        const glassMesh = new THREE.Mesh(mergeGeometries(glass, false), HOUSE_GLASS_MAT);
        const group = new THREE.Group();
        group.add(bodyMesh, glassMesh);
        group.userData.bodyMesh = bodyMesh;
        return group;
    }

    // --- 5. PROCEDURAL TREES & HOUSES ---
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 3, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
    const leavesGeo = new THREE.IcosahedronGeometry(2.5, 0);
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, flatShading: true });

    // Decorations
    const hydrantGeo = new THREE.CylinderGeometry(0.3, 0.3, 1, 8);
    const hydrantMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });

    const spawnedObjects = [];

    const interactables = [];
    for(let i=0; i<125; i++) {
        let x, z, dist, validPosition;
        
        do {
            validPosition = true;
            x = (Math.random() - 0.5) * 360;
            z = (Math.random() - 0.5) * 360;

            for (const obj of spawnedObjects) {
                dist = new THREE.Vector2(x, z).distanceTo(new THREE.Vector2(obj.x, obj.z));
                if (dist < obj.radius) {
                    validPosition = false;
                    break;
                }
            }
        } while (!validPosition);


        // Avoid roads
        if(Math.abs(x) < 15 || Math.abs(z) < 15) continue;
        
        const type = Math.random();
        const y = getTerrainHeightAt(x, z);

        if (type > 0.4) {
            // -- HOUSE --
            const w = 8 + Math.random() * 8;
            const h = 8 + Math.random() * 6;
            const d = 8 + Math.random() * 8;

            spawnedObjects.push({ x, z, radius: Math.max(w, d) + 5 });
            
            const houseGroup = buildHouse(w, h, d);
            houseGroup.position.set(x, y, z);
            // Random rotation 0, 90, 180, 270
            houseGroup.rotation.y = Math.floor(Math.random() * 4) * (Math.PI/2);
            
            // Force update of world matrix for correct door collider position
            houseGroup.updateMatrixWorld(true);

            scene.add(houseGroup);
            const wallBox = new THREE.Box3().setFromObject(houseGroup.userData.bodyMesh);
            wallBox.min.y -= 8;   // extend down so downhill approaches on the new hills still collide
            wallColliders.push(wallBox);

            // door trigger: sit it on the door's OWN ground (hills) + tall enough to span slope
            const doorCollider = new THREE.Box3();
            const doorPosition = new THREE.Vector3(0, 2, d/2);
            doorPosition.applyMatrix4(houseGroup.matrixWorld);
            doorPosition.y = getTerrainHeightAt(doorPosition.x, doorPosition.z) + 2;
            doorCollider.setFromCenterAndSize(doorPosition, new THREE.Vector3(2.5, 12, 2.5));
            houseEntryColliders.push(doorCollider);
            interactables.push({ type: 'house', position: doorPosition.clone(), radius: 3, object: houseGroup });

        } else if (type > 0.1) {
            // -- TREE --
            spawnedObjects.push({ x, z, radius: 5 });

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
            treeGroup.position.set(x, y, z);
            treeGroup.scale.setScalar(1 + Math.random() * 0.5);
            scene.add(treeGroup);
            wallColliders.push(new THREE.Box3().setFromObject(trunk));
            interactables.push({ type: 'tree', position: new THREE.Vector3(x, y, z), radius: 2.5 * treeGroup.scale.x, object: treeGroup });
        } else {
            // -- FIRE HYDRANT --
            spawnedObjects.push({ x, z, radius: 2 });

            const hydrant = new THREE.Mesh(hydrantGeo, hydrantMat);
            hydrant.position.set(x, y + 0.5, z);
            hydrant.castShadow = true;
            scene.add(hydrant);
            wallColliders.push(new THREE.Box3().setFromObject(hydrant));   // was missing - dog phased through hydrants
            interactables.push({ type: 'hydrant', position: hydrant.position.clone(), radius: 1.5, object: hydrant });
        }
    }

    // atmosphere + one-shot cel conversion of everything built above
    scene.fog = new THREE.FogExp2(0xf3ead9, 0.0055);
    toonify(scene);
    noOutline(floor.material);          // don't outline the 500u ground plane
    noOutline(grassField.material);     // don't outline 8000 grass instances
    floor.material.vertexColors = true; // use the per-vertex ground color variation

    // grass wind: sway blade tips via a per-instance-phased vertex offset (§13)
    const windUniform = { value: 0 };
    grassField.material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = windUniform;
        shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float _phase = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.35;
            float _sway = sin(uTime * 1.8 + _phase) * 0.14 * (position.y + 0.4);
            transformed.x += _sway;
            transformed.z += _sway * 0.5;`
        );
    };

    // live per-frame handle (§05): lets the loop drive wind + cloud drift + day/night + weather.
    let phaseOverride = null;   // test hook: pin the time of day
    const moteArr = moteGeo.attributes.position.array;
    return {
        wallColliders, houseEntryColliders, interactables,
        setPhaseOverride(p) { phaseOverride = p; },
        update(t) {
            windUniform.value = t;
            for (const c of clouds) c.position.x = ((c.userData.baseX + t * c.userData.driftX + 190) % 380) - 190;

            // day/night: arc the sun, regrade sky/fog/lights, fade stars in + motes out at night
            const phase = phaseOverride != null ? phaseOverride : ((0.22 + t / DAY_LENGTH) % 1);
            const theta = phase * Math.PI * 2;
            const sunH = Math.sin(theta);
            sunDir.set(Math.cos(SUN_AZ) * Math.cos(theta), sunH, Math.sin(SUN_AZ) * Math.cos(theta)).normalize();
            const g = gradeSky(sunH);
            skyMat.uniforms.uZenith.value.copy(g.zen);
            skyMat.uniforms.uHorizon.value.copy(g.hor);
            skyMat.uniforms.uSunCol.value.copy(g.sun);
            skyMat.uniforms.uSunDir.value.copy(sunDir);
            dirLight.color.copy(g.dir);
            dirLight.intensity = g.dirI;
            dirLight.position.copy(sunDir).multiplyScalar(150);
            hemiLight.color.copy(g.hemiS);
            hemiLight.groundColor.copy(g.hemiG);
            hemiLight.intensity = g.hemiI;
            if (scene.fog) scene.fog.color.copy(g.fog);

            const daylight = _smooth(-0.05, 0.35, sunH);
            starMat.opacity = (1 - _smooth(-0.2, 0.12, sunH)) * 0.9;
            moteMat.opacity = 0.12 + daylight * 0.32;
            for (let i = 0; i < moteN; i++) {
                const b = moteBase[i];
                moteArr[i * 3] = b.bx + Math.sin(t * 0.3 + b.ph) * 3;
                moteArr[i * 3 + 1] = b.by + Math.sin(t * 0.5 + b.ph * 1.7) * 1.6;
                moteArr[i * 3 + 2] = b.bz + Math.cos(t * 0.25 + b.ph) * 3;
            }
            moteGeo.attributes.position.needsUpdate = true;
        },
    };
}