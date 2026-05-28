#!/usr/bin/env python3
"""
Seed pc_volumen_historico_2025 desde "ventas 2025.xlsx" del Calendario V2.

Carga 304 días reales de 2025 (HL totales, bultos, camiones) en la tabla
pc_volumen_historico_2025 de Supabase Misiones. Luego computa el P90 HL del
año y lo deja en pc_config.hl_p90_2025 para que la vista v_pc_calendario_dia
pueda normalizar el volumen.

Requiere las env vars del .env.local.bak-misiones-* (NEXT_PUBLIC_SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY). Ejecutar SOLO contra Misiones.

Uso:
    cd /root/dpo-app
    # export NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
    python3 scripts/seed_pc_volumen_historico_2025.py
"""
from __future__ import annotations
import os
import sys

# Carga del Excel: se reutiliza el parser del script V2 que ya leyó este mismo
# archivo correctamente (la hoja se llama "Sheet1" con S mayúscula y openpyxl
# tropieza con eso; el parser hace fallback con zipfile + ElementTree).
sys.path.insert(0, '/root/Mercosur distribuciones/Planning/periodo-criticos/V2')
from calendario_dias_pico_2026 import cargar_ventas, agregar_por_dia  # type: ignore

from supabase import create_client

EXCEL_PATH = '/root/Mercosur distribuciones/Planning/periodo-criticos/V2/ventas 2025.xlsx'


def cargar_env_misiones() -> tuple[str, str]:
    """Lee URL + service role del .env.local.bak-misiones-* más reciente.

    Permite ejecutar el script sin tener que exportar variables a mano.
    """
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if url and key:
        return url, key

    candidates = sorted(
        p for p in os.listdir('/root/dpo-app')
        if p.startswith('.env.local.bak-misiones')
    )
    if not candidates:
        raise RuntimeError('No encuentro .env.local.bak-misiones-* y no hay env vars.')

    path = f'/root/dpo-app/{candidates[-1]}'
    env: dict[str, str] = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")

    return env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']


def main() -> None:
    print(f'1) Leyendo {EXCEL_PATH} …')
    v25 = cargar_ventas(EXCEL_PATH)
    diaria = agregar_por_dia(v25)
    print(f'   → {len(diaria)} días | {diaria["fecha"].min().date()} a {diaria["fecha"].max().date()}')

    url, key = cargar_env_misiones()
    if 'bvqmsrnrdrxprbggfziu' not in url:
        raise RuntimeError(f'URL no es la de Misiones: {url}. Abortando para no escribir en Pampeana.')
    sb = create_client(url, key)

    # Safety: chequear que la tabla exista (migración 083 aplicada)
    try:
        sb.table('pc_volumen_historico_2025').select('fecha', count='exact').limit(0).execute()
    except Exception as e:
        print(f'\n✗ La tabla pc_volumen_historico_2025 no existe. ¿Aplicaste la migración 083?')
        print(f'  Error: {e}')
        sys.exit(1)

    print('\n2) Cargando filas a Supabase Misiones …')
    rows = []
    for _, r in diaria.iterrows():
        rows.append({
            'fecha':         r['fecha'].date().isoformat(),
            'hl_total':      float(r['hl_total']),
            'hl_rechazo':    float(r['hl_rechazo']),
            'bultos_total':  float(r['bultos_total']),
            'camiones':      int(r['camiones']),
        })

    # Upsert por lotes de 100. PostgREST soporta hasta ~1000 pero conviene
    # mantenerlo bajo para que el log de errores apunte al lote conflictivo.
    BATCH = 100
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        res = sb.table('pc_volumen_historico_2025').upsert(chunk, on_conflict='fecha').execute()
        print(f'   lote {i // BATCH + 1}: {len(chunk)} filas → OK')

    # 3) actualizar P90 en pc_config
    p90 = float(diaria['hl_total'].quantile(0.90))
    print(f'\n3) P90 HL 2025 = {p90:,.2f} — actualizo pc_config.hl_p90_2025')
    sb.table('pc_config').update({'hl_p90_2025': p90}).eq('id', 1).execute()

    # 4) verificación
    cnt = sb.table('pc_volumen_historico_2025').select('fecha', count='exact').limit(0).execute()
    cfg = sb.table('pc_config').select('hl_p90_2025').eq('id', 1).single().execute()
    print(f'\n✓ Listo: {cnt.count} filas en pc_volumen_historico_2025, P90 cacheado = {cfg.data["hl_p90_2025"]}')


if __name__ == '__main__':
    main()
