import {damageBearing} from './combat-feedback.js';
import {createPaintTint} from './paint-tint.js';
import {drawSupplyMap} from './supply-map.js';
import {ClientMovement} from '../shared/arena/client-movement.js';
import {ServerClock,pushSample,sampleAt} from './interpolation.js';
import {choiceGroup} from './choice-group.js';
import {findPaintSurface} from './paint-surface.js';
import {createStaffPreview} from './staff-preview.js';
import { arenaRoute } from '../shared/arena/navigation.js';
import * as THREE from 'three';
import interfaceHtml from './interface.html?raw';
import interfaceCss from './interface.css?inline';
import { drawToolIcon } from '../src/hud.js';
import { Effects } from '../src/effects.js';
import { PostFX } from '../src/postfx.js';
import { loadQuality, pixelRatioFor } from '../src/quality.js';
import { MuzzleFlash } from '../src/gunfx.js';
import { FaceAnim, FACE_DEFAULTS } from '../src/face.js';
import { OFFICE_ARENA, OFFICE_MAP_HASH } from '../shared/arena/maps.js';
import { COLORS, PRESETS, ARENA_CONFIG, ARENA_WEAPONS, cleanName } from '../shared/arena/rules.js';
import { buildArenaBody, buildArenaTool, attachArenaWeapon, updateArenaBodyPose, disposeArenaBody, disposeArenaVisual } from '../src/arena/arena-models.js';
import { LEVELS } from '../src/levels.js';
import { World } from '../src/world.js';
import { buildViewmodels } from '../src/viewmodels.js';
import { applyPose } from '../src/handrig.js';
import { buildAmmo, buildHealth } from '../src/models.js';
import { initAudio, startSong, setRoom, playSound, isMuted, toggleMute, getOutputVolume, setOutputVolume, audioHealth } from '../src/audio.js';

// The production route mounts Arena in a shadow root owned by the main game.
// That keeps Arena's intentionally generic IDs (hud, feed, canvas, etc.) from
// colliding with the campaign HUD while preserving the standalone beta route.
const embeddedHost = document.getElementById('arena-root');
const arenaRoot = embeddedHost ? embeddedHost.attachShadow({ mode: 'open' }) : document.body;
arenaRoot.innerHTML = `<style>${interfaceCss}</style>${interfaceHtml}`;
const $ = (id) => arenaRoot.querySelector(`#${id}`);
const canvas = $('arena-canvas');
// Chromium rejects pointer-lock requests from a shadow-contained canvas in
// some hosted contexts. Lock the light-DOM host when embedded and keep the
// canvas target for the standalone Arena page.
const pointerLockTarget = embeddedHost || canvas;
const isPointerLocked = () => document.pointerLockElement === pointerLockTarget;
const requestPointerLockSafe = () => {
    const request = pointerLockTarget?.requestPointerLock?.();
    request?.catch?.(() => {});
};
const lobby = $('lobby');
const hud = $('hud');
const status = $('status');
const feed = $('feed');
const pausePanel = $('pause-panel');
const countdown = $('countdown');
const tokenKey = 'tq-arena-reconnect-token';
const toolOrder = ['paintbrush', 'tableLeg', 'sprayer', 'nailgun', 'roller'];
const weaponShort = ['BRUSH', 'LEG', 'SPRAYER', 'NAIL GUN', 'ROLLER'];
$('arena-weapons').innerHTML = toolOrder.map((key, i) => `<button class="arena-weapon rack-slot" data-weapon="${key}" aria-label="${i + 1}: ${ARENA_WEAPONS[key].name}"><canvas class="ricon" width="12" height="7"></canvas><span class="wname">${weaponShort[i]}</span><span class="num">${i + 1}</span></button>`).join('');
$('arena-weapons').querySelectorAll('canvas').forEach((canvas, i) => drawToolIcon(canvas, toolOrder[i]));
const face = new FaceAnim();
let deathBy = 'Another staff member';
let incomingDamage=null,eliminationUntil=0;
let noticeUntil = 0;
let doorNear = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ARENA_RENDER_PIXEL_BUDGET = 3200000;
const settingsKey='tq-arena-settings-v1';
let settings={sensitivity:1,fov:72,invert:false,shadows:true,bob:true,crosshair:'cross'};
try {const saved=JSON.parse(localStorage.getItem(settingsKey)||'{}');settings={sensitivity:Math.max(.25,Math.min(2.5,Number(saved.sensitivity)||1)),fov:Math.max(60,Math.min(100,Number(saved.fov)||72)),invert:saved.invert===true,shadows:saved.shadows!==false,bob:saved.bob!==false,crosshair:['cross','dot','ring'].includes(saved.crosshair)?saved.crosshair:'cross'};} catch {}
const saveSettings=()=>{try{localStorage.setItem(settingsKey,JSON.stringify(settings));}catch{}};
let roundTripMs=null;
const staffPreview=createStaffPreview($('staff-preview'));
const profileKey='tq-arena-profile-v1';
try {
    const profile=JSON.parse(localStorage.getItem(profileKey)||'{}');
    if(typeof profile.name==='string')$('name').value=cleanName(profile.name);
    if(Object.hasOwn(PRESETS,profile.preset))$('preset').value=profile.preset;
    if(Object.hasOwn(COLORS,profile.color))$('color').value=profile.color;
} catch {}
function saveProfile(){try{localStorage.setItem(profileKey,JSON.stringify({name:cleanName($('name').value),preset:$('preset').value,color:$('color').value}));}catch{}}
$('name').addEventListener('change',saveProfile);
// In-theme choices replace the native dropdowns; the selects stay the source of truth.
const choiceSyncs=[
    choiceGroup($('preset'),{className:'choice-staff'}),
    choiceGroup($('color'),{className:'choice-paint',decorate:(button,value)=>{const dot=document.createElement('span');dot.className='choice-swatch';dot.style.background=`#${hex(value).toString(16).padStart(6,'0')}`;button.prepend(dot);}}),
    choiceGroup($('preview-pose'),{className:'choice-compact'}),
    choiceGroup($('preview-held'),{className:'choice-tools',decorate:(button,value)=>{const icon=document.createElement('canvas');icon.width=12;icon.height=7;drawToolIcon(icon,value);button.prepend(icon);}}),
    choiceGroup($('bot-count'),{className:'choice-compact'}),
    choiceGroup($('crosshair-setting'),{className:'choice-compact'}),
];
const syncChoices=()=>choiceSyncs.forEach(sync=>sync());

function updateStaffPreview(){
    const preset=$('preset').value,color=$('color').value;
    staffPreview.set(preset,color);saveProfile();syncChoices();
    $('preview-rank').textContent=$('preview-arsenal').classList.contains('hidden')?PRESETS[preset].label:$('preview-tool-name').textContent;
    $('preview-color').textContent=`${color[0].toUpperCase()+color.slice(1)} paint`;
    $('paint-swatch').style.background=`#${hex(color).toString(16).padStart(6,'0')}`;
}
for(const id of ['preset','color']) $(id).addEventListener('change',updateStaffPreview);
updateStaffPreview();
const weaponNotes={paintbrush:'Reliable single shots. Start every life with one.',tableLeg:'Heavy close-range swing. Never needs paint.',sprayer:'Fast, wide bursts. Keep pressure on nearby staff.',nailgun:'Fast projectiles and a tight spread for longer sightlines.',roller:'Slow, heavy paint bombs. Splash catches nearby opponents.'};
function previewWeapon(key){
    staffPreview.weapon(key);
    for(const button of $('preview-tools').children)button.setAttribute('aria-pressed',String(button.dataset.tool===key));
    const tool=ARENA_WEAPONS[key];
    $('preview-tool-name').textContent=tool.name;
    if(!$('preview-arsenal').classList.contains('hidden'))$('preview-rank').textContent=tool.name;
    $('preview-tool-description').textContent=weaponNotes[key];
    const stats=[['Damage',`${tool.damage}${tool.splashDamage?` direct / ${tool.splashDamage} splash`:''}`],['Paint cost',tool.ammoCost?`${tool.ammoCost} per shot`:'No paint needed'],[tool.type==='melee'?'Swing interval':'Shot interval',`${(tool.cooldownMs/1000).toFixed(2)} seconds`]];
    $('preview-tool-stats').replaceChildren(...stats.map(([label,value])=>{const group=document.createElement('div'),term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=value;group.append(term,detail);return group;}));
    $('preview-tool-acquisition').textContent=(key==='paintbrush'||key==='tableLeg'?'Available at every spawn.':'Find this tool at its numbered Office station.')+' Weapon stations refill your paint and return 25 seconds after collection.';
}
$('preview-tools').innerHTML=toolOrder.map((key,i)=>`<button data-tool="${key}" aria-label="Preview ${ARENA_WEAPONS[key].name}" aria-pressed="false"><canvas width="12" height="7"></canvas><span>${weaponShort[i]}</span></button>`).join('');
$('preview-tools').querySelectorAll('button').forEach((button,i)=>{drawToolIcon(button.querySelector('canvas'),toolOrder[i]);button.addEventListener('click',()=>previewWeapon(toolOrder[i]));});
previewWeapon('paintbrush');
for(const button of $('preview-tabs').children)button.addEventListener('click',()=>{
    const weapons=button.dataset.preview==='weapons';staffPreview.inspect(button.dataset.preview);
    for(const tab of $('preview-tabs').children)tab.setAttribute('aria-pressed',String(tab===button));
    $('preview-rank').textContent=weapons?$('preview-tool-name').textContent:PRESETS[$('preset').value].label;
    $('preview-arsenal').classList.toggle('hidden',!weapons);$('preview-pose').classList.toggle('hidden',weapons);$('preview-held-label').classList.toggle('hidden',weapons);
    $('staff-preview').setAttribute('aria-label',weapons?'In-hand weapon preview. Drag or use arrow keys to rotate.':'Staff preview. Drag or use arrow keys to rotate.');
});
$('preview-reset').addEventListener('click',()=>{staffPreview.reset();$('preview-zoom').value='1';$('preview-spin').checked=false;});
$('preview-left').addEventListener('click',()=>staffPreview.rotate(-.4));
$('preview-right').addEventListener('click',()=>staffPreview.rotate(.4));
$('preview-zoom').addEventListener('input',event=>staffPreview.zoom(Number(event.target.value)));
$('preview-held').addEventListener('change',event=>staffPreview.staffTool(event.target.value));
$('preview-pose').addEventListener('change',event=>staffPreview.walk(event.target.value==='walk'));
$('preview-spin').addEventListener('change',event=>staffPreview.spin(event.target.checked));

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// 5.0: Arena shares the campaign's quality preset and post stack (AO, bloom, grade).
const arenaQuality = loadQuality(renderer);
const renderPixelRatio = () => pixelRatioFor(arenaQuality);
renderer.setPixelRatio(renderPixelRatio());
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Use the campaign shadow pass so desks, plants, and staff retain depth.
// Only the authored world key casts a world shadow; no duplicate shadow key.
renderer.shadowMap.enabled = settings.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11151d);
scene.fog = new THREE.Fog(0x11151d, 22, 70);
// A small unshadowed fill keeps the Office readable in shaded corners.
const arenaFill = new THREE.HemisphereLight(0xe8eef4, 0x777064, 0.22);
scene.add(arenaFill);
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 90);
// Match campaign PostFX: world and authored tools use separate camera layers.
camera.layers.set(0);
camera.rotation.order = 'YXZ';
const vmCamera = new THREE.PerspectiveCamera(56, 1, 0.02, 20);
vmCamera.layers.set(1);
camera.add(vmCamera);
scene.add(camera);
const arenaPost = new PostFX(renderer, scene, camera, { vmCamera, quality: arenaQuality });
if (new URLSearchParams(location.search).has("test")) window.__tqArenaPost = arenaPost;
// Campaign's nearby player light reveals furniture in unlit Office corners.
const playerLight = new THREE.PointLight(0xffe0b0, 2.4, 6, 1.6);
scene.add(playerLight);
let lastRenderAt=performance.now();
const effects = new Effects(scene);
const paintAudit={anchored:0,particlesOnly:0};
let decalSurfaces=[];
const world = new THREE.Group();
scene.add(world);
// World owns the Office lighting; adding another shadow key causes surface acne.

const bodies = new Map();
const pickupMeshes = new Map();
let productionWorld = null;
const officeProps = new Map();
let worldMatchId = null;
const projectileMeshes = new Map();
let localSlot = null;
let ws = null;
let roomState = null;
let lastSnapshot = null;
let yaw = 0;
let pitch = 0;
let seq = 0;
let fireHeld = false;
let paused = false;
let connected = false;
let resumeRequired = false;
let explicitLeave = false;
let reconnectAttempts = 0;
const keys = new Set();
let roomPoll = null;
let countdownDeadline = 0;
let resultsDeadline=0,resultsWaitValue=null;
let countdownValue = null;
let snapshotAt = 0;
let localPlayer = null;
const movement=new ClientMovement();
const serverClock=new ServerClock();
const PICKUP_DEFS=new Map(OFFICE_ARENA.pickups.map(p=>[p.id,p]));
let predictionMap={...OFFICE_ARENA,closedDoorCells:OFFICE_ARENA.doors.map(d=>d.id)};
const pendingShots=[];
let feedbackAudit=null;
let localCooldownUntil=0;
const cameraTarget = new THREE.Vector3();
let musicMatchId = null;
let arenaSong = null;
try{arenaSong=sessionStorage.getItem('tq-arena-last-song');}catch{}
const arenaSongs = ['office', 'archives', 'factory', 'boss'];
function updateArenaMusic(room) {
    if (!['countdown', 'active'].includes(room.state) || musicMatchId === room.matchId) return;
    const choices = arenaSongs.filter(song => song !== arenaSong);
    arenaSong = choices[Math.floor(Math.random() * choices.length)];
    musicMatchId = room.matchId;
    try{sessionStorage.setItem('tq-arena-last-song',arenaSong);}catch{}
    startSong(arenaSong,{playlist:arenaSongs});
    setRoom('office');
}

function resize() {
    renderer.setPixelRatio(renderPixelRatio());
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    vmCamera.aspect = camera.aspect;
    vmCamera.updateProjectionMatrix();
    arenaPost.setPixelRatio(renderPixelRatio());
    arenaPost.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize); resize();

function hex(name) { return COLORS[name] ?? COLORS.brass; }

function disposePickup(mesh) {
    disposeArenaVisual(mesh);
}

const pickupBuilders = {
    paint: buildAmmo, food: buildHealth,
    paintbrush: () => floorTool('paintbrush'), tableLeg: () => floorTool('tableLeg'),
    sprayer: () => floorTool('sprayer'), nailgun: () => floorTool('nailgun'), roller: () => floorTool('roller'),
};
// Weapon stations show the same detailed tool players hold, enlarged and
// resting on the floor so it reads from across the room.
function floorTool(weapon) {
    const group = new THREE.Group(), tool = buildArenaTool(weapon);
    tool.scale.setScalar(1.45);
    group.add(tool);
    const bounds = new THREE.Box3().setFromObject(group), center = bounds.getCenter(new THREE.Vector3());
    tool.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
    return group;
}

function syncPickup(pickup) {
    const model = pickup.model || pickup.weapon || pickup.kind;
    let mesh = pickupMeshes.get(pickup.id);
    if (mesh && mesh.userData.pickupModel !== model) {
        disposePickup(mesh);
        pickupMeshes.delete(pickup.id);
        mesh = null;
    }
    if (!mesh) {
        if (!Number.isFinite(pickup.x) || !Number.isFinite(pickup.z)) return;
        mesh = (pickupBuilders[model] || buildAmmo)();
        mesh.userData.pickupModel = model;
        mesh.userData.restYaw = mesh.rotation.y;
        mesh.traverse(object => { if (object.isMesh) object.castShadow = false; });
        world.add(mesh);
        pickupMeshes.set(pickup.id, mesh);
    }
    mesh.userData.arenaPickup = pickup;
    mesh.position.set(pickup.x, 0.12, pickup.z);
    mesh.visible = pickup.available !== false;
}

function syncDestroyedCover(ids = []) {
    for (const id of ids) {
        const prop = productionWorld.props.get(id);
        if (prop) productionWorld.damageProp(prop.x, prop.y, prop.hp);
    }
    // Props are batched: changing only the source mesh leaves intact furniture
    // on screen. Rebuild dirty regions once per snapshot, not once per prop.
    if (productionWorld.batchDirty) productionWorld.rebuildPropBatch();
}

function buildOffice() {
    // Reuse the production Office builder. The server map is derived from the
    // same LEVELS[1] ASCII layout, while World supplies the actual campaign
    // textures, dressing, ceiling, trim, windows, and lighting.
    if (productionWorld) {
        // A match resets gameplay state, not the authored scene. Disposing and
        // rebuilding here also tears down live baked materials/textures and
        // lights on the first lobby -> match transition.
        for (const [id, prop] of officeProps) {
            if (prop.state !== 'intact') productionWorld.swapPropMesh(prop, 'intact');
            prop.hp = prop.def.hp;
            productionWorld.props.set(id, prop);
            productionWorld.propCells.add(id);
            if (prop.def.tall) productionWorld.tallProps.add(id);
        }
        productionWorld.wrecks.length = 0;
        productionWorld.propsVersion = (productionWorld.propsVersion || 0) + 1;
        if (productionWorld.batchDirty) productionWorld.rebuildPropBatch();
        // Keep server-added supply meshes too; the next snapshot supplies their
        // authoritative availability. No world or shared asset disposal needed.
        for (const mesh of pickupMeshes.values()) {
            mesh.visible = false;
            mesh.rotation.y = mesh.userData.restYaw;
        }
        for (const pickup of OFFICE_ARENA.pickups) syncPickup(pickup);
        return;
    }
    // World attaches its own group once and applies fog to the actual scene.
    productionWorld = new World(scene, LEVELS[1], 1);
    for (const [id, prop] of productionWorld.props) officeProps.set(id, prop);
    decalSurfaces=productionWorld.group.children.filter(mesh=>mesh.userData.decalSurface);
    renderer.toneMappingExposure = productionWorld.rig.exposure ?? 1.1;
    arenaPost.applyGrade(productionWorld.rig.grade || {});
    productionWorld.keyLight.shadow.mapSize.set(2048,2048);
    productionWorld.keyLight.shadow.normalBias=.04;
    // Doors follow server snapshots. The campaign-only elevator gate stays open.
    for (const door of productionWorld.doors.values()) {
        door.openT=0;door.state='closed';
        door.mesh.material=door.mesh.material.clone();door.mesh.material.color.setHex(0x78998d);
        const sign=document.createElement('canvas');sign.width=256;sign.height=96;
        const ink=sign.getContext('2d');ink.fillStyle='#173f38';ink.fillRect(0,0,256,96);ink.strokeStyle='#d7bd75';ink.lineWidth=7;ink.strokeRect(4,4,248,88);ink.fillStyle='#fff0c8';ink.font='bold 35px Arial';ink.textAlign='center';ink.fillText('E · DOOR',128,61);
        const texture=new THREE.CanvasTexture(sign);texture.colorSpace=THREE.SRGBColorSpace;
        const signMaterial=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
        for(const side of [-1,1]){
            const plate=new THREE.Mesh(new THREE.PlaneGeometry(.48,.18),signMaterial);
            plate.position.set(door.spanX?0:side*.081,.13,door.spanX?side*.081:0);plate.rotation.y=door.spanX?(side<0?Math.PI:0):(side<0?-Math.PI/2:Math.PI/2);door.mesh.add(plate);
            const handle=new THREE.Mesh(new THREE.BoxGeometry(.055,.16,.055),new THREE.MeshStandardMaterial({color:0xd9ba65,metalness:.7,roughness:.3}));handle.position.set(door.spanX?.32:side*.11,-.13,door.spanX?side*.11:.32);door.mesh.add(handle);
        }
    }
    productionWorld.gatesUnlocked = true;
    for (const gate of productionWorld.gates) { gate.t = 1; gate.mesh.visible = false; }
    for (const pickup of OFFICE_ARENA.pickups) syncPickup(pickup);
}
buildOffice();

function getBody(player) {
    let entry = bodies.get(player.slot);
    const identity = JSON.stringify([player.name, player.preset, player.color, Boolean(player.bot)]);
    if (entry && entry.identity !== identity) {
        disposeArenaBody(entry.body);
        bodies.delete(player.slot);
        entry = null;
    }
    if (!entry) {
        const preset = PRESETS[player.preset]?.model ?? 0;
        const body = buildArenaBody({ variant: preset, color: hex(player.color) });
        scene.add(body.group);
        entry = { body, identity, tool: null, weapon: null, target: new THREE.Vector3(), targetYaw: 0, samples: [],
            initialized: false, pose: { yaw: 0, pitch: 0, movement: 0, phase: player.slot, alive: false, fireT: 0, flinchT: 0, deathT: undefined, deathSide: 1 } };
        bodies.set(player.slot, entry);
    }
    if (entry.weapon !== player.weapon) {
        entry.tool = attachArenaWeapon(entry.body, player.weapon);
        entry.weapon = player.weapon;
    }
    return entry;
}

function clearBodies() {
    for (const entry of bodies.values()) disposeArenaBody(entry.body);
    bodies.clear();
}

function pruneBodies(players) {
    const slots = new Set(players.map((player) => player.slot));
    for (const [slot, entry] of bodies) {
        if (slots.has(slot)) continue;
        disposeArenaBody(entry.body);
        bodies.delete(slot);
    }
}

// Use campaign-authored tools and presentation poses; the server still decides
// which weapon is equipped and when a shot actually fires.
const localVmRoot = new THREE.Group();
localVmRoot.position.set(0.14, -0.08, -0.47);
localVmRoot.scale.setScalar(0.9); // Campaign's normal-play scale.
camera.add(localVmRoot);
const localViewmodels = buildViewmodels();
const tintLocalTools=createPaintTint(localViewmodels);
let localPaintColor=null;
function setLocalPaint(color){
    if(localPaintColor===color)return;localPaintColor=color;
    const tint=new THREE.Color(hex(color));
    tintLocalTools(hex(color));
    $('arena-paint-bar').style.background=`linear-gradient(180deg,#${tint.getHexString()},#${tint.clone().multiplyScalar(.45).getHexString()})`;
}
const muzzleFlash = new MuzzleFlash(localVmRoot);
for (const vm of Object.values(localViewmodels)) {
    vm.visible = false; localVmRoot.add(vm);
    vm.userData.basePos = vm.position.clone();
}
// Campaign camera-space illumination, isolated from the world's shadow map.
const vmKey = new THREE.PointLight(0xffffff, 0.15, 3, 2);
vmKey.position.set(0.35, 0.45, 0.1);
const vmRim = new THREE.PointLight(0xc8d8ff, 0.5, 3, 2);
vmRim.position.set(-0.5, 0.2, -0.3);
const vmSun = new THREE.DirectionalLight(0xfff4e8, 1.1);
vmSun.position.set(0.45, 0.7, 0.25);
vmSun.target.position.set(0, -0.15, -0.55);
camera.add(vmSun.target);
vmSun.castShadow = false;
const vmShadowCamera = vmSun.shadow.camera;
vmShadowCamera.left = -0.5; vmShadowCamera.right = 0.5;
vmShadowCamera.top = 0.45; vmShadowCamera.bottom = -0.45;
vmShadowCamera.near = 0.01; vmShadowCamera.far = 2.5;
vmShadowCamera.layers.set(1);
vmSun.shadow.bias = -0.0006; vmSun.shadow.normalBias = 0.004;
const vmFill = new THREE.HemisphereLight(0xe8eef4, 0x4a4038, 0.25);
for (const light of [vmKey, vmRim, vmSun, vmFill]) { light.layers.set(1); camera.add(light); }
const vmAnim = { phase: 0, lower: 0, recoil: 0, swing: 0, swap: 0, pending: null };
// Kinematic impulses and spring constants from campaign Game.RECOIL.
const recoil = {
    paintbrush: [0.06, 0.03, -0.9, 0.35, 220, 12],
    tableLeg: [0.1, -0.06, 0.9, 0.5, 140, 11],
    sprayer: [0.018, 0.004, 0.10, 0.04, 360, 28],
    nailgun: [0.22, 0.08, 1.3, 0.18, 420, 20],
    roller: [0.4, 0.14, 1.8, 0.45, 150, 12],
};
const spring = new Float64Array(8);
let localToolWeapon = null;
function updateLocalTool(weapon) {
    if (vmAnim.pending === weapon || (!vmAnim.pending && localToolWeapon === weapon)) return;
    if (localToolWeapon) { vmAnim.pending = weapon; return; }
    showLocalTool(weapon);
}
function showLocalTool(weapon) {
    localToolWeapon = weapon;
    for (const key of toolOrder) localViewmodels[key].visible = key === weapon;
    spring.fill(0); vmAnim.swing = 0; vmAnim.recoil = 0;
}

let smoothedWeaponSpeed=0,weaponMotion=0;
function animateLocalTool(dt, time) {
    localVmRoot.visible = !!localPlayer?.alive && ['active','countdown'].includes(roomState?.state);
    const targetSpeed=localPlayer&&performance.now()-snapshotAt<250?Math.hypot(localPlayer.vx,localPlayer.vz):0;
    smoothedWeaponSpeed+=(targetSpeed-smoothedWeaponSpeed)*(1-Math.exp(-dt*9));
    const speed=smoothedWeaponSpeed,moving=speed>.05;
    weaponMotion+=((moving?Math.min(1,speed/3.7):0)-weaponMotion)*(1-Math.exp(-dt*8));
    if (moving) vmAnim.phase += dt * (3.2 + speed * 1.6);
    vmAnim.lower += ((moving && speed > 3.7 ? 1 : 0) - vmAnim.lower) * Math.min(1, dt * 9);
    vmAnim.swap = Math.max(0, Math.min(1, vmAnim.swap + (vmAnim.pending ? 1 : -1) * dt / 0.2));
    if (vmAnim.pending && vmAnim.swap === 1) { showLocalTool(vmAnim.pending); vmAnim.pending = null; }
    const drop = vmAnim.swap * vmAnim.swap, lower = vmAnim.lower, bob = settings.bob ? 1 : 0;
    localVmRoot.position.set(0.14 + bob * (Math.sin(vmAnim.phase * 0.5) * 0.008 * weaponMotion + Math.sin(time * 1.1) * 0.003) + lower * 0.07,
        -0.08 + bob * (Math.cos(vmAnim.phase) * 0.006 * weaponMotion + Math.sin(time * 1.7) * 0.002) - drop * 0.34 - lower * 0.13, -0.47 + lower * 0.03 + (localToolWeapon==='tableLeg'?.1:0));
    localVmRoot.rotation.set(drop * 0.9 + lower * 0.55, -lower * 0.35, lower * 0.12);
    const vm = localViewmodels[localToolWeapon];
    if (!vm) return;
    const rc = recoil[localToolWeapon];
    const steps = Math.max(1, Math.ceil(dt / 0.004)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
        for (let axis = 0; axis < 4; axis++) {
            const k = rc[4] * (axis === 1 ? 1.2 : axis === 2 ? 0.9 : 1);
            const d = rc[5] * (axis === 2 ? 0.9 : 1);
            spring[axis + 4] += (-k * spring[axis] - d * spring[axis + 4]) * h;
            spring[axis] += spring[axis + 4] * h;
        }
    }
    vm.position.copy(vm.userData.basePos);
    vm.rotation.set(vm.userData.baseRotX || 0, 0, 0);
    if(localToolWeapon==='tableLeg'){vm.position.x+=.06;vm.position.y-=.06;}
    vmAnim.recoil = Math.max(0, vmAnim.recoil - dt * 6);
    if (localToolWeapon === 'tableLeg') {
        vmAnim.swing = Math.max(0, vmAnim.swing - dt);
        const p = 1 - vmAnim.swing / 0.46;
        const q = THREE.MathUtils.smoothstep(p < 0.2 ? p / 0.2 : p < 0.68 ? (p - 0.2) / 0.48 : (p - 0.68) / 0.32, 0, 1);
        const y = p < 0.2 ? 0.62 * q : p < 0.68 ? THREE.MathUtils.lerp(0.62, -1.05, q) : -1.05 * (1 - q);
        const roll = p < 0.2 ? -0.34 * q : p < 0.68 ? THREE.MathUtils.lerp(-0.34, 0.68, q) : 0.68 * (1 - q);
        vm.rotation.x -= Math.abs(y) * 0.18;
        vm.rotation.y = y; vm.rotation.z = roll;
        vm.position.x += y * 0.08;
        vm.position.y += p < 0.2 ? 0.09 * q : p < 0.68 ? THREE.MathUtils.lerp(0.09, -0.035, q) : -0.035 * (1 - q);
        if (p >= 0.2 && p < 0.68) vm.position.z -= Math.sin(q * Math.PI) * 0.12;
        localVmRoot.rotation.y += y * 0.18; localVmRoot.rotation.z += roll * 0.12;
    } else {
        vm.position.z += spring[0]; vm.position.y += spring[1];
        vm.rotation.x += spring[2]; vm.rotation.z = spring[3];
    }
    const parts = vm.userData.parts || {};
    const trigger = parts.trigger;
    if (trigger) trigger.rotation.x = trigger.userData.rest.x + Math.min(1, vmAnim.recoil * 1.5) * 0.5;
    if (parts.head) parts.head.rotation.x = parts.head.userData.rest.x - vmAnim.recoil * 0.6;
    for (const rig of vm.userData.rigs || []) {
        rig.sq = Math.min(1, vmAnim.recoil * 1.6) * (rig.side === 'R' ? 1 : 0.15);
        rig.relax = Math.max(vmAnim.lower, vmAnim.swap);
        rig.fid = 0; rig.grip = 0;
        rig.wristFlex = spring[2] * (rig.side === 'R' ? 0.5 : 0.25);
        applyPose(rig);
    }
    if (parts.offHand) {
        const rest = parts.offHand.userData.rest;
        const r = vmAnim.recoil;
        const pump = r > 0.55 ? (1 - r) / 0.45 : r / 0.55;
        parts.offHand.position.z = rest.pz + (localToolWeapon === 'roller' ? pump * 0.05 : r * 0.012);
        parts.offHand.position.y = rest.py + Math.sin(time * 0.9) * 0.002 + (moving ? Math.sin(vmAnim.phase * 0.5 + 1) * 0.003 : 0);
        parts.offHand.rotation.z = rest.z + Math.sin(time * 0.7) * 0.012;
    }
}

const projectileGeometries = {};
const projectileMaterials = {};
for (const [weapon, color] of Object.entries({ paintbrush: 0x3479ff, sprayer: 0x3479ff, nailgun: 0xc8ccd4, roller: 0xffbf36 })) {
    const size = ARENA_WEAPONS[weapon].size;
    const tracer = weapon === 'nailgun';
    const trail = weapon === 'paintbrush' || weapon === 'roller';
    const geometry = tracer || trail
        ? new THREE.CylinderGeometry(size * (tracer ? 0.5 : 0.35), size * (tracer ? 0.9 : 1), tracer ? 0.42 : 0.22, 8)
        : new THREE.SphereGeometry(size, 8, 8);
    if (tracer || trail) geometry.rotateX(Math.PI / 2);
    projectileGeometries[weapon] = geometry;
    projectileMaterials[weapon] = new THREE.MeshBasicMaterial({ color, transparent: tracer, opacity: tracer ? 0.9 : 1, blending: tracer ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !tracer });
}
const activeProjectiles = new Set();

function updateProjectileVisuals(projectiles = []) {
    const active = activeProjectiles;
    active.clear();
    for (const projectile of projectiles) {
        active.add(projectile.id);
        let mesh = projectileMeshes.get(projectile.id);
        if (!mesh) {
            const materialKey=`${projectile.weapon}:${projectile.color || 'brass'}`;
            if(!projectileMaterials[materialKey]) {projectileMaterials[materialKey]=(projectileMaterials[projectile.weapon] || projectileMaterials.paintbrush).clone();if(projectile.weapon!=='nailgun')projectileMaterials[materialKey].color.setHex(hex(projectile.color));}
            mesh = new THREE.Mesh(projectileGeometries[projectile.weapon] || projectileGeometries.paintbrush, projectileMaterials[materialKey]);
            mesh.position.set(projectile.x, projectile.y ?? 0.62, projectile.z);
            mesh.userData.target = mesh.position.clone();
            world.add(mesh);
            projectileMeshes.set(projectile.id, mesh);
        }
        mesh.userData.velocity=new THREE.Vector3(projectile.vx || 0,projectile.vy || 0,projectile.vz || 0);
        const target = mesh.userData.target;
        target.set(projectile.x, projectile.y ?? 0.62, projectile.z);
        if (target.distanceToSquared(mesh.position) > 0.00001) mesh.lookAt(target);
    }
    for (const [id, mesh] of projectileMeshes) {
        if (active.has(id)) continue;
        world.remove(mesh);
        projectileMeshes.delete(id);
    }
}

function showFeed(text) {
    const item = document.createElement('div'); item.textContent = text; feed.prepend(item);
    while (feed.children.length > 4) feed.lastChild.remove();
    setTimeout(() => item.remove(), 5000);
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

function renderRoster(roster = []) {
    $('roster').innerHTML = roster.map((p) => `<div class="roster-row${p.ready ? ' is-ready' : ''}"><span class="dot" style="background:#${hex(p.color).toString(16).padStart(6, '0')}"></span><b>${escapeHtml(p.name)}</b><span>${p.bot ? 'BOT · ' : ''}${PRESETS[p.preset]?.label || 'STAFF'}</span><span>${p.connected ? (p.ready ? 'READY' : 'NOT READY') : 'RECONNECTING'}</span></div>`).join('');
}

function renderRooms(rooms = []) {
    $('rooms').innerHTML = rooms.map(room => `<div class="room-row"><span>${room.state === 'active' ? 'Round in progress' : room.state === 'results' ? 'Round complete' : 'Office lobby'}</span><span>${room.players}/${room.maxPlayers} players · ${room.bots} bots</span></div>`).join('');
}

async function refreshRooms() {
    try {
        const response = await fetch('../api/arena/rooms');
        if (!response.ok) throw new Error('rooms unavailable');
        const data = await response.json();
        renderRooms(data.rooms || []);
    } catch {
        $('rooms').innerHTML = '<div class="room-row"><span>Room browser offline · connect directly to OFFICE8.</span></div>';
    }
}

function appendChat(entry) {
    const line = document.createElement('div');
    line.className = 'chat-line';
    line.textContent = `${entry.name}: ${entry.text}`;
    $('chat-log').append(line);
    $('chat-empty').classList.add('hidden');
    while ($('chat-log').children.length > 30) $('chat-log').firstElementChild.remove();
    $('chat-log').scrollTop = $('chat-log').scrollHeight;
}

function updateRoom(room) {
    if(['countdown','active'].includes(room.state) && $('settings-dialog').open)$('settings-dialog').close();
    if (worldMatchId !== room.matchId) {
        if (worldMatchId !== null) buildOffice();
        worldMatchId = room.matchId;
        lastSnapshot = null;
        effects.clear();
        pendingShots.length=0;localCooldownUntil=0;
    }
    const enteringCountdown = room.state === 'countdown'
        && (roomState?.state !== 'countdown' || roomState?.matchId !== room.matchId);
    if (enteringCountdown) {
        countdownDeadline = performance.now() + room.countdownMs;
        countdownValue = null;
        if(localPlayer) { yaw=localPlayer.yaw; pitch=localPlayer.pitch; camera.position.copy(cameraTarget); }
    } else if (room.state !== 'countdown') countdownDeadline = 0;
    if (roomState?.matchId !== room.matchId) {
        localPlayer = null;
        clearBodies();
        updateProjectileVisuals([]);
    }
    roomState = room;
    resultsDeadline=performance.now()+Math.max(0,room.rematchWaitMs??(room.resultsAt+10000-Date.now()));resultsWaitValue=null;
    lobby.classList.toggle('joined', room.roster.some(p=>p.slot===localSlot));
    lobby.classList.toggle('results-mode',room.state==='results');
    lobby.querySelector('h1').innerHTML = room.state==='active' ? 'Round in progress' : room.state === 'results' ? 'Round results' : 'Office lobby';
    updateArenaMusic(room);
    pruneBodies(room.roster);
    renderRoster(room.roster);
    const me = room.roster.find((p) => p.slot === localSlot);
    if(me)setLocalPaint(me.color);
    $('ready').disabled = !connected || !me || (room.connected < 2 && !me.ready) || room.state === 'active' || room.state === 'countdown';
    $('ready').textContent = me?.ready ? 'CANCEL READY' : 'READY UP';
    $('start').disabled = !me || room.hostSlot !== localSlot || !['lobby', 'results'].includes(room.state);
    $('start').textContent = 'Start countdown';
    $('bot-toggle').disabled = !me || room.hostSlot !== localSlot || !['lobby', 'results'].includes(room.state);
    updateBotLabel(room);
    $('ready').classList.toggle('hidden',!me || room.state==='active' || (room.connected<2 && !me.ready));
    $('lobby-leave').classList.toggle('hidden',!me);
    $('bot-toggle').classList.toggle('primary',room.connected<2);
    $('bot-toggle').classList.toggle('hidden', !me || room.state==='active' || room.hostSlot !== localSlot || room.connected >= room.maxPlayers);
    $('bot-count').classList.toggle('hidden',$('bot-toggle').classList.contains('hidden'));
    $('bot-count').disabled=$('bot-toggle').disabled;
    $('connect').classList.toggle('hidden', !!me);
    arenaRoot.querySelector('.chat').classList.toggle('hidden', !me);
    for (const id of ['name','preset','color']) $(id).disabled = !!me;
    $('ready').textContent = me?.ready ? 'Ready · undo' : room.connected<2 ? 'Add opponents first' : room.roster.filter(p=>p.connected && !p.bot).length===1 ? 'Start 8-second countdown' : 'Ready for countdown';
    $('ready').setAttribute('aria-pressed',String(!!me?.ready));
    $('chat-members').textContent=`${room.roster.filter(p=>p.connected && !p.bot).length} human${room.roster.filter(p=>p.connected && !p.bot).length===1 ? '' : 's'} in room`;
    $('bot-clear').classList.toggle('hidden', !room.bots || room.state==='active');
    $('lobby-leave').textContent=room.state==='active' ? 'Leave room' : 'Leave lobby';
    $('bot-clear').disabled = !me || room.hostSlot !== localSlot || !['lobby', 'results'].includes(room.state);
    $('resume').classList.toggle('hidden', room.state !== 'active' || !resumeRequired);
    $('results').classList.toggle('hidden', room.state !== 'results');
    if(room.state==='results')renderResults(room.results || []);
    $('chat-log').replaceChildren(); $('chat-empty').classList.toggle('hidden',!!room.chat?.length); (room.chat || []).forEach(appendChat);
    if (room.state === 'lobby' || room.state === 'results') {
        paused = false; keys.clear(); fireHeld = false;
        document.exitPointerLock?.();
        pausePanel.classList.add('hidden'); lobby.classList.remove('hidden'); hud.classList.add('hidden'); countdown.classList.add('hidden');
        status.textContent = room.state === 'results' ? `Round complete · standings locked for ${Math.max(0, Math.ceil((room.resultsAt + 10000 - Date.now()) / 1000))}s` : room.connected < 2 ? 'Next: add bots or wait for another player. Starting needs at least two staff.' : me?.ready ? `You are ready. Waiting for ${room.roster.filter(p=>p.connected && !p.ready).map(p=>p.name).join(', ') || 'the room'}.` : `${room.connected}/${room.maxPlayers} staff joined. ${room.roster.filter(p=>p.connected && !p.bot).length===1 ? 'Press Start 8-second countdown when you are ready.' : 'Ready up when you want the countdown to begin.'}`;
    } else if (room.state === 'countdown') {
        resumeRequired = false; paused = false; keys.clear(); fireHeld = false;
        pausePanel.classList.add('hidden'); lobby.classList.add('hidden'); hud.classList.remove('hidden'); countdown.classList.remove('hidden');
        updateCountdown(performance.now());
    } else if (room.state === 'active' && resumeRequired && !paused) {
        pausePanel.classList.add('hidden'); lobby.classList.remove('hidden'); hud.classList.add('hidden'); countdown.classList.add('hidden');
        status.textContent = 'The round is underway. Enter match to take control, or leave the room.';
    } else if (!paused) {
        lobby.classList.add('hidden'); hud.classList.remove('hidden');
        countdown.classList.add('hidden');
        status.textContent = 'LIVE · THE OFFICE';
    }
}

function updateCountdown(now) {
    if (!countdownDeadline || roomState?.state !== 'countdown') return;
    const value = Math.max(1, Math.ceil((countdownDeadline - now) / 1000));
    if (value === countdownValue) return;
    countdownValue = value;
    $('countdown-value').textContent = String(value);
    status.textContent = `ROUND STARTS IN ${value} · STAFF LOCKED`;
}

function updateResultsWait(now){
    if(roomState?.state!=='results')return;
    const seconds=Math.max(0,Math.ceil((resultsDeadline-now)/1000));
    if(seconds===resultsWaitValue)return;resultsWaitValue=seconds;
    const me=roomState.roster.find(p=>p.slot===localSlot),host=me&&roomState.hostSlot===localSlot;
    $('ready').disabled=!!seconds||!connected||!me||roomState.connected<2;
    for(const id of ['start','bot-toggle','bot-count','bot-clear'])$(id).disabled=!!seconds||!host;
    $('ready').textContent=seconds?`Next round in ${seconds}s`:roomState.roster.filter(p=>p.connected&&!p.bot).length===1?'Start next round':'Ready for next round';
    status.textContent=seconds?`Round complete · next round available in ${seconds}s`:'Round complete · ready up for another round, adjust bots, or leave the lobby.';
}

function renderPauseScore() {
    if(!$('match-guide').classList.contains('hidden'))drawSupplyMap($('supply-map'),OFFICE_ARENA,lastSnapshot,localPlayer,yaw);
    const roster = [...(roomState?.roster || [])].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.slot - b.slot);
    $('pause-loadout').textContent = (localPlayer?.weapons || []).map(key => ARENA_WEAPONS[key].name).join(' · ');
    $('pause-status').textContent = `${$('timer').textContent} remaining · ${localPlayer?.health ?? 0} health · ${localPlayer?.paint ?? 0} paint`;
    $('sound-setting').checked=!isMuted();
    $('network-status').textContent=roundTripMs===null ? 'Measuring connection…' : `Connection: ${roundTripMs<1 ? '<1' : Math.round(roundTripMs)} ms round trip${roundTripMs>150 ? ' · High delay' : ''}`;
    const supplies=lastSnapshot?.pickups || OFFICE_ARENA.pickups;
    const locations={paintbrush:'Central aisle',tableLeg:'North hall',sprayer:'West desks',nailgun:'East desks',roller:'South corridor'};
    const rows=supplies.filter(p=>p.weapon).map(p=>[`${toolOrder.indexOf(p.weapon)+1} · ${ARENA_WEAPONS[p.weapon].name}`,locations[p.weapon],p.available===false ? `Returns in ${Math.ceil(p.respawnRemainingMs/1000)}s` : 'Available']);
    for(const kind of ['paint','food']){const stations=supplies.filter(p=>p.kind===kind);rows.push([kind==='food'?'HEALTH':'PAINT',`${stations.length} stations · ${kind==='food'?20:10}s respawn`,`${stations.filter(p=>p.available!==false).length} available`]);}
    const body=$('supply-rows');
    rows.forEach((values,index)=>{
        let row=body.rows[index];
        if(!row){row=body.insertRow();const heading=document.createElement('th');heading.scope='row';row.append(heading);row.insertCell();row.insertCell();}
        values.forEach((value,column)=>{if(row.cells[column].textContent!==value)row.cells[column].textContent=value;});
    });
    while(body.rows.length>rows.length)body.deleteRow(-1);
    const standings=standingsRows(roster);
    if(renderPauseScore.standings!==standings){$('pause-score').innerHTML=standings;renderPauseScore.standings=standings;}
}

function isOwnStanding(player){
    return player.playerId ? player.playerId===roomState?.roster.find(p=>p.slot===localSlot)?.playerId : player.slot===localSlot;
}
function renderResults(results){
    const me=results.find(isOwnStanding);
    $('results').innerHTML=`<h2>Final standings</h2><p class="result-summary">${results[0] ? escapeHtml(results[0].name)+' wins the round.' : 'Round complete.'} ${me ? 'You placed '+me.rank+' of '+results.length+'.' : 'You did not play this round.'}</p><table class="standings-table"><thead><tr><th scope="col">Rank</th><th scope="col">Staff</th><th scope="col">Eliminations</th><th scope="col">Deaths</th></tr></thead><tbody>${standingsRows(results)}</tbody></table>`;
}
function standingsRows(roster) {
    return roster.map((p, i) => `<tr class="${isOwnStanding(p) ? 'me' : ''}"><td>${p.rank ?? i + 1}</td><td>${escapeHtml(p.name)}<small>${isOwnStanding(p) ? 'YOU' : (p.bot || roomState?.roster.find(member=>member.slot===p.slot)?.bot) ? 'BOT' : ''}</small></td><td>${p.kills}</td><td>${p.deaths}</td></tr>`).join('');
}

function updateSnapshot(snapshot) {
    if (!roomState || snapshot.matchId !== roomState.matchId) return;
    // Snapshots carry only live pickup state; the shared map owns the rest.
    snapshot.pickups = (snapshot.pickups || []).map((p) => ({ ...PICKUP_DEFS.get(p.id), ...p, model: PICKUP_DEFS.get(p.id)?.weapon || PICKUP_DEFS.get(p.id)?.kind }));
    lastSnapshot = snapshot;
    predictionMap={...OFFICE_ARENA,blockingCells:OFFICE_ARENA.blockingCells.filter(id=>!snapshot.destroyedCover.includes(id)),closedDoorCells:snapshot.doors.filter(d=>d.openT<.75).map(d=>d.id)};
    for (const state of snapshot.doors || []) {
        const door = productionWorld.doors.get(state.id);
        if (door) { door.targetT = state.openT; door.serverOpen = state.open; }
    }
    snapshotAt = performance.now();
    serverClock.sample(snapshot.serverTime, clientNow());
    pruneBodies(snapshot.players);
    let scoresChanged = false;
    for (const player of snapshot.players) {
        const member = roomState.roster.find((p) => p.slot === player.slot);
        if (!member || (member.kills === player.kills && member.deaths === player.deaths)) continue;
        member.kills = player.kills;
        member.deaths = player.deaths;
        scoresChanged = true;
    }
    if (scoresChanged) {
        renderRoster(roomState.roster);
        if (paused) renderPauseScore();
    }
    const me = snapshot.players.find((p) => p.slot === localSlot);
    movement.others = snapshot.players.filter((p) => p.slot !== localSlot && p.alive).map((p) => ({ x: p.x + p.vx * 0.05, z: p.z + p.vz * 0.05 }));
    if (me) {
        cameraTarget.set(me.x, me.alive ? 0.7 : .22, me.z);
        movement.reconcile(predictionMap,me,!localPlayer || me.alive!==localPlayer.alive || camera.position.distanceToSquared(cameraTarget)>9);
        if(!me.alive)pendingShots.length=0;
        if (!localPlayer || (!localPlayer.alive && me.alive) || camera.position.distanceToSquared(cameraTarget) > 9) {
            camera.position.copy(cameraTarget);
            yaw = me.yaw; pitch = me.pitch;
        }
        if (!me.alive) { fireHeld=false; keys.clear(); }
        localPlayer = me;
        $('stats').textContent = `${me.kills} K · ${me.deaths} D`;
        // Keep a local weapon choice visible until the next authoritative
        // snapshot confirms it. Replacing it on every 15 Hz snapshot made
        // number-key switching look broken under normal network cadence.
        if (!(me.weapons || []).includes(currentWeapon)) {
            currentWeapon = me.weapon;
            weaponRequest = null;
        } else if (weaponRequest === me.weapon) {
            weaponRequest = null;
        } else if (!weaponRequest) {
            currentWeapon = me.weapon;
        }
        $('arena-health-value').textContent = String(me.health);
        $('arena-health-bar').parentElement.classList.toggle('low',me.health<=25);
        $('arena-paint-bar').parentElement.classList.toggle('low',me.paint<ARENA_WEAPONS[currentWeapon].ammoCost);
        $('arena-health-bar').style.width = `${Math.max(0, me.health)}%`;
        $('arena-paint-value').textContent = String(me.paint);
        $('arena-paint-bar').style.width = `${Math.max(0, Math.min(99, me.paint)) / 99 * 100}%`;
        $('arena-rank').textContent = String([...snapshot.players].sort((a,b) => b.kills-a.kills || a.deaths-b.deaths || a.slot-b.slot).findIndex(p => p.slot === localSlot) + 1);
        updateWeaponHud(me);
        $('dead').classList.toggle('hidden', me.alive);
        if(!me.alive){
            const seconds=String(Math.max(1,Math.ceil(me.respawnMs/1000)));
            if($('death-source').textContent!==deathBy)$('death-source').textContent=deathBy;
            if($('respawn-seconds').textContent!==seconds)$('respawn-seconds').textContent=seconds;
            $('respawn-progress').style.width=`${Math.max(0,Math.min(1,1-me.respawnMs/ARENA_CONFIG.respawnMs))*100}%`;
        }
        $('crosshair').classList.toggle('hidden', !me.alive);
    }
    for (const player of snapshot.players) {
        const rosterPlayer = (roomState.roster || []).find((p) => p.slot === player.slot) || { slot: player.slot, preset: 'guard', color: 'brass' };
        const entry = getBody({ ...rosterPlayer, weapon: player.weapon });
        entry.target.set(player.x, 0, player.z);
        entry.targetYaw = Math.PI / 2 - player.yaw;
        if (!entry.initialized || (!entry.pose.alive && player.alive) || entry.body.group.position.distanceToSquared(entry.target) > 9) {
            entry.body.group.position.copy(entry.target);
            entry.pose.yaw = entry.targetYaw;
            entry.initialized = true;
            entry.samples.length = 0;
        }
        pushSample(entry.samples, { t: snapshot.serverTime, x: player.x, z: player.z, yaw: entry.targetYaw });
        entry.pose.pitch = player.pitch;
        entry.pose.speed = Math.hypot(player.vx, player.vz);
        entry.pose.movement = Math.min(1, entry.pose.speed / 5.6);
        entry.pose.alive = player.alive;
        if (player.alive) entry.pose.deathT = undefined;
        else if (entry.pose.deathT === undefined) entry.pose.deathT = 0;
        entry.body.group.visible = player.slot !== localSlot && (player.alive || Number.isFinite(entry.pose.deathT));
    }
    for (const state of snapshot.coverHealth || []) { const prop=productionWorld.props.get(state.id); if(prop && prop.hp>state.health) productionWorld.damageProp(prop.x,prop.y,prop.hp-state.health); }
    syncDestroyedCover(snapshot.destroyedCover);
    const pickupIds = new Set();
    for (const pickup of snapshot.pickups || []) {
        pickupIds.add(pickup.id);
        syncPickup(pickup);
    }
    for (const [id, mesh] of pickupMeshes) {
        if (pickupIds.has(id)) continue;
        disposePickup(mesh);
        pickupMeshes.delete(id);
    }
    updateProjectileVisuals(snapshot.projectiles);
    const remaining = snapshot.state === 'countdown' ? 300000 : Math.max(0, snapshot.remainingMs);
    $('timer').textContent = `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`;
}

function connect() {
    if (ws && ws.readyState <= 1) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/arena/ws`);
    const socket = ws;
    explicitLeave = false;
    $('connect').disabled = true;
    status.textContent = reconnectAttempts ? 'Connection lost · reconnecting…' : 'Joining the Office lobby…';
    ws.addEventListener('open', () => {
        if (ws !== socket) return;
        ws.send(JSON.stringify({ v: 1, type: 'hello', protocol: 1, roomCode: $('room-code').value, reconnectToken: sessionStorage.getItem(tokenKey), name: cleanName($('name').value), preset: $('preset').value, color: $('color').value }));
    });
    ws.addEventListener('message', (event) => {
        if (ws !== socket) return;
        const data = JSON.parse(event.data);
        if (data.type === 'welcome') {
            connected = true;
            const resumed = reconnectAttempts > 0;
            reconnectAttempts = 0;
            if (resumed) { $('pickup-notice').textContent = 'Reconnected'; noticeUntil = performance.now() + 1500; }
            localSlot = data.slot; sessionStorage.setItem(tokenKey, data.token);
            const identity=data.room.roster.find(player=>player.slot===localSlot);
            if(identity){$('name').value=identity.name;$('preset').value=identity.preset;$('color').value=identity.color;updateStaffPreview();}

            // An automatic reconnect returns straight to play.
            resumeRequired = data.room.state === 'active' && !resumed;
            if (data.room.chat?.length) { $('chat-log').replaceChildren(); data.room.chat.forEach(appendChat); }
            initAudio(); setRoom('office');
            updateRoom(data.room);
        }
        else if (data.type === 'room') updateRoom(data);
        else if(data.type==='pong' && Number.isFinite(data.sentAt)) roundTripMs=performance.now()-data.sentAt;
        else if (data.type === 'snapshot') updateSnapshot(data);
        else if (data.type === 'result') { resumeRequired = false; renderResults(data.results); renderPauseScore(); }
        else if (data.type === 'chat') appendChat(data.entry);
        else if (data.type === 'event') {
            if (data.kind === 'impact') {
                const projectile=projectileMeshes.get(data.projectileId);if(projectile){projectile.removeFromParent();projectileMeshes.delete(data.projectileId);}
                const pos=new THREE.Vector3(data.x,data.y,data.z),normal=new THREE.Vector3(...data.normal),color=new THREE.Color(hex(data.color));
                productionWorld.group.updateMatrixWorld(true);
                const surface=data.target==='static' ? findPaintSurface(decalSurfaces,pos,normal,data.weapon==='nailgun' ? .05 : .34) : null;
                if(surface){paintAudit.anchored++;effects.impact(surface.position,surface.normal,data.surface,color,data.weapon==='nailgun' ? 'nail' : 'paint',{decalSize:surface.size});}
                else {paintAudit.particlesOnly++;effects.burst(pos,color,10,1.5,.35);}
                if(camera.position.distanceTo(pos)<12)playSound(data.weapon==='nailgun' ? 'wood_hit' : 'splat');
            }
            if (data.kind === 'explosion') {
                const pos=new THREE.Vector3(data.x,data.y,data.z);
                const color=new THREE.Color(hex(data.color));
                effects.burst(pos,color,26,3.4,.6);
                const surface=findPaintSurface(decalSurfaces,new THREE.Vector3(data.x,0,data.z),new THREE.Vector3(0,1,0),1.05);
                if(surface)effects.splat(surface.position,surface.normal,color,surface.size);
                playSound('roller_boom');
            }
            if (data.kind === 'cover-hit') {
                const [x,z]=data.id.split(',').map(Number),pos=new THREE.Vector3(x+.5,.45,z+.5),wood=new THREE.Color(0x9a7442);
                const prop=productionWorld.props.get(data.id);
                if(prop && prop.hp>data.health)productionWorld.damageProp(prop.x,prop.y,prop.hp-data.health);
                effects.burst(pos,wood,data.destroyed ? 22 : 6,data.destroyed ? 3 : 1.4,data.destroyed ? .6 : .3);
                if(data.destroyed) effects.burst(new THREE.Vector3(x+.5,.2,z+.5),new THREE.Color(0x6e5436),12,2,.5);
                effects.debris(new THREE.Vector3(x+.5,.35,z+.5),wood,data.destroyed ? 18 : 4,data.destroyed ? 2.8 : 1.6);
                playSound(data.destroyed ? 'wood_break' : 'wood_hit');
            }

            if (data.kind === 'match-start') { localPlayer = null; resumeRequired = false; countdown.classList.add('hidden'); paused = false; lobby.classList.add('hidden'); pausePanel.classList.add('hidden'); hud.classList.remove('hidden'); playSound('alert'); }
            if (data.kind === 'fire') {
                const entry = bodies.get(data.slot);
                if (entry) { entry.pose.fireT = 0.18; if (data.weapon === 'tableLeg') entry.pose.swingT = 0.46; }
            }
            if (data.kind === 'door') playSound(data.open ? 'door_open' : 'door_close');
            if (data.kind === 'death') {
                if (data.victim === localSlot) deathBy = `Painted by ${roomState?.roster.find(p => p.slot === data.killer)?.name || 'the room'} · ${ARENA_WEAPONS[data.weapon]?.name || data.weapon}`;
                const entry = bodies.get(data.victim);
                if (entry) { entry.pose.alive = false; entry.pose.deathT = 0; entry.pose.deathSide = (data.killer ?? 1) % 2 ? 1 : -1; }
                if(data.killer===localSlot){const name=roomState?.roster.find(p=>p.slot===data.victim)?.name||'Staff';$('elimination-notice').textContent=`Painted out ${name}`;$('elimination-notice').classList.remove('hidden');eliminationUntil=performance.now()+1600;}
                if(data.victim===localSlot)incomingDamage=null;
                const victim = roomState?.roster.find((p) => p.slot === data.victim)?.name || 'STAFF'; const killer = data.killer === null ? 'the room' : roomState?.roster.find((p) => p.slot === data.killer)?.name || 'staff'; showFeed(`${killer} painted ${victim} · ${ARENA_WEAPONS[data.weapon]?.name || data.weapon}`); if(data.killer===localSlot)playSound('killmark');
                const fallen=lastSnapshot?.players.find(p=>p.slot===data.victim);
                if(fallen&&localPlayer){const dx=fallen.x-localPlayer.x,dz=fallen.z-localPlayer.z,distance=Math.hypot(dx,dz);if(distance<18)playSound('enemy_death',{gain:Math.max(.08,1-distance/18),pan:Math.max(-1,Math.min(1,(-Math.sin(yaw)*dx+Math.cos(yaw)*dz)/Math.max(1,distance)))});}
            }
            if (data.kind === 'hit') {
                const entry = bodies.get(data.victim);
                if (entry) entry.pose.flinchT = 0.3;
                if (data.victim === localSlot) { const source=lastSnapshot?.players.find(p=>p.slot===data.attacker);incomingDamage=source?{x:source.x,z:source.z,until:performance.now()+900}:null;showFeed(`HIT · ${data.health} HP · ${ARENA_WEAPONS[data.weapon]?.name || data.weapon}`); $('arena-damage').classList.add('on'); setTimeout(() => $('arena-damage').classList.remove('on'), 130); playSound('pain'); }
                if (data.attacker === localSlot) { $('arena-hit').classList.remove('on'); void $('arena-hit').offsetWidth; $('arena-hit').classList.add('on'); playSound('hitmark'); }
            }
            if (data.kind === 'fire' && data.slot === localSlot) {
                const predicted=pendingShots.findIndex(shot=>shot.weapon===data.weapon);
                if(predicted>=0){const shot=pendingShots.splice(predicted,1)[0];if(feedbackAudit?.inputAt===shot.at)feedbackAudit.confirmationMs=performance.now()-shot.at;}
                else localFireFeedback(data.weapon);
            }
            if (data.kind === 'pickup' && data.slot === localSlot) {
                if (data.weapon && !localPlayer?.weapons.includes(data.weapon)) { currentWeapon = data.weapon; weaponRequest = data.weapon; updateLocalTool(data.weapon); }
                if (data.weapon) { $('pickup-notice').textContent = `${ARENA_WEAPONS[data.weapon].name} · ${localPlayer?.weapons.includes(data.weapon) ? 'paint refilled' : 'equipped'} · key ${toolOrder.indexOf(data.weapon)+1}`; $('pickup-notice').classList.remove('hidden'); noticeUntil = performance.now()+3500; }
                const slot = toolOrder.indexOf(data.weapon);
                const pickup = pickupMeshes.get(data.pickup)?.userData.arenaPickup;
                showFeed(slot >= 0 ? `${ARENA_WEAPONS[data.weapon].name} collected · key ${slot + 1}` : `${pickup?.kind === 'food' ? 'HEALTH' : 'PAINT'} COLLECTED`);
                playSound('collect');
            }
            if (data.kind === 'respawn' && data.slot === localSlot) { if(tour) {tour.path=[];tour.hold=0;} playSound('collect'); $('pickup-notice').textContent='Back in · brush + table leg · brief spawn protection'; $('pickup-notice').classList.remove('hidden'); noticeUntil=performance.now()+2000; }
        }
        else if (data.type === 'error') {
            if (data.code === 'room_full' || data.code === 'round_locked') sessionStorage.removeItem(tokenKey);
            status.textContent = `${data.code === 'waiting_for_ready' ? 'READY CHECK' : 'ARENA'} · ${data.message}`;
            if (!connected) {
                // During a reconnect let the close handler retry or reset.
                if (reconnectAttempts) socket.close();
                else { ws = null; socket.close(); $('connect').disabled = false; }
            }
        }
    });
    ws.addEventListener('close', (event) => {
        if (ws !== socket) return;
        ws = null;
        const wasJoined = connected;
        connected = false;
        $('ready').disabled = true;
        $('start').disabled = true;
        $('bot-toggle').disabled = true;
        $('bot-clear').disabled = true;
        if (explicitLeave) return;
        // The server holds the slot for its reconnect grace period; retry
        // quietly inside it instead of dropping the player to the lobby.
        if ((wasJoined || reconnectAttempts) && event.code !== 4001 && sessionStorage.getItem(tokenKey) && reconnectAttempts < 7) {
            reconnectAttempts++;
            localPlayer = null; keys.clear(); fireHeld = false;
            status.textContent = 'Connection lost · reconnecting…';
            $('pickup-notice').textContent = 'Connection lost · reconnecting…'; $('pickup-notice').classList.remove('hidden'); noticeUntil = 0;
            setTimeout(() => { if (!explicitLeave) connect(); }, Math.min(2000, 250 * 2 ** (reconnectAttempts - 1)));
            return;
        }
        reconnectAttempts = 0;
        $('pickup-notice').classList.add('hidden');
        lobby.classList.remove('joined','results-mode');
        $('connect').classList.remove('hidden');
        for(const id of ['ready','bot-toggle','bot-count','bot-clear','lobby-leave']) $(id).classList.add('hidden');
        for(const id of ['name','preset','color']) $(id).disabled=false;
        roomState = null;
        lastSnapshot = null;
        localPlayer = null;
        countdownDeadline = 0;
        updateProjectileVisuals([]);
        clearBodies();
        paused = false;
        resumeRequired = false;
        keys.clear(); fireHeld = false;
        document.exitPointerLock?.();
        pausePanel.classList.add('hidden');
        hud.classList.add('hidden');
        countdown.classList.add('hidden');
        $('resume').classList.add('hidden');
        renderRoster([]);
        lobby.classList.remove('hidden');
        $('connect').disabled = false;
        localSlot = null;
        $('results').classList.add('hidden');
        weaponRequest = null;
        status.textContent = 'Connection lost · choose JOIN OFFICE LOBBY to reconnect';
    });
}

const tour = new URLSearchParams(location.search).has('test') && new URLSearchParams(location.search).has('arenaTour') ? {index:0,path:[],hold:0,doorAt:0,label:'starting',lastShot:0} : null;
const tourStops = [
    {label:'sprayer',point:[7.5,12.5]}, {label:'roller',point:[19.5,22.5]},
    {label:'door approach',point:[31.5,19.5]}, {label:'door crossing',point:[33.5,19.5]},
    {label:'nailgun',point:[31.5,13.5]}, {label:'brush + leg',point:[19.5,3.5]},
    {label:'door controls',point:[15.5,9.5]},
];
function tourInput() {
    if(!tour || !localPlayer?.alive) return null;
    if(tour.index>=tourStops.length) {tour.label='complete';return null;}
    const stop=tourStops[tour.index],now=performance.now();
    tour.label=stop.label;
    if(tour.hold>now) return {moveX:0,moveY:0,fire:false};
    if(tour.hold) {tour.hold=0;tour.index++;tour.path=[];return null;}
    const map={...OFFICE_ARENA,blockingCells:OFFICE_ARENA.blockingCells.filter(id=>!lastSnapshot.destroyedCover.includes(id))};
    for(const door of lastSnapshot.doors || []) {
        const [x,z]=door.id.split(',').map(Number);
        if(!door.open && now>tour.doorAt && Math.hypot(localPlayer.x-x-.5,localPlayer.z-z-.5)<1.5) {ws.send(JSON.stringify({v:1,type:'interact'}));tour.doorAt=now+700;}
    }
    if(Math.hypot(localPlayer.x-stop.point[0],localPlayer.z-stop.point[1])<.4) {tour.hold=now+3500;return {moveX:0,moveY:0,fire:false};}
    if(!tour.path.length) tour.path=arenaRoute(map,localPlayer,stop.point);
    while(tour.path.length && Math.hypot(localPlayer.x-tour.path[0][0],localPlayer.z-tour.path[0][1])<.2) tour.path.shift();
    const next=tour.path[0];
    if(!next) return null;
    yaw=Math.atan2(next[1]-localPlayer.z,next[0]-localPlayer.x);pitch=0;
    return {moveX:0,moveY:1,fire:false};
}
let rehearsalInput=null;
function currentInput(){
    const controlling=!paused && !resumeRequired && arenaVisible() && localPlayer?.alive;
    return {moveX:rehearsalInput?.moveX ?? (controlling ? (keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0) : 0),moveY:rehearsalInput?.moveY ?? (controlling ? (keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0) : 0),yaw,pitch,sprint:controlling && (keys.has('ShiftLeft')||keys.has('ShiftRight')),fire:rehearsalInput?.fire ?? (controlling && fireHeld),weapon:currentWeapon};
}
function sendInput(tap=false){
    if(!ws || ws.readyState!==WebSocket.OPEN || roomState?.state!=='active')return;
    if(!tap)rehearsalInput=!paused && !resumeRequired && arenaVisible() ? tourInput() : null;
    const input={...currentInput(),tap};
    // viewDelay tells the server how far in the past we see other staff, so
    // our hits are judged against what we saw (bounded server-side).
    const viewDelay=Math.round(serverClock.delay()+(roundTripMs||0)/2);
    ws.send(JSON.stringify({v:1,type:'input',matchId:roomState.matchId,seq:++seq,viewDelay,...input}));
    // Predict exactly the step the server will apply for this input.
    if(!tap && localPlayer?.alive)movement.step(predictionMap,input,seq);
}
function localFireFeedback(weapon){
    playSound({paintbrush:'shoot',tableLeg:'swing',sprayer:'spray',nailgun:'nail',roller:'roller_fire'}[weapon]);
    if(weapon!==localToolWeapon)return;
    vmAnim.recoil=1;
    muzzleFlash.fire(weapon,localViewmodels[weapon],new THREE.Color(hex(roomState?.roster.find(p=>p.slot===localSlot)?.color || 'brass')));
    if(weapon==='tableLeg')vmAnim.swing=.46;
    else for(let axis=0;axis<4;axis++)spring[axis+4]+=recoil[weapon][axis];
}
function predictLocalFire(now){
    if(!currentInput().fire || !localPlayer?.alive)return;
    const weapon=ARENA_WEAPONS[currentWeapon];
    if(now<localCooldownUntil || localPlayer.paint-pendingShots.reduce((n,s)=>n+ARENA_WEAPONS[s.weapon].ammoCost,0)<weapon.ammoCost)return;
    if(pendingShots.length>=12)return;
    localCooldownUntil=now+weapon.cooldownMs;pendingShots.push({weapon:currentWeapon,at:now});localFireFeedback(currentWeapon);feedbackAudit={weapon:currentWeapon,inputAt:now,localFeedbackMs:performance.now()-now,confirmationMs:null};
}
let currentWeapon = 'paintbrush';
let weaponRequest = null;
// Fixed 30 Hz movement steps are taken from the render loop (see render), so
// the drawn camera can blend exactly between the last two steps each frame.
let inputAccumulator = 0;
const clientNow = () => performance.timeOrigin + performance.now();

// One settings form serves both menus, so values and handlers cannot drift.
const settingsDialog=$('settings-dialog'),settingsForm=$('match-settings');
$('lobby-settings').addEventListener('click',()=>{
    $('settings-slot').append(settingsForm);settingsForm.classList.remove('hidden');
    $('sound-setting').checked=!isMuted();
    $('network-status').textContent=connected?'Changes apply immediately and are saved on this browser.':'Join a room to measure the connection.';
    settingsDialog.showModal();
});
$('settings-done').addEventListener('click',()=>settingsDialog.close());
settingsDialog.addEventListener('close',()=>{
    pausePanel.insertBefore(settingsForm,$('match-guide'));
    showMatchPanel(arenaRoot.querySelector('[data-panel][aria-pressed="true"]')?.dataset.panel||'standings');
});
$('connect').addEventListener('click', connect);
$('ready').addEventListener('click', () => { const me = roomState?.roster.find((p) => p.slot === localSlot); ws?.send(JSON.stringify({ v: 1, type: 'ready', ready: !me?.ready })); });
$('start').addEventListener('click', () => ws?.send(JSON.stringify({ v: 1, type: 'start' })));
function updateBotLabel(room=roomState){const free=Math.max(0,(room?.maxPlayers||8)-(room?.connected||0)),count=Math.min(free,$('bot-count').value==='fill'?free:Number($('bot-count').value));$('bot-toggle').textContent=`Add ${count} bot${count===1?'':'s'}`;}
$('bot-count').addEventListener('change',()=>updateBotLabel());
$('bot-toggle').addEventListener('click', () => ws?.send(JSON.stringify({ v: 1, type: 'bots', enabled: true, ...($('bot-count').value==='fill'?{}:{count:Number($('bot-count').value)}) })));
$('bot-clear').addEventListener('click', () => ws?.send(JSON.stringify({ v: 1, type: 'bots', enabled: false })));
$('rooms').addEventListener('click', (event) => { const button = event.target.closest('[data-join-room]'); if (!button) return; $('room-code').value = button.dataset.joinRoom; if (!connected) connect(); });
$('chat-form').addEventListener('submit', (event) => { event.preventDefault(); const input = $('chat-text'); const text = input.value.trim(); if (!text || !ws || ws.readyState !== WebSocket.OPEN) return; ws.send(JSON.stringify({ v: 1, type: 'chat', text })); input.value = ''; });
function leaveRoom() {
    incomingDamage=null;eliminationUntil=0;$('elimination-notice').classList.add('hidden');
    explicitLeave = true;
    const socket = ws;
    ws = null;
    connected = false;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ v: 1, type: 'leave' }));
    socket?.close();
    sessionStorage.removeItem(tokenKey);
    roomState = null;
    lobby.classList.remove('joined','results-mode');
    lobby.querySelector('h1').innerHTML = 'After hours.<br>Anything goes.';
    lastSnapshot = null;
    localPlayer = null;
    paused = false;
    resumeRequired = false;
    keys.clear(); fireHeld = false;
    currentWeapon = 'paintbrush'; weaponRequest = null;
    document.exitPointerLock?.();
    lobby.classList.remove('hidden');
    $('resume').classList.add('hidden');
    $('results').classList.add('hidden');
    $('results').replaceChildren();
    $('chat-log').replaceChildren();
    $('connect').disabled = false;
    $('connect').classList.remove('hidden');
    for (const id of ['ready','bot-toggle','bot-count','bot-clear','lobby-leave']) $(id).classList.add('hidden');
    for (const id of ['name','preset','color']) $(id).disabled = false;
    arenaRoot.querySelector('.chat').classList.add('hidden');
    for (const id of ['ready', 'start', 'bot-toggle', 'bot-clear']) $(id).disabled = true;
    $('ready').textContent = 'Add opponents first';
    lobby.querySelector('h1').textContent='Office Arena';
    $('chat-log').replaceChildren();$('chat-empty').classList.remove('hidden');
    pausePanel.classList.add('hidden');
    hud.classList.add('hidden');
    countdown.classList.add('hidden');
    countdownDeadline = 0;
    updateProjectileVisuals([]);
    localSlot = null;
    clearBodies();
    renderRoster([]);
    status.textContent = 'You left the Office. Join again when you’re ready.';
    refreshRooms();
}
function returnToMain(event) {
    if(settingsDialog.open)settingsDialog.close();
    event?.preventDefault(); event?.stopPropagation();
    leaveRoom();
    musicMatchId = null; // The main menu takes audio ownership on exit.
    if (embeddedHost) window.dispatchEvent(new CustomEvent('tq-arena-exit'));
    else location.assign('../#menu');
}
$('back-main').addEventListener('click', returnToMain);
$('lobby-leave').addEventListener('click', leaveRoom);
$('hud-menu').addEventListener('click', () => { if(roomState?.state==='countdown') ws?.send(JSON.stringify({v:1,type:'ready',ready:false})); else pauseLocal(true); });
$('countdown-cancel').addEventListener('click', () => ws?.send(JSON.stringify({v:1,type:'ready',ready:false})));
$('capture').addEventListener('click', requestPointerLockSafe);
$('pause-back-main').addEventListener('click', returnToMain);
function pauseLocal(shouldPause = !paused) {
    if (roomState?.state !== 'active') return;
    if (!shouldPause) {
        resumeRequired = false; paused = false; lobby.classList.add('hidden'); pausePanel.classList.add('hidden'); hud.classList.remove('hidden'); status.textContent = 'LIVE · THE OFFICE'; requestPointerLockSafe(); return;
    }
    paused = true; keys.clear(); fireHeld = false;
    sendInput(true);
    document.exitPointerLock?.();
    lobby.classList.add('hidden'); hud.classList.add('hidden'); pausePanel.classList.remove('hidden');
    $('pause-status').textContent = 'The round continues while you are away. Your staff remains in the room.';
    renderPauseScore();
    $('pause-resume').focus();
}
 $('resume').addEventListener('click', () => { if (roomState?.state !== 'active') return; resumeRequired = false; paused = false; lobby.classList.add('hidden'); hud.classList.remove('hidden'); status.textContent = 'LIVE · THE OFFICE'; requestPointerLockSafe(); });
 $('pause-resume').addEventListener('click', () => { if (roomState?.state !== 'active') return; paused = false; pausePanel.classList.add('hidden'); hud.classList.remove('hidden'); status.textContent = 'LIVE · THE OFFICE'; requestPointerLockSafe(); });
$('pause-leave').addEventListener('click', () => { leaveRoom(); pausePanel.classList.add('hidden'); lobby.classList.remove('hidden'); hud.classList.add('hidden'); status.textContent = 'You left the Office. Enter again to join a new round.'; });
addEventListener('keydown', (event) => {
    if (!arenaVisible()) return;
    if(settingsDialog.open){event.stopImmediatePropagation();if(event.code==='Escape'){event.preventDefault();settingsDialog.close();}return;}
    if(event.code==='Tab' && paused && !event.shiftKey && (arenaRoot.activeElement||document.activeElement)===$('pause-resume')){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)pauseLocal(false);return;}
    if(event.code==='Tab' && paused){
        const focusable=[...pausePanel.querySelectorAll('button,a[href],input,select,summary')].filter(node=>!node.disabled&&node.getClientRects().length);
        const current=arenaRoot.activeElement||document.activeElement;
        const first=focusable[0],last=focusable.at(-1);
        if((event.shiftKey && current===first)||(!event.shiftKey && current===last)||!pausePanel.contains(current)){
            event.preventDefault();(event.shiftKey?last:first)?.focus();
        }
        event.stopImmediatePropagation();return;
    }
    if(event.code==='Escape' && paused){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)pauseLocal();return;}
    const inField = event.composedPath?.().some((node) => node?.matches?.('input, textarea, select, [contenteditable="true"]'));
    if (embeddedHost && !document.getElementById('arena-screen')?.classList.contains('hidden')) {
        const inField = event.composedPath?.().some((node) => node?.matches?.('input, textarea, select, [contenteditable="true"]'));
        event.stopImmediatePropagation();
        if (inField) return;
    }
    if (inField || resumeRequired) return;
    if(event.code==='Tab' && roomState?.state==='active' && !paused){event.preventDefault();if(!event.repeat){showMatchPanel('standings');pauseLocal();}return;}
    if (event.code === 'Escape') { if (!event.repeat) { if (!roomState || ['lobby','results'].includes(roomState.state)) returnToMain(); else if(roomState.state==='countdown') ws?.send(JSON.stringify({v:1,type:'ready',ready:false})); else pauseLocal(); } return; }
    if (event.code === 'KeyE' && !event.repeat && !paused && roomState?.state === 'active') ws?.send(JSON.stringify({v:1,type:'interact'}));
    if (paused || roomState?.state !== 'active') return;
    if(!event.repeat){keys.add(event.code);sendInput(true);}
    const index = Number(event.key) - 1;
    if (index >= 0 && index < toolOrder.length && !event.repeat) selectWeapon(toolOrder[index]);
});
function updateWeaponHud(me=localPlayer) {
    if(!me)return;
    $('arena-weapon-name').textContent = ARENA_WEAPONS[currentWeapon].name;
    $('arena-ammo').textContent = currentWeapon === 'tableLeg' ? 'Melee · no paint needed' : me.paint<ARENA_WEAPONS[currentWeapon].ammoCost ? 'Out of paint · 2 for table leg' : `${ARENA_WEAPONS[currentWeapon].ammoCost} paint / shot`;
    $('arena-weapons').querySelectorAll('.arena-weapon').forEach((slot, i) => {
        const key = toolOrder[i];
        slot.classList.toggle('active', key === currentWeapon);
        slot.setAttribute('aria-pressed', String(key === currentWeapon));
        slot.setAttribute('aria-label', `${i+1}: ${ARENA_WEAPONS[key].name}${(me.weapons || []).includes(key) ? key===currentWeapon ? ', equipped' : ', owned' : ', find in the Office'}`);
        slot.classList.toggle('unavailable', !(me.weapons || toolOrder).includes(key));
    });
    updateLocalTool(currentWeapon);
}
function selectWeapon(key) {
    if (paused || roomState?.state !== 'active' || !localPlayer?.alive) return;
    if (!localPlayer.weapons.includes(key)) { showFeed(`Find ${ARENA_WEAPONS[key].name} · ${({paintbrush:'central aisle',tableLeg:'north hall',sprayer:'west desks',nailgun:'east desks',roller:'south corridor'})[key]} · Tab → Field guide for map`); return; }
    if (currentWeapon === key) return;
    currentWeapon = key; weaponRequest = key; updateWeaponHud(); playSound('weapon_switch');sendInput(true);
}
$('arena-weapons').addEventListener('click', event => { const button = event.target.closest('[data-weapon]'); if (button) selectWeapon(button.dataset.weapon); });
let lastWeaponWheelAt=-Infinity;
addEventListener('wheel', event => {
    if (!arenaVisible() || paused || resumeRequired || settingsDialog.open || roomState?.state !== 'active') return;
    event.preventDefault();
    const now=performance.now();if(!event.deltaY||now-lastWeaponWheelAt<250)return;lastWeaponWheelAt=now;
    const owned = toolOrder.filter(key => localPlayer?.weapons.includes(key));
    if (owned.length) selectWeapon(owned[(owned.indexOf(currentWeapon) + (event.deltaY > 0 ? 1 : owned.length - 1)) % owned.length]);
}, {passive:false});
addEventListener('keyup', (event) => {
    if (embeddedHost && !document.getElementById('arena-screen')?.classList.contains('hidden')) event.stopImmediatePropagation();
    keys.delete(event.code); if(arenaVisible())sendInput(true);
});
document.addEventListener('pointerlockchange', () => { if (!isPointerLocked() && !paused && !resumeRequired && arenaVisible() && roomState?.state === 'active') pauseLocal(true); });
addEventListener('blur', () => { keys.clear(); fireHeld = false; if (arenaVisible() && !resumeRequired) pauseLocal(true); });
canvas.addEventListener('click', () => { if (!paused && roomState?.state === 'active') requestPointerLockSafe(); });
addEventListener('mousedown', (event) => {
    // When the embedded host owns pointer lock, Chromium retargets the locked
    // button event to #arena-root instead of the shadow canvas.
    if (!paused && roomState?.state === 'active' && isPointerLocked() && event.button === 0) {fireHeld=true;predictLocalFire(performance.now());sendInput(true);}
});
addEventListener('mousemove', (event) => { if (paused || roomState?.state !== 'active' || !isPointerLocked()) return; yaw += event.movementX * 0.0028 * settings.sensitivity; pitch = Math.max(-0.5, Math.min(0.5, pitch - event.movementY * 0.0028 * settings.sensitivity * (settings.invert ? -1 : 1))); });
canvas.addEventListener('mousedown', (event) => { if (!paused && roomState?.state === 'active' && event.button === 0) {fireHeld=true;predictLocalFire(performance.now());sendInput(true);} });
addEventListener('mouseup', (event) => { if(event.button===0){fireHeld=false;sendInput(true);} });

function showMatchPanel(name){
    for(const panel of ['standings','settings','guide']) $('match-'+panel).classList.toggle('hidden',panel!==name);
    arenaRoot.querySelectorAll('[data-panel]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.panel===name)));
}
arenaRoot.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>showMatchPanel(button.dataset.panel)));
$('sensitivity-setting').value=settings.sensitivity;$('fov-setting').value=settings.fov;$('invert-setting').checked=settings.invert;$('shadow-setting').checked=settings.shadows;
$('sensitivity-value').textContent=settings.sensitivity.toFixed(2)+'×';$('fov-value').textContent=settings.fov+'°';
$('sensitivity-setting').addEventListener('input',event=>{settings.sensitivity=Number(event.target.value);$('sensitivity-value').textContent=settings.sensitivity.toFixed(2)+'×';saveSettings();});
$('fov-setting').addEventListener('input',event=>{settings.fov=Number(event.target.value);camera.fov=settings.fov;camera.updateProjectionMatrix();$('fov-value').textContent=settings.fov+'°';saveSettings();});
$('invert-setting').addEventListener('change',event=>{settings.invert=event.target.checked;saveSettings();});
$('shadow-setting').addEventListener('change', event=>{settings.shadows=event.target.checked;renderer.shadowMap.enabled=settings.shadows;renderer.shadowMap.needsUpdate=true;saveSettings();});
$('sound-setting').addEventListener('change',event=>{if(event.target.checked===isMuted())toggleMute();});
function showVolume(){const volume=Math.round(getOutputVolume()*100);$('volume-setting').value=volume;$('volume-value').textContent=volume+'%';}
showVolume();
$('volume-setting').addEventListener('input',event=>{setOutputVolume(Number(event.target.value)/100);showVolume();});
$('test-sound').addEventListener('click',()=>{initAudio();playSound('collect');$('audio-test-status').textContent=isMuted()?'Sound is switched off.':getOutputVolume()===0?'Volume is at zero.':'Played the pickup sound.';});
$('bob-setting').checked=settings.bob;
$('bob-setting').addEventListener('change',event=>{settings.bob=event.target.checked;saveSettings();});
$('crosshair-setting').value=settings.crosshair;syncChoices();
const applyCrosshair=()=>{$('crosshair').dataset.shape=settings.crosshair;$('crosshair').textContent=settings.crosshair==='cross'?'+':'';};
applyCrosshair();
$('crosshair-setting').addEventListener('change',event=>{settings.crosshair=event.target.value;applyCrosshair();saveSettings();});
setInterval(()=>{if(connected && ws?.readyState===WebSocket.OPEN) ws.send(JSON.stringify({v:1,type:'ping',sentAt:performance.now()}));},2000);

const arenaVisible = () => !embeddedHost || !document.getElementById('arena-screen')?.classList.contains('hidden');
if (embeddedHost) addEventListener('tq-arena-enter', () => { paused = false; pausePanel.classList.add('hidden'); hud.classList.add('hidden'); countdown.classList.add('hidden'); initAudio(); setRoom('office'); refreshRooms(); });
if (arenaVisible()) refreshRooms();
roomPoll = setInterval(() => { if (arenaVisible()) refreshRooms(); }, 2000);

const auditOutput = new URLSearchParams(location.search).has('test') ? document.createElement('output') : null;
const frameSamples = [];
let lastMenuFrame=0,lastFaceFrame=0;
const renderAudit={frames:0,faceDraws:0,viewmodelPasses:0};
const auditReadout=auditOutput?document.createElement('output'):null;
if(auditOutput) {
    auditOutput.id='arena-audit';auditOutput.hidden=true;arenaRoot.append(auditOutput);
    auditReadout.id='arena-test-readout';auditReadout.setAttribute('aria-label','Arena test diagnostics');
    Object.assign(auditReadout.style,{position:'absolute',left:'12px',bottom:'125px',zIndex:'20',padding:'7px 10px',background:'#080c12dd',color:'#d1e6df',font:'11px/1.5 monospace',pointerEvents:'none',maxWidth:'300px'});
    arenaRoot.append(auditReadout);
}
function render() {
    requestAnimationFrame(render);
    const now=performance.now();
    if (!arenaVisible() || document.hidden) { lastRenderAt=now; return; }
    // Menu backdrop motion needs 30 Hz, while active play keeps display cadence.
    const menuOnly=paused || resumeRequired || !['active','countdown'].includes(roomState?.state);
    if(render.menuOnly!==menuOnly){frameSamples.length=0;render.menuOnly=menuOnly;}
    if(menuOnly && now-lastMenuFrame<1000/30-1) return;
    lastMenuFrame=now;
    const frameDt=(now-lastRenderAt)/1000;lastRenderAt=now;
    const dt = Math.min(frameDt, 0.05);
    // Fixed movement steps at an exact 30 Hz average, aligned with drawing.
    if (roomState?.state === 'active' && ws?.readyState === WebSocket.OPEN) {
        inputAccumulator += Math.min(frameDt, 0.1);
        for (let i = 0; i < 3 && inputAccumulator >= 1 / 30; i++) { sendInput(); inputAccumulator -= 1 / 30; }
        if (inputAccumulator >= 1 / 30) inputAccumulator = 0;
    } else inputAccumulator = 0;
    renderAudit.frames++;
    if(auditOutput) {
        frameSamples.push(frameDt*1000); if(frameSamples.length>300) frameSamples.shift();
        if(now-(render.auditAt || 0)>500) {
            render.auditAt=now;
            const sorted=[...frameSamples].sort((a,b)=>a-b);
            const auditParent=paused?pausePanel:arenaRoot;if(auditReadout.parentNode!==auditParent)auditParent.append(auditReadout);
            auditReadout.textContent=`TEST · ${paused?'menu':resumeRequired?'resume':tour?.label||roomState?.state||'lobby'} · frame p95 ${(sorted[Math.floor(sorted.length*.95)]||0).toFixed(1)} ms · ${render.worldCalls||0} draw calls · ${bodies.size} staff`;
            auditOutput.textContent=JSON.stringify({state:roomState?.state || 'lobby',renderAudit,audio:audioHealth(),preview:staffPreview.stats(),gpuMemory:renderer.info.memory,bodyCount:bodies.size,local:localPlayer,worldProps:officeProps.size,manifestProps:Object.keys(OFFICE_ARENA.props).length,propMismatches:[...officeProps].filter(([id,p])=>!OFFICE_ARENA.props[id] || OFFICE_ARENA.props[id].radius!==p.def.radius || OFFICE_ARENA.props[id].height!==p.def.height).map(([id])=>id),doors:[...productionWorld.doors].map(([id,d])=>({id,openT:d.openT})),frameMsP95:sorted[Math.floor(sorted.length*.95)],shadows:renderer.shadowMap.enabled,drawCalls:render.worldCalls || 0,tour:tour?.label,paintAudit,roundTripMs,feedbackAudit,predicted:movement.state,correction:movement.correction});
        }
    }
    if(!lobby.classList.contains('hidden')) staffPreview.render(reducedMotion ? 0 : now/1000);
    updateCountdown(now);
    updateResultsWait(now);
    const blend = 1 - Math.exp(-24 * dt);
    const remoteTime = serverClock.renderTime(clientNow());
    for (const [slot, entry] of bodies) {
        const sample = sampleAt(entry.samples, remoteTime);
        if (sample) { entry.body.group.position.set(sample.x, 0, sample.z); entry.pose.yaw = sample.yaw; }
        else {
            entry.body.group.position.lerp(entry.target, blend);
            const deltaYaw = entry.targetYaw - entry.pose.yaw;
            entry.pose.yaw += Math.atan2(Math.sin(deltaYaw), Math.cos(deltaYaw)) * blend;
        }
        entry.pose.time = now / 1000;
        if (now - snapshotAt < 250 && entry.pose.movement > 0.02) entry.pose.phase += dt * (4 + entry.pose.speed * 2.5);
        else entry.pose.movement = 0;
        entry.pose.fireT = Math.max(0, entry.pose.fireT - dt);
        entry.pose.swingT = Math.max(0, (entry.pose.swingT || 0) - dt);
        entry.pose.flinchT = Math.max(0, entry.pose.flinchT - dt);
        if (!entry.pose.alive && Number.isFinite(entry.pose.deathT)) {
            entry.pose.deathT += dt;
            // null marks a completed death animation until an alive snapshot resets it.
            if (entry.pose.deathT > 1.2) entry.pose.deathT = null;
        }
        updateArenaBodyPose(entry.body, entry.pose);
        entry.body.group.visible = slot !== localSlot && (entry.pose.alive || Number.isFinite(entry.pose.deathT));
        // Test mode only: per-frame drawn positions for smoothness checks.
        if (auditOutput && slot !== localSlot) { const trace = (window.__tqRemoteTrace ||= []); trace.push([now, slot, entry.body.group.position.x, entry.body.group.position.z]); if (trace.length > 4000) trace.shift(); }
    }
    if(localPlayer && roomState?.state==='active' && localPlayer.alive){
        const view=movement.view(dt,inputAccumulator*30);if(view)camera.position.set(view.x,.7,view.z);
        if (auditOutput) { const trace = (window.__tqCamTrace ||= []); trace.push([now, camera.position.x, camera.position.z, seq]); if (trace.length > 4000) trace.shift(); }
        predictLocalFire(now);
        while(pendingShots[0] && now-pendingShots[0].at>1200)pendingShots.shift();
    } else if (localPlayer && ['active','countdown'].includes(roomState?.state)) camera.position.lerp(cameraTarget, blend);
    else {
        camera.position.set(3.5, .8, 3.5);
        yaw = reducedMotion ? 0 : Math.sin(now / 12000) * .5;
        pitch = -.035;
    }
    if (roomState?.state === 'active' && !paused) {
        if (keys.has('ArrowLeft')) yaw -= dt * 2.2;
        if (keys.has('ArrowRight')) yaw += dt * 2.2;
    }
    doorNear = null;
    for (const door of productionWorld.doors.values()) {
        door.openT += ((door.targetT ?? 0) - door.openT) * Math.min(1, dt * 18);
        door.mesh.position.set(door.baseX + (door.spanX ? door.openT * .95 : 0), door.mesh.position.y, door.baseY + (door.spanX ? 0 : door.openT * .95));
        if (localPlayer?.alive && Math.hypot(localPlayer.x-door.x-.5,localPlayer.z-door.y-.5) < 1.65) doorNear = door;
    }
    $('door-hint').classList.toggle('hidden', !doorNear || paused);
    if (doorNear) $('door-hint').textContent = `E · ${doorNear.serverOpen ? 'Close' : 'Open'} door`;
    $('spawn-shield').classList.toggle('hidden', !localPlayer?.alive || !localPlayer.protectionMs || roomState?.state!=='active');
    $('capture').classList.toggle('hidden', isPointerLocked() || paused || roomState?.state !== 'active' || !localPlayer?.alive);
    const bearing=incomingDamage && now<incomingDamage.until && localPlayer?.alive ? damageBearing(localPlayer,incomingDamage,yaw) : null;
    $('damage-direction').classList.toggle('hidden',bearing===null);
    if(bearing!==null)$('damage-direction').style.transform=`translate(-50%,-50%) rotate(${bearing}deg)`;
    if(eliminationUntil && now>eliminationUntil){$('elimination-notice').classList.add('hidden');eliminationUntil=0;}
    if (noticeUntil && now > noticeUntil) { $('pickup-notice').classList.add('hidden'); noticeUntil = 0; }
    face.update(dt, {...FACE_DEFAULTS, hp: localPlayer?.health ?? 100, dead: localPlayer?.alive === false, moving: Math.hypot(localPlayer?.vx || 0, localPlayer?.vz || 0) > .1, fireAge: vmAnim.recoil > .8 ? .05 : 99});
    if(!hud.classList.contains('hidden') && now-lastFaceFrame>=66){face.draw($('arena-face').getContext('2d'));lastFaceFrame=now;renderAudit.faceDraws++;}
    productionWorld.dressing?.update?.(dt, now / 1000);
    if (roomState?.state==='results') {
        const wait=Math.max(0,Math.ceil((roomState.resultsAt+10000-Date.now())/1000));
        const ready=roomState.roster.find(p=>p.slot===localSlot)?.ready;
        $('ready').disabled=wait>0; $('ready').textContent=wait ? `Rematch in ${wait}s` : ready ? 'Ready · undo' : 'Ready for rematch';
        for(const id of ['bot-toggle','bot-clear']) $(id).disabled=wait>0 || roomState.hostSlot!==localSlot;
        status.textContent=wait ? `Round complete · rematch available in ${wait}s` : 'Round complete. Ready up for another shift, or return to the main menu.';
    }
    if (paused && Math.floor(now / 1000) !== render.pauseSecond) { render.pauseSecond = Math.floor(now / 1000); renderPauseScore(); }

    playerLight.position.set(camera.position.x, 0.95, camera.position.z);
    for (const mesh of projectileMeshes.values()) mesh.position.copy(mesh.userData.target).addScaledVector(mesh.userData.velocity || new THREE.Vector3(),Math.min(.067,(now-snapshotAt)/1000));
    for (const mesh of pickupMeshes.values()) {
        if (!mesh.visible) continue;
        mesh.position.y = 0.12 + Math.sin(now / 700 + mesh.position.x) * 0.045;
        if (mesh.userData.arenaPickup.weapon) mesh.rotation.y = mesh.userData.restYaw + now / 1800;
    }
    // Mouse look is local presentation; old snapshot aim must not pull it back.
    camera.rotation.y = -yaw - Math.PI / 2;
    camera.rotation.x = pitch;
    animateLocalTool(dt, now / 1000);
    if(productionWorld.batchDirty) productionWorld.rebuildPropBatch();
    effects.update(dt); muzzleFlash.update(dt);
    // Same post stack as the campaign: world, AO, viewmodel layer, tone map, bloom, grade.
    arenaPost.vmPass.enabled = localVmRoot.visible;
    if(localVmRoot.visible) renderAudit.viewmodelPasses++;
    renderer.info.autoReset=false;renderer.info.reset();
    arenaPost.render(now/1000, 0);
    render.worldCalls=renderer.info.render.calls;renderer.info.autoReset=true;
}
render();
