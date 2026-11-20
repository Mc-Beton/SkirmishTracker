// Ported from the game Eldfall Table (client/src/scene/world.ts). Kept close to the original so that changes there can be
// carried over; WarBracket differences are marked `WarBracket`.
import * as THREE from 'three';
import { surface } from './materials';
import { Sanctuary } from './sanctuary';
import { animateWater } from './terrain';
import { pointInPolygon } from '@/lib/eld/geometry.ts';
import type { TableState } from '@/lib/eld/types.ts';

// Everything around the rules that makes the table a place: the sky, the land beyond the board, grass that
// moves in the wind, glitter on the water, rain and snow. None of it affects the game.

export type Weather = 'sunny' | 'rain' | 'snow';
export const WEATHERS: Weather[] = ['sunny', 'rain', 'snow'];

interface Look {
  top: number;
  horizon: number;
  sun: number;
  sunPower: number;
  skyPower: number;
  fogNear: number;
  fogFar: number;
  wind: number;
  ground: number;
}

const LOOKS: Record<Weather, Look> = {
  sunny: { top: 0x4f93c8, horizon: 0xc4e6dc, sun: 0xffe2b0, sunPower: 3.2, skyPower: 0.55, fogNear: 90, fogFar: 330, wind: 1, ground: 0x4f6f33 },
  rain: { top: 0x4a5462, horizon: 0x8f9aa3, sun: 0xcdd6e0, sunPower: 1.1, skyPower: 0.6, fogNear: 60, fogFar: 240, wind: 2.2, ground: 0x3d4f33 },
  snow: { top: 0x9aa7b5, horizon: 0xe6ebf0, sun: 0xf2f5ff, sunPower: 1.6, skyPower: 0.75, fogNear: 50, fogFar: 220, wind: 0.6, ground: 0xc9d2d6 },
};

/** A soft, blotchy texture so large flat areas do not look like plastic. */
export function noiseTexture(base: number, spread: number, size = 256, repeat = 6): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const col = new THREE.Color(base);
  g.fillStyle = `#${col.getHexString()}`;
  g.fillRect(0, 0, size, size);
  let seed = 1234567;
  const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2600; i++) {
    const k = 1 + (rnd() - 0.5) * spread;
    g.fillStyle = `rgba(${Math.min(255, col.r * 255 * k) | 0}, ${Math.min(255, col.g * 255 * k) | 0}, ${Math.min(255, col.b * 255 * k) | 0}, 0.5)`;
    const r = 2 + rnd() * 9;
    g.beginPath();
    g.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class World {
  readonly group = new THREE.Group();
  /** Rebuilt with the table: grass and water glitter. */
  private readonly onTable = new THREE.Group();
  private readonly sky: THREE.Mesh;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly land: THREE.Mesh;
  private readonly fog = new THREE.Fog(0xcfe3f2, 140, 380);
  private readonly wind = { value: 1 };
  private readonly time = { value: 0 };
  private grassMat: THREE.MeshLambertMaterial | null = null;
  private glitter: THREE.Points[] = [];
  private rain: THREE.LineSegments | null = null;
  private snow: THREE.Points | null = null;
  private weather: Weather = 'sunny';
  private swayers: THREE.Object3D[] = [];
  private grass: THREE.InstancedMesh | null = null;
  private sanctuary: Sanctuary | null = null;
  private frames = 0;
  private slow = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sun: THREE.DirectionalLight,
    private readonly hemi: THREE.HemisphereLight,
    private readonly renderer?: THREE.WebGLRenderer,
    /** WarBracket: what a slower computer can do without – the sanctuary around the table, the grass on it. */
    private readonly parts: { sanctuary: boolean; grass: boolean } = { sanctuary: true, grass: true },
  ) {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(0x3f7fd0) }, horizon: { value: new THREE.Color(0xcfe3f2) } },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main() { float h = clamp(vDir.y, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.55)); if (vDir.y < 0.0) c = horizon * (1.0 + vDir.y * 0.5); gl_FragColor = vec4(c, 1.0); }',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(380, 24, 16), this.skyMat);
    this.sky.renderOrder = -10;
    // The land the table stands in, down to the horizon.
    const landGeo = new THREE.CircleGeometry(380, 48);
    landGeo.rotateX(-Math.PI / 2);
    this.land = new THREE.Mesh(landGeo, surface('ground', [70, 70], 0x9fb38a, 1.2));
    this.land.position.y = -0.62;
    this.land.receiveShadow = true;
    this.group.add(this.sky, this.land, this.onTable);
    scene.add(this.group);
    scene.fog = this.fog;
    scene.background = null;
    this.setWeather('sunny');
  }

  /** Grass over the mat (not under scenery or in water) and glitter on the water. Called when the table is built. */
  build(state: TableState, swayers: THREE.Object3D[]): void {
    for (const o of [...this.onTable.children]) {
      this.onTable.remove(o);
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    }
    this.glitter = [];
    this.swayers = swayers;
    const { width: w, height: h } = state;
    // The fallen sanctuary around the table is built once; the table's size does not change.
    if (!this.sanctuary && this.parts.sanctuary) {
      this.sanctuary = new Sanctuary(w, h, this.land.position.y);
      this.group.add(this.sanctuary.group);
      this.sanctuary.setBright(this.weather === 'sunny' ? 1 : 0.2);
    }
    let seed = 987654321;
    const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

    // Grass: thin blades, each instance leaning its own way; the vertex shader bends them with the wind.
    const blade = new THREE.PlaneGeometry(0.07, 1, 1, 3);
    blade.translate(0, 0.5, 0);
    // Pointed: the blade narrows to its tip.
    const bp = blade.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) bp.setX(i, bp.getX(i) * (1 - bp.getY(i) * 0.92));
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.uniforms.uWind = this.wind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec2 at = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
            float gust = sin(uTime * 1.6 + at.x * 0.55 + at.y * 0.4) * 0.5 + sin(uTime * 0.7 + at.y * 0.9) * 0.3;
            float bend = position.y * position.y;
            transformed.x += gust * bend * 0.35 * uWind;
            transformed.z += cos(uTime * 1.1 + at.x * 0.3) * bend * 0.12 * uWind;
          #endif`,
        );
    };
    this.grassMat = mat;
    const blocked = state.terrain.filter((t) => t.kind === 'obstacle' || t.env === 'water');
    const spots: { x: number; y: number }[] = [];
    for (let i = 0; i < 26000 && spots.length < 15000; i++) {
      const p = { x: rnd() * w, y: rnd() * h };
      if (blocked.some((t) => pointInPolygon(p, t.shape))) continue;
      spots.push(p);
    }
    const grass = new THREE.InstancedMesh(blade, mat, spots.length);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    spots.forEach((p, i) => {
      dummy.position.set(p.x - w / 2, 0, p.y - h / 2);
      dummy.rotation.set((rnd() - 0.5) * 0.3, rnd() * Math.PI, (rnd() - 0.5) * 0.3);
      const tall = 0.16 + rnd() * 0.2;
      dummy.scale.set(1, tall, 1);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
      grass.setColorAt(i, col.setHSL(0.25 + rnd() * 0.07, 0.42 + rnd() * 0.2, 0.26 + rnd() * 0.14));
    });
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    grass.receiveShadow = true;
    grass.raycast = () => undefined;
    // A painted ground has its own grass in the picture.
    grass.visible = !state.ground && this.parts.grass;
    this.grass = grass;
    this.frames = 0;
    this.slow = 0;
    this.onTable.add(grass);

    // Glitter: two sets of points on every piece of water, fading in and out in turn.
    for (const t of state.terrain) {
      if (t.env !== 'water') continue;
      const xs = t.shape.map((p) => p.x);
      const ys = t.shape.map((p) => p.y);
      for (let set = 0; set < 3; set++) {
        const pts: number[] = [];
        for (let i = 0; i < 400 && pts.length < 40 * 3; i++) {
          const p = { x: Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs)), y: Math.min(...ys) + rnd() * (Math.max(...ys) - Math.min(...ys)) };
          if (pointInPolygon(p, t.shape)) pts.push(p.x - w / 2, 0.05, p.y - h / 2);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        points.userData.phase = (set * Math.PI * 2) / 3;
        points.raycast = () => undefined;
        this.glitter.push(points);
        this.onTable.add(points);
      }
    }
  }

  get current(): Weather {
    return this.weather;
  }

  setWeather(w: Weather): void {
    this.weather = w;
    const look = LOOKS[w];
    (this.skyMat.uniforms.top!.value as THREE.Color).setHex(look.top);
    (this.skyMat.uniforms.horizon!.value as THREE.Color).setHex(look.horizon);
    this.fog.color.setHex(look.horizon);
    this.fog.near = look.fogNear;
    this.fog.far = look.fogFar;
    this.sun.color.setHex(look.sun);
    this.sun.intensity = look.sunPower;
    this.hemi.intensity = look.skyPower;
    this.wind.value = look.wind;
    (this.land.material as THREE.MeshStandardMaterial).color.setHex(look.ground).multiplyScalar(3.4);
    this.lightFromSky(look);
    this.sanctuary?.setBright(w === 'sunny' ? 1 : 0.2);
    if (this.rain) this.rain.visible = w === 'rain';
    if (this.snow) this.snow.visible = w === 'snow';
    if (w === 'rain' && !this.rain) {
      const n = 1800;
      const pts = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 90;
        const y = Math.random() * 40;
        const z = (Math.random() - 0.5) * 90;
        pts.set([x, y, z, x + 0.12, y - 0.9, z], i * 6);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xbfd0e0, transparent: true, opacity: 0.45, depthWrite: false }));
      this.rain.frustumCulled = false;
      this.rain.raycast = () => undefined;
      this.group.add(this.rain);
    }
    if (w === 'snow' && !this.snow) {
      const n = 2200;
      const pts = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pts.set([(Math.random() - 0.5) * 90, Math.random() * 40, (Math.random() - 0.5) * 90], i * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.9, depthWrite: false }));
      this.snow.frustumCulled = false;
      this.snow.raycast = () => undefined;
      this.group.add(this.snow);
    }
  }

  private envTarget: THREE.WebGLRenderTarget | null = null;

  /** The sky lights everything a little from all sides, and shows in whatever is smooth enough to reflect it. */
  private lightFromSky(look: Look): void {
    if (!this.renderer) return;
    const env = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 16), this.skyMat.clone());
    ((dome.material as THREE.ShaderMaterial).uniforms.top!.value as THREE.Color).setHex(look.top);
    ((dome.material as THREE.ShaderMaterial).uniforms.horizon!.value as THREE.Color).setHex(look.horizon);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(50, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(look.ground).multiplyScalar(0.7), side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(look.sun).multiplyScalar(look.sunPower * 2.5) }));
    glow.position.set(18, 38, 14).normalize().multiplyScalar(45);
    env.add(dome, floor, glow);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const target = pmrem.fromScene(env, 0.02);
    this.scene.environment = target.texture;
    this.scene.environmentIntensity = 0.55;
    this.envTarget?.dispose();
    this.envTarget = target;
    pmrem.dispose();
    dome.geometry.dispose();
  }

  /** Once a frame: wind, glitter, falling rain and snow. `t` in seconds. */
  update(t: number, dt: number, camera: THREE.Camera): void {
    this.time.value = t;
    // A slow computer: after the first two seconds, thin the grass out instead of stuttering.
    if (this.grass && this.frames < 120) {
      this.frames++;
      if (this.frames > 20 && dt > 0.045) this.slow++;
      if (this.frames === 120 && this.slow > 60) this.grass.count = Math.floor(this.grass.count / 6);
    }
    this.sky.position.copy(camera.position);
    this.sanctuary?.update(t, this.wind.value);
    animateWater(t);
    const sunny = this.weather === 'sunny' ? 1 : 0.25;
    for (const g of this.glitter) (g.material as THREE.PointsMaterial).opacity = Math.max(0, Math.sin(t * 2.4 + (g.userData.phase as number))) * 0.9 * sunny;
    for (const o of this.swayers) {
      const ph = (o.userData.sway as number) ?? 0;
      o.rotation.z = Math.sin(t * 1.3 + ph) * 0.03 * this.wind.value;
      o.rotation.x = Math.cos(t * 0.9 + ph * 1.7) * 0.02 * this.wind.value;
    }
    const fall = (obj: THREE.LineSegments | THREE.Points | null, speed: number, per: number, drift: number): void => {
      if (!obj?.visible) return;
      const a = obj.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3 * per) {
        let drop = speed * dt;
        if (arr[i + 1]! - drop < 0) drop -= 40;
        for (let k = 0; k < per; k++) {
          arr[i + 3 * k + 1]! -= drop;
          arr[i + 3 * k]! += drift * dt * Math.sin(t + i);
        }
      }
      a.needsUpdate = true;
    };
    fall(this.rain, 34, 2, 0);
    fall(this.snow, 3.2, 1, 0.8);
  }
}
