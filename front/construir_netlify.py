"""Arma la versión estática de la app para Netlify en la carpeta dist/.

    python front/construir_netlify.py

Netlify lo corre solo en cada despliegue (ver netlify.toml). Copia:
  - front/web/          -> dist/            (la interfaz)
  - motor/*.py          -> dist/py/motor/   (el mismo motor que se califica)
  - front/acciones.py   -> dist/py/front/
  - datos/*.csv         -> dist/py/datos/
y escribe dist/py/archivos.txt (lo que descarga el navegador) y
dist/js/modo.js con MODO_ESTATICO = true, para que el front use el motor
dentro del navegador (Pyodide) en vez del servidor de front/app.py.
"""
import glob
import os
import shutil

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
DIST = os.path.join(RAIZ, "dist")


def main():
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    shutil.copytree(os.path.join(AQUI, "web"), DIST)

    archivos = []
    grupos = [("motor", os.path.join(RAIZ, "motor", "*.py")),
              ("front", os.path.join(AQUI, "acciones.py")),
              ("datos", os.path.join(RAIZ, "datos", "*.csv"))]
    for carpeta, patron in grupos:
        destino = os.path.join(DIST, "py", carpeta)
        os.makedirs(destino, exist_ok=True)
        for origen in sorted(glob.glob(patron)):
            nombre = os.path.basename(origen)
            shutil.copy2(origen, os.path.join(destino, nombre))
            archivos.append(carpeta + "/" + nombre)

    with open(os.path.join(DIST, "py", "archivos.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(archivos) + "\n")
    with open(os.path.join(DIST, "js", "modo.js"), "w", encoding="utf-8") as f:
        f.write("window.MODO_ESTATICO = true;\n")

    print("Listo: dist/ con %d archivos del motor y los datos." % len(archivos))


if __name__ == "__main__":
    main()
