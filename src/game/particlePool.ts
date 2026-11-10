import * as THREE from 'three';

interface ParticleData {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxLife: number;
  startScale: number;
  endScale: number;
}

const MAX_PARTICLES = 140;
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export class PooledParticleSystem {
  public readonly mesh: THREE.InstancedMesh;
  private readonly pool: ParticleData[] = [];
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.DodecahedronGeometry(0.24, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_PARTICLES * 3),
      3
    );

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        maxLife: 1,
        startScale: 0.5,
        endScale: 2.0,
      });
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
      this.mesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  public spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    colorHex: number,
    maxLife = 0.55,
    startScale = 0.65,
    endScale = 2.4
  ) {
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    const p = this.pool[idx];
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.age = 0;
    p.maxLife = maxLife;
    p.startScale = startScale;
    p.endScale = endScale;

    _color.setHex(colorHex);
    this.mesh.setColorAt(idx, _color);
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  public spawnBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    colorHex: number,
    speed = 8
  ) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const spd = speed * (0.5 + Math.random() * 0.7);
      this.spawn(
        x,
        y + 0.4,
        z,
        Math.cos(angle) * spd,
        2.0 + Math.random() * 4.5,
        Math.sin(angle) * spd,
        colorHex,
        0.38 + Math.random() * 0.25,
        0.55,
        0.1
      );
    }
  }

  public update(dt: number) {
    let anyUpdated = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      anyUpdated = true;
      p.age += dt;
      if (p.age >= p.maxLife) {
        p.active = false;
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        this.mesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.94;
      p.vz *= 0.94;

      const t = p.age / p.maxLife;
      const scale = p.startScale + (p.endScale - p.startScale) * t;
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.rotation.set(p.age * 3, p.age * 2, 0);
      _dummy.scale.setScalar(scale * (1 - t * 0.35));
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
    }

    if (anyUpdated) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
