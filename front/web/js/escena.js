/* Maqueta 3D de la red con three.js.
   - Cada estación es un andén blanco con una torre: la altura es la cantidad
     de buses por día (lo que devuelve red.ranking); gris si está cerrada.
   - Las rutas son carriles grises entre estaciones vecinas.
   - Un viaje (red.viaje) o una ruta (red.recorrido) se resaltan con una
     línea elevada y un bus articulado que la recorre.
   Todo lo que se dibuja viene del motor; aquí no se decide nada de la red. */

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from '../vendor/CSS2DRenderer.js';
import { colorRuta } from './util.js';

const C_FONDO = 0xeef0f4;
const C_BASE = 0xf9fafb;
const C_CARRIL = 0xd3d8df;
const C_ANDEN = 0xffffff;
const C_CERRADA = 0xc4c9d1;
const C_APAGADA = new THREE.Color(0xe4e7ec);
const C_BAJA = new THREE.Color(0xf4b3ba);
const C_ALTA = new THREE.Color(0xd7192d);
const ALTURA_MAX = 10;

const suavizar = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Maqueta {
  constructor(contenedor, { alSeleccionar } = {}) {
    this.contenedor = contenedor;
    this.alSeleccionar = alSeleccionar || (() => {});
    this.estaciones = [];          // [{nombre, estado, buses}]
    this.indice = new Map();       // nombre -> i
    this.pos = new Map();          // nombre -> {x, z}
    this.alturas = [];
    this.enfoque = null;           // Set de nombres resaltados (o null)
    this.etiquetasVisibles = true;
    this.vuelo = null;
    this.buses = [];               // buses animados
    this.reloj = new THREE.Clock();

    this._crearBase();
    this._eventos();
    this._animar();
  }

  /* ------------------------------------------------------------ escena */
  _crearBase() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.contenedor.appendChild(r.domElement);

    this.etiquetas = new CSS2DRenderer();
    this.etiquetas.setSize(innerWidth, innerHeight);
    Object.assign(this.etiquetas.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
    this.contenedor.appendChild(this.etiquetas.domElement);

    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(C_FONDO);
    s.fog = new THREE.Fog(C_FONDO, 170, 330);

    const cam = this.camara = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 900);
    this.vistaInicial = { pos: new THREE.Vector3(-30, 92, 112), obj: new THREE.Vector3(0, 0, 4) };
    cam.position.copy(this.vistaInicial.pos);

    const c = this.controles = new OrbitControls(cam, r.domElement);
    c.target.copy(this.vistaInicial.obj);
    c.enableDamping = true; c.dampingFactor = 0.08;
    c.minDistance = 12; c.maxDistance = 260;
    c.maxPolarAngle = Math.PI * 0.44;
    c.autoRotate = true; c.autoRotateSpeed = 0.35;
    c.screenSpacePanning = false;

    // Luz suave de maqueta
    s.add(new THREE.HemisphereLight(0xffffff, 0xdfe3ea, 1.15));
    const sol = this.sol = new THREE.DirectionalLight(0xffffff, 1.9);
    sol.position.set(55, 95, 40);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    const sc = sol.shadow.camera;
    sc.left = -85; sc.right = 85; sc.top = 85; sc.bottom = -85; sc.near = 10; sc.far = 260;
    sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.03; sol.shadow.radius = 4;
    s.add(sol);

    // Suelo y mesa de la maqueta
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: C_FONDO, roughness: 1 }));
    suelo.rotation.x = -Math.PI / 2; suelo.position.y = -0.62; suelo.receiveShadow = true;
    s.add(suelo);
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(70, 70.6, 0.6, 128), new THREE.MeshStandardMaterial({ color: C_BASE, roughness: .9 }));
    mesa.position.y = -0.3; mesa.receiveShadow = true;
    s.add(mesa);
    const borde = new THREE.Mesh(new THREE.TorusGeometry(70.3, 0.09, 8, 160), new THREE.MeshBasicMaterial({ color: 0xd7192d }));
    borde.rotation.x = Math.PI / 2; borde.position.y = 0.0;
    s.add(borde);

    this._crearCerros();

    this.grupoRed = new THREE.Group();
    this.grupoResaltado = new THREE.Group();
    s.add(this.grupoRed, this.grupoResaltado);

    // Anillo de selección
    this.anillo = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 10, 64), new THREE.MeshBasicMaterial({ color: 0xd7192d }));
    this.anillo.rotation.x = Math.PI / 2; this.anillo.visible = false;
    s.add(this.anillo);

    this.raycaster = new THREE.Raycaster();
    this.puntero = new THREE.Vector2();
  }

  /* Cerros al oriente, como en Bogotá: un detalle de fondo. */
  _crearCerros() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe6ebe3, roughness: 1, flatShading: true });
    const g = new THREE.Group();
    let semilla = 11;
    const rnd = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const a = -0.95 + i * 0.075 + rnd() * 0.04;
      const rad = 118 + rnd() * 14;
      const geo = new THREE.IcosahedronGeometry(7 + rnd() * 6, 1);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) p.setY(k, Math.max(0, p.getY(k)) * (0.45 + rnd() * 0.2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.cos(a) * rad + 20, -0.6, Math.sin(a) * rad);
      m.scale.set(1.4, 1, 1);
      m.rotation.y = rnd() * Math.PI;
      m.receiveShadow = true;
      g.add(m);
    }
    g.rotation.y = -0.2;
    this.scene.add(g);
  }

  /* ------------------------------------------------------------ red */
  construir(datos, layout) {
    this.pos = layout.pos;
    this.tam = Math.min(2.2, Math.max(0.55, layout.separacion * 0.42));
    this._datos(datos);
    this._crearEstaciones();
    this._crearCarriles(datos.rutas);
    this._crearEtiquetasFijas();
  }

  /** Después de cerrar, reabrir o editar: alturas, colores y carriles. */
  actualizar(datos) {
    this._datos(datos);
    this._pintarEstaciones(true);
    this._crearCarriles(datos.rutas);
    this._crearEtiquetasFijas();
  }

  _datos(datos) {
    this.estaciones = datos.estaciones;
    this.rutas = datos.rutas;
    this.indice = new Map(this.estaciones.map((e, i) => [e.nombre, i]));
    this.maxBuses = 1;
    for (const e of this.estaciones) this.maxBuses = Math.max(this.maxBuses, e.buses);
  }

  _crearEstaciones() {
    const n = this.estaciones.length, t = this.tam;
    const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.02, ...extra });

    const geoAnden = new THREE.BoxGeometry(t * 1.7, 0.24, t * 0.78);
    geoAnden.translate(0, 0.12, 0);
    const geoTorre = new THREE.CylinderGeometry(t * 0.33, t * 0.36, 1, 32);
    geoTorre.translate(0, 0.5, 0);
    const geoTapa = new THREE.CylinderGeometry(t * 0.46, t * 0.46, 0.12, 32);

    this.anden = new THREE.InstancedMesh(geoAnden, mat(C_ANDEN), n);
    this.torre = new THREE.InstancedMesh(geoTorre, mat(0xffffff), n);
    this.tapa = new THREE.InstancedMesh(geoTapa, mat(0xffffff, { roughness: .25 }), n);
    for (const m of [this.anden, this.torre, this.tapa]) {
      m.castShadow = true; m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.grupoRed.add(m);
    }

    // Orientar cada andén según su primera vecina
    this.angulos = new Float32Array(n);
    const vecina = new Map();
    for (const r of this.rutas) for (let i = 0; i + 1 < r.paradas.length; i++) {
      if (!vecina.has(r.paradas[i])) vecina.set(r.paradas[i], r.paradas[i + 1]);
      if (!vecina.has(r.paradas[i + 1])) vecina.set(r.paradas[i + 1], r.paradas[i]);
    }
    this.estaciones.forEach((e, i) => {
      const a = this.pos.get(e.nombre), b = this.pos.get(vecina.get(e.nombre));
      this.angulos[i] = b ? -Math.atan2(b.z - a.z, b.x - a.x) : 0;
    });

    this.alturas = new Float32Array(n);
    this.alturasMeta = new Float32Array(n);
    this._pintarEstaciones(false);
  }

  _alturaDe(e) {
    if (e.estado !== 'ABIERTA') return 0.3;
    const h = 0.45 + ALTURA_MAX * Math.pow(e.buses / this.maxBuses, 0.8);
    return this.enfoque && !this.enfoque.has(e.nombre) ? Math.min(h, 0.45 + h * 0.18) : h;
  }

  _colorDe(e) {
    if (e.estado !== 'ABIERTA') return new THREE.Color(C_CERRADA);
    const c = C_BAJA.clone().lerp(C_ALTA, Math.pow(e.buses / this.maxBuses, 0.6));
    if (this.enfoque && !this.enfoque.has(e.nombre)) return c.lerp(C_APAGADA, 0.82);
    return c;
  }

  _pintarEstaciones(animado) {
    this.estaciones.forEach((e, i) => {
      this.alturasMeta[i] = this._alturaDe(e);
      if (!animado) this.alturas[i] = this.alturasMeta[i];
      const c = this._colorDe(e);
      this.torre.setColorAt(i, c);
      const tapa = e.estado !== 'ABIERTA' ? new THREE.Color(0xd9dde3)
        : (this.enfoque && !this.enfoque.has(e.nombre) ? new THREE.Color(0xf2f3f5) : new THREE.Color(0xffffff));
      this.tapa.setColorAt(i, tapa);
      this.anden.setColorAt(i, new THREE.Color(this.enfoque && !this.enfoque.has(e.nombre) ? 0xf4f5f7 : C_ANDEN));
    });
    this.torre.instanceColor.needsUpdate = true;
    this.tapa.instanceColor.needsUpdate = true;
    this.anden.instanceColor.needsUpdate = true;
    this._ubicarEstaciones();
  }

  _ubicarEstaciones() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), eje = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3(), esc = new THREE.Vector3();
    this.estaciones.forEach((e, i) => {
      const p = this.pos.get(e.nombre); if (!p) return;
      q.setFromAxisAngle(eje, this.angulos[i]);
      m.compose(v.set(p.x, 0, p.z), q, esc.set(1, 1, 1));
      this.anden.setMatrixAt(i, m);
      const h = this.alturas[i];
      m.compose(v.set(p.x, 0.22, p.z), q, esc.set(1, h, 1));
      this.torre.setMatrixAt(i, m);
      m.compose(v.set(p.x, 0.22 + h + 0.07, p.z), q, esc.set(1, 1, 1));
      this.tapa.setMatrixAt(i, m);
    });
    this.anden.instanceMatrix.needsUpdate = true;
    this.torre.instanceMatrix.needsUpdate = true;
    this.tapa.instanceMatrix.needsUpdate = true;
    this.torre.computeBoundingSphere();
    this.anden.computeBoundingSphere();
  }

  _crearCarriles(rutas) {
    if (this.carriles) { this.grupoRed.remove(this.carriles); this.carriles.geometry.dispose(); }
    const pares = [], vistos = new Set();
    for (const r of rutas) for (let i = 0; i + 1 < r.paradas.length; i++) {
      const a = r.paradas[i], b = r.paradas[i + 1];
      const k = a < b ? a + '\u0000' + b : b + '\u0000' + a;
      if (vistos.has(k) || !this.pos.has(a) || !this.pos.has(b)) continue;
      vistos.add(k); pares.push([a, b]);
    }
    const geo = new THREE.BoxGeometry(1, 0.05, 1);
    const malla = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: C_CARRIL, roughness: 1 }), Math.max(1, pares.length));
    malla.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), eje = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3(), esc = new THREE.Vector3();
    const ancho = this.tam * 0.2;
    pares.forEach(([a, b], i) => {
      const p = this.pos.get(a), w = this.pos.get(b);
      const dx = w.x - p.x, dz = w.z - p.z, largo = Math.hypot(dx, dz);
      q.setFromAxisAngle(eje, -Math.atan2(dz, dx));
      m.compose(v.set((p.x + w.x) / 2, 0.03, (p.z + w.z) / 2), q, esc.set(largo, 1, ancho));
      malla.setMatrixAt(i, m);
    });
    malla.count = pares.length;
    this.carriles = malla;
    this.grupoRed.add(malla);
  }

  /* ------------------------------------------------------------ etiquetas */
  _etiqueta(texto, clase, html = false) {
    const div = document.createElement('div');
    div.className = 'etiqueta3d ' + clase;
    if (html) div.innerHTML = texto; else div.textContent = texto;
    return new CSS2DObject(div);
  }

  _crearEtiquetasFijas() {
    if (this.fijas) { for (const o of this.fijas.children) o.element.remove(); this.scene.remove(this.fijas); }
    this.fijas = new THREE.Group();
    const top = this.estaciones.filter((e) => e.estado === 'ABIERTA')
      .sort((a, b) => b.buses - a.buses).slice(0, 10);
    for (const e of top) {
      const i = this.indice.get(e.nombre), p = this.pos.get(e.nombre);
      const et = this._etiqueta(e.nombre, 'discreta');
      et.userData.nombre = e.nombre;
      et.position.set(p.x, 0.22 + this.alturasMeta[i] + 0.4, p.z);
      this.fijas.add(et);
    }
    this.fijas.visible = this.etiquetasVisibles && !this.enfoque;
    this.scene.add(this.fijas);
    this._ocultarDuplicadas();
  }

  setEtiquetas(v) {
    this.etiquetasVisibles = v;
    if (this.fijas) this.fijas.visible = v && !this.enfoque;
    this._ocultarDuplicadas();
  }

  setGiro(v) { this.controles.autoRotate = v; }
  get girando() { return this.controles.autoRotate; }

  /* ------------------------------------------------------------ selección */
  seleccionar(nombre, volar = true) {
    if (this.etSel) { this.etSel.element.remove(); this.scene.remove(this.etSel); this.etSel = null; }
    this.seleccionada = nombre;
    this._ocultarDuplicadas();
    if (!nombre || !this.pos.has(nombre)) { this.anillo.visible = false; return; }
    const p = this.pos.get(nombre), i = this.indice.get(nombre), e = this.estaciones[i];
    this.anillo.visible = true;
    this.anillo.scale.setScalar(this.tam * 1.05);
    this.anillo.position.set(p.x, 0.08, p.z);
    this.anilloT = 0;
    this.etSel = this._etiqueta(`${e.nombre}<span class="b">${e.estado === 'ABIERTA' ? e.buses.toLocaleString('es-CO') : 'cerrada'}</span>`, 'fuerte', true);
    this.etSel.position.set(p.x, 0.22 + this.alturasMeta[i] + 0.6, p.z);
    this.scene.add(this.etSel);
    if (volar) this.volarA([nombre], 26);
  }

  /* La etiqueta de la estación seleccionada reemplaza a las demás de esa estación. */
  _ocultarDuplicadas() {
    // (CSS2DRenderer usa .visible; cambiar el estilo a mano no dura)
    const revisar = (g) => g && g.traverse((o) => {
      if (!o.isCSS2DObject) return;
      const dup = o.userData.nombre && o.userData.nombre === this.seleccionada;
      o.visible = !dup && (!o.userData.opcional || this.etiquetasVisibles);
    });
    revisar(this.fijas); revisar(this.grupoResaltado);
  }

  /** Mueve la cámara para encuadrar un conjunto de estaciones. */
  volarA(nombres, distanciaMin = 30) {
    const pts = nombres.map((n) => this.pos.get(n)).filter(Boolean);
    if (!pts.length) return;
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p.x; cz += p.z; }
    cx /= pts.length; cz /= pts.length;
    let r = 0;
    for (const p of pts) r = Math.max(r, Math.hypot(p.x - cx, p.z - cz));
    const dist = Math.max(distanciaMin, r * 2.7 + 16);
    const obj = new THREE.Vector3(cx, 0, cz);
    // conserva el ángulo horizontal actual de la cámara
    const dir = this.camara.position.clone().sub(this.controles.target); dir.y = 0;
    if (dir.lengthSq() < 1) dir.set(-0.3, 0, 1);
    dir.normalize();
    // El panel tapa la izquierda: se corre el objetivo para que lo encuadrado
    // quede en el espacio libre de la pantalla.
    if (innerWidth > 860) {
      const derecha = new THREE.Vector3(dir.z, 0, -dir.x);     // derecha en pantalla
      const corrimiento = (innerWidth > 1300 ? 0.2 : 0.14) * dist * (innerWidth / innerHeight) / 1.6;
      obj.add(derecha.multiplyScalar(-corrimiento));
    }
    const pos = obj.clone().add(dir.multiplyScalar(dist * 0.78)).add(new THREE.Vector3(0, dist * 0.72, 0));
    this._volar(pos, obj);
  }

  vistaGeneral() { this._volar(this.vistaInicial.pos.clone(), this.vistaInicial.obj.clone()); }

  _volar(pos, obj) {
    this.vuelo = { t: 0, desdeP: this.camara.position.clone(), desdeO: this.controles.target.clone(), haciaP: pos, haciaO: obj };
  }

  /* ------------------------------------------------------------ resaltados */
  limpiarResaltado() {
    for (const o of [...this.grupoResaltado.children]) {
      o.traverse((h) => { if (h.isCSS2DObject) h.element.remove(); if (h.geometry) h.geometry.dispose(); });
      this.grupoResaltado.remove(o);
    }
    this.buses = [];
    if (this.enfoque) { this.enfoque = null; this._pintarEstaciones(true); }
    if (this.fijas) this.fijas.visible = this.etiquetasVisibles;
  }

  _enfocar(nombres) {
    this.enfoque = new Set(nombres);
    this._pintarEstaciones(true);
    if (this.fijas) this.fijas.visible = false;
  }

  /** Línea elevada que sigue una lista de estaciones. */
  _linea(nombres, color, elevacion) {
    const pts = nombres.map((n) => this.pos.get(n)).filter(Boolean).map((p) => new THREE.Vector3(p.x, elevacion, p.z));
    if (pts.length < 2) return pts;
    const curva = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
    const tubo = new THREE.Mesh(
      new THREE.TubeGeometry(curva, Math.max(24, pts.length * 14), this.tam * 0.13, 10, false),
      new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0.18 }));
    tubo.castShadow = true;
    this.grupoResaltado.add(tubo);
    // paradas intermedias
    const geo = new THREE.SphereGeometry(this.tam * 0.2, 16, 12);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    for (const p of pts) { const s = new THREE.Mesh(geo, mat); s.position.copy(p); this.grupoResaltado.add(s); }
    return curva.getSpacedPoints(Math.max(40, pts.length * 20));
  }

  _marcar(nombre, clase, texto, opcional = false) {
    const p = this.pos.get(nombre), i = this.indice.get(nombre);
    if (!p) return;
    const et = this._etiqueta(texto ?? nombre, clase);
    et.userData.nombre = nombre;
    et.position.set(p.x, 0.22 + (this.alturasMeta[i] || 1) + 0.6, p.z);
    et.userData.opcional = opcional;
    if (opcional) et.visible = this.etiquetasVisibles;
    this.grupoResaltado.add(et);
  }

  _anilloEn(nombre, color) {
    const p = this.pos.get(nombre); if (!p) return;
    const a = new THREE.Mesh(new THREE.TorusGeometry(this.tam * 0.95, 0.11, 10, 48), new THREE.MeshBasicMaterial({ color }));
    a.rotation.x = Math.PI / 2; a.position.set(p.x, 0.1, p.z);
    a.userData.pulso = true;
    this.grupoResaltado.add(a);
  }

  /** tramos: [[ruta, sube, baja], ...]; recorridos: Map ruta -> paradas */
  mostrarViaje(tramos, recorridos) {
    this.limpiarResaltado();
    const todas = [], camino = [];
    tramos.forEach(([ruta, sube, baja], k) => {
      const p = recorridos.get(ruta) || [sube, baja];
      let i = p.indexOf(sube), j = p.indexOf(baja);
      const seg = i >= 0 && j > i ? p.slice(i, j + 1) : [sube, baja];
      todas.push(...seg);
      const pts = this._linea(seg, colorRuta(ruta), 0.55 + k * 0.08);
      camino.push(...pts);
      seg.slice(1, -1).forEach((n) => this._marcar(n, 'discreta', n, true));
    });
    const [primero] = tramos, ultimo = tramos[tramos.length - 1];
    this._enfocar(todas);
    this._marcar(primero[1], 'fuerte origen', primero[1]);
    this._marcar(ultimo[2], 'fuerte destino', ultimo[2]);
    this._anilloEn(ultimo[2], 0xd7192d);
    if (tramos.length === 2) { this._marcar(tramos[0][2], 'cambio', tramos[0][2]); this._anilloEn(tramos[0][2], 0xf5b700); }
    this._agregarBus(camino, colorRuta(tramos[0][0]));
    this._ocultarDuplicadas();
    this.volarA(todas);
  }

  mostrarRuta(nombre, paradas) {
    this.limpiarResaltado();
    if (!paradas.length) return;
    this._enfocar(paradas);
    const pts = this._linea(paradas, colorRuta(nombre), 0.55);
    paradas.slice(1, -1).forEach((n) => this._marcar(n, 'discreta', n, true));
    this._marcar(paradas[0], 'fuerte origen', paradas[0]);
    if (paradas.length > 1) this._marcar(paradas[paradas.length - 1], 'fuerte destino', paradas[paradas.length - 1]);
    if (pts.length > 1) this._agregarBus(pts, colorRuta(nombre));
    this._ocultarDuplicadas();
    this.volarA(paradas);
  }

  /* Bus articulado: dos cuerpos rojos, fuelle, ventanas y ruedas. */
  _modeloBus() {
    const t = this.tam * 1.55;
    const g = new THREE.Group();
    const rojo = new THREE.MeshStandardMaterial({ color: 0xd7192d, roughness: 0.38 });
    const vidrio = new THREE.MeshStandardMaterial({ color: 0x1d2731, roughness: 0.15, metalness: 0.3 });
    const blanco = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const negro = new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.8 });
    const largo = 1.15 * t, alto = 0.5 * t, ancho = 0.48 * t;
    const cuerpo = (x) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(largo, alto, ancho), rojo); c.position.set(x, alto / 2 + 0.12 * t, 0); c.castShadow = true;
      const v = new THREE.Mesh(new THREE.BoxGeometry(largo * 0.92, alto * 0.32, ancho * 1.02), vidrio); v.position.set(x, alto * 0.78 + 0.12 * t, 0);
      const techo = new THREE.Mesh(new THREE.BoxGeometry(largo * 0.96, 0.04 * t, ancho * 0.9), blanco); techo.position.set(x, alto + 0.14 * t, 0);
      g.add(c, v, techo);
      for (const dx of [-0.32, 0.32]) for (const dz of [-1, 1]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * t, 0.11 * t, 0.06 * t, 14), negro);
        r.rotation.x = Math.PI / 2; r.position.set(x + dx * largo, 0.11 * t, dz * ancho / 2); g.add(r);
      }
    };
    cuerpo(largo * 0.56); cuerpo(-largo * 0.56);
    const fuelle = new THREE.Mesh(new THREE.BoxGeometry(0.12 * t, alto * 0.9, ancho * 0.92), negro);
    fuelle.position.set(0, alto / 2 + 0.12 * t, 0); g.add(fuelle);
    const frente = new THREE.Mesh(new THREE.BoxGeometry(0.03 * t, alto * 0.55, ancho * 0.9), vidrio);
    frente.position.set(largo * 1.13, alto * 0.62 + 0.12 * t, 0); g.add(frente);
    return g;
  }

  _agregarBus(puntos, color) {
    if (!puntos || puntos.length < 2) return;
    const bus = this._modeloBus();
    this.grupoResaltado.add(bus);
    const dist = [0];
    for (let i = 1; i < puntos.length; i++) dist.push(dist[i - 1] + puntos[i].distanceTo(puntos[i - 1]));
    this.buses.push({ bus, puntos, dist, total: dist[dist.length - 1], s: 0, pausa: 0.8, color });
  }

  _moverBuses(dt) {
    const vel = Math.max(8, this.tam * 9);
    for (const b of this.buses) {
      if (b.pausa > 0) { b.pausa -= dt; } else b.s += vel * dt;
      if (b.s >= b.total) { b.s = b.total; b.pausa = 1.4; b.reiniciar = true; }
      if (b.reiniciar && b.pausa <= 0) { b.s = 0; b.reiniciar = false; b.pausa = 0.6; }
      let k = 1;
      while (k < b.dist.length - 1 && b.dist[k] < b.s) k++;
      const a = b.puntos[k - 1], c = b.puntos[k];
      const seg = b.dist[k] - b.dist[k - 1] || 1;
      const t = Math.min(1, Math.max(0, (b.s - b.dist[k - 1]) / seg));
      b.bus.position.lerpVectors(a, c, t);
      b.bus.position.y = 0.06;
      const mira = b.puntos[Math.min(b.puntos.length - 1, k + 2)];
      const ang = Math.atan2(mira.z - b.bus.position.z, mira.x - b.bus.position.x);
      if (Number.isFinite(ang) && (mira.x !== b.bus.position.x || mira.z !== b.bus.position.z)) {
        const actual = b.bus.rotation.y, meta = -ang;
        let d = meta - actual; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        b.bus.rotation.y = actual + d * Math.min(1, dt * 10);
      }
    }
  }

  /* ------------------------------------------------------------ eventos */
  _eventos() {
    addEventListener('resize', () => {
      this.camara.aspect = innerWidth / innerHeight;
      this.camara.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.etiquetas.setSize(innerWidth, innerHeight);
    });
    const el = this.renderer.domElement;
    let abajo = null;
    el.addEventListener('pointerdown', (e) => { abajo = [e.clientX, e.clientY]; this.vuelo = null; this.alInteractuar?.(); });
    el.addEventListener('pointerup', (e) => {
      if (!abajo || Math.hypot(e.clientX - abajo[0], e.clientY - abajo[1]) > 5) return;
      const n = this._estacionBajo(e);
      if (n) this.alSeleccionar(n);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      const n = this._estacionBajo(e);
      el.style.cursor = n ? 'pointer' : 'grab';
      this._hover(n);
    });
    el.addEventListener('wheel', () => { this.vuelo = null; }, { passive: true });
  }

  _estacionBajo(e) {
    if (!this.torre) return null;
    this.puntero.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.puntero, this.camara);
    const hits = this.raycaster.intersectObjects([this.torre, this.tapa, this.anden], false);
    if (!hits.length) return null;
    return this.estaciones[hits[0].instanceId]?.nombre || null;
  }

  _hover(nombre) {
    if (nombre === this.hoverNombre) return;
    this.hoverNombre = nombre;
    if (this.etHover) { this.etHover.element.remove(); this.scene.remove(this.etHover); this.etHover = null; }
    if (!nombre || nombre === this.seleccionada) return;
    const i = this.indice.get(nombre), e = this.estaciones[i], p = this.pos.get(nombre);
    const extra = e.estado === 'ABIERTA' ? `<span class="b">${e.buses.toLocaleString('es-CO')}</span>` : '<span class="b">cerrada</span>';
    this.etHover = this._etiqueta(e.nombre + extra, '', true);
    this.etHover.position.set(p.x, 0.22 + this.alturasMeta[i] + 0.5, p.z);
    this.scene.add(this.etHover);
  }

  /* ------------------------------------------------------------ bucle */
  _animar() {
    requestAnimationFrame(() => this._animar());
    const dt = Math.min(0.05, this.reloj.getDelta());

    if (this.vuelo) {
      const v = this.vuelo;
      v.t = Math.min(1, v.t + dt / 1.1);
      const k = suavizar(v.t);
      this.camara.position.lerpVectors(v.desdeP, v.haciaP, k);
      this.controles.target.lerpVectors(v.desdeO, v.haciaO, k);
      if (v.t >= 1) this.vuelo = null;
    }

    // Torres que crecen o bajan con suavidad
    if (this.torre) {
      let cambio = false;
      for (let i = 0; i < this.alturas.length; i++) {
        const d = this.alturasMeta[i] - this.alturas[i];
        if (Math.abs(d) > 0.002) { this.alturas[i] += d * Math.min(1, dt * 7); cambio = true; }
      }
      if (cambio) this._ubicarEstaciones();
    }

    if (this.anillo.visible) {
      this.anilloT = (this.anilloT || 0) + dt;
      const s = this.tam * (1.05 + 0.08 * Math.sin(this.anilloT * 4));
      this.anillo.scale.setScalar(s);
    }
    const pulso = 1 + 0.1 * Math.sin(performance.now() / 260);
    this.grupoResaltado.children.forEach((o) => { if (o.userData.pulso) o.scale.setScalar(pulso); });

    this._moverBuses(dt);
    this.controles.update();
    this.renderer.render(this.scene, this.camara);
    this.etiquetas.render(this.scene, this.camara);
  }
}
