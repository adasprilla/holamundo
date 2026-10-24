import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { solve, ringPoints, SEGMENTS } from './solver.js';

// UI strings (en). For Spanish, swap this block and <html lang>.
const T = {
  exported: 'STL exported.',
  loading: 'loading rhino3dm (~2.5 MB, first time only)…',
  exported3dm: '3DM exported.',
  failed: (msg) => `3DM export failed: ${msg}. Use STL instead.`,
};

// Inputs from definition.ir.json (inlined so the page also works from file://).
const INPUTS = [
  { name: 'altura', label: 'height', min: 21, max: 84, step: 0.1, value: 51.4 },
  { name: 'seccNum', label: 'sections', min: 3, max: 7, step: 1, value: 3 },
  { name: 'posAtrac', label: 'attraction point', min: 0, max: 1, step: 0.01, value: 0.47 },
];
const ORIGIN = [0, 0, 0]; // RH_IN:origin, fixed
const params = Object.fromEntries(INPUTS.map(i => [i.name, i.value]));

const canvas = document.getElementById('canvas');
const view = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x121212);

const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
camera.up.set(0, 0, 1); // Rhino is Z-up
camera.position.set(130, -150, 95);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0, 35);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.1));

const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(80, -110, 160);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { near: 20, far: 500, left: -140, right: 140, top: 180, bottom: -140 });
key.target.position.set(0, 0, 30);
scene.add(key, key.target);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.ShadowMaterial({ opacity: 0.28 })
);
floor.position.z = -0.2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(240, 12, 0x333333, 0x242424);
grid.rotation.x = Math.PI / 2; // XY, like the model
grid.position.z = -0.1;
grid.material.transparent = true;
grid.material.opacity = 0.75;
scene.add(grid);

const mesh = new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.45, metalness: 0.06, side: THREE.DoubleSide })
);
mesh.castShadow = true;
scene.add(mesh);

const ringGroup = new THREE.Group();
scene.add(ringGroup);

const ringMaterial = new THREE.LineBasicMaterial({ color: 0x5aa9e6, transparent: true, opacity: 0.85 });

// --- UI ---
const controlsEl = document.getElementById('controls');
const fields = {};

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
  fields[input.name] = { slider, paint };
  paint();
}

document.getElementById('reset').addEventListener('click', () => {
  for (const input of INPUTS) {
    params[input.name] = input.value;
    fields[input.name].slider.value = input.value;
    fields[input.name].paint();
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
}

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
  download(new Blob([data], { type: 'model/stl' }), 'holaMundo.stl');
  note.textContent = T.exported;
});

let rhinoModule = null;
const loadRhino = () => (rhinoModule ??= import('rhino3dm').then(m => m.default()));

document.getElementById('export-3dm').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  note.textContent = T.loading;
  try {
    const rhino = await loadRhino();
    const { positions, indices } = lastSolved;
    const m = new rhino.Mesh();
    for (let i = 0; i < positions.length; i += 3) m.vertices().add(positions[i], positions[i + 1], positions[i + 2]);
    for (let i = 0; i < indices.length; i += 3) m.faces().addTriFace(indices[i], indices[i + 1], indices[i + 2]);
    m.normals().computeNormals();

    const file = new rhino.File3dm();
    file.objects().addMesh(m, new rhino.ObjectAttributes());
    download(new Blob([file.toByteArray()], { type: 'model/vnd.3dm' }), 'holaMundo.3dm');
    note.textContent = T.exported3dm;
  } catch (error) {
    note.textContent = T.failed(error.message);
  } finally {
    button.disabled = false;
  }
});

// --- loop / resize ---
function loop() {
  controls.update();
  renderer.render(scene, camera);
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
