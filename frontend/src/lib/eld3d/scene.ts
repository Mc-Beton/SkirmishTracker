// Ported from the game Eldfall Table (client/src/scene/scene.ts): the 3D table. WarBracket differences: no sculpts,
// no animation and no Spell effects (placeholder figures only); players' tokens can be placed and dragged; figures
// the viewer may not see are covered; Deployment Zones (belts or corners) and the rules shapes can be switched on
// and off; the labels are styled here instead of by a style sheet.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SIDE_COLORS } from '@/lib/eld/content.ts';
import { baseHeight, baseRadius, dist, SHELF, shelfRect } from '@/lib/eld/geometry.ts';
import type { BaseSize, Marker, Model, Pt, TableState } from '@/lib/eld/types.ts';
import { ASSETS } from './assets';
import { buildFigure, buildHidden, buildRing, figureKey } from './figures';
import { loadBegin, loadEnd } from './loading';
import { surface } from './materials';
import { reliefAt } from './relief';
import { buildTerrain } from './terrain';
import { World, type Weather } from './world';

export type Mode = 'select' | 'measure' | 'aim' | 'token';

/** WarBracket: how much the scene draws – the player's choice for a slower or a faster computer. */
export interface SceneOptions {
  /** Shadows: none, a smaller shadow map, the full one. */
  shadows: 'off' | 'low' | 'high';
  /** Smooth edges and the screen's full resolution. */
  sharp: boolean;
  /** The sanctuary around the table (columns, trees, mist). */
  surroundings: boolean;
  /** Grass on a field without a painted ground. */
  grass: boolean;
}
export const FULL_SCENE: SceneOptions = { shadows: 'high', sharp: true, surroundings: true, grass: true };

/** A template lying on the table: a circle, or the outline of a spray. */
export interface TemplateShape {
  circle?: { at: Pt; r: number };
  poly?: Pt[];
  ok: boolean;
}

export interface Preview {
  ok: boolean;
  /** Shown next to the ruler: distance, Walk / Run, or why the move is not allowed. */
  label: string;
  /** Where the figure will actually end up when the spot was adjusted (snapped into Base Contact). */
  at?: Pt;
}

export interface SceneHooks {
  /** May the viewer act at all (a player, not an observer)? */
  canAct(): boolean;
  /** May the viewer drag this figure? */
  canDrag(id: string): boolean;
  /** Is this figure covered for the viewer (Shrouded)? */
  hidden(id: string): boolean;
  onSelect(id: string | null): void;
  onMove(id: string, x: number, y: number): void;
  /** Rules check for dragging a figure to (x, y). */
  previewMove(id: string, x: number, y: number): Preview;
  /** Aiming a template: the mouse is over (x, y) / the spot was clicked. */
  previewAim(x: number, y: number): void;
  onAim(x: number, y: number): void;
  /** The mouse wheel was turned while a figure is held: turn it by `degrees`. */
  onTurn(id: string, degrees: number): void;
  onTokenSelect(id: string | null): void;
  onTokenPlace(x: number, y: number): void;
  onTokenMove(id: string, x: number, y: number): void;
}

/** A line between two figures (line of sight). */
export interface SightLine {
  from: string;
  to: string;
  color: string;
}

/** A circle drawn on the table around a figure (movement range, Awareness). Radius in inches from its centre. */
export interface RangeRing {
  id: string;
  radius: number;
  color: string;
}

interface Figure {
  group: THREE.Group;
  key: string;
  target: THREE.Vector3;
  label: HTMLDivElement;
  model: Model;
}

interface Drag {
  id: string;
  startX: number;
  startY: number;
  offset: Pt;
  active: boolean;
  dest: Pt | null;
  ok: boolean;
  turned?: boolean;
}

interface TokenDrag {
  id: string;
  at: Pt;
  moved: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const CLICK_SLOP = 5;
const TOKEN_R = 0.55;
const round2 = (n: number): number => Math.round(n * 100) / 100;

const LABEL_CSS = 'position:absolute;left:0;top:0;white-space:nowrap;font:11px ui-sans-serif,system-ui,sans-serif;padding:1px 6px;border-radius:4px;background:rgba(15,17,22,.78);border:1px solid transparent;will-change:transform;';
const SIDE_LABEL = [
  { border: 'rgba(91,155,248,.6)', color: '#cfe2ff' },
  { border: 'rgba(242,109,109,.6)', color: '#ffd6d6' },
] as const;

/** The 3D table: draws the state, and turns mouse input into "select", "move here", "aim here" and tokens. */
export class TableScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(UP, 0);
  private readonly tableGroup = new THREE.Group();
  private readonly markerGroup = new THREE.Group();
  private builtMarkers = '';
  private readonly tokenMeshes = new Map<string, THREE.Object3D>();
  private markerLabels: { el: HTMLDivElement; id: string; at: THREE.Vector3 }[] = [];
  private readonly zoneGroup = new THREE.Group();
  private zoneKey = '';
  private showZones = true;
  private readonly overlayGroup = new THREE.Group();
  private overlayKey = '';
  private showOverlay = false;
  private readonly figureGroup = new THREE.Group();
  private readonly figures = new Map<string, Figure>();
  private readonly ring = buildRing();
  private readonly activeRing = buildRing(0x4ade80, 1.38, 1.6);
  private readonly tokenRing = buildRing(0x33d3e0, 1.15, 1.4);
  private readonly rangeGroup = new THREE.Group();
  private ranges: RangeRing[] = [];
  private readonly templateGroup = new THREE.Group();
  private sightLines: SightLine[] = [];
  private readonly sightMesh: THREE.LineSegments;
  private readonly arcMesh: THREE.Mesh;
  private arc: { id: string; full: boolean } | null = null;
  private activatedId: string | null = null;
  private readonly ghost: THREE.Mesh;
  private readonly ruler: THREE.Line;
  private readonly rulerLabel: HTMLDivElement;
  private readonly labels: HTMLDivElement;
  private readonly resizer: ResizeObserver;

  private state: TableState | null = null;
  /** What the table was built from: WarBracket hands over a fresh copy of the state after every event. */
  private builtTable = '';
  private readonly world: World;
  private lastFrame = performance.now();
  private selected: string | null = null;
  private selectedToken: string | null = null;
  private mode: Mode = 'select';
  private drag: Drag | null = null;
  private tokenDrag: TokenDrag | null = null;
  private down: { x: number; y: number } | null = null;
  private measure: { a: Pt; am: Model | null; b: Pt; bm: Model | null; live: boolean } | null = null;
  private topDown = false;
  private frame = 0;
  private w = 36;
  private h = 36;

  /** `seat`: the side the viewer sits on – Red (1) looks at the table from the far edge. */
  constructor(
    private readonly host: HTMLElement,
    private readonly hooks: SceneHooks,
    seat: 0 | 1 = 0,
    options: SceneOptions = FULL_SCENE,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: options.sharp });
    this.renderer.setPixelRatio(options.sharp ? Math.min(window.devicePixelRatio, 2) : 1);
    this.renderer.shadowMap.enabled = options.shadows !== 'off';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Film-like response to bright light: highlights roll off instead of burning out.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    host.append(this.renderer.domElement);

    this.labels = document.createElement('div');
    this.labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    host.append(this.labels);
    this.rulerLabel = document.createElement('div');
    this.rulerLabel.style.cssText = LABEL_CSS + 'font-size:15px;font-weight:700;color:#fff;background:rgba(15,17,22,.9);border-color:#fff;padding:2px 8px;max-width:260px;white-space:normal;text-align:center;';
    this.rulerLabel.hidden = true;
    this.labels.append(this.rulerLabel);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    this.camera.position.set(0, 42, seat === 1 ? -52 : 52);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 90;
    // Low enough to look across the table from a figure's eye level, with the sky above.
    this.controls.maxPolarAngle = Math.PI / 2 - 0.015;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a3226, 1.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
    sun.position.set(18, 38, 14);
    sun.castShadow = options.shadows !== 'off';
    sun.shadow.mapSize.set(options.shadows === 'high' ? 4096 : 2048, options.shadows === 'high' ? 4096 : 2048);
    sun.shadow.radius = 2.5;
    sun.shadow.normalBias = 0.04;
    const sc = sun.shadow.camera;
    sc.left = -28;
    sc.right = 28;
    sc.top = 28;
    sc.bottom = -28;
    sc.near = 1;
    sc.far = 90;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.world = new World(this.scene, sun, hemi, this.renderer, { sanctuary: options.surroundings, grass: options.grass });

    this.scene.add(this.tableGroup, this.zoneGroup, this.overlayGroup, this.markerGroup, this.figureGroup, this.ring, this.activeRing, this.tokenRing, this.rangeGroup, this.templateGroup);

    this.ghost = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 32),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    this.ruler = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }),
    );
    this.ruler.frustumCulled = false;
    this.ruler.renderOrder = 10;
    this.ruler.visible = false;
    this.scene.add(this.ruler);

    this.sightMesh = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 }));
    this.sightMesh.frustumCulled = false;
    this.sightMesh.renderOrder = 9;
    this.sightMesh.visible = false;
    // Front arc of the selected figure: a half disc (or a full one for 360° vision) lying on the table.
    this.arcMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x4fd98a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    this.arcMesh.visible = false;
    this.scene.add(this.sightMesh, this.arcMesh);

    const el = this.renderer.domElement;
    // Capture phase: runs before the camera controls, so grabbing a figure never also turns the camera.
    el.addEventListener('pointerdown', this.onDown, { capture: true });
    el.addEventListener('pointermove', this.onMoveEvent);
    el.addEventListener('pointerup', this.onUp);
    // Holding a figure and turning the wheel turns the figure (15° a notch) instead of zooming.
    el.addEventListener(
      'wheel',
      (e) => {
        if (!this.drag) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.drag.turned = true;
        this.hooks.onTurn(this.drag.id, e.deltaY > 0 ? 15 : -15);
      },
      { capture: true, passive: false },
    );
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('contextmenu', (e: Event) => e.preventDefault());

    this.resizer = new ResizeObserver(() => this.resize());
    this.resizer.observe(host);
    this.resize();
    this.loop();
  }

  // ---- state ----

  setState(state: TableState): void {
    this.state = state;
    this.w = state.width;
    this.h = state.height;
    const tableKey = `${state.width}|${state.height}|${state.ground ?? ''}|${state.relief ?? 0}|${JSON.stringify(state.terrain)}`;
    if (tableKey !== this.builtTable) {
      this.builtTable = tableKey;
      this.buildTable(state);
    }
    const markerKey = JSON.stringify(state.markers);
    if (markerKey !== this.builtMarkers) {
      this.builtMarkers = markerKey;
      this.buildMarkers(state);
    }
    this.buildZones(state);
    this.buildOverlay(state);

    const seen = new Set<string>();
    for (const m of state.models) {
      seen.add(m.id);
      const hidden = this.hooks.hidden(m.id);
      const key = figureKey(m, hidden);
      let f = this.figures.get(m.id);
      if (!f || f.key !== key) {
        const group = hidden ? buildHidden(m) : buildFigure(m);
        const pos = f ? f.group.position.clone() : this.toWorld(m).setY(this.standY(state, m));
        if (f) this.figureGroup.remove(f.group);
        group.position.copy(pos);
        this.figureGroup.add(group);
        const label = f?.label ?? this.makeLabel();
        f = { group, key, target: this.toWorld(m).setY(this.standY(state, m)), label, model: m };
        this.figures.set(m.id, f);
      }
      f.model = m;
      f.target.copy(this.toWorld(m)).setY(this.standY(state, m));
      f.group.rotation.y = (-m.facing * Math.PI) / 180;
      const reacting = state.activation !== null && m.id in state.activation.reactions;
      const ap = state.phase === 'playing' ? ` · ${'●'.repeat(Math.min(m.ap, 6)) || '○'}` : '';
      const high = (m.z ?? 0) > 0.01 ? ` ▲${m.z}″` : '';
      f.label.textContent = hidden ? '?' : `${m.leader ? '★ ' : ''}${m.treasure ? '◆ ' : ''}${m.name.split(/[ ,]/)[0]} · ${m.hp}/${m.maxHp}${ap}${high}`;
      const side = SIDE_LABEL[m.side];
      const s = f.label.style;
      s.color = m.id === this.selected ? '#fff' : side.color;
      s.fontWeight = m.id === this.selected ? '600' : '400';
      s.borderColor = m.id === this.selected ? '#fff' : state.activation?.id === m.id ? '#33d3e0' : reacting ? '#ff8a3d' : side.border;
      s.boxShadow = state.activation?.id === m.id ? '0 0 0 1px #33d3e0' : '';
      s.opacity = m.hp === 0 ? '0.6' : '1';
      s.textDecoration = m.hp === 0 ? 'line-through' : '';
    }
    for (const [id, f] of this.figures) {
      if (seen.has(id)) continue;
      this.figureGroup.remove(f.group);
      f.label.remove();
      this.figures.delete(id);
    }
    this.activatedId = state.activation?.id ?? null;
    this.updateRing();
  }

  /** The template of the Attack being prepared, or null to clear it. */
  setTemplate(t: TemplateShape | null): void {
    for (const c of this.templateGroup.children) (c as THREE.Mesh).geometry.dispose();
    this.templateGroup.clear();
    if (!t) return;
    const color = t.ok ? 0xfb923c : 0xf87171;
    const fill = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    const edge = new THREE.LineBasicMaterial({ color });
    let outline: THREE.Vector3[] = [];
    if (t.circle) {
      const geo = new THREE.CircleGeometry(t.circle.r, 64);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, fill);
      mesh.position.copy(this.toWorld(t.circle.at)).setY(0.05);
      this.templateGroup.add(mesh);
      const c = this.toWorld(t.circle.at);
      for (let i = 0; i <= 64; i++) outline.push(new THREE.Vector3(c.x + Math.cos((i / 64) * Math.PI * 2) * t.circle.r, 0.06, c.z + Math.sin((i / 64) * Math.PI * 2) * t.circle.r));
    } else if (t.poly && t.poly.length >= 3) {
      const pts = t.poly.map((p) => this.toWorld(p).setY(0.05));
      const verts: number[] = [];
      for (let i = 1; i < pts.length - 1; i++) for (const v of [pts[0]!, pts[i]!, pts[i + 1]!]) verts.push(v.x, v.y, v.z);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      this.templateGroup.add(new THREE.Mesh(geo, fill));
      outline = [...pts, pts[0]!].map((v) => v.clone().setY(0.06));
    }
    if (outline.length) this.templateGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline), edge));
  }

  /** Circles on the table around figures; they follow the figure. */
  setRanges(rings: RangeRing[]): void {
    this.ranges = rings;
    for (const c of this.rangeGroup.children) (c as THREE.Mesh).geometry.dispose();
    this.rangeGroup.clear();
    for (const r of rings) {
      const mesh = buildRing(0xffffff, 1 - Math.min(0.5, 0.07 / Math.max(r.radius, 0.1)), 1, 0.7);
      ((mesh as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setStyle(r.color);
      mesh.scale.setScalar(r.radius);
      mesh.visible = true;
      this.rangeGroup.add(mesh);
    }
  }

  private makeLabel(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = LABEL_CSS;
    this.labels.append(el);
    return el;
  }

  private buildTable(state: TableState): void {
    this.tableGroup.clear();
    const { width: w, height: h } = state;

    // The board: a bed of dark oak with a raised, moulded rail down both long sides.
    const oak = (rx: number, ry: number) => surface('planks', [rx, ry], 0x8a6a4c);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 0.6, h + 1.4), oak((w + 1.4) / 8, (h + 1.4) / 8));
    // Under a ground with hollows (a stream bed) the bed of the board lies lower, or it would show through.
    frame.position.y = state.relief ? -0.66 : -0.31;
    frame.receiveShadow = true;
    frame.castShadow = true;
    this.tableGroup.add(frame);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.34, h + 1.4), oak(0.5, (h + 1.4) / 6));
      rail.position.set(side * (w / 2 + 0.36), 0.0, 0);
      rail.castShadow = true;
      rail.receiveShadow = true;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, h + 1.4, 10), oak(0.4, (h + 1.4) / 6));
      cap.rotation.x = Math.PI / 2;
      cap.position.set(side * (w / 2 + 0.36), 0.17, 0);
      cap.scale.x = 1.75;
      cap.castShadow = true;
      this.tableGroup.add(rail, cap);
    }

    // The field: earth, short grass and stones, with relief that catches the low sun – or a painted ground.
    const cells = state.relief ? 96 : 1;
    const matGeo = new THREE.PlaneGeometry(w, h, cells, cells);
    matGeo.rotateX(-Math.PI / 2);
    if (state.relief) {
      const p = matGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setY(i, reliefAt(state, p.getX(i) + w / 2, p.getZ(i) + h / 2));
      matGeo.computeVertexNormals();
    }
    const skin = surface('ground', [w / 12, h / 12], 0xffffff, state.ground ? 0.7 : 1.4);
    if (state.ground) {
      // A painted ground: the picture gives the colour, the computed field only its fine relief.
      const url = `${ASSETS}/grounds/${state.ground}`;
      loadBegin(url);
      const picture = new THREE.TextureLoader().load(url, () => loadEnd(url, true), undefined, () => loadEnd(url, false));
      picture.colorSpace = THREE.SRGBColorSpace;
      picture.anisotropy = 8;
      skin.map = picture;
      skin.roughnessMap = null;
      skin.roughness = 0.92;
    }
    const mat = new THREE.Mesh(matGeo, skin);
    mat.receiveShadow = true;
    this.tableGroup.add(mat);

    if (w === h && !state.ground) {
      const grid = new THREE.GridHelper(w, w, 0x000000, 0x000000);
      grid.position.y = 0.006;
      const gm = grid.material as THREE.Material;
      gm.transparent = true;
      gm.opacity = 0.09;
      gm.depthWrite = false;
      this.tableGroup.add(grid);
    }

    // Shelves beyond each player's edge: the party waits there. The darker quarter with the screen is the part
    // the other player cannot see.
    for (const side of [0, 1] as const) {
      const box = shelfRect(state, side);
      const depth = box.y1 - box.y0;
      const zc = (box.y0 + box.y1) / 2 - h / 2;
      const board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, depth), surface('planks', [w / 8, depth / 8], 0xa58463));
      board.position.set(0, -0.16, zc);
      board.receiveShadow = true;
      this.tableGroup.add(board);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, 0.12), new THREE.MeshBasicMaterial({ color: SIDE_COLORS[side] }));
      trim.position.set(0, 0.0, side === 0 ? box.y0 - h / 2 + 0.06 : box.y1 - h / 2 - 0.06);
      this.tableGroup.add(trim);
      const hw = w * SHELF.hidden;
      const hx = side === 0 ? w / 2 - hw / 2 : -w / 2 + hw / 2;
      const hiddenGeo = new THREE.PlaneGeometry(hw, depth);
      hiddenGeo.rotateX(-Math.PI / 2);
      const hidden = new THREE.Mesh(hiddenGeo, new THREE.MeshBasicMaterial({ color: 0x0c0a12, transparent: true, opacity: 0.55, depthWrite: false }));
      hidden.position.set(hx, 0.004, zc);
      this.tableGroup.add(hidden);
      // A low screen on the table side and the inner end of the hidden part.
      const wood = new THREE.MeshStandardMaterial({ color: 0x2c2018, roughness: 0.8 });
      const front = new THREE.Mesh(new THREE.BoxGeometry(hw, 1.1, 0.12), wood);
      front.position.set(hx, 0.4, side === 0 ? box.y0 - h / 2 : box.y1 - h / 2);
      const end = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, depth), wood);
      end.position.set(side === 0 ? w / 2 - hw : -w / 2 + hw, 0.4, zc);
      for (const m of [front, end]) {
        m.castShadow = true;
        this.tableGroup.add(m);
      }
    }

    for (const piece of state.terrain) this.tableGroup.add(buildTerrain(piece, w, h, piece.model ? reliefAt(state, piece.model.x, piece.model.y) : 0));
    // Rings, templates and markers lie just above the highest ground.
    this.rangeGroup.position.y = this.templateGroup.position.y = this.markerGroup.position.y = this.zoneGroup.position.y = (state.relief ?? 0) * 0.8;
    const swayers: THREE.Object3D[] = [];
    this.tableGroup.traverse((o) => o.userData.sway !== undefined && swayers.push(o));
    this.world.build(state, swayers);
    this.zoneKey = '';
    this.overlayKey = '';
  }

  /** Deployment Zones during deployment: belts along the two edges, or quarter circles in two corners. */
  private buildZones(state: TableState): void {
    const show = this.showZones && state.phase === 'setup';
    const key = `${show}|${state.deploy ?? 'standard'}|${state.deployDepth}|${state.width}|${state.height}`;
    if (key === this.zoneKey) return;
    this.zoneKey = key;
    for (const c of this.zoneGroup.children) (c as THREE.Mesh).geometry.dispose();
    this.zoneGroup.clear();
    if (!show) return;
    const { width: w, height: h, deployDepth: d } = state;
    for (const side of [0, 1] as const) {
      const fill = new THREE.MeshBasicMaterial({ color: SIDE_COLORS[side], transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
      let geo: THREE.BufferGeometry;
      let zone: THREE.Mesh;
      if (state.deploy === 'corner') {
        // Blue: the corner at the near left; Red: the far right.
        geo = new THREE.CircleGeometry(d, 32, side === 0 ? 0 : Math.PI, Math.PI / 2);
        geo.rotateX(-Math.PI / 2);
        zone = new THREE.Mesh(geo, fill);
        zone.position.set(side === 0 ? -w / 2 : w / 2, 0.012, side === 0 ? h / 2 : -h / 2);
      } else {
        geo = new THREE.PlaneGeometry(w, d);
        geo.rotateX(-Math.PI / 2);
        zone = new THREE.Mesh(geo, fill);
        zone.position.set(0, 0.012, side === 0 ? h / 2 - d / 2 : -h / 2 + d / 2);
      }
      this.zoneGroup.add(zone);
    }
  }

  /** The terrain as the rules see it: the outline of every piece at its height (areas on the ground). */
  private buildOverlay(state: TableState): void {
    const spells = state.terrain.filter((t) => t.caster !== undefined || t.until !== undefined);
    const pieces = this.showOverlay ? state.terrain : spells;
    const key = `${this.showOverlay}|${pieces.length}|${pieces.map((t) => t.id).join(',')}`;
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    for (const c of this.overlayGroup.children) (c as THREE.Line).geometry.dispose();
    this.overlayGroup.clear();
    const lift = (state.relief ?? 0) * 0.8;
    for (const t of pieces) {
      const y = (t.kind === 'obstacle' ? t.height : 0) + 0.06 + lift;
      const top = t.shape.map((p) => this.toWorld(p).setY(y));
      const color = t.kind === 'obstacle' ? 0xffd296 : t.env === 'water' ? 0x5ab4ff : t.env === 'forest' ? 0x5ad17a : 0xc08cf0;
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(top), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }));
      line.renderOrder = 8;
      this.overlayGroup.add(line);
      if (t.kind !== 'obstacle') continue;
      // The faces of an obstacle: posts at its corners down to the ground.
      const posts: THREE.Vector3[] = [];
      for (const v of top) posts.push(v, v.clone().setY(lift + 0.02));
      const edges = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(posts), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.45 }));
      edges.renderOrder = 8;
      this.overlayGroup.add(edges);
    }
  }

  /** Quest objectives and tokens. They change during a game, so they are rebuilt whenever they do. */
  private buildMarkers(state: TableState): void {
    this.markerGroup.clear();
    this.tokenMeshes.clear();
    for (const l of this.markerLabels) l.el.remove();
    this.markerLabels = [];
    const solid = (color: number, emissive = 0x000000, glow = 0) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive, emissiveIntensity: glow });
    for (const k of state.markers) {
      const at = this.toWorld(k);
      const add = (mesh: THREE.Mesh, y: number): void => {
        mesh.position.set(at.x, y, at.z);
        mesh.castShadow = true;
        this.markerGroup.add(mesh);
      };
      if (k.kind === 'token') {
        // WarBracket: a token the players put down themselves (Quests the table does not run).
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(TOKEN_R, TOKEN_R, 0.1, 24), solid(0x8bd3dd, 0x2a6b78, 0.5));
        disc.userData.tokenId = k.id;
        add(disc, 0.05);
        this.tokenMeshes.set(k.id, disc);
        this.markerLabel(k, 0.7);
        continue;
      }
      if (k.kind === undefined) this.markerLabel(k, 2.9);
      if (k.kind === undefined) {
        // An objective: a stone marker and its scoring ring.
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.49, 2.4, 6), solid(0xd8d2c0, 0x6b5a1e, 0.5)), 1.2);
        const reach = k.radius + 0.49;
        const ring = buildRing(0xe0b24a, 1 - 0.08 / reach, 1, 0.8);
        ring.scale.setScalar(reach);
        ring.position.set(at.x, 0.03, at.z);
        ring.visible = true;
        this.markerGroup.add(ring);
      } else if (k.kind === 'intrigue') {
        // A face-down token with a question mark's worth of mystery: a purple disc and a floating gem.
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.12, 24), solid(0x6d3fa8, 0x3b1d66, 0.6)), 0.06);
        add(new THREE.Mesh(new THREE.OctahedronGeometry(0.28), solid(0xc9a5ff, 0x8a5cf0, 0.9)), 0.75);
      } else if (k.kind === 'sigil') {
        // A glowing rune disc on top of the chest it guards.
        add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.5), solid(0x6b4423)), 0.225);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.06, 6), solid(0xff7a1a, 0xff5a00, 1.2)), 0.5);
        const ring = buildRing(0xff7a1a, 0.97, 1, 0.5);
        ring.scale.setScalar(120 / 25.4 / 2);
        ring.position.set(at.x, 0.03, at.z);
        ring.visible = true;
        this.markerGroup.add(ring);
      } else if (k.kind === 'cache') {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.5), solid(0x8a5a2b, 0x5a3a10, 0.3)), 0.225);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.55), solid(0xd9a441, 0x8a6a10, 0.4)), 0.5);
      } else if (k.kind === 'opened') {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.3, 0.5), solid(0x4a3b2c)), 0.15);
      } else {
        // Loot on the ground.
        add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.3), solid(0xffd24a, 0xd9a400, 0.9)), 0.3);
      }
    }
    if (this.selectedToken && !this.tokenMeshes.has(this.selectedToken)) this.selectedToken = null;
    this.updateRing();
  }

  private markerLabel(k: Marker, height: number): void {
    const el = this.makeLabel();
    el.textContent = k.name;
    el.style.color = '#e8f6f8';
    this.markerLabels.push({ el, id: k.id, at: this.toWorld(k).setY(height) });
  }

  /** Lines between figures, and the Front arc of one figure (null = none). */
  setSight(lines: SightLine[], arc: { id: string; full: boolean } | null): void {
    this.sightLines = lines;
    this.sightMesh.visible = lines.length > 0;
    const changed = arc?.id !== this.arc?.id || arc?.full !== this.arc?.full;
    this.arc = arc;
    this.arcMesh.visible = arc !== null;
    if (arc && changed) {
      this.arcMesh.geometry.dispose();
      const geo = new THREE.CircleGeometry(9, 48, 0, arc.full ? Math.PI * 2 : Math.PI);
      geo.rotateX(-Math.PI / 2); // the flat edge now runs left-right and the disc points to -z, the figure's front
      this.arcMesh.geometry = geo;
    }
  }

  setSelected(id: string | null): void {
    if (this.selected === id) return;
    this.selected = id;
    if (this.state) this.setState(this.state);
  }

  setSelectedToken(id: string | null): void {
    this.selectedToken = id;
    this.updateRing();
  }

  setShowZones(on: boolean): void {
    this.showZones = on;
    if (this.state) this.buildZones(this.state);
  }

  setShowTerrain(on: boolean): void {
    this.showOverlay = on;
    if (this.state) this.buildOverlay(this.state);
  }

  private updateRing(): void {
    const f = this.selected ? this.figures.get(this.selected) : undefined;
    this.ring.visible = !!f;
    if (f) this.ring.scale.setScalar(baseRadius(f.model.size));
    const a = this.activatedId ? this.figures.get(this.activatedId) : undefined;
    this.activeRing.visible = !!a;
    if (a) this.activeRing.scale.setScalar(baseRadius(a.model.size));
    const t = this.selectedToken ? this.tokenMeshes.get(this.selectedToken) : undefined;
    this.tokenRing.visible = !!t;
    if (t) {
      this.tokenRing.scale.setScalar(TOKEN_R);
      this.tokenRing.position.set(t.position.x, this.markerGroup.position.y + 0.12, t.position.z);
    }
  }

  setMode(mode: Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.cancelDrag();
    this.measure = null;
    this.hideTools();
    this.renderer.domElement.style.cursor = mode === 'select' ? '' : 'crosshair';
  }

  get weather(): Weather {
    return this.world.current;
  }

  setWeather(w: Weather): void {
    this.world.setWeather(w);
  }

  setTopDown(on: boolean): void {
    this.topDown = on;
    const t = this.controls.target;
    const d = this.camera.position.distanceTo(t);
    if (on) this.camera.position.set(t.x, d, t.z + 0.01);
    else this.camera.position.set(t.x, d * 0.64, t.z + d * 0.77);
    this.controls.enableRotate = !on;
    this.controls.update();
  }

  focus(id: string): void {
    const f = this.figures.get(id);
    if (!f) return;
    const delta = f.target.clone().sub(this.controls.target);
    delta.y = 0;
    this.controls.target.add(delta);
    this.camera.position.add(delta);
  }

  // ---- coordinates ----

  /** How high a figure stands: on scenery at its height, otherwise on the ground as it rises and falls. */
  private standY(state: TableState, m: Model): number {
    return (m.z ?? 0) > 0.01 ? m.z! : reliefAt(state, m.x, m.y);
  }

  private toWorld(p: Pt): THREE.Vector3 {
    return new THREE.Vector3(p.x - this.w / 2, 0, p.y - this.h / 2);
  }

  private toTable(v: THREE.Vector3): Pt {
    return { x: v.x + this.w / 2, y: v.z + this.h / 2 };
  }

  private aim(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  /** Point of the table under the mouse (table inches), or null when pointing at the sky. */
  private groundAt(e: PointerEvent): Pt | null {
    this.aim(e);
    // The top of a piece of scenery under the mouse counts too (a roof the figure can stand on).
    const tops = this.raycaster.intersectObjects(this.tableGroup.children, true).find((x) => x.object.userData.terrain && (x.face?.normal.y ?? 0) > 0.7);
    if (tops) return this.toTable(tops.point);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
    return hit ? this.toTable(hit) : null;
  }

  private modelAt(e: PointerEvent): Model | null {
    this.aim(e);
    const hits = this.raycaster.intersectObjects(this.figureGroup.children, true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.modelId) o = o.parent;
      const f = o ? this.figures.get(o.userData.modelId as string) : undefined;
      if (f) return f.model;
    }
    return null;
  }
  private tokenAt(e: PointerEvent): string | null {
    this.aim(e);
    for (const hit of this.raycaster.intersectObjects(this.markerGroup.children, false)) {
      const id = hit.object.userData.tokenId as string | undefined;
      if (id) return id;
    }
    return null;
  }

  private onTable(p: Pt): boolean {
    return p.x >= 0 && p.x <= this.w && p.y >= 0 && p.y <= this.h;
  }

  // ---- mouse ----

  private grabToken(id: string, e: PointerEvent): void {
    const k = this.state?.markers.find((x) => x.id === id);
    if (!k) return;
    this.setSelectedToken(id);
    this.hooks.onTokenSelect(id);
    this.tokenDrag = { id, at: { x: k.x, y: k.y }, moved: false };
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || !this.state) return;
    this.down = { x: e.clientX, y: e.clientY };

    if (this.mode === 'measure') {
      const m = this.modelAt(e);
      const p = m ? { x: m.x, y: m.y } : this.groundAt(e);
      if (!p) return;
      this.measure = { a: p, am: m, b: p, bm: m, live: true };
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }
    if (this.mode === 'aim') return;
    const token = this.hooks.canAct() ? this.tokenAt(e) : null;
    if (this.mode === 'token') {
      if (token) this.grabToken(token, e);
      return; // an empty spot: the token is put down on release, if the mouse did not turn the camera meanwhile
    }

    const m = this.modelAt(e);
    if (!m) {
      if (token) this.grabToken(token, e);
      return;
    }
    this.setSelected(m.id);
    this.hooks.onSelect(m.id);
    if (!this.hooks.canDrag(m.id)) return;
    const g = this.groundAt(e) ?? { x: m.x, y: m.y };
    this.drag = { id: m.id, startX: e.clientX, startY: e.clientY, offset: { x: m.x - g.x, y: m.y - g.y }, active: false, dest: null, ok: false };
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private onMoveEvent = (e: PointerEvent): void => {
    if (!this.state) return;
    if (this.measure?.live) {
      const m = this.modelAt(e);
      const p = m ? { x: m.x, y: m.y } : this.groundAt(e);
      if (p) {
        this.measure.b = p;
        this.measure.bm = m;
        this.showMeasure();
      }
      return;
    }
    const td = this.tokenDrag;
    if (td) {
      const g = this.groundAt(e);
      const mesh = this.tokenMeshes.get(td.id);
      const k = this.state.markers.find((x) => x.id === td.id);
      if (!g || !mesh || !k) return;
      td.at = { x: round2(Math.max(0, Math.min(this.w, g.x))), y: round2(Math.max(0, Math.min(this.h, g.y))) };
      td.moved = td.moved || Math.hypot(td.at.x - k.x, td.at.y - k.y) > 0.15;
      if (td.moved) {
        const v = this.toWorld(td.at);
        mesh.position.set(v.x, mesh.position.y, v.z);
        this.updateRing();
      }
      return;
    }
    const d = this.drag;
    if (!d) {
      if (this.mode === 'select') this.renderer.domElement.style.cursor = this.modelAt(e) ? 'pointer' : '';
      if (this.mode === 'aim') {
        const g = this.groundAt(e);
        if (g) this.hooks.previewAim(round2(g.x), round2(g.y));
      }
      return;
    }
    if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < CLICK_SLOP) return;
    d.active = true;
    const g = this.groundAt(e);
    const f = this.figures.get(d.id);
    if (!g || !f) return;
    const r = baseRadius(f.model.size);
    // Keep the base on the table while dragging.
    const dest = {
      x: round2(Math.min(this.w - r, Math.max(r, g.x + d.offset.x))),
      // A figure can be dragged past its table edge onto the shelf (and back).
      y: round2(Math.min(this.h + SHELF.gap + SHELF.depth - r, Math.max(r - SHELF.gap - SHELF.depth, g.y + d.offset.y))),
    };
    const p = this.hooks.previewMove(d.id, dest.x, dest.y);
    const end = p.at ?? dest;
    d.dest = end;
    d.ok = p.ok;
    this.showGhost(f.model.size, end, d.ok);
    this.showRuler(f.model, end, p.label, d.ok);
  };

  private onUp = (e: PointerEvent): void => {
    const el = this.renderer.domElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    this.controls.enabled = true;
    const wasClick = this.down !== null && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < CLICK_SLOP;
    this.down = null;

    if (this.measure?.live) {
      this.measure.live = false; // the measurement stays on screen until the next click
      if (wasClick) {
        this.measure = null;
        this.hideTools();
      }
      return;
    }
    const td = this.tokenDrag;
    if (td) {
      this.tokenDrag = null;
      if (td.moved && e.type === 'pointerup') this.hooks.onTokenMove(td.id, td.at.x, td.at.y);
      else if (td.moved) this.builtMarkers = ''; // cancelled: the next state puts it back
      return;
    }
    if (this.mode === 'aim' || this.mode === 'token') {
      if (wasClick && e.type === 'pointerup') {
        const g = this.groundAt(e);
        if (!g) return;
        if (this.mode === 'aim') this.hooks.onAim(round2(g.x), round2(g.y));
        else if (this.onTable(g)) this.hooks.onTokenPlace(round2(g.x), round2(g.y));
      }
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (d) {
      this.hideTools();
      if (d.active && d.dest && d.ok && e.type === 'pointerup') this.hooks.onMove(d.id, d.dest.x, d.dest.y);
      return;
    }
    if (this.mode === 'select' && wasClick && e.type === 'pointerup' && !this.modelAt(e)) {
      this.setSelected(null);
      this.hooks.onSelect(null);
      this.setSelectedToken(null);
      this.hooks.onTokenSelect(null);
    }
  };

  private cancelDrag(): void {
    this.drag = null;
    this.tokenDrag = null;
    this.controls.enabled = true;
  }

  // ---- ruler and ghost ----

  private showGhost(size: BaseSize, at: Pt, ok: boolean): void {
    const r = baseRadius(size);
    const hgt = baseHeight(size);
    this.ghost.scale.set(r, hgt, r);
    this.ghost.position.copy(this.toWorld(at)).setY(hgt / 2);
    (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(ok ? 0x4ade80 : 0xf87171);
    this.ghost.visible = true;
  }

  private rulerMid = new THREE.Vector3();

  private showRuler(a: Pt, b: Pt, text: string, ok = true): void {
    const va = this.toWorld(a).setY(0.2);
    const vb = this.toWorld(b).setY(0.2);
    this.ruler.geometry.setFromPoints([va, vb]);
    (this.ruler.material as THREE.LineBasicMaterial).color.setHex(ok ? 0xffffff : 0xf87171);
    this.ruler.visible = true;
    this.rulerMid.copy(vb).setY(0.6);
    this.rulerLabel.textContent = text;
    this.rulerLabel.style.color = this.rulerLabel.style.borderColor = ok ? '#fff' : '#f87171';
    this.rulerLabel.hidden = false;
  }

  private showMeasure(): void {
    const m = this.measure;
    if (!m) return;
    let d = dist(m.a, m.b);
    // Between two figures the distance is measured base edge to base edge.
    if (m.am && m.bm && m.am.id !== m.bm.id) d = Math.max(0, d - baseRadius(m.am.size) - baseRadius(m.bm.size));
    else if (m.am && !m.bm) d = Math.max(0, d - baseRadius(m.am.size));
    else if (m.bm && !m.am) d = Math.max(0, d - baseRadius(m.bm.size));
    this.showRuler(m.a, m.b, `${d.toFixed(1)}"`);
  }

  private hideTools(): void {
    this.ghost.visible = false;
    this.ruler.visible = false;
    this.rulerLabel.hidden = true;
  }
  // ---- frame loop ----

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private proj = new THREE.Vector3();

  private place(el: HTMLElement, world: THREE.Vector3): void {
    this.proj.copy(world).project(this.camera);
    const visible = this.proj.z > -1 && this.proj.z < 1;
    el.style.display = visible ? '' : 'none';
    if (!visible) return;
    const x = (this.proj.x * 0.5 + 0.5) * this.host.clientWidth;
    const y = (-this.proj.y * 0.5 + 0.5) * this.host.clientHeight;
    el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
  private tmp = new THREE.Vector3();
  private col = new THREE.Color();

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    this.controls.update();
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.world.update(now / 1000, dt, this.camera);
    for (const f of this.figures.values()) {
      // No animation: a figure slides to where it now stands.
      if (f.group.position.distanceTo(f.target) > 1e-3) f.group.position.lerp(f.target, 0.22);
      else f.group.position.copy(f.target);
      this.place(f.label, this.tmp.copy(f.group.position).setY(f.group.position.y + baseHeight(f.model.size) + 0.45));
    }
    for (const l of this.markerLabels) {
      const mesh = this.tokenMeshes.get(l.id);
      if (mesh) l.at.set(mesh.position.x, l.at.y, mesh.position.z);
      this.place(l.el, l.at);
    }
    const sel = this.selected ? this.figures.get(this.selected) : undefined;
    if (sel) this.ring.position.set(sel.group.position.x, sel.group.position.y + 0.03, sel.group.position.z);
    const act = this.activatedId ? this.figures.get(this.activatedId) : undefined;
    if (act) this.activeRing.position.set(act.group.position.x, act.group.position.y + 0.025, act.group.position.z);
    this.ranges.forEach((r, i) => {
      const f = this.figures.get(r.id);
      const mesh = this.rangeGroup.children[i];
      if (!mesh) return;
      mesh.visible = !!f;
      if (f) mesh.position.set(f.group.position.x, f.group.position.y + 0.04, f.group.position.z);
    });
    if (this.sightLines.length > 0) {
      const pts: number[] = [];
      const cols: number[] = [];
      const c = this.col;
      for (const l of this.sightLines) {
        const a = this.figures.get(l.from);
        const b = this.figures.get(l.to);
        if (!a || !b) continue;
        pts.push(a.group.position.x, a.group.position.y + baseHeight(a.model.size), a.group.position.z, b.group.position.x, b.group.position.y + baseHeight(b.model.size) * 0.6, b.group.position.z);
        c.setStyle(l.color);
        cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
      const g = this.sightMesh.geometry;
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    }
    const arcFig = this.arc ? this.figures.get(this.arc.id) : undefined;
    this.arcMesh.visible = !!arcFig;
    if (arcFig) {
      this.arcMesh.position.set(arcFig.group.position.x, arcFig.group.position.y + 0.035, arcFig.group.position.z);
      this.arcMesh.rotation.y = arcFig.group.rotation.y;
    }
    if (!this.rulerLabel.hidden) this.place(this.rulerLabel, this.rulerMid);
    this.renderer.render(this.scene, this.camera);
  };

  get isTopDown(): boolean {
    return this.topDown;
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizer.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labels.remove();
  }
}
