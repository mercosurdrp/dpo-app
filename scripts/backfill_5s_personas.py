"""
Backfill de ayudante_id / chofer_id en s5_auditorias.

Pre-requisito: aplicar la migration 052 (ayudante_id, chofer_id en s5_auditorias).

Pasos:
  1. Crear los 3 empleados faltantes en empleados.
  2. Resolver el match para cada audit (Aguirre Diego forzado al de Distribución).
  3. UPDATE s5_auditorias con los UUIDs.
"""
import json
import os
import ssl
import sys
import unicodedata
import urllib.parse
import urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    sys.exit("Faltan envs SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")

EMPLEADOS_FALTANTES = [
    "MARTINEZ ELIAS",
    "ORTIZ BAUTISTA",
    "PEDERSEN ARIEL",
]

# AGUIRRE DIEGO: ambiguo, usamos el de sector Distribución (NO el "MIGUEL")
FORCE_BY_NAME = {
    "aguirre diego": ("AGUIRRE DIEGO", "Distribución"),
}

ctx = ssl.create_default_context()


def sb(method, path, body=None, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx) as r:
            text = r.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        msg = e.read().decode()
        raise RuntimeError(f"{method} {url} -> {e.code}: {msg}") from None


def norm(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower().strip()
    return s


def ensure_schema():
    sample = sb("GET", "s5_auditorias", params={"select": "ayudante_id,chofer_id", "limit": "1"})
    if sample is None:
        print("✗ Migration 052 no aplicada. Aplica el SQL primero.")
        sys.exit(1)
    print("✓ Schema con ayudante_id/chofer_id listo")


def crear_faltantes():
    creados = []
    ya = []
    for nombre in EMPLEADOS_FALTANTES:
        rows = sb("GET", "empleados", params={"select": "id,nombre", "nombre": f"eq.{nombre}"})
        if rows:
            ya.append((nombre, rows[0]["id"]))
            continue
        body = {
            "nombre": nombre,
            "sector": "Distribución",
            "activo": True,
        }
        result = sb("POST", "empleados", body=body)
        creados.append((nombre, result[0]["id"]))
    if creados:
        print("✓ Empleados creados:")
        for n, i in creados:
            print(f"    {n}  ({i})")
    if ya:
        print("✓ Empleados ya existentes:")
        for n, i in ya:
            print(f"    {n}  ({i})")


def cargar_empleados():
    rows = sb("GET", "empleados", params={"select": "id,nombre,sector,activo", "limit": "500"})
    return rows


def find_match(form_name, empleados):
    if not form_name:
        return None
    key = norm(form_name)
    forced = FORCE_BY_NAME.get(key)
    if forced:
        target_name, target_sector = forced
        for e in empleados:
            if e["nombre"] == target_name and e.get("sector") == target_sector:
                return e
    tokens = set(key.split())
    candidates = []
    for e in empleados:
        en = set(norm(e["nombre"]).split())
        if tokens.issubset(en):
            candidates.append(e)
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        # Si hay ambigüedad, preferimos sector Distribución
        dist = [c for c in candidates if c.get("sector") == "Distribución"]
        if len(dist) == 1:
            return dist[0]
        # Y el activo
        act = [c for c in candidates if c.get("activo")]
        if len(act) == 1:
            return act[0]
        return None
    return None


def main():
    ensure_schema()
    print()
    crear_faltantes()
    print()

    empleados = cargar_empleados()
    print(f"Total empleados en base: {len(empleados)}")

    audits = sb(
        "GET",
        "s5_auditorias",
        params={
            "select": "id,chofer_nombre,ayudante_1,ayudante_id,chofer_id,fecha,tipo",
            "tipo": "eq.flota",
            "limit": "500",
        },
    )
    print(f"Auditorías flota: {len(audits)}")

    actualizables = 0
    sin_ayudante = 0
    sin_chofer = 0
    detalle_fallidos = []
    for a in audits:
        ay = a.get("ayudante_1")
        ch = a.get("chofer_nombre")
        emp_ay = find_match(ay, empleados) if ay else None
        emp_ch = find_match(ch, empleados) if ch else None

        update = {}
        if emp_ay and a.get("ayudante_id") != emp_ay["id"]:
            update["ayudante_id"] = emp_ay["id"]
        if emp_ch and a.get("chofer_id") != emp_ch["id"]:
            update["chofer_id"] = emp_ch["id"]

        if ay and not emp_ay:
            sin_ayudante += 1
            detalle_fallidos.append(("ayudante", ay, a["id"]))
        if ch and not emp_ch:
            sin_chofer += 1
            detalle_fallidos.append(("chofer", ch, a["id"]))

        if update:
            sb("PATCH", "s5_auditorias", body=update, params={"id": f"eq.{a['id']}"})
            actualizables += 1

    print()
    print(f"✓ Auditorías actualizadas: {actualizables}")
    print(f"  Ayudantes no resueltos: {sin_ayudante}")
    print(f"  Choferes no resueltos: {sin_chofer}")
    if detalle_fallidos:
        print("\nDetalle de no resueltos:")
        for r, n, aid in detalle_fallidos:
            print(f"  [{r:8}] {n}  (audit {aid})")


if __name__ == "__main__":
    main()
