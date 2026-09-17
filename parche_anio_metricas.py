"""Que nps_metricas_mensuales tome el anio de CADA FILA y no el del reloj.

Se aplica sobre /root/pbi_extract/sync_nps_quincenal.py en la VPS.

Por que: la tabla tiene clave (anio, mes) y el script escribia "anio": ANIO,
con ANIO = datetime.now().year. Al cargar un export historico (2025) por el
buzon, las metricas quedarian etiquetadas 2026 y PISARIAN los meses del anio
en curso. Tomando el anio de la fecha de puntuacion de cada fila, cada mes va
a su anio y el comportamiento para el sync normal es identico.

Es idempotente: si ya esta aplicado, avisa y no toca nada. Antes de correrlo
conviene tener el backup sync_nps_quincenal.py.bak-20260917 (ya creado).

    python3 parche_anio_metricas.py
"""
import ast
import io
import sys

RUTA = "/root/pbi_extract/sync_nps_quincenal.py"

VIEJO = '''    pm = defaultdict(lambda: {"n": 0, "sum": 0.0, "det": 0})
    for r in rmd_rows:
        mes = int(r["Fecha Puntuacion"][5:7])
        p = float(r["Puntuacion"])
        pm[mes]["n"] += 1
        pm[mes]["sum"] += p
        if p <= 3:
            pm[mes]["det"] += 1
    metricas = [
        {
            "anio": ANIO,
            "mes": mes,
            "rmd": round(v["sum"] / v["n"], 3),
            "rmd_puntuadas": v["n"],
            "rmd_detractores": v["det"],
            "notas": "RMD del Power BI Quilmes (sync quincenal)",
        }
        for mes, v in sorted(pm.items())
    ]'''

NUEVO = '''    # El anio sale de la FECHA DE CADA FILA, no del reloj: asi un export
    # historico (2025) se guarda en su propio anio y no pisa los meses del
    # anio en curso, que es la clave de nps_metricas_mensuales (anio, mes).
    pm = defaultdict(lambda: {"n": 0, "sum": 0.0, "det": 0})
    for r in rmd_rows:
        fp = r["Fecha Puntuacion"]
        anio_fila, mes = int(fp[:4]), int(fp[5:7])
        p = float(r["Puntuacion"])
        pm[(anio_fila, mes)]["n"] += 1
        pm[(anio_fila, mes)]["sum"] += p
        if p <= 3:
            pm[(anio_fila, mes)]["det"] += 1
    metricas = [
        {
            "anio": anio_fila,
            "mes": mes,
            "rmd": round(v["sum"] / v["n"], 3),
            "rmd_puntuadas": v["n"],
            "rmd_detractores": v["det"],
            "notas": "RMD del Power BI Quilmes (sync quincenal)",
        }
        for (anio_fila, mes), v in sorted(pm.items())
    ]'''


def main():
    s = io.open(RUTA, encoding="utf-8").read()

    if "anio_fila, mes = int(fp[:4])" in s:
        print("YA APLICADO: no toco nada")
        return 0
    if VIEJO not in s:
        print("NO ENCONTRE EL BLOQUE ORIGINAL: no toco nada")
        return 1

    io.open(RUTA, "w", encoding="utf-8").write(s.replace(VIEJO, NUEVO, 1))
    ast.parse(io.open(RUTA, encoding="utf-8").read())
    print("PARCHE APLICADO Y SINTAXIS OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
