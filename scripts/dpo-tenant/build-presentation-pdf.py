"""
Genera un PDF ejecutivo del sistema DPO Mercosur Distribuciones (Misiones)
para presentar al gerente.
"""
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, ListFlowable, ListItem,
)

# ---------- Paleta ----------
NAVY = colors.HexColor("#0F172A")
BLUE = colors.HexColor("#1E40AF")
LIGHT_BLUE = colors.HexColor("#DBEAFE")
SLATE = colors.HexColor("#475569")
LIGHT_SLATE = colors.HexColor("#F1F5F9")
BORDER = colors.HexColor("#E2E8F0")
GREEN = colors.HexColor("#16A34A")
AMBER = colors.HexColor("#D97706")
RED = colors.HexColor("#DC2626")
WHITE = colors.HexColor("#FFFFFF")

OUT = Path("/root/fausto/Sistema_DPO_Distribuciones.pdf")

# ---------- Datos ----------
URL_APP = "https://dpo-distribuciones-pij3vtjiz-mercosurdrps-projects.vercel.app"
ADMIN_EMAIL = "admin@mercosurdistribuciones.local"
ADMIN_PASS = "distribuciones2026"

MODULOS = [
    ("Auditorías DPO", "Manual completo de los 7 pilares con 168 preguntas de auditoría, evaluación y planes de acción por punto."),
    ("Acciones y Planes", "Seguimiento de planes de mejora, timeline de cambios, comentarios y vinculación con evidencia."),
    ("Indicadores (KPIs)", "Tablero de indicadores por pilar y por pregunta con tendencias, meta vs. real."),
    ("Asistencia", "Registro de fichadas, novedades (vacaciones, licencias, ausencias) y reunión pre-ruta matinal."),
    ("Vehículos", "Catálogo de flota, checklists de liberación/retorno, carga de combustible y rendimiento km/l."),
    ("Capacitaciones", "81 capacitaciones precargadas, exámenes automáticos, histórico de intentos, matriz SKAP."),
    ("Reportes de Seguridad", "Registro de accidentes, incidentes, actos inseguros, rutas de riesgo con fotos/videos."),
    ("Línea Ética", "Canal anónimo de denuncias con QR (PDF listo para imprimir). Integrado con punto 1.1 Compliance."),
    ("5S", "Auditorías mensuales de flota (19 ítems) y almacén (30 ítems) con tendencias, ranking y top críticos."),
    ("Sugerencias (Kanban)", "Tickets de mejoras/bugs con estados, comentarios y asignación a responsables."),
    ("Evidencias DPO", "Gestión documental versionada por punto del manual, con trazabilidad completa (quién, cuándo, motivo)."),
]

INTEGRACIONES_PENDIENTES = [
    ("Chess ERP", "Sincronización de rechazos de comprobantes. Requiere user/password del Chess de Distribuciones."),
    ("Foxtrot GPS", "Tracking de camiones en ruta, TML real por vehículo. Requiere API key de Foxtrot."),
    ("Reloj de asistencia", "Sync automático de fichadas. Requiere configurar webhook desde el reloj."),
    ("OpenAI (opcional)", "Generación de exámenes automáticos desde PDFs. Requiere clave de OpenAI."),
]


def read_empleados():
    rows = []
    with open("/tmp/dist-empleados.tsv") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 5:
                rows.append(parts[:5])
    return rows


def read_vehiculos():
    rows = []
    with open("/tmp/dist-vehiculos.tsv") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 4:
                rows.append(parts[:4])
    return rows


# ---------- Estilos ----------

styles = getSampleStyleSheet()

H1 = ParagraphStyle(
    "H1", parent=styles["Heading1"],
    fontName="Helvetica-Bold", fontSize=22, textColor=NAVY,
    spaceAfter=6, spaceBefore=0, leading=26,
)
H2 = ParagraphStyle(
    "H2", parent=styles["Heading2"],
    fontName="Helvetica-Bold", fontSize=14, textColor=NAVY,
    spaceAfter=8, spaceBefore=18, leading=18,
)
H3 = ParagraphStyle(
    "H3", parent=styles["Heading3"],
    fontName="Helvetica-Bold", fontSize=11, textColor=BLUE,
    spaceAfter=4, spaceBefore=10, leading=14,
)
BODY = ParagraphStyle(
    "Body", parent=styles["BodyText"],
    fontName="Helvetica", fontSize=10, textColor=NAVY,
    leading=14, spaceAfter=4,
)
SMALL = ParagraphStyle(
    "Small", parent=styles["BodyText"],
    fontName="Helvetica", fontSize=9, textColor=SLATE, leading=12,
)
CAPTION = ParagraphStyle(
    "Caption", parent=styles["BodyText"],
    fontName="Helvetica-Oblique", fontSize=9, textColor=SLATE, leading=12,
)
MONO = ParagraphStyle(
    "Mono", parent=styles["BodyText"],
    fontName="Courier-Bold", fontSize=10, textColor=NAVY, leading=13,
)

# ---------- Helpers ----------

def kpi_box(label, value, color=NAVY):
    return Table(
        [[Paragraph(f'<font color="#64748B" size="8">{label}</font>', styles["BodyText"])],
         [Paragraph(f'<font color="{color.hexval()}" size="22"><b>{value}</b></font>', styles["BodyText"])]],
        colWidths=[4 * cm], rowHeights=[0.5 * cm, 1.1 * cm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), LIGHT_SLATE),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]),
    )


def banner(text, subtitle=None, color=NAVY):
    rows = [[Paragraph(f'<font color="white" size="18"><b>{text}</b></font>', styles["BodyText"])]]
    if subtitle:
        rows.append([Paragraph(f'<font color="#CBD5E1" size="10">{subtitle}</font>', styles["BodyText"])])
    return Table(
        rows, colWidths=[17 * cm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), color),
            ("LEFTPADDING", (0, 0), (-1, -1), 14),
            ("RIGHTPADDING", (0, 0), (-1, -1), 14),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]),
    )


def table_from_rows(header, rows, col_widths=None, fontsize=9):
    data = [header] + rows
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), fontsize),
        ("FONTSIZE", (0, 1), (-1, -1), fontsize),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("TEXTCOLOR", (0, 1), (-1, -1), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_SLATE]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ])
    t.setStyle(style)
    return t


def on_page(canvas, doc):
    canvas.saveState()
    # Footer
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(SLATE)
    canvas.drawString(2 * cm, 1 * cm, "DPO Mercosur Distribuciones · Sistema de Gestión Operacional")
    canvas.drawRightString(A4[0] - 2 * cm, 1 * cm, f"Página {doc.page}")
    canvas.restoreState()


# ---------- Build ----------

def build():
    doc = SimpleDocTemplate(
        str(OUT), pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=1.8 * cm, bottomMargin=1.8 * cm,
        title="DPO Mercosur Distribuciones — Sistema",
    )

    story = []

    # ================== PORTADA ==================
    story.append(Spacer(1, 4 * cm))
    story.append(Paragraph(
        '<font color="#0F172A" size="32"><b>DPO</b></font>',
        ParagraphStyle("cover", alignment=1, fontSize=32, leading=40)
    ))
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph(
        '<font color="#1E40AF" size="20"><b>Mercosur Distribuciones</b></font>',
        ParagraphStyle("cover2", alignment=1, fontSize=20, leading=24)
    ))
    story.append(Paragraph(
        '<font color="#64748B" size="12">Sistema de Gestión Operacional · Misiones</font>',
        ParagraphStyle("cover3", alignment=1, fontSize=12, leading=16)
    ))
    story.append(Spacer(1, 2 * cm))

    cover_box = Table(
        [[
            Paragraph('<font color="white" size="10"><b>INFORME PARA GERENCIA</b></font>',
                      ParagraphStyle("", alignment=1)),
        ], [
            Paragraph(f'<font color="#CBD5E1" size="9">Generado el {datetime.now().strftime("%d/%m/%Y")}</font>',
                      ParagraphStyle("", alignment=1)),
        ]],
        colWidths=[10 * cm], hAlign="CENTER",
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), NAVY),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]),
    )
    story.append(cover_box)
    story.append(PageBreak())

    # ================== 1. ACCESO ==================
    story.append(banner("1 · Acceso al sistema", "URL, credenciales y cómo entran los usuarios"))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph("URL de producción", H3))
    story.append(Paragraph(
        f'<font color="#1E40AF"><u>{URL_APP}</u></font>', MONO))
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(
        "La aplicación está desplegada en la infraestructura de Vercel. No requiere instalación — se accede desde cualquier navegador (PC, celular, tablet).",
        SMALL
    ))

    story.append(Paragraph("Acceso Administrador", H3))
    story.append(Table(
        [["Usuario", ADMIN_EMAIL],
         ["Contraseña", ADMIN_PASS],
         ["Rol", "admin (acceso completo)"]],
        colWidths=[4 * cm, 10 * cm],
        style=TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (1, 0), (1, -1), "Courier"),
            ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
            ("TEXTCOLOR", (0, 0), (-1, -1), NAVY),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ])
    ))
    story.append(Paragraph(
        "<b>Importante:</b> se sugiere cambiar la contraseña desde el primer acceso. Desde la sección Admin → Usuarios se pueden crear más usuarios con roles admin, auditor o viewer.",
        SMALL
    ))

    story.append(Paragraph("Acceso Empleados", H3))
    story.append(Paragraph(
        "Los 97 empleados entran por el tab <b>Empleado</b> del login con:",
        BODY
    ))
    story.append(Table(
        [["Usuario", "su número de legajo (ej: 175)"],
         ["Contraseña", "su número de DNI"]],
        colWidths=[4 * cm, 10 * cm],
        style=TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
            ("TEXTCOLOR", (0, 0), (-1, -1), NAVY),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ])
    ))
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(
        "Los empleados solo ven sus propias capacitaciones, evaluaciones y pueden reportar actos inseguros. No acceden al resto del sistema.",
        SMALL
    ))

    story.append(PageBreak())

    # ================== 2. RESUMEN EJECUTIVO ==================
    story.append(banner("2 · Resumen ejecutivo", "Lo que ya está cargado en la base del sistema"))
    story.append(Spacer(1, 0.5 * cm))

    kpi_row = Table(
        [[
            kpi_box("Pilares DPO", "7"),
            kpi_box("Preguntas de auditoría", "168"),
            kpi_box("Empleados", "97", color=BLUE),
            kpi_box("Vehículos", "16", color=GREEN),
        ]],
        colWidths=[4.25 * cm] * 4,
        style=TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ])
    )
    story.append(kpi_row)
    story.append(Spacer(1, 0.3 * cm))

    kpi_row2 = Table(
        [[
            kpi_box("Capacitaciones precargadas", "81"),
            kpi_box("Ítems checklist vehículos", "30"),
            kpi_box("Ítems auditoría 5S", "49"),
            kpi_box("Ítems OWD pre-ruta", "20"),
        ]],
        colWidths=[4.25 * cm] * 4,
        style=TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ])
    )
    story.append(kpi_row2)
    story.append(Spacer(1, 0.8 * cm))

    story.append(Paragraph("Módulos disponibles", H2))
    modulos_rows = [[m[0], m[1]] for m in MODULOS]
    story.append(table_from_rows(["Módulo", "Descripción"], modulos_rows, col_widths=[4.5 * cm, 12 * cm]))

    story.append(PageBreak())

    # ================== 3. EMPLEADOS ==================
    empleados = read_empleados()
    por_sector = {}
    for r in empleados:
        s = r[3] or "Sin asignar"
        por_sector.setdefault(s, []).append(r)

    story.append(banner(f"3 · Empleados ({len(empleados)})", "Listado completo por sector"))
    story.append(Spacer(1, 0.5 * cm))

    # Resumen por sector
    kpi_sec = Table(
        [[
            kpi_box("Distribución", str(len(por_sector.get("Distribución", []))), color=BLUE),
            kpi_box("Depósito", str(len(por_sector.get("Depósito", []))), color=GREEN),
            kpi_box("Sin asignar", str(len(por_sector.get("Sin asignar", []))), color=AMBER),
            kpi_box("Desvinculados", str(len(por_sector.get("Desvinculado", []))), color=RED),
        ]],
        colWidths=[4.25 * cm] * 4,
    )
    story.append(kpi_sec)
    story.append(Spacer(1, 0.6 * cm))

    for sector in ["Distribución", "Depósito", "Sin asignar", "Desvinculado"]:
        rows = por_sector.get(sector, [])
        if not rows:
            continue
        story.append(Paragraph(f"{sector} · {len(rows)} empleados", H3))
        table_rows = [[r[0], r[1], r[2], r[4]] for r in rows]
        story.append(table_from_rows(
            ["Legajo", "Nombre", "DNI", "Activo"],
            table_rows,
            col_widths=[2 * cm, 9 * cm, 3 * cm, 2 * cm],
            fontsize=8,
        ))
        story.append(Spacer(1, 0.5 * cm))

    story.append(PageBreak())

    # ================== 4. VEHÍCULOS ==================
    vehiculos = read_vehiculos()
    story.append(banner(f"4 · Flota de vehículos ({len(vehiculos)})", "Catálogo cargado en el sistema"))
    story.append(Spacer(1, 0.5 * cm))

    veh_rows = [[v[0], v[1] or "—", v[2].title(), (v[3] or "—").title()] for v in vehiculos]
    story.append(table_from_rows(
        ["Dominio", "Descripción", "Sector", "Tipo"],
        veh_rows,
        col_widths=[3 * cm, 7 * cm, 4 * cm, 3 * cm],
        fontsize=9,
    ))
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph(
        "El administrador puede agregar más vehículos, editar descripciones, asignar choferes habituales y configurar el mantenimiento preventivo desde el módulo Vehículos.",
        SMALL
    ))

    story.append(PageBreak())

    # ================== 5. PILARES DPO ==================
    story.append(banner("5 · Estructura del manual DPO", "Los 7 pilares y sus bloques"))
    story.append(Spacer(1, 0.5 * cm))

    pilares = [
        ("Gestión", "Compliance, estrategia, sueño, liderazgo, rutinas"),
        ("Gente", "Estructura, seguridad, DNA cultural, capacitación, clima"),
        ("Planeamiento", "Forecast, S&OP, gestión de inventario, presupuesto"),
        ("Entrega", "Pre-ruta, en-ruta, retorno, TML, rechazos, calidad"),
        ("Ventas", "Rutas, cobertura, ejecución PDV, matinal, planificación"),
        ("Almacén", "Layout, recepción, picking, despacho, 5S, inventarios"),
        ("Mantenimiento", "Preventivo, correctivo, flota, equipos, SOPs técnicos"),
    ]
    story.append(table_from_rows(
        ["Pilar", "Temas"],
        pilares,
        col_widths=[4 * cm, 12 * cm],
    ))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph(
        "Cada pilar contiene entre 5 y 15 bloques temáticos, y cada bloque tiene preguntas de auditoría con 4 niveles de puntaje (0 · 1 · 3 · 5). La evaluación puede hacerse con evidencia documental (SOP, foto, reporte) y genera planes de acción automáticos.",
        BODY
    ))

    story.append(PageBreak())

    # ================== 6. INTEGRACIONES PENDIENTES ==================
    story.append(banner("6 · Integraciones pendientes de configurar", "Requieren credenciales del proveedor"))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph(
        "Las siguientes integraciones están desarrolladas en el sistema pero aún no fueron activadas. Se habilitan con un cambio de configuración cuando estén disponibles las credenciales:",
        BODY
    ))
    story.append(Spacer(1, 0.3 * cm))
    int_rows = [[i[0], i[1]] for i in INTEGRACIONES_PENDIENTES]
    story.append(table_from_rows(
        ["Integración", "Descripción"],
        int_rows,
        col_widths=[4 * cm, 12.5 * cm],
    ))

    story.append(Spacer(1, 0.8 * cm))
    story.append(Paragraph("Próximos pasos recomendados", H2))

    items = [
        "<b>Cambiar la contraseña del admin</b> (en la primera sesión).",
        "<b>Asignar sector</b> a los 61 empleados que figuran como <i>Sin asignar</i>.",
        "<b>Editar las 81 capacitaciones precargadas</b> — asignar fechas, instructor y material (actualmente en null).",
        "<b>Asignar responsables 5S</b> para los 4 sectores de almacén del mes corriente.",
        "<b>Imprimir el QR de Línea Ética</b> (descarga directa desde <i>/compliance/linea-etica → Descargar QR</i>) y colocarlo en el comedor.",
        "<b>Realizar primera auditoría 5S</b> de flota y almacén — los catálogos de ítems ya están cargados.",
        "<b>Solicitar credenciales</b> al área de Sistemas para Chess ERP y Foxtrot GPS cuando estén disponibles.",
        "<b>Capacitación inicial a supervisores</b> para que usen checklists, reportes de seguridad y carga de combustible.",
    ]
    story.append(ListFlowable(
        [ListItem(Paragraph(it, BODY), leftIndent=20) for it in items],
        bulletType="1",
    ))

    story.append(Spacer(1, 0.8 * cm))
    story.append(Table(
        [[Paragraph(
            '<font color="white" size="10"><b>Soporte técnico:</b> '
            'Francisco (Analista BI Mercosur) · azzflowia@gmail.com</font>',
            ParagraphStyle("", alignment=1))]],
        colWidths=[16.5 * cm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), NAVY),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]),
    ))

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"OK -> {OUT}")


if __name__ == "__main__":
    build()
