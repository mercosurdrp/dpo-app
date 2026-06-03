#!/usr/bin/env python3
"""
Sync de BULTOS DISTRIBUIDOS desde Foxtrot a pc_volumen_diario (Misiones).

Recorre, por cada día, todas las rutas de Iguazú + Eldorado, y de cada parada
(waypoint) suma la `quantity` de las entregas con attempt_status=SUCCESSFUL.
Ese total (bultos realmente entregados por distribución) se upsertea en
pc_volumen_diario.bultos_distribuidos. Excluye domingos (no hay reparto).

Idempotente: upsert por `fecha` (on_conflict=fecha) → re-correr un rango no
duplica, solo reescribe. Para retomar un backfill cortado, basta volver a
correrlo sobre el rango faltante.

Credenciales por entorno (NO hardcodear):
  FOXTROT_API_KEY      bearer de la API de Foxtrot
  SUPABASE_URL         https://<proj>.supabase.co  (Misiones)
  SUPABASE_SERVICE_KEY service_role key de Misiones

Uso:
  FOXTROT_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
    python3 scripts/sync_foxtrot_bultos.py 2025-01-01 2026-06-02 --write
  (sin --write = dry-run, solo imprime)
"""
import json, os, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

FX = os.environ["FOXTROT_API_KEY"]
SB = os.environ["SUPABASE_URL"].rstrip("/")
SBKEY = os.environ["SUPABASE_SERVICE_KEY"]
BASE = "https://apiv1.foxtrotsystems.com"
DCS = ["iguazu", "eldorado"]
WRITE = "--write" in sys.argv

def fx_get(path, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(BASE + path, headers={
                "Authorization": f"Bearer {FX}", "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception:
            if i == tries - 1:
                return {"_err": True}
    return {"_err": True}

def upsert(fecha, bultos, clientes, otif):
    row = {"fecha": fecha,
           "bultos_distribuidos": round(bultos, 2),
           "clientes_distribuidos": clientes}
    if otif is not None:
        row["otif_distribuido"] = round(otif, 4)
    body = json.dumps([row]).encode()
    req = urllib.request.Request(
        f"{SB}/rest/v1/pc_volumen_diario?on_conflict=fecha", data=body, method="POST",
        headers={"apikey": SBKEY, "Authorization": f"Bearer {SBKEY}",
                 "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return f"ERR {e.code}: {e.read().decode()[:200]}"
    except Exception as e:
        return f"ERR {e}"

def resumen_dia(fecha):
    """Devuelve (bultos entregados, clientes con entrega OK, OTIF por clientes).
    OTIF = clientes OK / (clientes OK + clientes con falla total). None si no hay
    paradas con intento (denominador 0)."""
    total = 0.0
    cli_ok = set()
    cli_fail = set()
    for dc in DCS:
        rutas = fx_get(f"/dcs/{dc}/routes/find_by_date/{fecha}").get("data", {}).get("routes", [])
        for r in rutas:
            rid = r.get("id") or r.get("route_id")
            wps = fx_get(f"/dcs/{dc}/routes/{rid}/waypoints").get("data", {})
            wps = wps.get("waypoints", wps) if isinstance(wps, dict) else wps
            if not isinstance(wps, list):
                continue
            def fetch(wp):
                d = fx_get(f"/dcs/{dc}/routes/{rid}/waypoints/{wp.get('waypoint_id')}/deliveries")
                dels = d.get("data", {}).get("deliveries", []) if isinstance(d.get("data"), dict) else []
                b = 0.0
                ok = False
                fail = False
                for it in dels:
                    st = [a.get("attempt_status") for a in it.get("attempts", [])]
                    if "SUCCESSFUL" in st:
                        b += (it.get("quantity") or 0)
                        ok = True
                    elif "FAILED" in st:
                        fail = True
                # estado del cliente: ok si entregó algo; fail solo si todo falló
                estado = "ok" if ok else ("fail" if fail else None)
                return b, wp.get("customer_id"), estado
            with ThreadPoolExecutor(max_workers=10) as ex:
                for b, cid, estado in ex.map(fetch, wps):
                    total += b
                    if estado == "ok" and cid:
                        cli_ok.add(cid)
                    elif estado == "fail" and cid:
                        cli_fail.add(cid)
    # un cliente con OK en una parada y fail en otra cuenta como OK
    cli_fail -= cli_ok
    denom = len(cli_ok) + len(cli_fail)
    otif = (len(cli_ok) / denom) if denom else None
    return total, len(cli_ok), otif

def main():
    desde = date.fromisoformat(sys.argv[1])
    hasta = date.fromisoformat(sys.argv[2])
    d = desde
    while d <= hasta:
        if d.weekday() != 6:  # excluye domingos
            b, cli, otif = resumen_dia(d.isoformat())
            st = upsert(d.isoformat(), b, cli, otif) if WRITE else "(dry)"
            ot = f"{otif*100:.1f}%" if otif is not None else "s/d"
            print(f"{d.isoformat()} -> {b:8.1f} bultos · {cli} cli · OTIF {ot} · save={st}", flush=True)
        d += timedelta(days=1)
    print("LISTO")

if __name__ == "__main__":
    main()
