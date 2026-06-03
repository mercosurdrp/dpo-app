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

def upsert(fecha, bultos):
    body = json.dumps([{"fecha": fecha, "bultos_distribuidos": round(bultos, 2)}]).encode()
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

def bultos_dia(fecha):
    total = 0.0
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
                return sum((it.get("quantity") or 0) for it in dels
                           if any(a.get("attempt_status") == "SUCCESSFUL" for a in it.get("attempts", [])))
            with ThreadPoolExecutor(max_workers=10) as ex:
                total += sum(ex.map(fetch, wps))
    return total

def main():
    desde = date.fromisoformat(sys.argv[1])
    hasta = date.fromisoformat(sys.argv[2])
    d = desde
    while d <= hasta:
        if d.weekday() != 6:  # excluye domingos
            b = bultos_dia(d.isoformat())
            st = upsert(d.isoformat(), b) if WRITE else "(dry)"
            print(f"{d.isoformat()} -> {b:8.1f} bultos · save={st}", flush=True)
        d += timedelta(days=1)
    print("LISTO")

if __name__ == "__main__":
    main()
