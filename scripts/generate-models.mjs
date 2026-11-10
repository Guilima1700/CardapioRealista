import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mkdir, writeFile } from "node:fs/promises";
// Original geometric demonstration assets. No photographs or scanned geometry.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
};
let state = 42;
function random() {
  state = (state * 1664525 + 1013904223) >>> 0;
  return state / 4294967296;
}
const material = (color, roughness = 0.85) =>
  new THREE.MeshStandardMaterial({ color, roughness });
const bread = material("#d4913e"),
  cutBread = material("#efd08b"),
  meat = material("#49271c"),
  cheese = material("#ffad21"),
  lettuce = material("#548431"),
  tomato = material("#c14329"),
  sesame = material("#f8e4ad"),
  bacon = material("#893720");
function mesh(group, geometry, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  group.add(m);
  return m;
}
function disc(group, radius, height, y, mat) {
  return mesh(
    group,
    new THREE.CylinderGeometry(radius, radius * 0.98, height, 64),
    mat,
    0,
    y,
    0,
  );
}
function leaf(group, y, rotation) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 100; i++) {
    const a = (i / 100) * Math.PI * 2,
      r = 0.068 + Math.sin(a * 9) * 0.005;
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z);
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.002,
    bevelEnabled: false,
  });
  geo.rotateX(-Math.PI / 2);
  const m = mesh(group, geo, lettuce, 0, y, 0);
  m.rotation.y = rotation;
  return m;
}
function burger(double = false) {
  const group = new THREE.Group();
  disc(group, 0.064, 0.018, 0.009, bread);
  disc(group, 0.063, 0.003, 0.019, cutBread);
  leaf(group, 0.024, 0.2);
  disc(group, 0.062, 0.019, 0.036, meat);
  const c = mesh(
    group,
    new THREE.BoxGeometry(0.105, 0.003, 0.105),
    cheese,
    0,
    0.048,
    0,
  );
  c.rotation.y = 0.3;
  disc(group, 0.052, 0.006, 0.054, tomato);
  if (double) {
    disc(group, 0.062, 0.017, 0.067, meat);
    const c2 = mesh(
      group,
      new THREE.BoxGeometry(0.108, 0.003, 0.108),
      cheese,
      0,
      0.078,
      0,
    );
    c2.rotation.y = -0.2;
  } else {
    for (let i = 0; i < 3; i++) {
      const b = mesh(
        group,
        new THREE.BoxGeometry(0.11, 0.004, 0.015),
        bacon,
        0,
        0.06 + i * 0.003,
        (i - 1) * 0.025,
      );
      b.rotation.y = 0.18;
    }
  }
  const top = double ? 0.086 : 0.074;
  disc(group, 0.064, 0.006, top, bread);
  mesh(
    group,
    new THREE.SphereGeometry(0.064, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2),
    bread,
    0,
    top,
    0,
    1,
    0.52,
    1,
  );
  for (let i = 0; i < 90; i++) {
    const r = Math.sqrt(random()) * 0.059,
      a = random() * Math.PI * 2,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r,
      y = top + Math.sqrt(1 - (r / 0.064) ** 2) * 0.033;
    const s = mesh(
      group,
      new THREE.SphereGeometry(0.001, 8, 6),
      sesame,
      x,
      y,
      z,
      0.7,
      0.5,
      1.6,
    );
    s.rotation.y = random() * Math.PI;
  }
  return group;
}
function fries() {
  const group = new THREE.Group(),
    gold = material("#dca137"),
    plate = material("#e9e3d4");
  disc(group, 0.105, 0.006, 0.003, plate);
  for (let i = 0; i < 40; i++) {
    const fry = mesh(
      group,
      new THREE.BoxGeometry(0.009, 0.009, 0.065 + random() * 0.025),
      gold,
      (random() - 0.5) * 0.13,
      0.013 + Math.floor(i / 10) * 0.011,
      (random() - 0.5) * 0.08,
    );
    fry.rotation.y = (random() - 0.5) * 2;
    fry.rotation.z = (random() - 0.5) * 0.15;
  }
  return group;
}
await mkdir("public/models", { recursive: true });
for (const [name, model] of [
  ["brasa-classic", burger()],
  ["double-fire", burger(true)],
  ["rustic-fries", fries()],
]) {
  const data = await new GLTFExporter().parseAsync(model, { binary: true });
  await writeFile(`public/models/${name}.glb`, Buffer.from(data));
  console.log(`${name}.glb: ${Math.round(data.byteLength / 1024)} KB`);
}
