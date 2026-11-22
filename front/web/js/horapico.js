/* Vista de hora pico (R10). El motor (simular_fila) decide en qué bus sale
   cada persona; aquí solo se generan llegadas de ejemplo y se dibuja. */

import { aviso, esc, fmt, motor } from './util.js';

const $ = (s) => document.querySelector(s);
let animacion = null;

function generarLlegadas(p, duracion) {
  // Forma de campana (suma de dos uniformes): la mayoría llega a mitad del pico
  const ll = new Array(p);
  for (let i = 0; i < p; i++) ll[i] = Math.floor(((Math.random() + Math.random()) / 2) * duracion);
  return ll;
}

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function iniciarHoraPico() {
  $('#btn-simular').addEventListener('click', () => {
    const p = Math.min(300000, Math.max(1, +$('#hp-pasajeros').value || 0));
    const dur = Math.max(1, +$('#hp-duracion').value || 1);
    simular(generarLlegadas(p, dur), +$('#hp-frecuencia').value, +$('#hp-capacidad').value, false);
  });
  $('#btn-ejemplo').addEventListener('click', () => {
    $('#hp-frecuencia').value = 60; $('#hp-capacidad').value = 2;
    simular([30, 5, 5, 70], 60, 2, true);
  });
}

async function simular(llegadas, frecuencia, capacidad, ejemplo) {
  const caja = $('#hp-resultado');
  if (!(frecuencia > 0) || !(capacidad > 0)) { aviso('La frecuencia y el cupo deben ser mayores que 0', 'error'); return; }
  caja.innerHTML = '<p class="metodo">Simulando en el motor…</p>';
  const t0 = performance.now();
  const salidas = await motor('simular_fila', { llegadas: llegadas.join(','), frecuencia, capacidad }, 'POST');
  const ms = performance.now() - t0;
  if (!salidas) { caja.innerHTML = '<div class="vacio-grande"><b>Datos inválidos</b>El motor devolvió None.</div>'; return; }

  const p = llegadas.length;
  let suma = 0, max = 0;
  const distintos = new Set(salidas);
  let ultima = 0;
  for (let i = 0; i < p; i++) {
    const e = salidas[i] - llegadas[i]; suma += e; if (e > max) max = e;
    if (salidas[i] > ultima) ultima = salidas[i];
  }

  caja.innerHTML = `
    <div class="hp-datos">
      <div class="dato"><b>${fmt(distintos.size)}</b><span>buses usados</span></div>
      <div class="dato"><b>${mmss(suma / p)}</b><span>espera promedio</span></div>
      <div class="dato"><b>${mmss(max)}</b><span>espera máxima</span></div>
      <div class="dato"><b>${mmss(ultima)}</b><span>sale el último bus</span></div>
    </div>
    ${ejemplo ? `<div class="salidas-lista">simular_fila([${llegadas.join(', ')}], ${frecuencia}, ${capacidad})<br>→ [${salidas.join(', ')}]</div>
      <p class="metodo">Las dos personas que llegaron en el segundo 5 suben al bus de los 60; la de 30 y la de 70, al de los 120.</p>` : ''}
    <div class="anden"><canvas id="hp-anden" height="170"></canvas>
      <div class="anden-controles">
        <button class="mini" id="hp-play" aria-label="Reproducir">❚❚</button>
        <input type="range" id="hp-tiempo" min="0" max="${ultima + frecuencia}" value="0" step="1">
        <span class="reloj-hp" id="hp-reloj">00:00</span>
      </div>
    </div>
    <div class="grafica-titulo">Personas en la fila a lo largo del tiempo</div>
    <div class="grafica"><canvas id="hp-grafica" height="130"></canvas></div>
    <p class="metodo">${fmt(p)} pasajeros simulados por <code>simular_fila()</code> en ${ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s'} (incluye el viaje al motor).
      La fila es una cola FIFO; las llegadas se ordenan con merge sort: O(P log P).</p>`;

  dibujar(llegadas, salidas, frecuencia, capacidad, ultima);
}

function dibujar(llegadas, salidas, frecuencia, capacidad, ultima) {
  if (animacion) cancelAnimationFrame(animacion);
  const p = llegadas.length;
  // Para la animación: eventos ordenados (esto es presentación, fuera del motor)
  const orden = [...Array(p).keys()].sort((a, b) => llegadas[a] - llegadas[b] || a - b);
  const llegO = orden.map((i) => llegadas[i]), salO = orden.map((i) => salidas[i]);
  const fin = ultima + frecuencia;

  const lienzo = $('#hp-anden'), g = $('#hp-grafica');
  const dpr = Math.min(devicePixelRatio, 2);
  for (const c of [lienzo, g]) { const w = c.clientWidth; c.width = w * dpr; c.height = +c.getAttribute('height') * dpr; c.style.height = c.getAttribute('height') + 'px'; }

  // Serie de la fila (para la gráfica): llegadas menos salidas hasta t
  const salOrd = [...salO].sort((a, b) => a - b);
  const pasos = 220, serie = new Array(pasos + 1).fill(0);
  let ia = 0, is = 0;
  for (let k = 0; k <= pasos; k++) {
    const t = (k / pasos) * fin;
    while (ia < p && llegO[ia] <= t) ia++;
    while (is < p && salOrd[is] <= t) is++;
    serie[k] = ia - is;
  }
  const maxFila = Math.max(1, ...serie);

  const tiempo = $('#hp-tiempo'), reloj = $('#hp-reloj'), play = $('#hp-play');
  let t = 0, corriendo = true, ultimoTs = performance.now();
  const velocidad = fin / 14;            // toda la simulación dura ~14 s
  play.addEventListener('click', () => { corriendo = !corriendo; play.textContent = corriendo ? '❚❚' : '▶'; if (corriendo && t >= fin) t = 0; });
  tiempo.addEventListener('input', () => { t = +tiempo.value; corriendo = false; play.textContent = '▶'; });

  function cuadro(ts) {
    const dt = (ts - ultimoTs) / 1000; ultimoTs = ts;
    if (corriendo) { t += dt * velocidad; if (t >= fin) { t = fin; corriendo = false; play.textContent = '▶'; } }
    tiempo.value = t; reloj.textContent = mmss(t);
    pintarAnden(lienzo, dpr, t, llegO, salO, frecuencia, capacidad);
    pintarGrafica(g, dpr, serie, maxFila, t / fin, fin);
    animacion = requestAnimationFrame(cuadro);
  }
  animacion = requestAnimationFrame(cuadro);
}

function pintarAnden(c, dpr, t, llegO, salO, frecuencia, capacidad) {
  const x = c.getContext('2d'), W = c.width / dpr, H = c.height / dpr;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, W, H);

  // carril y andén
  x.fillStyle = '#e6e9ee'; x.fillRect(0, 22, W, 46);
  x.strokeStyle = '#ffffff'; x.setLineDash([10, 10]); x.lineWidth = 2;
  x.beginPath(); x.moveTo(0, 45); x.lineTo(W, 45); x.stroke(); x.setLineDash([]);
  x.fillStyle = '#ffffff'; x.fillRect(0, 74, W, H - 82);
  x.fillStyle = '#d7192d'; x.fillRect(0, 70, W, 4);

  // Fila: quienes ya llegaron y aún no salen, en orden de llegada
  let n = 0;
  const cola = [];
  for (let i = 0; i < llegO.length && llegO[i] <= t; i++) if (salO[i] > t) cola.push(i);
  n = cola.length;
  const r = 3.2, gap = 9, filas = Math.floor((H - 92) / gap), cols = Math.floor((W - 90) / gap);
  const capVis = filas * cols;
  for (let k = 0; k < Math.min(n, capVis); k++) {
    const col = Math.floor(k / filas), fila = k % filas;
    const px = W - 74 - col * gap, py = 86 + fila * gap;
    const prox = k < capacidad;                       // quienes caben en el próximo bus
    x.fillStyle = prox ? '#d7192d' : '#9aa1ac';
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = '#0f1419'; x.font = '600 12px ui-sans-serif, system-ui';
  x.fillText(`${fmt(n)} en la fila${n > capVis ? ` (se muestran ${fmt(capVis)})` : ''}`, 10, 14);

  // Bus: llega, espera en el andén y sale en cada múltiplo de la frecuencia
  const k = Math.max(1, Math.ceil(t / frecuencia));
  const salida = k * frecuencia;
  const u = (t % frecuencia) / frecuencia;          // 0 justo después de una salida
  const anchoBus = 120, parado = W - anchoBus - 14;
  let bx;
  if (t > 0 && u < 0.18) bx = parado + (u / 0.18) * (anchoBus + 40);                   // saliendo
  else if (u < 0.8 && t > 0) bx = -anchoBus - 20 + ((u - 0.18) / 0.62) * (parado + anchoBus + 20); // llegando
  else bx = parado;                                                                   // en el andén
  dibujarBus(x, bx, 26, anchoBus);
  x.fillStyle = '#6b7280'; x.font = '600 11px ui-monospace, monospace';
  x.textAlign = 'right'; x.fillText(`próximo bus ${mmss(salida)} · cupo ${fmt(capacidad)}`, W - 10, 14); x.textAlign = 'left';
}

function dibujarBus(x, bx, by, w) {
  const h = 36, mitad = w / 2 - 3;
  const caja = (ox) => {
    x.fillStyle = '#d7192d'; redondeado(x, ox, by, mitad, h, 6); x.fill();
    x.fillStyle = '#1d2731'; for (let i = 0; i < 4; i++) { redondeado(x, ox + 6 + i * (mitad - 12) / 4, by + 6, (mitad - 12) / 4 - 3, 11, 2); x.fill(); }
    x.fillStyle = '#ffffff'; x.fillRect(ox + 4, by + h - 9, mitad - 8, 2);
  };
  caja(bx); caja(bx + mitad + 6);
  x.fillStyle = '#2b313a'; x.fillRect(bx + mitad, by + 4, 6, h - 8);
  x.fillStyle = '#1b1f24';
  for (const ox of [bx + 12, bx + mitad - 16, bx + mitad + 18, bx + w - 16]) { x.beginPath(); x.arc(ox, by + h, 5, 0, Math.PI * 2); x.fill(); }
}

function redondeado(x, a, b, w, h, r) {
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}

function pintarGrafica(c, dpr, serie, maxFila, avance, fin) {
  const x = c.getContext('2d'), W = c.width / dpr, H = c.height / dpr;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, W, H);
  const iz = 34, ab = 18, ar = 6;
  const px = (k) => iz + (k / (serie.length - 1)) * (W - iz - 6);
  const py = (v) => ar + (1 - v / maxFila) * (H - ab - ar);
  x.strokeStyle = '#eef0f3'; x.lineWidth = 1; x.fillStyle = '#9aa1ac'; x.font = '10px ui-monospace, monospace';
  for (const v of [0, maxFila / 2, maxFila]) { x.beginPath(); x.moveTo(iz, py(v)); x.lineTo(W - 6, py(v)); x.stroke(); x.fillText(fmt(Math.round(v)), 2, py(v) + 3); }
  x.fillText('0:00', iz, H - 4); x.textAlign = 'right'; x.fillText(mmss(fin), W - 6, H - 4); x.textAlign = 'left';
  const grad = x.createLinearGradient(0, ar, 0, H - ab);
  grad.addColorStop(0, 'rgba(215,25,45,.28)'); grad.addColorStop(1, 'rgba(215,25,45,0)');
  x.beginPath(); x.moveTo(px(0), py(0));
  serie.forEach((v, k) => x.lineTo(px(k), py(v)));
  x.lineTo(px(serie.length - 1), py(0)); x.closePath(); x.fillStyle = grad; x.fill();
  x.beginPath(); serie.forEach((v, k) => (k ? x.lineTo(px(k), py(v)) : x.moveTo(px(k), py(v))));
  x.strokeStyle = '#d7192d'; x.lineWidth = 1.6; x.stroke();
  const cx = iz + avance * (W - iz - 6);
  x.strokeStyle = '#0f1419'; x.lineWidth = 1; x.beginPath(); x.moveTo(cx, ar); x.lineTo(cx, H - ab); x.stroke();
}
