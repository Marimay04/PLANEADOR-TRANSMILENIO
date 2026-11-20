"""R11 · Panel de rendimiento (tkinter).

Arrancar desde la raíz del repositorio:
    py front/panel_rendimiento.py        (o python front/panel_rendimiento.py)

Genera redes de tamaño n, 2n, 4n, ..., corre cada operación del motor,
grafica cómo crece el tiempo junto a la complejidad esperada y explica ahí
mismo si la medición no coincide. Solo usa la librería estándar (tkinter),
no hay que instalar nada.
"""
import os
import queue
import sys
import threading
import tkinter as tk
from tkinter import ttk

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rendimiento as rd  # noqa: E402

ROJO = "#C8102E"
ROJO_OSCURO = "#8E0B20"
AMARILLO = "#FFCD00"
BLANCO = "#FFFFFF"
GRIS = "#F2F2F2"
TEXTO = "#222222"
TENUE = "#777777"


def formato_tiempo(seg):
    if seg >= 1:
        return "%.2f s" % seg
    if seg >= 1e-3:
        return "%.2f ms" % (seg * 1e3)
    return "%.2f µs" % (seg * 1e6)


class Panel(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Panel de rendimiento · Planeador TransMilenio")
        self.geometry("1180x720")
        self.minsize(980, 620)
        self.configure(bg=BLANCO)

        self.ns = None
        self.tiempos = None
        self.cola = queue.Queue()
        self.midiendo = False

        self._estilos()
        self._encabezado()
        self._controles()
        self._cuerpo()
        self._mostrar_vacio()

    # ------------------------------------------------------------ interfaz
    def _estilos(self):
        st = ttk.Style(self)
        st.theme_use("clam")
        st.configure("Treeview", background=BLANCO, fieldbackground=BLANCO,
                     foreground=TEXTO, rowheight=26, font=("Segoe UI", 10))
        st.configure("Treeview.Heading", background=ROJO, foreground=BLANCO,
                     font=("Segoe UI", 10, "bold"), relief="flat")
        st.map("Treeview.Heading", background=[("active", ROJO_OSCURO)])
        st.map("Treeview", background=[("selected", AMARILLO)],
               foreground=[("selected", TEXTO)])

    def _encabezado(self):
        barra = tk.Frame(self, bg=ROJO)
        barra.pack(fill="x")
        tk.Label(barra, text="Panel de rendimiento", bg=ROJO, fg=BLANCO,
                 font=("Segoe UI", 20, "bold")).pack(side="left", padx=18, pady=(12, 12))
        tk.Label(barra, text="R11 · ¿el tiempo crece como esperábamos al duplicar la red?",
                 bg=ROJO, fg=AMARILLO, font=("Segoe UI", 11)).pack(side="left", pady=(18, 12))

    def _controles(self):
        fila = tk.Frame(self, bg=BLANCO)
        fila.pack(fill="x", padx=18, pady=10)
        tk.Label(fila, text="Estaciones iniciales (n):", bg=BLANCO, fg=TEXTO,
                 font=("Segoe UI", 10)).pack(side="left")
        self.var_base = tk.IntVar(value=500)
        tk.Spinbox(fila, from_=100, to=20000, increment=100, width=7,
                   textvariable=self.var_base).pack(side="left", padx=(6, 18))
        tk.Label(fila, text="Tamaños (n, 2n, 4n…):", bg=BLANCO, fg=TEXTO,
                 font=("Segoe UI", 10)).pack(side="left")
        self.var_pasos = tk.IntVar(value=4)
        tk.Spinbox(fila, from_=2, to=7, width=4,
                   textvariable=self.var_pasos).pack(side="left", padx=(6, 18))
        self.boton = tk.Button(fila, text="▶  Medir", command=self._medir, bg=AMARILLO,
                               fg=TEXTO, activebackground="#E6B800", relief="flat",
                               font=("Segoe UI", 10, "bold"), padx=16, pady=4,
                               cursor="hand2")
        self.boton.pack(side="left")
        self.estado = tk.Label(fila, text="", bg=BLANCO, fg=TENUE, font=("Segoe UI", 10))
        self.estado.pack(side="left", padx=14)

    def _cuerpo(self):
        cuerpo = tk.Frame(self, bg=BLANCO)
        cuerpo.pack(fill="both", expand=True, padx=18, pady=(0, 14))
        cuerpo.columnconfigure(0, weight=5)
        cuerpo.columnconfigure(1, weight=6)
        cuerpo.rowconfigure(0, weight=1)

        izq = tk.Frame(cuerpo, bg=BLANCO)
        izq.grid(row=0, column=0, sticky="nsew", padx=(0, 12))
        cols = ("esperada", "crece", "veredicto")
        self.tabla = ttk.Treeview(izq, columns=cols, show="tree headings",
                                  selectmode="browse")
        self.tabla.heading("#0", text="Operación")
        self.tabla.heading("esperada", text="Esperada")
        self.tabla.heading("crece", text="Crecimiento total")
        self.tabla.heading("veredicto", text="¿Coincide?")
        self.tabla.column("#0", width=230)
        self.tabla.column("esperada", width=90, anchor="center")
        self.tabla.column("crece", width=150, anchor="center")
        self.tabla.column("veredicto", width=90, anchor="center")
        self.tabla.tag_configure("si", foreground="#1B7F3B")
        self.tabla.tag_configure("no", foreground=ROJO)
        self.tabla.tag_configure("r5", foreground=TENUE)
        self.tabla.pack(fill="both", expand=True)
        self.tabla.bind("<<TreeviewSelect>>", lambda e: self._dibujar())

        der = tk.Frame(cuerpo, bg=BLANCO)
        der.grid(row=0, column=1, sticky="nsew")
        der.rowconfigure(0, weight=1)
        der.columnconfigure(0, weight=1)
        self.lienzo = tk.Canvas(der, bg=BLANCO, highlightthickness=1,
                                highlightbackground="#DDDDDD")
        self.lienzo.grid(row=0, column=0, sticky="nsew")
        self.lienzo.bind("<Configure>", lambda e: self._dibujar())
        self.explicacion = tk.Label(der, text="", bg=GRIS, fg=TEXTO, justify="left",
                                    anchor="nw", wraplength=600, font=("Segoe UI", 10),
                                    padx=12, pady=10)
        self.explicacion.grid(row=1, column=0, sticky="ew", pady=(10, 0))
        der.bind("<Configure>", lambda e: self.explicacion.configure(
            wraplength=max(300, e.width - 30)))

    # ------------------------------------------------------------ medir
    def _medir(self):
        if self.midiendo:
            return
        try:
            base = int(self.var_base.get())
            pasos = int(self.var_pasos.get())
        except (tk.TclError, ValueError):
            self.estado.configure(text="Valores inválidos", fg=ROJO)
            return
        if base < 50 or pasos < 2:
            self.estado.configure(text="Use n ≥ 50 y al menos 2 tamaños", fg=ROJO)
            return
        self.midiendo = True
        self.boton.configure(state="disabled", text="Midiendo…")

        def trabajo():
            try:
                res = rd.medir_todo(base, pasos, progreso=lambda i, t, n:
                                    self.cola.put(("progreso", i, t, n)))
                self.cola.put(("listo", res))
            except Exception as e:      # mostrar el error en la ventana
                self.cola.put(("error", e))

        # La medición corre en otro hilo para no congelar la ventana; los
        # resultados vuelven por la cola y solo el hilo de tkinter los dibuja.
        threading.Thread(target=trabajo, daemon=True).start()
        self.after(100, self._revisar_cola)

    def _revisar_cola(self):
        try:
            while True:
                msg = self.cola.get_nowait()
                if msg[0] == "progreso":
                    _, i, t, n = msg
                    self.estado.configure(
                        text="Generando y midiendo red %d de %d (n = %d)…" % (i + 1, t, n),
                        fg=TENUE)
                elif msg[0] == "listo":
                    self.ns, self.tiempos = msg[1]
                    self._fin("Listo: %d tamaños medidos." % len(self.ns), TENUE)
                    self._llenar_tabla()
                    return
                else:
                    self._fin("Error: %s" % msg[1], ROJO)
                    return
        except queue.Empty:
            pass
        self.after(100, self._revisar_cola)

    def _fin(self, texto, color):
        self.midiendo = False
        self.boton.configure(state="normal", text="▶  Medir")
        self.estado.configure(text=texto, fg=color)

    # ------------------------------------------------------------ mostrar
    def _llenar_tabla(self):
        self.tabla.delete(*self.tabla.get_children())
        for clave, nombre, modelo, _ in rd.OPERACIONES:
            ok, _, total, esperado = rd.veredicto(self.tiempos[clave], self.ns, modelo)
            self.tabla.insert("", "end", iid=clave, text=nombre, tags=("si" if ok else "no",),
                              values=(modelo, "x%.2f  (esp. x%.2f)" % (total, esperado),
                                      "Sí" if ok else "No"))
        self.tabla.insert("", 5, iid="r5", text="R5 · viaje", tags=("r5",),
                          values=("—", "no se mide", "—"))
        self.tabla.selection_set("r1")

    def _mostrar_vacio(self):
        for clave, nombre, modelo, _ in rd.OPERACIONES:
            self.tabla.insert("", "end", iid=clave, text=nombre, values=(modelo, "", ""))
        self.tabla.insert("", 5, iid="r5", text="R5 · viaje", tags=("r5",),
                          values=("—", "no se mide", "—"))
        self.explicacion.configure(
            text="Presione «Medir». Se generan redes sintéticas de n, 2n, 4n… estaciones "
                 "con el mismo formato de los CSV y se cronometra cada operación del motor. "
                 "Lo que no depende de n (k, el tamaño del rango, horarios por estación) se "
                 "deja fijo para ver solo el efecto de n.")

    def _seleccion(self):
        sel = self.tabla.selection()
        return sel[0] if sel else None

    def _dibujar(self):
        c = self.lienzo
        c.delete("all")
        w = max(c.winfo_width(), 200)
        h = max(c.winfo_height(), 200)
        clave = self._seleccion()

        if clave == "r5":
            c.create_text(w / 2, h / 2, text="R5 no se mide en rendimiento\n(así lo dice el enunciado)",
                          fill=TENUE, font=("Segoe UI", 13), justify="center")
            self.explicacion.configure(
                text="R5 (viaje) combina varias ideas del curso y no hay una opción de "
                     "referencia contra la cual comparar su crecimiento, por eso el script "
                     "del profesor no lo mide.")
            return
        if self.tiempos is None or clave is None:
            c.create_text(w / 2, h / 2, text="Sin mediciones todavía", fill=TENUE,
                          font=("Segoe UI", 13))
            return

        nombre, modelo, explic = "", "", ""
        for k, nom, mod, ex in rd.OPERACIONES:
            if k == clave:
                nombre, modelo, explic = nom, mod, ex
        ts = self.tiempos[clave]
        ns = self.ns
        f = rd.MODELOS[modelo]
        esperado = [ts[0] * f(n) / f(ns[0]) for n in ns]

        izq, der, arr, aba = 80, 24, 46, 52
        ancho, alto = w - izq - der, h - arr - aba
        y_max = 0.0
        for v in ts + esperado:
            if v > y_max:
                y_max = v
        y_max = y_max * 1.15 if y_max > 0 else 1e-9
        x_min, x_max = ns[0], ns[-1]

        def px(n):
            return izq + (n - x_min) / (x_max - x_min) * ancho

        def py(v):
            return arr + alto - v / y_max * alto

        c.create_text(izq, 20, text=nombre, anchor="w", fill=TEXTO,
                      font=("Segoe UI", 12, "bold"))
        # ejes y rejilla
        for i in range(5):
            v = y_max * i / 4
            y = py(v)
            c.create_line(izq, y, izq + ancho, y, fill="#EEEEEE")
            c.create_text(izq - 8, y, text=formato_tiempo(v), anchor="e", fill=TENUE,
                          font=("Segoe UI", 8))
        c.create_line(izq, arr + alto, izq + ancho, arr + alto, fill=TEXTO)
        c.create_line(izq, arr, izq, arr + alto, fill=TEXTO)
        for n in ns:
            c.create_text(px(n), arr + alto + 14, text=str(n), fill=TENUE, font=("Segoe UI", 8))
        c.create_text(izq + ancho / 2, h - 14, text="n (estaciones)", fill=TENUE,
                      font=("Segoe UI", 9))

        # curva esperada (punteada, escalada al primer punto medido)
        puntos = []
        pasos = 40
        for i in range(pasos + 1):
            n = x_min + (x_max - x_min) * i / pasos
            puntos += [px(n), py(ts[0] * f(n) / f(ns[0]))]
        c.create_line(*puntos, fill="#555555", dash=(5, 4), width=2, smooth=True)

        # medición
        medidos = []
        for n, t in zip(ns, ts):
            medidos += [px(n), py(t)]
        c.create_line(*medidos, fill=ROJO, width=3)
        for n, t in zip(ns, ts):
            x, y = px(n), py(t)
            c.create_oval(x - 5, y - 5, x + 5, y + 5, fill=AMARILLO, outline=ROJO, width=2)

        # leyenda
        lx = izq + ancho - 190
        c.create_rectangle(lx - 10, arr - 4, izq + ancho, arr + 40, fill=BLANCO, outline="#DDDDDD")
        c.create_line(lx, arr + 8, lx + 24, arr + 8, fill=ROJO, width=3)
        c.create_text(lx + 32, arr + 8, text="medido", anchor="w", fill=TEXTO, font=("Segoe UI", 9))
        c.create_line(lx, arr + 26, lx + 24, arr + 26, fill="#555555", dash=(5, 4), width=2)
        c.create_text(lx + 32, arr + 26, text="esperado " + modelo, anchor="w", fill=TEXTO,
                      font=("Segoe UI", 9))

        ok, razones, total, esp = rd.veredicto(ts, ns, modelo)
        detalle = "  ·  ".join("%d→%d: x%.2f" % (ns[i], ns[i + 1], r)
                               for i, r in enumerate(razones))
        if ok:
            cabeza = ("✔ Coincide con %s: de n=%d a n=%d el tiempo creció x%.2f "
                      "(se esperaba hasta x%.2f)." % (modelo, ns[0], ns[-1], total, esp))
        else:
            cabeza = ("✖ No coincide con %s: creció x%.2f y se esperaba x%.2f. "
                      "Posible explicación:" % (modelo, total, esp))
        self.explicacion.configure(
            text=cabeza + "\nPor duplicación: " + detalle + "\n\n" + explic +
            "\n\nCrecer un poco menos de lo esperado es normal: en redes pequeñas los "
            "costos fijos de Python pesan más que el término que crece.")


if __name__ == "__main__":
    Panel().mainloop()
