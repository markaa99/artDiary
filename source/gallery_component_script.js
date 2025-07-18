// Path to JSON file containing the image list
const imageListFile = 'data/gallery.json';


import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// test SSAO
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

// for anti aliasing pass (not used for now)
//import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
//import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';


// Tween.js: for animations
// Tween.js is loaded globally from the CDN script tag
const TWEEN = window.TWEEN;



let scene, camera, renderer, controls;

let paintings = [];
let currentFocusedPainting = null; // currently focused painting
let placedPaintings = []; // Array to store manually placed paintings

let isCameraAnimating = false;

let originalCameraPosition = new THREE.Vector3();
let originalControlsTarget = new THREE.Vector3();

// units are in meters

let cameraStartZ = 5;

// to append SSAO effect rendering pass
let composer;

// light following camera movements
let headlight;

// --- background setup ---
let floorSize = { width: 10, depth: 5 };    
let wallHeight = 5;                         
const floorColor = 0x888888;
const wallColor = 0xaaaaaa;

// --- shared materials ---
let frameMaterial = null;       // material for frame
let passpartoutMaterial = null; // material for pass-partout (mat)


/*
// SPIRAL POSITIONIERUNG TEMPORÄR AUSKOMMENTIERT - Noch in Entwicklung
function calculateSpiralPosition(index, totalPaintings) {
    // Guggenheim spiral parameters (should match createGuggenheimScene)
    const innerRadius = 10;
    const outerRadius = 20;
    const galleryHeight = 15;
    const turns = 2.5;
    const wallHeight = 5.0;

    // Calculate position along the spiral
    const progress = index / totalPaintings;
    const angle = progress * turns * 2 * Math.PI;
    const currentHeight = progress * galleryHeight;
    
    // Position paintings on the outer wall, slightly inward
    const paintingRadius = outerRadius - 0.5; // 0.5m from the wall
    const paintingX = paintingRadius * Math.cos(angle);
    const paintingZ = paintingRadius * Math.sin(angle);
    const paintingY = currentHeight + paintingBaseSize.height / 2 + 0.5; // Slightly above the ramp
    
    // Calculate rotation to face inward
    const rotationY = angle + Math.PI; // Face toward center
    
    return {
        position: new THREE.Vector3(paintingX, paintingY, paintingZ),
        rotation: rotationY
    };
}
*/

// --- UI elements (HTML Overlay) ---
let galleryContainerElement; // Reference to the container div
let tooltipElement;
let actionsPanelElement;
let countdownDisplayElement;
let actionBtn1, actionBtn2, actionBtn3, actionBtn4, actionBtn5;
let focusedElementDescription;
let imageUploadInput; // File input for image upload
let descriptionEditTextarea; // Textarea for description editing
let descriptionButtons; // Container for description edit buttons
let saveDescriptionBtn, cancelDescriptionBtn; // Description edit buttons
let isEditingDescription = false; // Flag to track if description is being edited

// --- raycasting ---
const raycaster = new THREE.Raycaster();

// stores mouse pos relative to container
const mouse = new THREE.Vector2();


// --- auto panning Config (not used for now) ---
let isAutoPanning = false;
let panSpeedFactor = 0.02;
let panZoneThreshold = 0.2;
let currentPanSpeedX = 0;

// --- WASD movement controls ---
let moveSpeed = 0.1; // Movement speed in meters per frame
let sprintMultiplier = 2.5; // Speed multiplier when holding Shift
let keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    q: false,  // Move down
    e: false,  // Move up
    shift: false
};


// --- paintings set configuration ---
const paintingBaseSize = { width: 1, height: .8 };
const spacing = .8;
const paintingsPerRow = 11;
const panelHeightPx = 40;
const cameraFocusDistance = .8;
const cameraAnimationDuration_ms = 700; // Millisecondi


// --- inactivity timer ---
// to hide action panel after a time interval
let inactivityTimer = null; // inactivity timer
const inactivityTimeoutDuration = 1000; // hide panel after n ms of inactivity
let panelFadeTween; // panel fade animation
let panelFadeDuration_ms = 500; // panel fade duration


let debugDiv; // used to show debug infos (like timer countdown)

async function init()
{
    galleryContainerElement = document.getElementById('galleryContainer');
    if (!galleryContainerElement) {
        console.error("Gallery container div not found!");
        return;
    }

    // main scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202025); // set to null for transparent if desired
    
    const width = galleryContainerElement.clientWidth;
    const height = galleryContainerElement.clientHeight;
    const ar = width / height;
    camera = new THREE.PerspectiveCamera(75, ar, 0.1, 1000);
    camera.position.set(0, paintingBaseSize.height / 2 + .2, cameraStartZ); // start position
    

    //const canvas = document.getElementById('galleryCanvas');

    // --- renderer ---
    //renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    // enable shadows in renderer (we have to enable them also for each light and objects that cast shadows)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap; // Variance Shadow Maps

    // --- add SSAO ---
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    
    const ssaoPass = new SSAOPass(scene, camera);
    ssaoPass.radius = 10;
    ssaoPass.onlyAO = false; // true = show only AO
    composer.addPass(ssaoPass);

    // since we use the composer, antialias flag set in renderer does not work anymore
    // so we should add a dedicated pass for antialiasing
    // add FXAA antialiasing pass (last step before final output)
    // i disable it for now, since textures become too blurry when activated
    //const fxaaPass = new ShaderPass(FXAAShader);
    //fxaaPass.uniforms['resolution'].value.set(1.0 / width, 1.0 / height);
    //composer.addPass(fxaaPass);
    // -------------------------------

    galleryContainerElement.appendChild(renderer.domElement); // append canvas to container


    // --- lighting ---
    setupLights();
    
    
    // --- controls ---
    // pass the renderer.domElement (the canvas) to OrbitControls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, paintingBaseSize.height / 2, 0); // initial target
    camera.lookAt(controls.target);
    
    // Configure for WASD movement + mouse look
    controls.enablePan = false; // Disable mouse panning, use WASD instead
    controls.enableZoom = true; // Keep zoom functionality
    controls.enableRotate = true; // Keep mouse rotation
    controls.maxDistance = 50; // Maximum zoom out distance
    controls.minDistance = 0.5; // Minimum zoom in distance
    
    controls.update();

    // disable right-click pan if using custom pan
    //controls.mouseButtons.RIGHT = null;

    originalCameraPosition.copy(camera.position);
    originalControlsTarget.copy(controls.target);

    // --- getting references to UI Elements (already defined inside container via HTML) ---
    tooltipElement = document.getElementById('paintingTooltip');
    actionsPanelElement = document.getElementById('paintingActionsPanel');
    actionBtn1 = document.getElementById('actionBtn1');
    actionBtn2 = document.getElementById('actionBtn2');
    actionBtn3 = document.getElementById('actionBtn3');
    actionBtn4 = document.getElementById('actionBtn4');
    actionBtn5 = document.getElementById('actionBtn5');
    countdownDisplayElement = document.getElementById('inactivityCountdown');
    focusedElementDescription = document.getElementById('paintingDescription');
    imageUploadInput = document.getElementById('imageUpload');
    descriptionEditTextarea = document.getElementById('descriptionEdit');
    descriptionButtons = document.getElementById('descriptionButtons');
    saveDescriptionBtn = document.getElementById('saveDescriptionBtn');
    cancelDescriptionBtn = document.getElementById('cancelDescriptionBtn');

    // disable action panel visibility at start
    actionsPanelElement.style.opacity = '0';
    actionsPanelElement.style.display = 'none';


    // create materials shared by more elements (like frames)
    createSharedMaterials();


    // loading paintings data
    try {
        const paintingDataArray = await fetchPaintingData();
        if (paintingDataArray && paintingDataArray.length > 0) {
            loadPaintings(paintingDataArray);
        } else { console.warn("no painting data."); }
    } catch (error) { console.error("Error while loading paintings:", error); }


    // --- add event Listeners ---
    // add resize listener now on window, but re-calculates based on container
    window.addEventListener('resize', onContainerResize, false);
    
    // mouse events should be on the renderer.domElement (the canvas)
    renderer.domElement.addEventListener('mousemove', onCanvasMouseMove, false);
    renderer.domElement.addEventListener('click', onCanvasClick, false); // to focus on a painting
    renderer.domElement.addEventListener('contextmenu', onCanvasRightClick, false); // Right click to place painting
    renderer.domElement.addEventListener('mouseleave', onCanvasMouseLeave, false); // TODO: for auto-panning

    window.addEventListener('wheel', onMouseWheel);

    // WASD keyboard controls
    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('keyup', onKeyUp, false);

    // add event listeners for click event on action panel buttons
    actionBtn1.addEventListener('click', () => handleAction('info'));
    actionBtn2.addEventListener('click', () => handleAction('video'));
    actionBtn3.addEventListener('click', () => handleAction('data'));
    actionBtn4.addEventListener('click', () => handleAction('upload'));
    actionBtn5.addEventListener('click', () => handleAction('edit'));

    // Event listener for file upload
    imageUploadInput.addEventListener('change', handleImageUpload);

    // Event listeners for description editing
    saveDescriptionBtn.addEventListener('click', saveDescription);
    cancelDescriptionBtn.addEventListener('click', cancelDescriptionEdit);
    
    // Add double-click event to description to enable editing
    focusedElementDescription.addEventListener('dblclick', startDescriptionEdit);
    
    // Add keyboard event listeners for description editing
    descriptionEditTextarea.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            cancelDescriptionEdit();
        }
        // Prevent event from bubbling up to avoid WASD interference
        event.stopPropagation();
    });
    
    descriptionEditTextarea.addEventListener('keyup', (event) => {
        // Prevent event from bubbling up to avoid WASD interference
        event.stopPropagation();
    });

    debugDiv = document.getElementById('debugDiv');

    animate();
}

function createSharedMaterials()
{
    // TODO: maybe put it in global scope and reuse the same in every place
    const textureLoader = new THREE.TextureLoader();

    // frame material
    let frameTexturePath = "./data/textures/polyhaven__dark_wood_diff_2k.jpg";
    if (frameTexturePath) {
         const frameTexture = textureLoader.load(frameTexturePath);
         frameTexture.wrapS = THREE.RepeatWrapping;
         frameTexture.wrapT = THREE.RepeatWrapping;
         frameTexture.repeat.set(2, 2);

         // TODO: add a full PBR set
         // TODO: add tangent and bitangent vectors to generated mesh
         //let normalMapPath = "./data/textures/polyhaven__dark_wood_nor_dx_2k.jpg";
         //let normalMap = textureLoader.load(normalMapPath);
         //normalMap.repeat.set(1, 1);

         //frameMaterial = new THREE.MeshStandardMaterial({ map: frameTexture, normalMap:normalMap, roughness: 0.8 });
         frameMaterial = new THREE.MeshStandardMaterial({ map: frameTexture, roughness: 0.8 });
     } else {
        frameMaterial = new THREE.MeshStandardMaterial({ color: 0x503010, roughness: 0.8 });
     }

     // pass-partout material (mat)
     let passpartoutTexturePath = "./data/textures/polyhaven__fabric_pattern_05_ao_2k.jpg";
     if (passpartoutTexturePath) {
          const passpartoutTexture = textureLoader.load(passpartoutTexturePath);
          passpartoutTexture.wrapS = THREE.RepeatWrapping;
          passpartoutTexture.wrapT = THREE.RepeatWrapping;
          passpartoutTexture.repeat.set(1, 1);
          passpartoutMaterial = new THREE.MeshStandardMaterial({ map: passpartoutTexture, roughness: 0.8 });
      } else {
         passpartoutMaterial = new THREE.MeshStandardMaterial({ color: 0xddccaa, roughness: 0.8 });
      }
}

function setupLights()
{
    // Wärmeres, angenehmeres Ambient Light für globale Beleuchtung
    const ambientLight = new THREE.AmbientLight(0xfff4e6, 0.8); // Warmer Farbton, höhere Intensität
    scene.add(ambientLight);

    // Hauptrichtungslicht von oben (simuliert natürliches Licht)
    const mainDirectionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    mainDirectionalLight.position.set(0, 20, 10);
    mainDirectionalLight.castShadow = true;
    
    // Schatten-Konfiguration für das Hauptlicht
    mainDirectionalLight.shadow.camera.near = 0.5;
    mainDirectionalLight.shadow.camera.far = 50;
    mainDirectionalLight.shadow.camera.left = -25;
    mainDirectionalLight.shadow.camera.right = 25;
    mainDirectionalLight.shadow.camera.top = 25;
    mainDirectionalLight.shadow.camera.bottom = -25;
    mainDirectionalLight.shadow.mapSize.width = 2048;
    mainDirectionalLight.shadow.mapSize.height = 2048;
    mainDirectionalLight.shadow.bias = -0.0005;
    mainDirectionalLight.shadow.radius = 8; // Weichere Schatten
    
    scene.add(mainDirectionalLight);

    // Zusätzliches Füllicht (Fill Light) für weichere Schatten
    const fillLight = new THREE.DirectionalLight(0xfff8f0, 0.3);
    fillLight.position.set(-10, 10, -10);
    scene.add(fillLight);

    // Headlight - reduzierte Intensität da wir jetzt besseres globales Licht haben
    headlight = new THREE.PointLight(0xfff0dd, 30, 0); // Reduzierte Intensität
    headlight.position.set(0, 5, 5);
    scene.add(headlight);

    // Schatten für Headlight
    headlight.castShadow = true;
    headlight.shadow.mapSize.width = 1024;
    headlight.shadow.mapSize.height = 1024;
    headlight.shadow.camera.near = 0.25;
    headlight.shadow.camera.far = 15;
    headlight.shadow.bias = -0.001;
    headlight.shadow.radius = 6; // Weichere Schatten

    // Zusätzliche Punktlichter für bessere Raumbeleuchtung
    const roomLight1 = new THREE.PointLight(0xfff4e6, 20, 30);
    roomLight1.position.set(15, 10, 0);
    scene.add(roomLight1);

    const roomLight2 = new THREE.PointLight(0xfff4e6, 20, 30);
    roomLight2.position.set(-15, 10, 0);
    scene.add(roomLight2);

    const roomLight3 = new THREE.PointLight(0xfff4e6, 15, 25);
    roomLight3.position.set(0, 15, 15);
    scene.add(roomLight3);
}

/*
// ZUSÄTZLICHE BELEUCHTUNG TEMPORÄR AUSKOMMENTIERT - Für Guggenheim-Layout
// Add additional lighting for better visibility in Guggenheim layout
function setupAdditionalLighting() {
    // Add some ambient light to the upper areas
    const upperAmbientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(upperAmbientLight);
    
    // Add a central light from above (like a skylight)
    const centralLight = new THREE.PointLight(0xffffff, 50, 30);
    centralLight.position.set(0, 20, 0);
    centralLight.castShadow = true;
    centralLight.shadow.mapSize.width = 1024;
    centralLight.shadow.mapSize.height = 1024;
    scene.add(centralLight);
}
*/

function getSceneBoundingBox() {
    const boundingBox = new THREE.Box3();
    let bFound = false;

    scene.traverse((object) => {
        // we consider only visible meshes with an actual geometry
        // additional controls could be added
        if (object.isMesh && object.geometry && object.visible) {
            // be sure object world matrix is up to date
            object.updateMatrixWorld(true);

            const objectBoundingBox = new THREE.Box3().setFromObject(object);
            
            if (!bFound) {
                boundingBox.copy(objectBoundingBox);
                bFound = true;
            } else {
                boundingBox.union(objectBoundingBox);
            }
        }
    });

    if (!bFound)
    {
        console.warn("No valid object found to build scene bbox.");
        return null;
    }

    return boundingBox;
}

// create background scene (a simple gradient or maybe a room)
// Ersetze deine existierende createBackgroundScene-Funktion mit dieser.
function createGuggenheimScene() {
    // =================================================================
    // 1. PARAMETER für unsere Guggenheim-Spirale
    // =================================================================
    // Einheiten sind in Metern. Spiele mit diesen Werten!
    const innerRadius = 10; // Radius des inneren, offenen Atriums
    const outerRadius = 20; // Radius bis zur Außenwand
    const rampWidth = outerRadius - innerRadius;
    const galleryHeight = 15; // Gesamthöhe der Galerie
    const turns = 2.5; // Anzahl der kompletten Umdrehungen
    const segmentsPerTurn = 128; // Segmente pro 360°-Drehung (mehr = glatter)
    const totalSegments = Math.floor(segmentsPerTurn * turns);
    const wallHeight = 6.0; // Höhe der Wand über der Rampe

    const textureLoader = new THREE.TextureLoader();

    // =================================================================
    // 2. ERSTELLE DIE RAMPENGEOMETRIE (DER BODEN)
    // =================================================================
    const rampGeometry = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const uvs = [];

    for (let i = 0; i <= totalSegments; i++) {
        // Berechne den Fortschritt entlang der Spirale (0 bis 1)
        const progress = i / totalSegments;

        // Aktueller Winkel und Höhe
        const angle = progress * turns * 2 * Math.PI;
        const currentHeight = progress * galleryHeight;

        // Nächster Winkel und Höhe (für das nächste Segment)
        const nextProgress = (i + 1) / totalSegments;
        const nextAngle = nextProgress * turns * 2 * Math.PI;
        const nextHeight = nextProgress * galleryHeight;

        // Berechne die 4 Eckpunkte für dieses Rampensegment (ein Viereck)
        // p1 --- p2  (Innenkante)
        // |      |
        // p0 --- p3  (Außenkante)

        // p0: aktueller Punkt, außen
        const p0_x = outerRadius * Math.cos(angle);
        const p0_y = currentHeight;
        const p0_z = outerRadius * Math.sin(angle);

        // p1: aktueller Punkt, innen
        const p1_x = innerRadius * Math.cos(angle);
        const p1_y = currentHeight;
        const p1_z = innerRadius * Math.sin(angle);

        // p2: nächster Punkt, innen
        const p2_x = innerRadius * Math.cos(nextAngle);
        const p2_y = nextHeight;
        const p2_z = innerRadius * Math.sin(nextAngle);

        // p3: nächster Punkt, außen
        const p3_x = outerRadius * Math.cos(nextAngle);
        const p3_y = nextHeight;
        const p3_z = outerRadius * Math.sin(nextAngle);

        // OBERSEITE der Rampe (original)
        // Füge die Vertices für zwei Dreiecke hinzu, die das Viereck bilden
        // Dreieck 1: p0, p1, p2
        positions.push(p0_x, p0_y, p0_z);
        positions.push(p1_x, p1_y, p1_z);
        positions.push(p2_x, p2_y, p2_z);
        
        // Dreieck 2: p0, p2, p3
        positions.push(p0_x, p0_y, p0_z);
        positions.push(p2_x, p2_y, p2_z);
        positions.push(p3_x, p3_y, p3_z);

        // UVs für die Texturkoordinaten (Oberseite)
        uvs.push(i / segmentsPerTurn, 0); // p0
        uvs.push(i / segmentsPerTurn, 1); // p1
        uvs.push((i + 1) / segmentsPerTurn, 1); // p2

        uvs.push(i / segmentsPerTurn, 0); // p0
        uvs.push((i + 1) / segmentsPerTurn, 1); // p2
        uvs.push((i + 1) / segmentsPerTurn, 0); // p3

        // UNTERSEITE der Rampe (mit umgekehrter Winding Order für korrekte Normalen)
        const rampThickness = 0.1; // Dicke der Rampe in Metern
        
        // Unterseite Punkte (gleiche Position aber Y um thickness reduziert)
        const p0_bottom_x = p0_x;
        const p0_bottom_y = p0_y - rampThickness;
        const p0_bottom_z = p0_z;

        const p1_bottom_x = p1_x;
        const p1_bottom_y = p1_y - rampThickness;
        const p1_bottom_z = p1_z;

        const p2_bottom_x = p2_x;
        const p2_bottom_y = p2_y - rampThickness;
        const p2_bottom_z = p2_z;

        const p3_bottom_x = p3_x;
        const p3_bottom_y = p3_y - rampThickness;
        const p3_bottom_z = p3_z;

        // Dreieck 1 (Unterseite): p0, p2, p1 (umgekehrte Winding Order)
        positions.push(p0_bottom_x, p0_bottom_y, p0_bottom_z);
        positions.push(p2_bottom_x, p2_bottom_y, p2_bottom_z);
        positions.push(p1_bottom_x, p1_bottom_y, p1_bottom_z);
        
        // Dreieck 2 (Unterseite): p0, p3, p2 (umgekehrte Winding Order)
        positions.push(p0_bottom_x, p0_bottom_y, p0_bottom_z);
        positions.push(p3_bottom_x, p3_bottom_y, p3_bottom_z);
        positions.push(p2_bottom_x, p2_bottom_y, p2_bottom_z);

        // UVs für die Unterseite (gleiche wie Oberseite)
        uvs.push(i / segmentsPerTurn, 0); // p0
        uvs.push((i + 1) / segmentsPerTurn, 1); // p2
        uvs.push(i / segmentsPerTurn, 1); // p1

        uvs.push(i / segmentsPerTurn, 0); // p0
        uvs.push((i + 1) / segmentsPerTurn, 0); // p3
        uvs.push((i + 1) / segmentsPerTurn, 1); // p2
    }
    
    rampGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    rampGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    rampGeometry.computeVertexNormals(); // WICHTIG für korrekte Beleuchtung!

    // Material für die Rampe
    const floorTexture = textureLoader.load("./data/textures/polyhaven__floor_tiles_02_diff_2k.jpg");
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    const rampMaterial = new THREE.MeshStandardMaterial({
        map: floorTexture,
        roughness: 0.1,
        metalness: 0.1
    });

    const rampMesh = new THREE.Mesh(rampGeometry, rampMaterial);
    rampMesh.receiveShadow = true;
    scene.add(rampMesh);

    // =================================================================
    // 3. ERSTELLE DIE AUSSENWAND
    // =================================================================
    // Die Logik ist sehr ähnlich zur Rampe, nur dass die Wand vertikal ist.
    const outerWallGeometry = new THREE.BufferGeometry();
    const wallPositions = [];
    const wallUvs = [];

    for (let i = 0; i < totalSegments; i++) {
        const progress = i / totalSegments;
        const angle = progress * turns * 2 * Math.PI;
        const currentHeight = progress * galleryHeight;

        const nextProgress = (i + 1) / totalSegments;
        const nextAngle = nextProgress * turns * 2 * Math.PI;
        const nextHeight = nextProgress * galleryHeight;

        // p0: unten, aktuell
        const p0_x = outerRadius * Math.cos(angle);
        const p0_y = currentHeight;
        const p0_z = outerRadius * Math.sin(angle);

        // p1: oben, aktuell
        const p1_x = outerRadius * Math.cos(angle);
        const p1_y = currentHeight + wallHeight;
        const p1_z = outerRadius * Math.sin(angle);
        
        // p2: oben, nächstes Segment
        const p2_x = outerRadius * Math.cos(nextAngle);
        const p2_y = nextHeight + wallHeight;
        const p2_z = outerRadius * Math.sin(nextAngle);

        // p3: unten, nächstes Segment
        const p3_x = outerRadius * Math.cos(nextAngle);
        const p3_y = nextHeight;
        const p3_z = outerRadius * Math.sin(nextAngle);
        
        // Dreieck 1: p0, p1, p2
        wallPositions.push(p0_x, p0_y, p0_z);
        wallPositions.push(p1_x, p1_y, p1_z);
        wallPositions.push(p2_x, p2_y, p2_z);

        // Dreieck 2: p0, p2, p3
        wallPositions.push(p0_x, p0_y, p0_z);
        wallPositions.push(p2_x, p2_y, p2_z);
        wallPositions.push(p3_x, p3_y, p3_z);
        
        // UVs für die Wandtextur
        wallUvs.push(i / segmentsPerTurn, 0);
        wallUvs.push(i / segmentsPerTurn, 1);
        wallUvs.push((i + 1) / segmentsPerTurn, 1);

        wallUvs.push(i / segmentsPerTurn, 0);
        wallUvs.push((i + 1) / segmentsPerTurn, 1);
        wallUvs.push((i + 1) / segmentsPerTurn, 0);
    }

    outerWallGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
    outerWallGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(wallUvs, 2));
    outerWallGeometry.computeVertexNormals();
    
    // Material für die Wände
    const wallTexture = textureLoader.load("./data/textures/polyhaven__painted_plaster_wall_diff_2k.jpg");
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;
    const wallMaterial = new THREE.MeshStandardMaterial({
        map: wallTexture,
        roughness: 0.9,
        metalness: 0.1,
        side: THREE.DoubleSide // Wichtig, damit man die Wand von beiden Seiten sieht
    });
    
    const outerWallMesh = new THREE.Mesh(outerWallGeometry, wallMaterial);
    outerWallMesh.receiveShadow = true;
    scene.add(outerWallMesh);

    // =================================================================
    // 4. ERSTELLE DAS INNERE GELÄNDER (BALUSTRADE)
    // =================================================================
    const innerRailingGeometry = new THREE.BufferGeometry();
    const railingPositions = [];
    const railingUvs = [];
    const railingHeight = 1.5; // Höhe des Geländers (1,2m ist Standard)

    for (let i = 0; i < totalSegments; i++) {
        const progress = i / totalSegments;
        const angle = progress * turns * 2 * Math.PI;
        const currentHeight = progress * galleryHeight;

        const nextProgress = (i + 1) / totalSegments;
        const nextAngle = nextProgress * turns * 2 * Math.PI;
        const nextHeight = nextProgress * galleryHeight;

        // p0: unten, aktuell (auf der Rampe)
        const p0_x = innerRadius * Math.cos(angle);
        const p0_y = currentHeight;
        const p0_z = innerRadius * Math.sin(angle);

        // p1: oben, aktuell (Geländer-Oberkante)
        const p1_x = innerRadius * Math.cos(angle);
        const p1_y = currentHeight + railingHeight;
        const p1_z = innerRadius * Math.sin(angle);
        
        // p2: oben, nächstes Segment
        const p2_x = innerRadius * Math.cos(nextAngle);
        const p2_y = nextHeight + railingHeight;
        const p2_z = innerRadius * Math.sin(nextAngle);

        // p3: unten, nächstes Segment
        const p3_x = innerRadius * Math.cos(nextAngle);
        const p3_y = nextHeight;
        const p3_z = innerRadius * Math.sin(nextAngle);
        
        // Dreieck 1: p0, p2, p1 (umgekehrte Winding Order für Innenseite)
        railingPositions.push(p0_x, p0_y, p0_z);
        railingPositions.push(p2_x, p2_y, p2_z);
        railingPositions.push(p1_x, p1_y, p1_z);

        // Dreieck 2: p0, p3, p2 (umgekehrte Winding Order für Innenseite)
        railingPositions.push(p0_x, p0_y, p0_z);
        railingPositions.push(p3_x, p3_y, p3_z);
        railingPositions.push(p2_x, p2_y, p2_z);
        
        // UVs für das Geländer
        railingUvs.push(i / segmentsPerTurn, 0);
        railingUvs.push((i + 1) / segmentsPerTurn, 1);
        railingUvs.push(i / segmentsPerTurn, 1);

        railingUvs.push(i / segmentsPerTurn, 0);
        railingUvs.push((i + 1) / segmentsPerTurn, 0);
        railingUvs.push((i + 1) / segmentsPerTurn, 1);
    }

    innerRailingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(railingPositions, 3));
    innerRailingGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(railingUvs, 2));
    innerRailingGeometry.computeVertexNormals();
    
    // Verwende das gleiche Material wie die Außenwand
    const innerRailingMesh = new THREE.Mesh(innerRailingGeometry, wallMaterial);
    innerRailingMesh.receiveShadow = true;
    innerRailingMesh.castShadow = true;
    scene.add(innerRailingMesh);

    // =================================================================
    // 5. ERWEITERTE BODENPLATTE BIS ZUR AUSSENWAND
    // =================================================================
    // Vollständiger Boden vom Zentrum bis zur Außenwand
    const fullFloorGeometry = new THREE.CircleGeometry(outerRadius, segmentsPerTurn);
    const fullFloor = new THREE.Mesh(fullFloorGeometry, rampMaterial);
    fullFloor.rotation.x = -Math.PI / 2;
    fullFloor.position.y = 0; // Auf dem untersten Level
    fullFloor.receiveShadow = true;
    scene.add(fullFloor);

    // =================================================================
    // 6. AUSSENWAND NUR FÜR DAS ERDGESCHOSS
    // =================================================================
    const groundFloorWallGeometry = new THREE.BufferGeometry();
    const groundWallPositions = [];
    const groundWallUvs = [];
    const groundFloorHeight = wallHeight; // Höhe der Erdgeschoss-Außenwand

    // Erstelle eine kreisförmige Wand um das Erdgeschoss
    const groundWallSegments = segmentsPerTurn; // Gleiche Segmentierung wie andere Teile
    for (let i = 0; i < groundWallSegments; i++) {
        const angle = (i / groundWallSegments) * 2 * Math.PI;
        const nextAngle = ((i + 1) / groundWallSegments) * 2 * Math.PI;

        // Definiere die 4 Punkte der Wand (Rechteck)
        // p0: unten, aktuell
        const p0_x = outerRadius * Math.cos(angle);
        const p0_y = 0;
        const p0_z = outerRadius * Math.sin(angle);

        // p1: oben, aktuell
        const p1_x = outerRadius * Math.cos(angle);
        const p1_y = groundFloorHeight;
        const p1_z = outerRadius * Math.sin(angle);
        
        // p2: oben, nächstes Segment
        const p2_x = outerRadius * Math.cos(nextAngle);
        const p2_y = groundFloorHeight;
        const p2_z = outerRadius * Math.sin(nextAngle);

        // p3: unten, nächstes Segment
        const p3_x = outerRadius * Math.cos(nextAngle);
        const p3_y = 0;
        const p3_z = outerRadius * Math.sin(nextAngle);
        
        // Dreieck 1: p0, p1, p2 (Außenseite nach außen gerichtet)
        groundWallPositions.push(p0_x, p0_y, p0_z);
        groundWallPositions.push(p1_x, p1_y, p1_z);
        groundWallPositions.push(p2_x, p2_y, p2_z);

        // Dreieck 2: p0, p2, p3 (Außenseite nach außen gerichtet)
        groundWallPositions.push(p0_x, p0_y, p0_z);
        groundWallPositions.push(p2_x, p2_y, p2_z);
        groundWallPositions.push(p3_x, p3_y, p3_z);
        
        // UVs für die Wandtextur
        groundWallUvs.push(i / groundWallSegments, 0);
        groundWallUvs.push(i / groundWallSegments, 1);
        groundWallUvs.push((i + 1) / groundWallSegments, 1);

        groundWallUvs.push(i / groundWallSegments, 0);
        groundWallUvs.push((i + 1) / groundWallSegments, 1);
        groundWallUvs.push((i + 1) / groundWallSegments, 0);
    }

    groundFloorWallGeometry.setAttribute('position', new THREE.Float32BufferAttribute(groundWallPositions, 3));
    groundFloorWallGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(groundWallUvs, 2));
    groundFloorWallGeometry.computeVertexNormals();
    
    const groundFloorWallMesh = new THREE.Mesh(groundFloorWallGeometry, wallMaterial);
    groundFloorWallMesh.receiveShadow = true;
    groundFloorWallMesh.castShadow = true;
    scene.add(groundFloorWallMesh);

    // =================================================================
    // 7. DURCHGÄNGIGES LICHTBAND ALS SPIRALRÖHRE (NUDEL-FORM)
    // =================================================================
    // Das Lichtband folgt der Spirale als röhrenförmige "Nudel"
    const lightBandRadius = outerRadius - 0.5; // Radius der Spiralbahn
    const lightBandTubeRadius = 0.2; // Radius der "Nudel" (Röhren-Dicke)
    const lightBandYOffset = wallHeight - 0.3; // Höhe über der Wand

    // Erstelle die Spiralkurve für das Lichtband
    class SpiralCurve extends THREE.Curve {
        constructor(innerRadius, outerRadius, turns, height) {
            super();
            this.innerRadius = innerRadius;
            this.outerRadius = outerRadius;
            this.turns = turns;
            this.height = height;
        }

        getPoint(t) {
            const angle = t * this.turns * 2 * Math.PI;
            const currentHeight = t * this.height;
            
            const x = lightBandRadius * Math.cos(angle);
            const y = currentHeight + lightBandYOffset;
            const z = lightBandRadius * Math.sin(angle);
            
            return new THREE.Vector3(x, y, z);
        }
    }

    // Erstelle die Spiralkurve
    const spiralCurve = new SpiralCurve(innerRadius, outerRadius, turns, galleryHeight);

    // Erstelle die Röhrengeometrie entlang der Spirale
    const lightBandGeometry = new THREE.TubeGeometry(
        spiralCurve,           // Pfad der Spirale
        totalSegments,        // Anzahl der Segmente entlang der Kurve
        lightBandTubeRadius,  // Radius der Röhre
        16,                   // Radiale Segmente der Röhre
        false                 // Nicht geschlossen
    );
    
    // Emissive Material für das Lichtband
    const lightBandMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffcc,
        emissiveIntensity: 0.8,
        roughness: 0.1,
        metalness: 0.0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
    });

    const lightBandMesh = new THREE.Mesh(lightBandGeometry, lightBandMaterial);
    scene.add(lightBandMesh);

    // Füge Punktlichter entlang der Spiralröhre hinzu
    const lightsPerTurn = 5; // Lichter pro Spiralwindung
    const totalLights = Math.floor(lightsPerTurn * turns);
    const lightIntensity = 80; // Intensität der einzelnen Lichter
    const lightDistance = 80; // Reichweite der Lichter

    for (let i = 0; i < totalLights; i++) {
        const progress = i / totalLights;
        const angle = progress * turns * 2 * Math.PI;
        const currentHeight = progress * galleryHeight;

        const lightX = lightBandRadius * Math.cos(angle);
        const lightZ = lightBandRadius * Math.sin(angle);
        const lightY = currentHeight + lightBandYOffset;

        const pointLight = new THREE.PointLight(0xfff8e6, lightIntensity, lightDistance);
        pointLight.position.set(lightX, lightY, lightZ);
        
        // Optimierte Schatten für bessere Performance
        pointLight.castShadow = true;
        pointLight.shadow.mapSize.width = 256;
        pointLight.shadow.mapSize.height = 256;
        pointLight.shadow.camera.near = 0.1;
        pointLight.shadow.camera.far = lightDistance;
        pointLight.shadow.bias = -0.0001;
        pointLight.shadow.radius = 2;

        scene.add(pointLight);
    }

    // Zusätzliche Deckenbeleuchtung für bessere Sichtbarkeit
    const ceilingLight = new THREE.PointLight(0xffffff, 100, 0);
    ceilingLight.position.set(0, galleryHeight + 5, 0);
    ceilingLight.castShadow = true;
    ceilingLight.shadow.mapSize.width = 1024;
    ceilingLight.shadow.mapSize.height = 1024;
    ceilingLight.shadow.camera.near = 0.5;
    ceilingLight.shadow.camera.far = 50;
    scene.add(ceilingLight);
}


function onContainerResize()
{
    if (!galleryContainerElement || !renderer || !camera) return;

    const newWidth = galleryContainerElement.clientWidth;
    const newHeight = galleryContainerElement.clientHeight;

    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(newWidth, newHeight);
}


async function fetchPaintingData()
{
    try {
        const response = await fetch(imageListFile);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Unable to load paintings data:", error); return [];
    }
}


function computeMaxAbsComponentIdx(vector3) {
    const absX = Math.abs(vector3.x);
    const absY = Math.abs(vector3.y);
    const absZ = Math.abs(vector3.z);

    if (absX >= absY && absX >= absZ) {
        return 0;
    } else if (absY >= absX && absY >= absZ) {
        return 1;
    }
    return 2;
}

// compute texture coords
function computeUVs(uniqueVerticesArray, meshVerticesArray, meshNormalsArray, numVerticesPerSide) {
    if (meshVerticesArray.length === 0 || meshVerticesArray.length !== meshNormalsArray.length) {
        console.error("vertices and normals arrays should be non empty and have same size.");
        return new Float32Array(0);
    }

    // compute bbox
    const vMin = new THREE.Vector3(Infinity, Infinity, Infinity);
    const vMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    for (const v of uniqueVerticesArray) {
        vMin.min(v); // vMin.x = Math.min(vMin.x, v.x), ecc.
        vMax.max(v); // vMax.x = Math.max(vMax.x, v.x), ecc.
    }

    if (!isFinite(vMin.x) || !isFinite(vMax.x)) { // check if bbox is valid
        console.warn("invalid vertices bbox");
        vMin.set(0,0,0);
        vMax.set(1,1,1);
        if(uniqueVerticesArray.length > 0){
             vMin.copy(uniqueVerticesArray[0]);
             vMax.copy(uniqueVerticesArray[0]);
             for (const v of uniqueVerticesArray) {
                vMin.min(v);
                vMax.max(v);
            }
        }
    }

    // compute bbox size
    const size = new THREE.Vector3().subVectors(vMax, vMin);
    let single_texture_repetition_size = Math.max(size.x, size.y, size.z);

    if (single_texture_repetition_size === 0) {
        single_texture_repetition_size = 1.0; // avoid divide by zero
    }

    // generate UVs
    const uvsArray = [];
    const diff = new THREE.Vector3();

    for (let i = 0; i < meshVerticesArray.length; ++i) 
    {
        const v = meshVerticesArray[i];
        const n = meshNormalsArray[i];

        // get normal dominant axis
        const iAxis = computeMaxAbsComponentIdx(n);

        // diff = (v - vMin) / single_texture_repetition_size
        diff.subVectors(v, vMin).divideScalar(single_texture_repetition_size);

        let u_coord, v_coord;

        switch (iAxis) {
            case 0:
                u_coord = diff.z;
                v_coord = diff.y;
                break;
            case 1:
                u_coord = diff.x;
                v_coord = diff.z;
                break;
            case 2:
            default:
                u_coord = diff.x;
                v_coord = diff.y;
                break;
        }

        // Math.trunc gets the integer part (same as floor)
        let iSide = Math.trunc(i / numVerticesPerSide);
        let bVertical = (iSide % 2) === 1;
        if (bVertical)
        {
            // swap u_coord and v_coord (cool!)
            [u_coord, v_coord] = [v_coord, u_coord];
        }
        uvsArray.push(u_coord, v_coord);
    }

    return new Float32Array(uvsArray);
}

// create simple geometry for painting frame and pass-partout
function createFrameGeometry(width, height, thickness, depth, bFlat = false)
{
    const hw = width * .5;
    const hh = height * .5;

    const cornersPositions = [
        new THREE.Vector3(-hw,  hh,  0),
        new THREE.Vector3( hw,  hh,  0),
        new THREE.Vector3( hw, -hh,  0),
        new THREE.Vector3(-hw, -hh,  0)
    ];

    const signs = [
        new THREE.Vector2(-1.0,  1.0),
        new THREE.Vector2( 1.0,  1.0),
        new THREE.Vector2( 1.0, -1.0),
        new THREE.Vector2(-1.0, -1.0)
    ];

    const profileVertices = []; // Array of THREE.Vector3
    const zOffsetVec = new THREE.Vector3(0, 0, -depth);

    const numFrameSides = 4;

    for (let i = 0; i < numFrameSides; ++i) {
        const v_inner_front = cornersPositions[i];
        const v_outer_front = new THREE.Vector3(
            v_inner_front.x + signs[i].x * thickness,
            v_inner_front.y + signs[i].y * thickness,
            v_inner_front.z
        );
        
        if (!bFlat)
        {
            let numSteps = 3;
            let minDepth = depth*.3;
            let zStepDepth = -(depth - minDepth)/numSteps;
            profileVertices.push(v_inner_front.clone().add(new THREE.Vector3(.0, .0, zStepDepth*numSteps)));
        
            let diff = v_outer_front.clone().sub(v_inner_front);
            let diff_increment = diff.clone().divideScalar(numSteps+1);

            diff = diff_increment.clone();

        // TODO: eventually add more segments to profile
            while (numSteps > 0)
            {
                profileVertices.push(v_inner_front.clone().add(diff).add(new THREE.Vector3(.0, .0, zStepDepth*numSteps)));
                numSteps--;
                profileVertices.push(v_inner_front.clone().add(diff).add(new THREE.Vector3(.0, .0, zStepDepth*numSteps)));
                diff.add(diff_increment);
            }
            //profileVertices.push(v_inner_front.clone().add(diff.clone().multiplyScalar(.4)).add(new THREE.Vector3(.0, .0, zStepDepth)));
            //profileVertices.push(v_inner_front.clone().add(diff.clone().multiplyScalar(.7)));

        }
        else
        {
            profileVertices.push(v_inner_front.clone());
        }
        
        profileVertices.push(v_outer_front.clone());
        profileVertices.push(v_outer_front.clone().add(zOffsetVec));
        profileVertices.push(v_inner_front.clone().add(zOffsetVec));
    }

    // number of vertices per single profile
    const numProfileFaces = profileVertices.length / numFrameSides;

    const finalMeshVerticesData = []; // flat array  [x,y,z, x,y,z, ...] for 'position' attribute
    const finalIndices = [];
    const finalNormalsData = [];   // flat array [nx,ny,nz, nx,ny,nz, ...] for 'normal' attribute

    let currentVertexOffset = 0;

    for (let iSide = 0; iSide < numFrameSides; ++iSide)
    {
        for (let iFace = 0; iFace < numProfileFaces; ++iFace)
        {
            const iNextSide = (iSide + 1) % numFrameSides;
            const iNextFace = (iFace + 1) % numProfileFaces;

            const idx_p0 = (iSide * numProfileFaces) + iFace;
            const idx_p1 = (iNextSide * numProfileFaces) + iFace;
            const idx_p2 = (iNextSide * numProfileFaces) + iNextFace;
            const idx_p3 = (iSide * numProfileFaces) + iNextFace;

            const p0 = profileVertices[idx_p0];
            const p1 = profileVertices[idx_p1];
            const p2 = profileVertices[idx_p2];
            const p3 = profileVertices[idx_p3];

            // add face vertices
            // order is important for winding and normal computation
            finalMeshVerticesData.push(p0);
            finalMeshVerticesData.push(p1);
            finalMeshVerticesData.push(p2);
            finalMeshVerticesData.push(p3);

            // compute face normal
            const edge1 = new THREE.Vector3().subVectors(p1, p0);
            const edge2 = new THREE.Vector3().subVectors(p2, p0);
            const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

            // set normal for all 4 vertices of this face (flat shading)
            for (let k = 0; k < 4; ++k) {
                // here I push always the same normal instance (the same reference to the same object)
                // since I don't need to modify it later separately for each vertex, so it is safe to share it
                finalNormalsData.push(normal);
            }

            // create triangles
            finalIndices.push(currentVertexOffset + 0);
            finalIndices.push(currentVertexOffset + 1);
            finalIndices.push(currentVertexOffset + 2);

            finalIndices.push(currentVertexOffset + 0);
            finalIndices.push(currentVertexOffset + 2);
            finalIndices.push(currentVertexOffset + 3);

            currentVertexOffset += 4;
        }
    }

    let numVerticesPerSide = 4 * numProfileFaces;

    // comptue UVs
    const uvs = computeUVs(profileVertices, finalMeshVerticesData, finalNormalsData, numVerticesPerSide);

    // create 'flat' version of arrays of positions and normals
    const meshVerticesFlatArray = [];
    for (const vec3 of finalMeshVerticesData) {
        meshVerticesFlatArray.push(vec3.x, vec3.y, vec3.z);
    }
    const meshNormalsFlatArray = [];
    for (const vec3 of finalNormalsData) {
        meshNormalsFlatArray.push(vec3.x, vec3.y, vec3.z);
    }

    // pass the vectors to the geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshVerticesFlatArray, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(meshNormalsFlatArray, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(finalIndices);

    // no need to invoke geometry.computeVertexNormals(),
    // since we manually specified normals
    
    return geometry;
}


// load paintings data from json file
function loadPaintings(paintingDataArray) {
    /*
    // BILDER TEMPORÄR AUSKOMMENTIERT - Guggenheim-Spirale ist noch in Entwicklung
    const textureLoa der = new THREE.TextureLoader();
    const totalPaintings = paintingDataArray.length;
    const numRows = Math.ceil(totalPaintings / paintingsPerRow);

    let totalPaintingsToLoad = totalPaintings;
    let paintingsLoadedCount = 0;


    paintingDataArray.forEach((paintingDataItem, index) => {
        const imageUrl = paintingDataItem.Image;
        const paintingName = paintingDataItem.Name || `Painting ${index + 1}`;

        // funzione da invocarea dopo ciascun caricamento
        const onTextureLoadOrError = () => {
            paintingsLoadedCount++;
            if (paintingsLoadedCount === totalPaintingsToLoad) {
                // all painting have been loaded
                //console.log("All paintings have been loaded and added to scene.");

                // create room scene
                createGuggenheimScene();
            }
        };


        if (!imageUrl) {
            createPlaceholder(index, numRows, paintingDataItem); return;
        }

        textureLoader.load(imageUrl, (texture) => {
            const aspectRatio = texture.image.width / texture.image.height;
            let planeWidth = paintingBaseSize.width;
            let planeHeight = paintingBaseSize.width / aspectRatio;
            if (planeHeight > paintingBaseSize.height) {
                planeHeight = paintingBaseSize.height;
                planeWidth = paintingBaseSize.height * aspectRatio;
            }

            // plane for the painting
            const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
            // material will use the painting as a texture
            const material = new THREE.MeshStandardMaterial({ map: texture, metalness: 0.1, roughness: 0.7, side: THREE.DoubleSide });
            const paintingMesh = new THREE.Mesh(geometry, material);
            paintingMesh.name = paintingName;
            // store all data
            paintingMesh.userData = { ...paintingDataItem, type: 'painting' }; // Mark as painting

            // compute painting position in scene
            const row = Math.floor(index / paintingsPerRow);
            const col = index % paintingsPerRow;

            paintingMesh.position.x = (col - (paintingsPerRow - 1) / 2) * (paintingBaseSize.width + spacing);
            paintingMesh.position.y = ((numRows - 1) / 2 - row) * (paintingBaseSize.height + spacing) + paintingBaseSize.height / 2;
            paintingMesh.position.z = 0;

            // add pass-partout (mat) mesh
            // ---------------------------
            const passpartoutThickness = .2;
            const passpartoutDepth = 0.005;
                        
            let bFlat = true;
            const passpartoutGeometry = createFrameGeometry(planeWidth, planeHeight, passpartoutThickness, passpartoutDepth, bFlat);
            const passpartout = new THREE.Mesh(passpartoutGeometry, passpartoutMaterial);
            passpartout.position.copy(paintingMesh.position);
            passpartout.position.z += passpartoutDepth;
            // To prevent passpartout from being raycasted for the tooltip (optional)
            // passpartout.raycast = () => {}; // Or add passpartout to a separate non-raycastable group


            // add frame mesh
            // ---------------------------
            //const frameThickness = .04;
            const frameThickness = .08;
            //const frameDepth = 0.05;
            const frameDepth = .08;

            const frameGeometry = createFrameGeometry(planeWidth+passpartoutThickness*2, planeHeight+passpartoutThickness*2, frameThickness, frameDepth);
            const frame = new THREE.Mesh(frameGeometry, frameMaterial);
            frame.position.copy(paintingMesh.position);
            frame.position.z += frameDepth;
            // To prevent frame from being raycasted for the tooltip (optional)
            // frame.raycast = () => {}; // Or add frame to a separate non-raycastable group


            // meshes should cast and receive shadows
            paintingMesh.castShadow = true;
            paintingMesh.receiveShadow = true; // Permetti che ricevano ombre da altri dipinti/cornici
            
            passpartout.castShadow = true;
            passpartout.receiveShadow = true;

            frame.castShadow = true;
            frame.receiveShadow = true;
    
            // adding meshes to scene
            scene.add(frame);
            scene.add(passpartout);
            scene.add(paintingMesh);
            paintings.push(paintingMesh);

            onTextureLoadOrError();
        },
        undefined,
        (error) => {
            console.error(`Error loading texture for '${paintingName}': ${imageUrl}`, error);
        createPlaceholder(index, numRows, paintingDataItem);

            onTextureLoadOrError();
        });
    });
    */
    
    // Erstelle nur die Guggenheim-Szene ohne Bilder
    createGuggenheimScene();
}

/*
// PLACEHOLDER FUNKTION TEMPORÄR AUSKOMMENTIERT
function createPlaceholder(index, numRows, paintingDataItem = {}) {
    const planeWidth = paintingBaseSize.width;
    const planeHeight = paintingBaseSize.height;
    const placeholderGeo = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const placeholderMat = new THREE.MeshBasicMaterial({ color: 0x555555, side: THREE.DoubleSide });
    const placeholder = new THREE.Mesh(placeholderGeo, placeholderMat);
    const placeholderName = paintingDataItem.Name || `Placeholder ${index + 1}`;
    placeholder.name = placeholderName;
    placeholder.userData = { ...paintingDataItem, Name: placeholderName, Description: "Image not available.", type: 'painting' };

    const row = Math.floor(index / paintingsPerRow);
    const col = index % paintingsPerRow;
    placeholder.position.x = (col - (paintingsPerRow - 1) / 2) * (paintingBaseSize.width + spacing);
    placeholder.position.y = ((numRows - 1) / 2 - row) * (paintingBaseSize.height + spacing) + paintingBaseSize.height/2;
    placeholder.position.z = 0;
    scene.add(placeholder);
    paintings.push(placeholder);
}
*/


function onMouseWheel(event) {
    // code to run on mouse wheel (scroll event)
    //console.log('mouse wheel event');
    
    updateActionsPanelVisibility(false);
}

// WASD keyboard controls
function onKeyDown(event) {
    // Don't handle WASD keys if we're editing description
    if (isEditingDescription) return;
    
    const key = event.key.toLowerCase();
    if (key in keys) {
        keys[key] = true;
        event.preventDefault(); // Prevent default browser behavior
    }
    // Handle Shift key for sprinting
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        keys.shift = true;
        event.preventDefault();
    }
}

function onKeyUp(event) {
    // Don't handle WASD keys if we're editing description
    if (isEditingDescription) return;
    
    const key = event.key.toLowerCase();
    if (key in keys) {
        keys[key] = false;
        event.preventDefault(); // Prevent default browser behavior
    }
    // Handle Shift key for sprinting
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        keys.shift = false;
        event.preventDefault();
    }
}

function handleWASDMovement() {
    if (isCameraAnimating || isEditingDescription) return; // Don't move during camera animations or description editing
    
    // Get camera direction vectors
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    // Calculate right vector (perpendicular to camera direction)
    const rightVector = new THREE.Vector3();
    rightVector.crossVectors(cameraDirection, camera.up).normalize();
    
    // Calculate forward vector (camera direction projected onto XZ plane)
    const forwardVector = new THREE.Vector3(cameraDirection.x, 0, cameraDirection.z).normalize();
    
    // Calculate movement vector
    const moveVector = new THREE.Vector3(0, 0, 0);
    
    // Horizontal movement (WASD)
    if (keys.w) moveVector.add(forwardVector);
    if (keys.s) moveVector.sub(forwardVector);
    if (keys.a) moveVector.sub(rightVector);
    if (keys.d) moveVector.add(rightVector);
    
    // Vertical movement (QE)
    if (keys.q) moveVector.y -= 1; // Move down
    if (keys.e) moveVector.y += 1; // Move up
    
    // Apply movement if any keys are pressed
    if (moveVector.length() > 0) {
        moveVector.normalize();
        
        // Apply speed with sprint multiplier
        const currentSpeed = keys.shift ? moveSpeed * sprintMultiplier : moveSpeed;
        moveVector.multiplyScalar(currentSpeed);
        
        // Move both camera and controls target
        camera.position.add(moveVector);
        controls.target.add(moveVector);
        
        // Update controls
        controls.update();
    }
}


function onCanvasMouseMove(event) {
    // Calculate mouse position relative to the canvas (renderer.domElement)
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;


    // if a painting is focused and camera animation was completed
    // --> show action panel
    if (currentFocusedPainting && !isCameraAnimating) {
        showActionPanel();
    }


    if (isCameraAnimating || currentFocusedPainting) { // Non mostrare tooltip se la camera si muove o è già a fuoco
        tooltipElement.style.display = 'none';
        return;
    }

    // old version relative to fullscreen gallery
    //mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    //mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(paintings);

    if (intersects.length > 0 && intersects[0].object.userData.type === 'painting') {
        const hoveredPainting = intersects[0].object;
        tooltipElement.textContent = hoveredPainting.name;
        tooltipElement.style.display = 'block';
        // Position tooltip relative to the canvas/container using event.clientX/Y
        // and adjust for container's offset if needed, or simply:
        const tooltipX = event.clientX - rect.left + 15; // position relative to canvas, then add offset
        const tooltipY = event.clientY - rect.top + 15;
        tooltipElement.style.left = `${tooltipX}px`;
        tooltipElement.style.top = `${tooltipY}px`;
    } else {
        tooltipElement.style.display = 'none';
    }
}


function onCanvasClick(event) {
    // if camera is moving -> do nothin
    if (isCameraAnimating) return;

    // mouse position relative to canvas is already set by onCanvasMouseMove if it fired,
    // but good to recalculate here for click accuracy.
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(paintings);


    if (intersects.length > 0 && intersects[0].object.userData.type === 'painting') {
        const clickedPainting = intersects[0].object;
        if (currentFocusedPainting === clickedPainting) {
            // if we click again on the focused paintig, reset view to original position
            resetCameraPosition();
        } else {
            // focus on selected painting
            currentFocusedPainting = clickedPainting;
            focusCameraOnPainting(clickedPainting);
        }
    } else {
        // click on an empty space --> reset view
        if (currentFocusedPainting) {
            resetCameraPosition();
        }
    }
}

// Right click to place painting on wall
function onCanvasRightClick(event) {
    event.preventDefault(); // Prevent context menu from appearing
    
    if (isCameraAnimating) return;
    
    // Calculate mouse position
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Cast ray to find intersection with walls
    raycaster.setFromCamera(mouse, camera);
    
    // Get all meshes in the scene that could be walls
    const allMeshes = [];
    scene.traverse((object) => {
        if (object.isMesh && object.geometry && object.visible) {
            // Skip existing paintings
            if (object.userData.type !== 'painting') {
                allMeshes.push(object);
            }
        }
    });
    
    const intersects = raycaster.intersectObjects(allMeshes);
    
    if (intersects.length > 0) {
        const intersection = intersects[0];
        const wallPosition = intersection.point;
        const wallNormal = intersection.face.normal.clone();
        
        // Transform normal to world space
        wallNormal.transformDirection(intersection.object.matrixWorld);
        
        // Place painting at wall position
        placePaintingOnWall(wallPosition, wallNormal);
    }
}

function placePaintingOnWall(position, normal) {
    // Load painting data to get a random image
    fetchPaintingData().then(paintingDataArray => {
        if (paintingDataArray && paintingDataArray.length > 0) {
            // Get a random painting from the data
            const randomIndex = Math.floor(Math.random() * paintingDataArray.length);
            const paintingData = paintingDataArray[randomIndex];
            
            const textureLoader = new THREE.TextureLoader();
            const imageUrl = paintingData.Image;
            
            if (imageUrl) {
                textureLoader.load(imageUrl, (texture) => {
                    createPaintingMesh(texture, paintingData, position, normal);
                }, undefined, (error) => {
                    console.error('Error loading painting texture:', error);
                    // Fallback to placeholder
                    createPlaceholderPainting(position, normal);
                });
            } else {
                createPlaceholderPainting(position, normal);
            }
        } else {
            createPlaceholderPainting(position, normal);
        }
    }).catch(error => {
        console.error('Error fetching painting data:', error);
        createPlaceholderPainting(position, normal);
    });
}

function createPaintingMesh(texture, paintingData, position, normal) {
    // Calculate painting dimensions based on texture aspect ratio
    const aspectRatio = texture.image.width / texture.image.height;
    const maxWidth = 1.2;
    const maxHeight = 1.0;
    
    let paintingWidth = maxWidth;
    let paintingHeight = maxWidth / aspectRatio;
    if (paintingHeight > maxHeight) {
        paintingHeight = maxHeight;
        paintingWidth = maxHeight * aspectRatio;
    }
    
    const geometry = new THREE.PlaneGeometry(paintingWidth, paintingHeight);
    
    // Rotate the texture 180 degrees to correct orientation
    texture.center.set(0.5, 0.5);
    texture.rotation = Math.PI;
    
    const material = new THREE.MeshStandardMaterial({ 
        map: texture,
        roughness: 0.7,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    
    const paintingMesh = new THREE.Mesh(geometry, material);
    paintingMesh.name = paintingData.Name || `Placed Painting ${placedPaintings.length + 1}`;
    paintingMesh.userData = { ...paintingData, type: 'painting', placed: true };
    
    // Position and orient the painting
    positionPaintingOnWall(paintingMesh, position, normal);
    
    // Add frame and passepartout
    addFrameAndPassepartout(paintingMesh, paintingWidth, paintingHeight);
    
    // Add to scene and arrays
    scene.add(paintingMesh);
    paintings.push(paintingMesh);
    placedPaintings.push(paintingMesh);
    
    console.log(`Painting "${paintingMesh.name}" placed at wall`);
}

function createPlaceholderPainting(position, normal) {
    const paintingWidth = 1.0;
    const paintingHeight = 0.8;
    
    const geometry = new THREE.PlaneGeometry(paintingWidth, paintingHeight);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x8844aa,
        roughness: 0.7,
        metalness: 0.1
    });
    
    const paintingMesh = new THREE.Mesh(geometry, material);
    paintingMesh.name = `Placeholder Painting ${placedPaintings.length + 1}`;
    paintingMesh.userData = { type: 'painting', placed: true };
    
    // Position and orient the painting
    positionPaintingOnWall(paintingMesh, position, normal);
    
    // Add frame and passepartout
    addFrameAndPassepartout(paintingMesh, paintingWidth, paintingHeight);
    
    // Add to scene and arrays
    scene.add(paintingMesh);
    paintings.push(paintingMesh);
    placedPaintings.push(paintingMesh);
    
    console.log(`Placeholder painting placed at wall`);
}

function positionPaintingOnWall(paintingMesh, position, normal) {
    // Position the painting slightly in front of the wall
    const offset = -0.15; // Increased offset to ensure painting is clearly in front of wall
    paintingMesh.position.copy(position);
    paintingMesh.position.add(normal.clone().multiplyScalar(offset));
    
    // Create a proper orientation matrix for the painting
    // The painting should face away from the wall (toward the camera)
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, normal).normalize();
    const realUp = new THREE.Vector3().crossVectors(normal, right).normalize();
    
    // Create rotation matrix - use negative normal to face toward camera
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeBasis(right, realUp, normal.clone().negate());
    
    // Apply the rotation to the painting
    paintingMesh.rotation.setFromRotationMatrix(rotationMatrix);
}

function addFrameAndPassepartout(paintingMesh, width, height) {
    const passpartoutThickness = 0.15;
    const passpartoutDepth = 0.005;
    const frameThickness = 0.06;
    const frameDepth = 0.06;
    
    // Create passepartout
    const passpartoutGeometry = createFrameGeometry(width, height, passpartoutThickness, passpartoutDepth, true);
    const passpartout = new THREE.Mesh(passpartoutGeometry, passpartoutMaterial);
    passpartout.position.copy(paintingMesh.position);
    passpartout.rotation.copy(paintingMesh.rotation);
    passpartout.position.add(paintingMesh.getWorldDirection(new THREE.Vector3()).multiplyScalar(passpartoutDepth));
    
    // Create frame
    const frameGeometry = createFrameGeometry(width + passpartoutThickness * 2, height + passpartoutThickness * 2, frameThickness, frameDepth);
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.position.copy(paintingMesh.position);
    frame.rotation.copy(paintingMesh.rotation);
    frame.position.add(paintingMesh.getWorldDirection(new THREE.Vector3()).multiplyScalar(frameDepth));
    
    // Enable shadows
    paintingMesh.castShadow = true;
    paintingMesh.receiveShadow = true;
    passpartout.castShadow = true;
    passpartout.receiveShadow = true;
    frame.castShadow = true;
    frame.receiveShadow = true;
    
    // Add to scene
    scene.add(passpartout);
    scene.add(frame);
}


function onCanvasMouseLeave() {
    // stop auto-panning if mouse leaves the canvas
    isAutoPanning = false;
    currentPanSpeedX = 0;
    tooltipElement.style.display = 'none'; // hide tooltip when mouse leaves canvas
}



function startInactivityTimer() {
    if (inactivityTimer)
        clearTimeout(inactivityTimer); // clear previous timer
    
    // Don't start timer if editing description
    if (currentFocusedPainting && !isCameraAnimating && !isEditingDescription) {
        //console.log("start inactivity timer.");
        inactivityTimer = setTimeout(() => {
            //console.log("inactivity timer timeout.");
            // mouse hasn't moved for the whole time ->
            // hide action panel
            updateActionsPanelVisibility(false);
            // hide also the tooltip
            tooltipElement.style.display = 'none';
            // console.log("hiding action panel.");
        }, inactivityTimeoutDuration);
    }
}


function fadeInActionsPanel() {
    if (panelFadeTween) panelFadeTween.stop();
    //console.log("start fadeIn, opacity = ", actionsPanelElement.style.opacity);
    actionsPanelElement.style.display = 'block';
    actionsPanelElement.style.pointerEvents = 'auto';
    panelFadeTween = new TWEEN.Tween({ opacity: parseFloat(actionsPanelElement.style.opacity) || 0 })
        .to({ opacity: 1 }, panelFadeDuration_ms).easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate((obj) => { actionsPanelElement.style.opacity = obj.opacity; })
        .onComplete(() => { panelFadeTween = null; }).start();
}
function fadeOutActionsPanel() {
    if (panelFadeTween) panelFadeTween.stop();
    //console.log("start fadeOut, opacity = ", actionsPanelElement.style.opacity);
    actionsPanelElement.style.pointerEvents = 'none';
    panelFadeTween = new TWEEN.Tween({ opacity: parseFloat(actionsPanelElement.style.opacity) || 1 })
        .to({ opacity: 0 }, panelFadeDuration_ms).easing(TWEEN.Easing.Quadratic.In)
        .onUpdate((obj) => { actionsPanelElement.style.opacity = obj.opacity; })
        .onComplete(() => { actionsPanelElement.style.display = 'none'; panelFadeTween = null; }).start();
}


// shows action panel
function showActionPanel() {
    if (currentFocusedPainting && !isCameraAnimating)
    {
        updateActionsPanelVisibility(true); 

        //? update painting description
        const data = currentFocusedPainting.userData;
        focusedElementDescription.innerHTML = data.Description;

        startInactivityTimer(); // reset timer
    }
}


function focusCameraOnPainting(paintingMesh) {
    if (isCameraAnimating) return;

    // Save current camera position and target before focusing
    const previousCameraPosition = camera.position.clone();
    const previousControlsTarget = controls.target.clone();
    
    // Store in global variables for later restoration
    window.previousCameraPosition = previousCameraPosition;
    window.previousControlsTarget = previousControlsTarget;

    isCameraAnimating = true;
    controls.enabled = false;
    tooltipElement.style.display = 'none'; // hide tooltip during animatin
    updateActionsPanelVisibility(false); // hide action panel during animation

    const paintingWorldPosition = new THREE.Vector3();
    paintingMesh.getWorldPosition(paintingWorldPosition);

    // Get the painting's world direction (normal vector pointing away from painting)
    const paintingDirection = new THREE.Vector3();
    paintingMesh.getWorldDirection(paintingDirection);
    
    // Position camera in front of the painting along its normal
    const targetPosition = paintingWorldPosition.clone().add(
        paintingDirection.multiplyScalar(cameraFocusDistance)
    );

    new TWEEN.Tween(camera.position)
        .to(targetPosition, cameraAnimationDuration_ms)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

    new TWEEN.Tween(controls.target)
        .to(paintingWorldPosition, cameraAnimationDuration_ms)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
            isCameraAnimating = false;
            controls.enabled = true;
            // currentFocusedPainting was already set in onMouseClick
            showActionPanel(); // show action panel
        })
        .start();
}

function resetCameraPosition() {
    if (isCameraAnimating && !currentFocusedPainting) return;

    isCameraAnimating = true;
    controls.enabled = false;
    updateActionsPanelVisibility(false); // hide actions panel
    clearTimeout(inactivityTimer); // clear inactivity timer

    // Use previous camera position if available, otherwise use original position
    const targetCameraPosition = window.previousCameraPosition || originalCameraPosition;
    const targetControlsTarget = window.previousControlsTarget || originalControlsTarget;

    new TWEEN.Tween(camera.position)
        .to(targetCameraPosition, cameraAnimationDuration_ms)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

    new TWEEN.Tween(controls.target)
        .to(targetControlsTarget, cameraAnimationDuration_ms)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
            isCameraAnimating = false;
            controls.enabled = true;
            currentFocusedPainting = null;
            // Clear the saved positions after use
            window.previousCameraPosition = null;
            window.previousControlsTarget = null;
        })
        .start();
}

function updateActionsPanelPosition()
{
    //console.log("updateActionsPanelPosition");

    const paintingToDisplay = currentFocusedPainting;
    const canvas = renderer.domElement; // Canvas/renderer DOM element
    
    const containerRect = galleryContainerElement.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    // project 3D points to 2D screen coordinates (relative to viewport)
    const planeWidth = paintingToDisplay.geometry.parameters.width;
    const planeHeight = paintingToDisplay.geometry.parameters.height;
    const v_bl_local = new THREE.Vector3(-planeWidth / 2, -planeHeight / 2, 0);
    const v_br_local = new THREE.Vector3( planeWidth / 2, -planeHeight / 2, 0);
    const v_bl_world = v_bl_local.applyMatrix4(paintingToDisplay.matrixWorld);
    const v_br_world = v_br_local.applyMatrix4(paintingToDisplay.matrixWorld);

    v_bl_world.project(camera); // NDC: -1 to 1
    v_br_world.project(camera);

    // convert NDC to pixel coordinates *relative to the canvas*
    const panelLeftOnCanvas = ((v_bl_world.x + 1) / 2) * canvasRect.width;
    const panelRightOnCanvas = ((v_br_world.x + 1) / 2) * canvasRect.width;
    // Y is inverted from NDC: (1 - ndc.y) / 2 for top-left origin
    const paintingBottomYOnCanvas = ((1 - v_bl_world.y) / 2) * canvasRect.height;

    const panelActualWidth = panelRightOnCanvas - panelLeftOnCanvas;

    // set panel style relative to the container (which is parent of canvas)
    actionsPanelElement.style.left = `${panelLeftOnCanvas}px`;
    actionsPanelElement.style.top = `${paintingBottomYOnCanvas - panelHeightPx}px`;
    actionsPanelElement.style.width = `${panelActualWidth}px`;
    actionsPanelElement.style.height = `${panelHeightPx}px`;
}

function updateActionsPanelVisibility(show)
{
    if (show && currentFocusedPainting && !isCameraAnimating)
    {
        //console.log("show actions panel.");

        updateActionsPanelPosition();
        
        const data = currentFocusedPainting.userData;
        actionBtn1.textContent = data.Name || 'Info';
        actionBtn2.disabled = !data.Video || data.Video.toLowerCase() === 'none';
        actionBtn3.disabled = !data.Data || data.Data.toLowerCase() === 'none';
        // Upload button is always enabled for all paintings
        actionBtn4.disabled = false;
        // Edit button is always enabled for all paintings
        actionBtn5.disabled = false;

        // abrupt state change:
        //actionsPanelElement.style.opacity = '1';
        //actionsPanelElement.style.display = 'block';
        
        //console.log("prima del fadein, display = ", actionsPanelElement.style.display, " opacity = ", actionsPanelElement.style.opacity);

        // using fadein
        if (actionsPanelElement.style.display === 'none' || parseFloat(actionsPanelElement.style.opacity) < 1) {
            fadeInActionsPanel();
        }
    } else {
        //console.log("hide actions panel.");

        // abrupt state change
        //actionsPanelElement.style.opacity = '0';
        //actionsPanelElement.style.display = 'none';
        
        //console.log("prima del fadeOut, display = ", actionsPanelElement.style.display, " opacity = ", actionsPanelElement.style.opacity);

        // using fadeOut
        if (actionsPanelElement.style.display !== 'none' && parseFloat(actionsPanelElement.style.opacity) > 0) {
            fadeOutActionsPanel();
         } else {
             actionsPanelElement.style.opacity = '0';
             actionsPanelElement.style.display = 'none';
             actionsPanelElement.style.pointerEvents = 'none';
         }
    }
}

function handleAction(actionType)
{
    if (!currentFocusedPainting) return;
    const data = currentFocusedPainting.userData;
    // switch according to which action button was pressed
    switch (actionType) {
        case 'info':
            // do nothing
            //alert(`Nome: ${data.Name}\nDescrizione: ${data.Description || 'Nessuna descrizione.'}`);
            break;
        case 'video':
            if (data.Video && data.Video.toLowerCase() !== 'none') window.open(data.Video, '_blank');
            else alert('No video link available.');
            break;
        case 'data':
            if (data.Data && data.Data.toLowerCase() !== 'none') {
                const link = document.createElement('a');
                link.href = data.Data;
                link.download = `${data.Data}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else alert('No drawing process file available.');
            break;
        case 'upload':
            // Trigger file input click
            imageUploadInput.click();
            break;
        case 'edit':
            // Start description editing
            startDescriptionEdit();
            break;
    }
}

// Functions for description editing
function startDescriptionEdit() {
    if (!currentFocusedPainting) return;
    
    // Set editing flag to disable WASD controls
    isEditingDescription = true;
    
    // Stop inactivity timer during editing
    clearTimeout(inactivityTimer);
    
    // Get current description
    const currentDescription = currentFocusedPainting.userData.Description || '';
    
    // Show textarea with current description
    descriptionEditTextarea.value = currentDescription;
    descriptionEditTextarea.style.display = 'block';
    descriptionButtons.style.display = 'block';
    
    // Hide the normal description display
    focusedElementDescription.style.display = 'none';
    
    // Focus on textarea
    descriptionEditTextarea.focus();
    descriptionEditTextarea.select();
}

function saveDescription() {
    if (!currentFocusedPainting) return;
    
    const newDescription = descriptionEditTextarea.value.trim();
    
    // Update the painting's userData
    currentFocusedPainting.userData.Description = newDescription;
    
    // Update the display
    focusedElementDescription.innerHTML = newDescription;
    
    // Hide editing elements and show normal description
    descriptionEditTextarea.style.display = 'none';
    descriptionButtons.style.display = 'none';
    focusedElementDescription.style.display = 'block';
    
    // Re-enable WASD controls
    isEditingDescription = false;
    
    // Restart inactivity timer
    startInactivityTimer();
    
    console.log(`Beschreibung aktualisiert: "${newDescription}"`);
}

function cancelDescriptionEdit() {
    // Hide editing elements and show normal description
    descriptionEditTextarea.style.display = 'none';
    descriptionButtons.style.display = 'none';
    focusedElementDescription.style.display = 'block';
    
    // Re-enable WASD controls
    isEditingDescription = false;
    
    // Restart inactivity timer
    startInactivityTimer();
}

function animate() {
    requestAnimationFrame(animate);
    TWEEN.update();
    
    // Handle WASD movement
    handleWASDMovement();
    
    controls.update();


    // disable action panel visibility during camera animation
    if (isCameraAnimating)
        actionsPanelElement.style.display = 'none';

    //debugDiv.innerText = `Timer:\nX: ${cameraDirection.x.toFixed(2)}\nY: ${cameraDirection.y.toFixed(2)}\nZ: ${cameraDirection.z.toFixed(2)}`;

    // update headlight position relative to camera position
    let cameraPos_WS = new THREE.Vector3();
    camera.getWorldPosition(cameraPos_WS);

    let headLightOffsetFromCamera = new THREE.Vector3(0, 1, .15);

    let newHeadLightPos = new THREE.Vector3();
    newHeadLightPos.copy(cameraPos_WS);
    newHeadLightPos.add(headLightOffsetFromCamera);

    headlight.position.copy(newHeadLightPos);

    // change intensity according to distance
    let minIntensity = 10.; // when near - reduziert da wir besseres globales Licht haben
    let maxIntensity = 50.; // when far - reduziert da wir besseres globales Licht haben
    let minDistance = 1.0;
    let maxDistance = 15.0;
    
    // Calculate base intensity
    let baseIntensity = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(cameraPos_WS.z, minDistance, maxDistance, minIntensity, maxIntensity),
        minIntensity, maxIntensity);
    
    // Reduce intensity significantly when focusing on a painting
    if (currentFocusedPainting) {
        baseIntensity *= 0.2; // Reduce to 20% of normal intensity when focused
    }
    
    // remap from one range to another
    //headlight.decay = 2; // default
    headlight.distance = floorSize.width * 2.0;
    headlight.intensity = baseIntensity;
    //console.log("headlight position:", headlight.position);
    //console.log("headlight intensity:", headlight.intensity);


    //renderer.render(scene, camera);
    // replaced by:
    composer.render();
}

// --- start the application ---
init();

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
        alert('Bitte wählen Sie eine Bilddatei aus.');
        return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('Die Datei ist zu groß. Maximale Größe: 10MB.');
        return;
    }

    if (!currentFocusedPainting) {
        alert('Kein Bild ausgewählt.');
        return;
    }

    // Create FileReader to read the image
    const reader = new FileReader();
    reader.onload = function(e) {
        // Create new texture from uploaded image
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(e.target.result, function(texture) {
            // Apply the 180-degree rotation to match the existing setup
            texture.center.set(0.5, 0.5);
            texture.rotation = Math.PI;
            
            // Replace the current painting's texture
            if (currentFocusedPainting.material.map) {
                currentFocusedPainting.material.map.dispose(); // Clean up old texture
            }
            currentFocusedPainting.material.map = texture;
            currentFocusedPainting.material.needsUpdate = true;
            
            // Update painting name and userData
            currentFocusedPainting.name = `Custom Image - ${file.name}`;
            currentFocusedPainting.userData.Name = currentFocusedPainting.name;
            currentFocusedPainting.userData.Description = `Hochgeladenes Bild: ${file.name}`;
            currentFocusedPainting.userData.isCustomUpload = true;
            
            // Update the action panel to show new name
            const data = currentFocusedPainting.userData;
            actionBtn1.textContent = data.Name || 'Info';
            focusedElementDescription.innerHTML = data.Description;
            
            console.log(`Bild ersetzt: ${file.name}`);
            
            // Reset the file input
            imageUploadInput.value = '';
        }, undefined, function(error) {
            console.error('Fehler beim Laden des Bildes:', error);
            alert('Fehler beim Laden des Bildes. Bitte versuchen Sie es erneut.');
        });
    };
    
    reader.readAsDataURL(file);
}