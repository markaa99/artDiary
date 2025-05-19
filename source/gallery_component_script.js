
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
let wallHeight = 3;                         
const floorColor = 0x888888;
const wallColor = 0xaaaaaa;

// --- shared materials ---
let frameMaterial = null;       // material for frame
let passpartoutMaterial = null; // material for pass-partout (mat)


// --- UI elements (HTML Overlay) ---
let galleryContainerElement; // Reference to the container div
let tooltipElement;
let actionsPanelElement;
let countdownDisplayElement;
let actionBtn1, actionBtn2, actionBtn3;
let focusedElementDescription;

// --- raycasting ---
const raycaster = new THREE.Raycaster();

// stores mouse pos relative to container
const mouse = new THREE.Vector2();


// --- auto panning Config (not used for now) ---
let isAutoPanning = false;
let panSpeedFactor = 0.02;
let panZoneThreshold = 0.2;
let currentPanSpeedX = 0;


// --- paintings set configuration ---
const paintingBaseSize = { width: 1, height: .8 };
const spacing = .5;
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
    countdownDisplayElement = document.getElementById('inactivityCountdown');
    focusedElementDescription = document.getElementById('paintingDescription');

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
    renderer.domElement.addEventListener('mouseleave', onCanvasMouseLeave, false); // TODO: for auto-panning

    window.addEventListener('wheel', onMouseWheel);

    // add event listeners for click event on action panel buttons
    actionBtn1.addEventListener('click', () => handleAction('info'));
    actionBtn2.addEventListener('click', () => handleAction('video'));
    actionBtn3.addEventListener('click', () => handleAction('data'));

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
    // TODO: this should be delayed after scene is fully built

    const ambientLight = new THREE.AmbientLight(0xffffff, .5);
    scene.add(ambientLight);

    // directional light
    /*const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);

    directionalLight.castShadow = true;
    // --- configure shadow camera for the light ---
    // TODO: this should be delayed after scene is fully built
    // define camera frustum
    directionalLight.shadow.camera.near = 0.5;    // Default 0.5
    directionalLight.shadow.camera.far = 50;     // Default 500
    directionalLight.shadow.camera.left = -20;   // Default -5
    directionalLight.shadow.camera.right = 20;   // Default 5
    directionalLight.shadow.camera.top = 20;     // Default 5
    directionalLight.shadow.camera.bottom = -20;  // Default -5

    // shadow map size
    directionalLight.shadow.mapSize.width = 2048;  // Default 512
    directionalLight.shadow.mapSize.height = 2048; // Default 512

    // shadow bias (to reduce shadow acne)
    directionalLight.shadow.bias = -0.0005;

    // camera frustum helper
    const shadowCameraHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    scene.add(shadowCameraHelper)
    
    scene.add(directionalLight);
    */

    // we create a pointlight whose position stays relative to camera position
    // (headlight)
    headlight = new THREE.PointLight(0xfff0dd, 100, 0); // Colore, Intensità, Distanza (attenuazione)
    headlight.position.set(0, 5, 5); // Posiziona la luce al centro della stanza, per esempio
    
    // solution 1:
    // absolute position and manual update in the animate function
    scene.add(headlight);

    // solution 2:
    // we set the headlight as a child of the camera
    // no need to update the position in the animate function
    //let lightOffsetFromCamera = new THREE.Vector3(0, .5, .0);
    //camera.add(pointLight);
    //headlight.position.copy(lightOffsetFromCamera);


    //  enable shadows for this light
    headlight.castShadow = true;
    // shadow map resolution  (resolution of each face of the cubemap)
    headlight.shadow.mapSize.width = 1024;  // Default 512
    headlight.shadow.mapSize.height = 1024; // Default 512

    // near and far planes
    headlight.shadow.camera.near = 0.25;
    headlight.shadow.camera.far = 15;

    // shadow bias
    headlight.shadow.bias = -0.001;
    //headlight.shadow.normalBias = 0.05;

    // shadow radius for smoother shadows
    headlight.shadow.radius = 4;

    // just for debug purposes
    /*
    const pointLightHelper = new THREE.PointLightHelper(headlight, 1);
    scene.add(pointLightHelper);
    */
}


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
function createBackgroundScene()
{
    // units are in meters

    // get the cumulative bbox of all paintings
    let cumulativePaintingsBBox = getSceneBoundingBox();
    if (cumulativePaintingsBBox === null) return;


    const paintingsAreaCenter = new THREE.Vector3();
    cumulativePaintingsBBox.getCenter(paintingsAreaCenter);
    //console.log("Paintings Area Center:", paintingsAreaCenter);

    const paintingsAreaSize = new THREE.Vector3();
    cumulativePaintingsBBox.getSize(paintingsAreaSize);
    //console.log("Total Paintings area Size:", paintingsAreaSize);

    let cumulative_padding = 2.0;
    let frontWallZOffset = -.1;

    floorSize.width = paintingsAreaSize.x +cumulative_padding;
    //floorSize.depth = 10.0;


    wallHeight = paintingsAreaSize.y + cumulative_padding;
    let yMin = paintingsAreaCenter.y - wallHeight*.5;
    let yMax = paintingsAreaCenter.y + wallHeight*.5;

    const textureLoader = new THREE.TextureLoader();

    // --- floor ---
    const floorGeometry = new THREE.PlaneGeometry(floorSize.width, floorSize.depth);
    let floorMaterial;

    // textures from polyhaven.com
    const floorTexturePath = "./data/textures/polyhaven__floor_tiles_02_diff_2k.jpg";
     if (floorTexturePath) {
         const floorTexture = textureLoader.load(floorTexturePath);
         floorTexture.wrapS = THREE.RepeatWrapping;
         floorTexture.wrapT = THREE.RepeatWrapping;
         floorTexture.repeat.set(floorSize.width / 2, floorSize.depth / 2);
         floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.1, metalness: 0.1 });
     } else {
        floorMaterial = new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.1, metalness: 0.1 });
     }

    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2; // rotate the plane to make it horizontal
    floor.position.y = yMin;
    floor.position.z = floorSize.depth*.5+frontWallZOffset;
    floor.receiveShadow = true;
    // no need to cast shadows
    // floor.castShadow = false;
    scene.add(floor);

    // ---back wall ---
    // it will be aligned with the far side of the floor
    const wallGeometry = new THREE.PlaneGeometry(floorSize.width, wallHeight);
    let wallMaterial;

    let wallTexturePath = "./data/textures/polyhaven__painted_plaster_wall_diff_2k.jpg";
    if (wallTexturePath) {
         const wallTexture = textureLoader.load(wallTexturePath);
         wallTexture.wrapS = THREE.RepeatWrapping;
         wallTexture.wrapT = THREE.RepeatWrapping;
         wallTexture.repeat.set(floorSize.width / 2, wallHeight / 2);
         wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.9, metalness: 0.1 });
     } else {
        wallMaterial = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.95, metalness: 0.05 });
     }

    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    // plane is created on the XY plane by default
    wall.position.y = paintingsAreaCenter.y;
    wall.position.z = frontWallZOffset;
    wall.receiveShadow = true;
    // wall.castShadow = false;

    scene.add(wall);



    // --- side walls ---
    const sideWallGeometry = new THREE.PlaneGeometry(floorSize.depth, wallHeight);

    // we use the same material for all walls and for the ceiling

    // left wall
    const leftWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
    leftWall.rotation.y = Math.PI / 2; // Ruota di 90 gradi
    leftWall.position.x = -floorSize.width / 2;
    leftWall.position.y = paintingsAreaCenter.y;
    leftWall.position.z = floorSize.depth*.5+frontWallZOffset;
    scene.add(leftWall);

    // right wall
    const rightWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.x = floorSize.width / 2;
    rightWall.position.y = paintingsAreaCenter.y;
    rightWall.position.z = floorSize.depth*.5+frontWallZOffset;
    scene.add(rightWall);

    // ceiling
    const ceiling = new THREE.Mesh(floorGeometry, wallMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = yMax;
    ceiling.position.z = floorSize.depth*.5+frontWallZOffset;
    scene.add(ceiling);
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
function createFrameGeometry(width, height, thickness, depth)
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
        const v0_inner_front = cornersPositions[i];
        const v1_outer_front = new THREE.Vector3(
            v0_inner_front.x + signs[i].x * thickness,
            v0_inner_front.y + signs[i].y * thickness,
            v0_inner_front.z
        );
        profileVertices.push(v0_inner_front.clone());
        
        // TODO: eventually add more segments to profile
        //profileVertices.push(v0_inner_front.clone().add(v1_outer_front.clone().sub(v0_inner_front).normalize()).multiply(.5).add(new THREE.Vector3(.0, .0, .1)));
        //profileVertices.push(v0_inner_front.clone().add(v1_outer_front.sub(v0_inner_front).normalize()).multiply(.5).add(new THREE.Vector3(.0, .0, .1)));

        
        profileVertices.push(v1_outer_front.clone());
        profileVertices.push(v1_outer_front.clone().add(zOffsetVec));
        profileVertices.push(v0_inner_front.clone().add(zOffsetVec));
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
    const textureLoader = new THREE.TextureLoader();
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
                createBackgroundScene();
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
            const passpartoutThickness = .1;
            const passpartoutDepth = 0.005;
                        
            const passpartoutGeometry = createFrameGeometry(planeWidth, planeHeight, passpartoutThickness, passpartoutDepth);
            const passpartout = new THREE.Mesh(passpartoutGeometry, passpartoutMaterial);
            passpartout.position.copy(paintingMesh.position);
            passpartout.position.z += passpartoutDepth;
            // To prevent passpartout from being raycasted for the tooltip (optional)
            // passpartout.raycast = () => {}; // Or add passpartout to a separate non-raycastable group


            // add frame mesh
            // ---------------------------
            const frameThickness = .04;
            const frameDepth = 0.05;

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
}

function createPlaceholder(index, numRows, paintingDataItem = {}) { /* ... (Ensure .userData.type = 'painting') ... */
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


function onMouseWheel(event) {
    // code to run on mouse wheel (scroll event)
    //console.log('mouse wheel event');
    
    updateActionsPanelVisibility(false);
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


function onCanvasMouseLeave() {
    // stop auto-panning if mouse leaves the canvas
    isAutoPanning = false;
    currentPanSpeedX = 0;
    tooltipElement.style.display = 'none'; // hide tooltip when mouse leaves canvas
}



function startInactivityTimer() {
    if (inactivityTimer)
        clearTimeout(inactivityTimer); // clear previous timer
    
    if (currentFocusedPainting && !isCameraAnimating) {
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

    isCameraAnimating = true;
    controls.enabled = false;
    tooltipElement.style.display = 'none'; // hide tooltip during animatin
    updateActionsPanelVisibility(false); // hide action panel during animation

    const paintingWorldPosition = new THREE.Vector3();
    paintingMesh.getWorldPosition(paintingWorldPosition);

    // compute animation target position
    const targetPosition = new THREE.Vector3(
        paintingWorldPosition.x,
        paintingWorldPosition.y,
        paintingWorldPosition.z + cameraFocusDistance
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

    new TWEEN.Tween(camera.position)
        .to(originalCameraPosition, cameraAnimationDuration_ms)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

    new TWEEN.Tween(controls.target)
        .to(originalControlsTarget, cameraAnimationDuration_ms)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
            isCameraAnimating = false;
            controls.enabled = true;
            currentFocusedPainting = null;
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
    }
}

function animate() {
    requestAnimationFrame(animate);
    TWEEN.update();
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
    let minIntensity = 5.; // when near
    let maxIntensity = 200.; // when far
    let minDistance = 1.0;
    let maxDistance = 15.0;
    // remap from one range to another
    //headlight.decay = 2; // default
    headlight.distance = floorSize.width * 2.0;
    headlight.intensity = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(cameraPos_WS.z, minDistance, maxDistance, minIntensity, maxIntensity),
        minIntensity, maxIntensity);
    //console.log("headlight position:", headlight.position);
    //console.log("headlight intensity:", headlight.intensity);


    //renderer.render(scene, camera);
    // replaced by:
    composer.render();
}

// --- start the application ---
init();