import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { solve, ringPoints, SEGMENTS } from './solver.js';

// Inputs copiados de definition.ir.json (sin fetch: así funciona también abriendo el archivo en local)
const INPUTS = [
  { name: 'altura', label: 'altura', min: 21, max: 84, step: 0.1, value: 51.4 },
  { name: 'seccNum', label: 'seccNum (tramos)', min: 3, max: 7, step: 1, value: 3 },
  { name: 'posAtrac', label: 'posAtrac', min: 0, max: 1, step: 0.01, value: 0.47 },
];
const ORIGIN = [0, 0, 0];
const params = Object.fromEntries(INPUTS.map(i => [i.name, i.value]));

const canvas = document.getElementById('canvas');
const view = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14171c);

const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
camera.up.set(0, 0, 1); // Rhino es Z-up
camera.position.set(130, -150, 95);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0, 35);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x1b1f26, 1.1));

const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(80, -110, 160);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { near: 20, far: 500, left: -140, right: 140, top: 180, bottom: -140 });
key.target.position.set(0, 0, 30);
scene.add(key, key.target);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.ShadowMaterial({ opacity: 0.25 })
);
floor.position.z = -0.2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(240, 12, 0x39414b, 0x262c34);
grid.rotation.x = Math.PI / 2; // XY, como el modelo
grid.position.z = -0.1;
grid.material.transparent = true;
grid.material.opacity = 0.75;
scene.add(grid);

const mesh = new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshStandardMaterial({ color: 0xc9d3dd, roughness: 0.45, metalness: 0.06, side: THREE.DoubleSide })
);
mesh.castShadow = true;
scene.add(mesh);

const ringGroup = new THREE.Group();
scene.add(ringGroup);

// --- UI ---
const controlsEl = document.getElementById('controls');
const outputs = {};

for (const input of INPUTS) {
  const field = document.createElement('div');
  field.className = 'field';
  field.innerHTML = `
    <div class="row"><label for="in-${input.name}">${input.label}</label><output id="out-${input.name}"></output></div>
    <input type="range" id="in-${input.name}" min="${input.min}" max="${input.max}" step="${input.step}" value="${input.value}">
  `;
  controlsEl.append(field);
  const slider = field.querySelector('input');
  const out = field.querySelector('output');
  const decimals = (String(input.step).split('.')[1] || '').length;
  const paint = () => { out.textContent = Number(params[input.name]).toFixed(decimals); };
  slider.addEventListener('input', () => {
    params[input.name] = Number(slider.value);
    paint();
    schedule();
  });
  outputs[input.name] = { slider, paint };
  paint();
}

const originNote = document.createElement('p');
originNote.className = 'note';
originNote.textContent = `origin fijo: (${ORIGIN.join(', ')})`;
controlsEl.append(originNote);

document.getElementById('reset').addEventListener('click', () => {
  for (const input of INPUTS) {
    params[input.name] = input.value;
    outputs[input.name].slider.value = input.value;
    outputs[input.name].paint();
  }
  rebuild();
});

let timer = 0;
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 80); // debounce
};

// --- solve + render ---
let lastSolved = null;

function rebuild() {
  const t0 = performance.now();
  const { positions, indices, circles } = solve({ ...params, origin: ORIGIN });

  const geometry = mesh.geometry;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  for (const line of ringGroup.children) line.geometry.dispose();
  ringGroup.clear();
  for (const circle of circles) {
    const pts = [];
    for (let k = 0; k <= SEGMENTS; k++) pts.push(new THREE.Vector3(...ringPoints(circle, k)));
    ringGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMaterial));
  }

  lastSolved = { positions, indices };
  const ms = performance.now() - t0;
  document.getElementById('stat-verts').textContent = (positions.length / 3).toLocaleString('es');
  document.getElementById('stat-tris').textContent = (indices.length / 3).toLocaleString('es');
  document.getElementById('stat-solve').textContent = `${ms.toFixed(1)} ms`;
}

const ringMaterial = new THREE.LineBasicMaterial({ color: 0x5aa9e6, transparent: true, opacity: 0.85 });

// --- export ---
const note = document.getElementById('export-note');
const download = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

document.getElementById('export-stl').addEventListener('click', () => {
  const data = new STLExporter().parse(mesh, { binary: true });
  download(new Blob([data], { type: 'model/stl' }), 'adHolaMundo.stl');
  note.textContent = 'STL exportado.';
});

let rhinoModule = null;
const loadRhino = () => (rhinoModule ??= import('rhino3dm').then(m => m.default()));

document.getElementById('export-3dm').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  note.textContent = 'cargando rhino3dm (~2.5 MB, solo la primera vez)…';
  try {
    const rhino = await loadRhino();
    const { positions, indices } = lastSolved;
    const m = new rhino.Mesh();
    for (let i = 0; i < positions.length; i += 3) m.vertices().add(positions[i], positions[i + 1], positions[i + 2]);
    for (let i = 0; i < indices.length; i += 3) m.faces().addTriFace(indices[i], indices[i + 1], indices[i + 2]);
    m.normals().computeNormals();

    const file = new rhino.File3dm();
    file.objects().addMesh(m, new rhino.ObjectAttributes());
    download(new Blob([file.toByteArray()], { type: 'model/vnd.3dm' }), 'adHolaMundo.3dm');
    note.textContent = '3DM exportado.';
  } catch (error) {
    note.textContent = `No se pudo exportar 3DM: ${error.message}. Usa STL.`;
  } finally {
    button.disabled = false;
  }
});

// --- loop / resize ---
let frames = 0;
let stamp = performance.now();
const fpsEl = document.getElementById('stat-fps');

function loop() {
  controls.update();
  renderer.render(scene, camera);
  frames++;
  const now = performance.now();
  if (now - stamp >= 500) {
    fpsEl.textContent = Math.round((frames * 1000) / (now - stamp));
    frames = 0;
    stamp = now;
  }
  requestAnimationFrame(loop);
}

function resize() {
  const { clientWidth: w, clientHeight: h } = view;
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

addEventListener('resize', resize);
new ResizeObserver(resize).observe(view);

resize();
rebuild();
loop();
