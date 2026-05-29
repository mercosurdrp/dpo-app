#!/usr/bin/env python3
"""
Sync de volumen + #clientes + rechazo histórico Misiones desde la Postgres
local del dashboard Misiones (5433) hacia la tabla pc_volumen_diario de la
Supabase Misiones (dpo-app).

Fuente:
  postgresql://postgres:postgres@localhost:5433/mercosur_dist_dashboard
  vista comprobantes_integrado (Chess + GESCOM, region='misiones')

Reglas de agregación por día:
  hl           = SUM(unimed_total) WHERE ds_documento ~ '^FACTURA' AND anulado='NO'
  clientes_dia = COUNT(DISTINCT id_cliente) idem
  hl_rechazo   = SUM(unimed_total) WHERE ds_documento IN
                 ('NOTA DE CREDITO','DEV-RE','DEVOLUCION PRESUPUESTO')
                 AND anulado='NO'

Notas:
  • La vista comprobantes_integrado ya filtra SEGUNDA VUELTA en Chess (línea 279
    de rebuild_integrado.py del dashboard). REFUERZO no está excluido — para
    este sync lo dejamos pasar porque interesa el volumen entregado total.
  • GESCOM tiene unimed_total = NULL → solo aporta volumen via Chess. OK porque
    Chess cubre 2025-01-01 → 2026-05-28 que es el rango que necesitamos.
  • Upsert por fecha. Se puede correr múltiples veces sin duplicar.

Uso:
    cd /root/dpo-app
    python3 scripts/sync_pc_volumen.py
    python3 scripts/sync_pc_volumen.py --desde 2025-01-01 --hasta 2025-12-31
"""
from __future__ import annotations
import argparse
import os
import sys
from datetime import date, timedelta

import psycopg2
from supabase import create_client

PG_DSN = 'postgresql://postgres:postgres@localhost:5433/mercosur_dist_dashboard'

DOC_FACTURA = ('FACTURA', 'FACTURA PRESUPUESTO', 'VEN')
DOC_RECHAZO = ('NOTA DE CREDITO', 'DEV-RE', 'DEVOLUCION PRESUPUESTO')


def cargar_env_misiones() -> tuple[str, str]:
    """Lee URL + service role del .env.local.bak-misiones-* más reciente."""
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


def agregar_volumen_diario(desde: str, hasta: str) -> list[dict]:
    """Una query sola — combina facturas y rechazos en CTEs para evitar 2 round trips."""
    sql = """
        WITH fact AS (
            SELECT fecha,
                   SUM(unimed_total)::numeric                AS hl,
                   COUNT(DISTINCT id_cliente)::int           AS clientes_dia,
                   SUM(cantidades_total)::numeric            AS bultos_total
            FROM comprobantes_integrado
            WHERE region = 'misiones'
              AND fecha BETWEEN %s AND %s
              AND anulado = 'NO'
              AND ds_documento = ANY(%s)
            GROUP BY fecha
        ),
        rech AS (
            -- Notas de crédito y devoluciones traen unimed_total negativo en
            -- comprobantes_integrado, por eso ABS().
            SELECT fecha, ABS(SUM(unimed_total))::numeric AS hl_rechazo
            FROM comprobantes_integrado
            WHERE region = 'misiones'
              AND fecha BETWEEN %s AND %s
              AND anulado = 'NO'
              AND ds_documento = ANY(%s)
            GROUP BY fecha
        )
        SELECT
            f.fecha,
            COALESCE(f.hl, 0)            AS hl,
            COALESCE(r.hl_rechazo, 0)    AS hl_rechazo,
            COALESCE(f.bultos_total, 0)  AS bultos_total,
            COALESCE(f.clientes_dia, 0)  AS clientes_dia
        FROM fact f
        LEFT JOIN rech r ON r.fecha = f.fecha
        ORDER BY f.fecha
    """
    conn = psycopg2.connect(PG_DSN, connect_timeout=15)
    try:
        cur = conn.cursor()
        cur.execute(sql, (desde, hasta, list(DOC_FACTURA),
                          desde, hasta, list(DOC_RECHAZO)))
        cols = [c.name for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        return rows
    finally:
        conn.close()


def upsert_supabase(rows: list[dict]) -> None:
    url, key = cargar_env_misiones()
    if 'bvqmsrnrdrxprbggfziu' not in url:
        raise RuntimeError(f'URL no es Misiones: {url}. Abortando.')
    sb = create_client(url, key)

    payload = []
    for r in rows:
        payload.append({
            'fecha':         r['fecha'].isoformat(),
            'hl_total':      float(r['hl']),
            'hl_rechazo':    float(r['hl_rechazo']),
            'bultos_total':  float(r['bultos_total']),
            'camiones':      0,    # no lo tenemos en comprobantes_integrado
            'clientes_dia':  int(r['clientes_dia']),
        })

    BATCH = 100
    for i in range(0, len(payload), BATCH):
        chunk = payload[i:i + BATCH]
        sb.table('pc_volumen_diario').upsert(chunk, on_conflict='fecha').execute()
        print(f'   lote {i // BATCH + 1}: {len(chunk)} filas → OK')


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawTextHelpFormatter)
    p.add_argument('--desde', default='2025-01-01',
                   help='Fecha inicio (YYYY-MM-DD). Default 2025-01-01.')
    p.add_argument('--hasta', default=None,
                   help='Fecha fin (YYYY-MM-DD). Default = hoy.')
    args = p.parse_args()

    hasta = args.hasta or date.today().isoformat()
    desde = args.desde
    print(f'1) Agregando {desde} → {hasta} desde 5433/comprobantes_integrado …')
    rows = agregar_volumen_diario(desde, hasta)
    if not rows:
        print('   ⚠ Sin filas en el rango.')
        return
    print(f'   → {len(rows)} días con datos (primero={rows[0]["fecha"]}, '
          f'último={rows[-1]["fecha"]})')

    # resumen
    total_hl = sum(float(r['hl']) for r in rows)
    total_rech = sum(float(r['hl_rechazo']) for r in rows)
    print(f'   HL acumulado: {total_hl:,.0f}  |  Rechazo: {total_rech:,.0f}  '
          f'({total_rech / max(total_hl, 1) * 100:.2f}% del HL)')

    print('\n2) Upsert a Supabase Misiones pc_volumen_diario …')
    upsert_supabase(rows)
    print('\n✓ OK')


if __name__ == '__main__':
    main()
