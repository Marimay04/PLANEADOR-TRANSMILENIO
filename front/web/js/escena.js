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

const C_FONDO = 0xeeeff3;
const C_SABANA = 0xc9d6b8;      // pasto de la sabana alrededor de la maqueta
const C_HORIZONTE = 0xe9eeea;   // bruma del horizonte (niebla)
const C_BASE = 0xf8f8fa;
const C_CARRIL = 0xd2d4da;
const C_ANDEN = 0xffffff;
const C_CERRADA = 0xc4c9d1;
const C_APAGADA = new THREE.Color(0xe4e7ec);
const C_BAJA = new THREE.Color(0xeaa6ab);
const C_ALTA = new THREE.Color(0xc62f38);
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
    s.background = this._cielo();
    s.fog = new THREE.Fog(C_HORIZONTE, 150, 340);

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
    s.add(new THREE.HemisphereLight(0xffffff, 0xe2e3e8, 1.15));
    const sol = this.sol = new THREE.DirectionalLight(0xffffff, 1.9);
    sol.position.set(55, 95, 40);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    const sc = sol.shadow.camera;
    sc.left = -85; sc.right = 85; sc.top = 85; sc.bottom = -85; sc.near = 10; sc.far = 260;
    sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.03; sol.shadow.radius = 4;
    s.add(sol);

    // Suelo y mesa de la maqueta
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: C_SABANA, roughness: 1 }));
    suelo.rotation.x = -Math.PI / 2; suelo.position.y = -0.62; suelo.receiveShadow = true;
    s.add(suelo);
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(70, 70.6, 0.6, 128), new THREE.MeshStandardMaterial({ color: C_BASE, roughness: .9 }));
    mesa.position.y = -0.3; mesa.receiveShadow = true;
    s.add(mesa);
    const borde = new THREE.Mesh(new THREE.TorusGeometry(70.3, 0.09, 8, 160), new THREE.MeshBasicMaterial({ color: 0xc62f38 }));
    borde.rotation.x = Math.PI / 2; borde.position.y = 0.0;
    s.add(borde);

    this._crearCerros();
    this._crearEntorno();

    this.grupoRed = new THREE.Group();
    this.grupoResaltado = new THREE.Group();
    s.add(this.grupoRed, this.grupoResaltado);

    // Anillo de selección
    this.anillo = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 10, 64), new THREE.MeshBasicMaterial({ color: 0xc62f38 }));
    this.anillo.rotation.x = Math.PI / 2; this.anillo.visible = false;
    s.add(this.anillo);

    this.raycaster = new THREE.Raycaster();
    this.puntero = new THREE.Vector2();
  }

  /* Cielo de la sabana: degradado de azul pálido a bruma en el horizonte. */
  _cielo() {
    const lienzo = document.createElement('canvas');
    lienzo.width = 4; lienzo.height = 256;
    const x = lienzo.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#b9d3e6');
    g.addColorStop(0.55, '#dde8ef');
    g.addColorStop(1, '#eef1ee');
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(lienzo);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* Cerros orientales, como en Bogotá, con Monserrate y su iglesia. */
  _crearCerros() {
    const mats = [0x9db58a, 0x8faa7d, 0xa9bf96].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }));
    const g = this.cerros = new THREE.Group();
    let semilla = 11;
    const rnd = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    this.zonasCerro = [];
    let cima = null;
    for (let i = 0; i < 30; i++) {
      const a = -1.05 + i * 0.072 + rnd() * 0.04;
      const rad = 128 + rnd() * 18;
      const alto = 0.7 + rnd() * 0.45 + (i > 10 && i < 18 ? 0.5 : 0);   // más altos en el medio
      const geo = new THREE.IcosahedronGeometry(9 + rnd() * 7, 1);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) p.setY(k, Math.max(0, p.getY(k)) * alto);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mats[i % 3]);
      m.position.set(Math.cos(a) * rad + 20, -0.6, Math.sin(a) * rad);
      m.scale.set(1.5, 1, 1.2);
      m.rotation.y = rnd() * Math.PI;
      m.receiveShadow = true;
      g.add(m);
      if (i === 14) cima = m;
    }
    g.rotation.y = -0.2;
    this.scene.add(g);
    g.updateMatrixWorld(true);
    for (const m of g.children) {
      const w = new THREE.Vector3(); m.getWorldPosition(w);
      this.zonasCerro.push({ x: w.x, z: w.z, r: 26 });
    }
    // Monserrate: una iglesia blanca en la cima del cerro más alto
    if (cima) {
      cima.geometry.computeBoundingBox();
      const tope = cima.geometry.boundingBox.max.y;
      const w = new THREE.Vector3(); cima.getWorldPosition(w);
      const blanco = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .6 });
      const iglesia = new THREE.Group();
      const nave = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 1.8), blanco); nave.position.y = 1.1;
      const torre = new THREE.Mesh(new THREE.BoxGeometry(1, 3.6, 1), blanco); torre.position.set(1.6, 1.8, 0);
      const techo = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.2, 4), new THREE.MeshStandardMaterial({ color: 0xb4562f, roughness: .8 }));
      techo.position.set(1.6, 4.2, 0); techo.rotation.y = Math.PI / 4;
      iglesia.add(nave, torre, techo);
      iglesia.position.set(w.x, tope * 0.92 - 0.8, w.z);
      this.scene.add(iglesia);
    }
  }

  /* La ciudad alrededor de la maqueta: avenida, barrios de ladrillo, torres,
     parques y nubes. Es solo decoración: no participa en los clics. */
  _crearEntorno() {
    let semilla = 7;
    const rnd = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    const s = this.scene;
    const libre = (x, z, margen = 0) => this.zonasCerro.every((c) => Math.hypot(x - c.x, z - c.z) > c.r + margen);

    // Avenida que rodea la mesa, con línea central
    const via = new THREE.Mesh(new THREE.RingGeometry(72.5, 77, 160), new THREE.MeshStandardMaterial({ color: 0x9a9da4, roughness: .95 }));
    via.rotation.x = -Math.PI / 2; via.position.y = -0.58; via.receiveShadow = true;
    const linea = new THREE.Mesh(new THREE.RingGeometry(74.65, 74.85, 160), new THREE.MeshBasicMaterial({ color: 0xf3f3f0 }));
    linea.rotation.x = -Math.PI / 2; linea.position.y = -0.57;
    const anden = new THREE.Mesh(new THREE.RingGeometry(77, 78.2, 160), new THREE.MeshStandardMaterial({ color: 0xdedcd6, roughness: 1 }));
    anden.rotation.x = -Math.PI / 2; anden.position.y = -0.56;
    s.add(via, linea, anden);

    // Edificios: casas de ladrillo bajas y algunas torres hacia el "centro"
    const colores = [0xb8673f, 0xc57a52, 0xa95a36, 0xd8cfc2, 0xcbc6bd, 0xe9e4da, 0xb06a4a];
    const lotes = [];
    for (let i = 0; i < 900 && lotes.length < 420; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 81 + Math.pow(rnd(), 1.4) * 95;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!libre(x, z, 4)) continue;
      const centro = Math.abs(a - 2.3) < 0.35 && r < 125;      // un sector con torres
      const ancho = 2.2 + rnd() * 3.2, fondo = 2.2 + rnd() * 3.2;
      const alto = centro ? 8 + rnd() * 16 : 1.4 + Math.pow(rnd(), 2) * 5;
      lotes.push({ x, z, ancho, fondo, alto, giro: -a + (rnd() - .5) * .2, color: centro ? [0xd9d6d0, 0xbfc6cc, 0xe8e6e1][Math.floor(rnd() * 3)] : colores[Math.floor(rnd() * colores.length)] });
    }
    const edif = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: .85 }), lotes.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eje = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    lotes.forEach((l, i) => {
      q.setFromAxisAngle(eje, l.giro);
      m4.compose(new THREE.Vector3(l.x, -0.6 + l.alto / 2, l.z), q, new THREE.Vector3(l.ancho, l.alto, l.fondo));
      edif.setMatrixAt(i, m4);
      edif.setColorAt(i, col.setHex(l.color));
    });
    edif.receiveShadow = true;
    s.add(edif);

    // Árboles: copa redonda y tronco, entre los barrios y junto a la avenida
    const arboles = [];
    for (let i = 0; i < 700 && arboles.length < 320; i++) {
      const a = rnd() * Math.PI * 2;
      const r = i < 260 ? 79 + rnd() * 3 : 80 + Math.pow(rnd(), 1.2) * 100;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!libre(x, z, 0)) continue;
      if (lotes.some((l) => Math.abs(l.x - x) < l.ancho * .7 && Math.abs(l.z - z) < l.fondo * .7)) continue;
      arboles.push({ x, z, t: 0.8 + rnd() * 0.8 });
    }
    const copa = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.3, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), arboles.length);
    const tronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.24, 1.6, 5), new THREE.MeshStandardMaterial({ color: 0x7a5a42, roughness: 1 }), arboles.length);
    const verdes = [0x6f9a5b, 0x5f8a4f, 0x7fa86a, 0x88ad6f];
    arboles.forEach((t, i) => {
      q.identity();
      m4.compose(new THREE.Vector3(t.x, -0.6 + 0.8 * t.t, t.z), q, new THREE.Vector3(t.t, t.t, t.t));
      tronco.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(t.x, -0.6 + 2.2 * t.t, t.z), q, new THREE.Vector3(t.t, t.t * 1.1, t.t));
      copa.setMatrixAt(i, m4);
      copa.setColorAt(i, col.setHex(verdes[i % verdes.length]));
    });
    s.add(tronco, copa);

    // Nubes bajas que pasan despacio
    const nubes = this.nubes = new THREE.Group();
    const matNube = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: .92 });
    for (let i = 0; i < 9; i++) {
      const nube = new THREE.Group();
      const n = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + rnd() * 3, 1), matNube);
        b.position.set(k * 4 - n * 2, rnd() * 1.5, (rnd() - .5) * 3);
        b.scale.y = 0.6;
        nube.add(b);
      }
      const a = rnd() * Math.PI * 2, r = 95 + rnd() * 80;
      nube.position.set(Math.cos(a) * r, 48 + rnd() * 22, Math.sin(a) * r);
      nubes.add(nube);
    }
    s.add(nubes);
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

  _volar(pos, obj, duracion = 1.1) {
    this.vuelo = { t: 0, duracion, desdeP: this.camara.position.clone(), desdeO: this.controles.target.clone(), haciaP: pos, haciaO: obj };
  }

  /* ------------------------------------------------------------ entrada */
  /** Secuencia de entrada: la cámara llega volando desde lo alto de la ciudad
   *  y las torres crecen en ola desde el centro. Solo decoración. */
  intro() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !this.torre) return;
    this.camara.position.set(-150, 230, 250);
    this.controles.target.set(0, 0, 0);
    this._volar(this.vistaInicial.pos.clone(), this.vistaInicial.obj.clone(), 2.6);
    let lejos = 1;
    for (const p of this.pos.values()) lejos = Math.max(lejos, Math.hypot(p.x, p.z));
    this.retrasos = new Float32Array(this.estaciones.length);
    this.estaciones.forEach((e, i) => {
      const p = this.pos.get(e.nombre);
      this.retrasos[i] = 0.5 + (p ? Math.hypot(p.x, p.z) / lejos : 1) * 1.6;
      this.alturas[i] = 0.02;
    });
    this.tiempoIntro = 0;
    if (this.fijas) this.fijas.visible = false;   // los nombres aparecen cuando terminan de crecer
    this._ubicarEstaciones();
  }

  /* ------------------------------------------------------------ tráfico */
  /** Buses que circulan por la red mientras nadie consulta un viaje.
   *  Usa las rutas más largas; se esconden cuando hay un viaje resaltado. */
  iniciarTrafico(rutas, cantidad = 10) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!this.grupoTrafico) { this.grupoTrafico = new THREE.Group(); this.scene.add(this.grupoTrafico); }
    for (const b of this.trafico || []) this.grupoTrafico.remove(b.bus);
    this.trafico = [];
    const largas = [...rutas].filter((r) => r.paradas.length > 6).sort((a, b) => b.paradas.length - a.paradas.length);
    const elegidas = [];
    for (let i = 0; i < largas.length && elegidas.length < cantidad; i += 3) elegidas.push(largas[i]);
    elegidas.forEach((r, k) => {
      const pts = r.paradas.map((n) => this.pos.get(n)).filter(Boolean).map((p) => new THREE.Vector3(p.x, 0.06, p.z));
      if (pts.length < 2) return;
      const camino = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05).getSpacedPoints(pts.length * 16);
      const bus = this._modeloBus();
      bus.scale.setScalar(0.72);
      this.grupoTrafico.add(bus);
      const dist = [0];
      for (let i = 1; i < camino.length; i++) dist.push(dist[i - 1] + camino[i].distanceTo(camino[i - 1]));
      const total = dist[dist.length - 1];
      this.trafico.push({ bus, puntos: camino, dist, total, s: (k / elegidas.length) * total, pausa: 0, vel: 0.55 + (k % 3) * 0.12 });
    });
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
    this._anilloEn(ultimo[2], 0xc62f38);
    if (tramos.length === 2) { this._marcar(tramos[0][2], 'cambio', tramos[0][2]); this._anilloEn(tramos[0][2], 0xf2b705); }
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
    const rojo = new THREE.MeshStandardMaterial({ color: 0xc62f38, roughness: 0.38 });
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

  _moverBuses(dt, lista = this.buses) {
    const vel = Math.max(8, this.tam * 9);
    for (const b of lista) {
      if (b.pausa > 0) { b.pausa -= dt; } else b.s += vel * (b.vel || 1) * dt;
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
    if (this.nubes) this.nubes.rotation.y += dt * 0.012;

    if (this.vuelo) {
      const v = this.vuelo;
      v.t = Math.min(1, v.t + dt / (v.duracion || 1.1));
      const k = suavizar(v.t);
      this.camara.position.lerpVectors(v.desdeP, v.haciaP, k);
      this.controles.target.lerpVectors(v.desdeO, v.haciaO, k);
      if (v.t >= 1) this.vuelo = null;
    }

    // Torres que crecen o bajan con suavidad
    if (this.torre) {
      let cambio = false;
      if (this.retrasos) this.tiempoIntro += dt;
      let esperando = false;
      for (let i = 0; i < this.alturas.length; i++) {
        if (this.retrasos && this.tiempoIntro < this.retrasos[i]) { esperando = true; continue; }
        const d = this.alturasMeta[i] - this.alturas[i];
        if (Math.abs(d) > 0.002) { this.alturas[i] += d * Math.min(1, dt * (this.retrasos ? 3.2 : 7)); cambio = true; }
      }
      if (this.retrasos && !esperando && !cambio) {
        this.retrasos = null;
        if (this.fijas) this.fijas.visible = this.etiquetasVisibles && !this.enfoque;
      }
      if (cambio) this._ubicarEstaciones();
    }

    // Tráfico de fondo: solo cuando no hay un viaje o una ruta resaltados
    if (this.trafico) {
      this.grupoTrafico.visible = !this.enfoque;
      if (!this.enfoque) this._moverBuses(dt, this.trafico);
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
