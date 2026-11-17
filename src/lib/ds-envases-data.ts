/**
 * DS de vacíos de Quilmes (Power BI), exportado a Excel el 17/11/2026
 * (Downloads/data (2).xlsx). Foto fija: se regenera a mano con un export nuevo.
 *
 * Criterio de signos del DS: Ingreso = vacíos que DEVOLVEMOS a Quilmes,
 * Retiro = vacíos que RETIRAMOS. Acá los dos van en positivo; neto = ingreso - retiro.
 * Filtros del reporte: categoría RGB, grupo comercial Mercosur Región Pampeana SRL,
 * canal Distribuidores, status Activo; excluye jul-sep 2023 y el centro SDMC.
 */
export const DS_ENVASES_CORTE = "2026-11-14"
export const DS_ENVASES_EXPORT = "2026-11-17"
export const DS_ENVASES_DESDE = "2023-10-02"

export interface DsEnvasesMes { mes: string; ingreso: number; retiro: number; movimientos: number; hlIngreso: number; hlRetiro: number }
export interface DsEnvasesCalibre { calibre: string; codigos: number[]; ingreso: number; retiro: number; movimientos: number }
export interface DsEnvasesCentro { centro: string; ingreso: number; retiro: number; movimientos: number }

export const DS_ENVASES_MESES: DsEnvasesMes[] = [
 {
  "mes": "2023-10",
  "ingreso": 34050,
  "retiro": 32550,
  "movimientos": 71,
  "hlIngreso": 4086,
  "hlRetiro": 3906
 },
 {
  "mes": "2023-11",
  "ingreso": 38750,
  "retiro": 38450,
  "movimientos": 77,
  "hlIngreso": 4650,
  "hlRetiro": 4614
 },
 {
  "mes": "2023-12",
  "ingreso": 29600,
  "retiro": 29500,
  "movimientos": 67,
  "hlIngreso": 3552,
  "hlRetiro": 3540
 },
 {
  "mes": "2024-01",
  "ingreso": 37500,
  "retiro": 37450,
  "movimientos": 80,
  "hlIngreso": 4500,
  "hlRetiro": 4494
 },
 {
  "mes": "2024-02",
  "ingreso": 32600,
  "retiro": 32600,
  "movimientos": 62,
  "hlIngreso": 3912,
  "hlRetiro": 3912
 },
 {
  "mes": "2024-03",
  "ingreso": 15600,
  "retiro": 16900,
  "movimientos": 37,
  "hlIngreso": 1872,
  "hlRetiro": 2028
 },
 {
  "mes": "2024-04",
  "ingreso": 14650,
  "retiro": 14650,
  "movimientos": 30,
  "hlIngreso": 1758,
  "hlRetiro": 1758
 },
 {
  "mes": "2024-05",
  "ingreso": 26200,
  "retiro": 26200,
  "movimientos": 48,
  "hlIngreso": 3144,
  "hlRetiro": 3144
 },
 {
  "mes": "2024-06",
  "ingreso": 31700,
  "retiro": 31700,
  "movimientos": 62,
  "hlIngreso": 3804,
  "hlRetiro": 3804
 },
 {
  "mes": "2024-07",
  "ingreso": 21600,
  "retiro": 21600,
  "movimientos": 46,
  "hlIngreso": 2592,
  "hlRetiro": 2592
 },
 {
  "mes": "2024-08",
  "ingreso": 27700,
  "retiro": 27700,
  "movimientos": 52,
  "hlIngreso": 3324,
  "hlRetiro": 3324
 },
 {
  "mes": "2024-09",
  "ingreso": 36800,
  "retiro": 36800,
  "movimientos": 74,
  "hlIngreso": 4416,
  "hlRetiro": 4416
 },
 {
  "mes": "2024-10",
  "ingreso": 37500,
  "retiro": 37500,
  "movimientos": 68,
  "hlIngreso": 4500,
  "hlRetiro": 4500
 },
 {
  "mes": "2024-11",
  "ingreso": 42900,
  "retiro": 42900,
  "movimientos": 81,
  "hlIngreso": 5148,
  "hlRetiro": 5148
 },
 {
  "mes": "2024-12",
  "ingreso": 52450,
  "retiro": 52200,
  "movimientos": 106,
  "hlIngreso": 6294,
  "hlRetiro": 6264
 },
 {
  "mes": "2025-01",
  "ingreso": 59500,
  "retiro": 59500,
  "movimientos": 104,
  "hlIngreso": 7140,
  "hlRetiro": 7140
 },
 {
  "mes": "2025-02",
  "ingreso": 48550,
  "retiro": 48950,
  "movimientos": 92,
  "hlIngreso": 5826,
  "hlRetiro": 5874
 },
 {
  "mes": "2025-03",
  "ingreso": 27500,
  "retiro": 26350,
  "movimientos": 65,
  "hlIngreso": 3300,
  "hlRetiro": 3162
 },
 {
  "mes": "2025-04",
  "ingreso": 21800,
  "retiro": 21800,
  "movimientos": 47,
  "hlIngreso": 2616,
  "hlRetiro": 2616
 },
 {
  "mes": "2025-05",
  "ingreso": 26850,
  "retiro": 26850,
  "movimientos": 56,
  "hlIngreso": 3222,
  "hlRetiro": 3222
 },
 {
  "mes": "2025-06",
  "ingreso": 13200,
  "retiro": 13150,
  "movimientos": 36,
  "hlIngreso": 1584,
  "hlRetiro": 1578
 },
 {
  "mes": "2025-07",
  "ingreso": 26900,
  "retiro": 26900,
  "movimientos": 70,
  "hlIngreso": 3228,
  "hlRetiro": 3228
 },
 {
  "mes": "2025-08",
  "ingreso": 31400,
  "retiro": 31400,
  "movimientos": 70,
  "hlIngreso": 3768,
  "hlRetiro": 3768
 },
 {
  "mes": "2025-09",
  "ingreso": 26850,
  "retiro": 26650,
  "movimientos": 60,
  "hlIngreso": 3222,
  "hlRetiro": 3198
 },
 {
  "mes": "2025-10",
  "ingreso": 43100,
  "retiro": 43300,
  "movimientos": 86,
  "hlIngreso": 5172,
  "hlRetiro": 5196
 },
 {
  "mes": "2025-11",
  "ingreso": 38500,
  "retiro": 38500,
  "movimientos": 87,
  "hlIngreso": 4620,
  "hlRetiro": 4620
 },
 {
  "mes": "2025-12",
  "ingreso": 72950,
  "retiro": 79950,
  "movimientos": 151,
  "hlIngreso": 8754,
  "hlRetiro": 9594
 },
 {
  "mes": "2026-01",
  "ingreso": 55100,
  "retiro": 48950,
  "movimientos": 100,
  "hlIngreso": 6612,
  "hlRetiro": 5874
 },
 {
  "mes": "2026-02",
  "ingreso": 45700,
  "retiro": 45700,
  "movimientos": 85,
  "hlIngreso": 5484,
  "hlRetiro": 5484
 },
 {
  "mes": "2026-03",
  "ingreso": 49750,
  "retiro": 49750,
  "movimientos": 98,
  "hlIngreso": 5970,
  "hlRetiro": 5970
 },
 {
  "mes": "2026-04",
  "ingreso": 32150,
  "retiro": 33000,
  "movimientos": 63,
  "hlIngreso": 3858,
  "hlRetiro": 3960
 },
 {
  "mes": "2026-05",
  "ingreso": 29900,
  "retiro": 29900,
  "movimientos": 50,
  "hlIngreso": 3588,
  "hlRetiro": 3588
 },
 {
  "mes": "2026-06",
  "ingreso": 34950,
  "retiro": 34950,
  "movimientos": 62,
  "hlIngreso": 4194,
  "hlRetiro": 4194
 },
 {
  "mes": "2026-07",
  "ingreso": 48250,
  "retiro": 48200,
  "movimientos": 84,
  "hlIngreso": 5790,
  "hlRetiro": 5784
 },
 {
  "mes": "2026-08",
  "ingreso": 35600,
  "retiro": 35600,
  "movimientos": 66,
  "hlIngreso": 4272,
  "hlRetiro": 4272
 },
 {
  "mes": "2026-09",
  "ingreso": 44200,
  "retiro": 44200,
  "movimientos": 84,
  "hlIngreso": 5304,
  "hlRetiro": 5304
 },
 {
  "mes": "2026-10",
  "ingreso": 29000,
  "retiro": 29100,
  "movimientos": 60,
  "hlIngreso": 3480,
  "hlRetiro": 3492
 },
 {
  "mes": "2026-11",
  "ingreso": 17350,
  "retiro": 17350,
  "movimientos": 32,
  "hlIngreso": 2082,
  "hlRetiro": 2082
 }
]

export const DS_ENVASES_CALIBRES: DsEnvasesCalibre[] = [
 {
  "calibre": "Botella Litro",
  "codigos": [
   31144,
   89860
  ],
  "ingreso": 1274900,
  "retiro": 1280400,
  "movimientos": 2179
 },
 {
  "calibre": "Botella SA",
  "codigos": [
   40516
  ],
  "ingreso": 53900,
  "retiro": 53000,
  "movimientos": 383
 },
 {
  "calibre": "ENVASE BOT 1/1 FLINT 1000CC",
  "codigos": [
   106765
  ],
  "ingreso": 9600,
  "retiro": 5300,
  "movimientos": 106
 },
 {
  "calibre": "Botella 970",
  "codigos": [
   42961
  ],
  "ingreso": 250,
  "retiro": 0,
  "movimientos": 1
 }
]

export const DS_ENVASES_CENTROS: DsEnvasesCentro[] = [
 {
  "centro": "ZTE",
  "ingreso": 1241650,
  "retiro": 1240400,
  "movimientos": 2512
 },
 {
  "centro": "QUI",
  "ingreso": 95800,
  "retiro": 97100,
  "movimientos": 155
 },
 {
  "centro": "MZA",
  "ingreso": 1200,
  "retiro": 1200,
  "movimientos": 2
 }
]
