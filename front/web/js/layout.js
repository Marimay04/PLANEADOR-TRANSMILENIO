/* Posiciones de las estaciones en el plano.
   Los CSV no traen coordenadas, así que se calcula una distribución por
   fuerzas: estaciones vecinas en una ruta se atraen y todas se repelen.
   La repulsión usa una rejilla (solo vecinos cercanos), así sirve también
   para redes grandes. Es solo presentación: no resuelve ningún requisito. */

function azar(semilla) {
  let s = semilla >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function calcularPosiciones(nombres, rutas) {
  const n = nombres.length;
  const indice = new Map(nombres.map((nm, i) => [nm, i]));

  // Aristas sin repetir (pares consecutivos de cada ruta)
  const vistas = new Set();
  const aristas = [];
  for (const r of rutas) {
    const p = r.paradas;
    for (let i = 0; i + 1 < p.length; i++) {
      const a = indice.get(p[i]), b = indice.get(p[i + 1]);
      if (a === undefined || b === undefined || a === b) continue;
      const clave = a < b ? a * n + b : b * n + a;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      aristas.push(a, b);
    }
  }

  const rnd = azar(n * 7919 + aristas.length);
  const x = new Float32Array(n), y = new Float32Array(n);
  const vx = new Float32Array(n), vy = new Float32Array(n);
  const radio = Math.sqrt(n) * 2.2 + 4;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radio;
    x[i] = Math.cos(a) * r; y[i] = Math.sin(a) * r;
  }

  const ideal = 2.6;                 // distancia deseada entre vecinas
  const celda = ideal * 2.5;
  const iteraciones = n > 3000 ? 120 : n > 800 ? 220 : 420;
  let temperatura = radio * 0.25;

  for (let it = 0; it < iteraciones; it++) {
    vx.fill(0); vy.fill(0);

    // Repulsión con la rejilla
    const rejilla = new Map();
    for (let i = 0; i < n; i++) {
      const k = Math.floor(x[i] / celda) * 73856093 ^ Math.floor(y[i] / celda) * 19349663;
      let l = rejilla.get(k); if (!l) rejilla.set(k, (l = [])); l.push(i);
    }
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(x[i] / celda), cy = Math.floor(y[i] / celda);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const l = rejilla.get((cx + dx) * 73856093 ^ (cy + dy) * 19349663);
        if (!l) continue;
        for (const j of l) {
          if (j <= i) continue;
          let ddx = x[i] - x[j], ddy = y[i] - y[j];
          let d2 = ddx * ddx + ddy * ddy;
          if (d2 < 1e-4) { ddx = rnd() - .5; ddy = rnd() - .5; d2 = .01; }
          if (d2 > celda * celda) continue;
          const f = (ideal * ideal) / d2;
          vx[i] += ddx * f; vy[i] += ddy * f; vx[j] -= ddx * f; vy[j] -= ddy * f;
        }
      }
    }
    // Atracción por las rutas
    for (let e = 0; e < aristas.length; e += 2) {
      const a = aristas[e], b = aristas[e + 1];
      const ddx = x[b] - x[a], ddy = y[b] - y[a];
      const d = Math.sqrt(ddx * ddx + ddy * ddy) + 1e-6;
      const f = (d - ideal) * 0.35;
      vx[a] += ddx / d * f; vy[a] += ddy / d * f; vx[b] -= ddx / d * f; vy[b] -= ddy / d * f;
    }
    // Gravedad suave al centro y paso limitado por la temperatura
    for (let i = 0; i < n; i++) {
      vx[i] -= x[i] * 0.012; vy[i] -= y[i] * 0.012;
      const m = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      if (m > temperatura) { vx[i] *= temperatura / m; vy[i] *= temperatura / m; }
      x[i] += vx[i]; y[i] += vy[i];
    }
    temperatura = Math.max(0.05, temperatura * 0.985);
  }

  // Centrar y escalar a un tamaño fijo de maqueta
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n || 1; my /= n || 1;
  let rmax = 1;
  for (let i = 0; i < n; i++) rmax = Math.max(rmax, Math.hypot(x[i] - mx, y[i] - my));
  const escala = 58 / rmax;
  const pos = new Map();
  for (let i = 0; i < n; i++) pos.set(nombres[i], { x: (x[i] - mx) * escala, z: (y[i] - my) * escala });
  return { pos, aristas: aristas.length / 2, separacion: ideal * escala };
}
