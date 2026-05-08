# Rechazos Analysis - Chess ERP Ventas API

**Date analyzed**: 2026-04-06
**Data sample**: 2026-04-01 (1,743 records total)

## API Endpoint

```
GET /ventas/?fechaDesde={date}&fechaHasta={date}&detallado=true
```

Response structure: `dsReporteComprobantesApi.VentasResumen[]`

---

## All Fields in VentasResumen

| # | Field | Description / Sample |
|---|-------|---------------------|
| 1 | rowVersion | Timestamp ID (20260401101201868) |
| 2 | idEmpresa | Company ID (1) |
| 3 | dsEmpresa | "MERCOSUR REGION PAMPEANA S.R.L." |
| 4 | **idDocumento** | Document type code: FCVTA, DVVTA, PRVTA, PRDVO |
| 5 | **dsDocumento** | "FACTURA", "NOTA DE CREDITO", "FACTURA PRESUPUESTO", "DEVOLUCION PRESUPUESTO" |
| 6 | letra | A, B, etc. |
| 7 | serie | Punto de venta (2, etc.) |
| 8 | nrodoc | Document number |
| 9 | pickup | "SI" / "NO" |
| 10 | consumeStock | "" |
| 11 | **anulado** | "SI" / "NO" |
| 12 | idMovComercial | Commercial movement ID |
| 13 | dsMovComercial | Commercial movement description |
| 14 | **idRechazo** | Rejection reason ID (0 = no rejection) |
| 15 | **dsRechazo** | Rejection reason description |
| 16 | fechaComprobate | Document date |
| 17 | fechaAnulacion | Annulment date |
| 18 | fechaAlta | Creation date |
| 19 | usuarioAlta | User who created it |
| 20 | fechaVencimiento | Due date |
| 21 | fechaEntrega | Delivery date |
| 22 | idSucursal / dsSucursal | Branch |
| 23 | idFuerzaVentas / dsFuerzaVentas | Sales force |
| 24 | idDeposito / dsDeposito | Warehouse |
| 25 | idVendedor / dsVendedor | Salesperson |
| 26 | idSupervisor / dsSupervisor | Supervisor |
| 27 | idGerente / dsGerente | Manager |
| 28 | tipoConstribuyente / dsTipoConstribuyente | Tax category |
| 29 | idTipoPago / dsTipoPago | Payment type ("CTA CTE", "CONTADO") |
| 30 | fechaPago | Payment date |
| 31 | idPedido | Order ID |
| 32 | fechaPedido | Order date |
| 33 | **origen** | Source: "BEES" (sales), "LIQUIDACION" (settlement/returns) |
| 34 | **planillaCarga** | Load sheet / delivery manifest ("0000 - 00016497") |
| 35 | **idFleteroCarga** | Driver/carrier ID |
| 36 | **dsFleteroCarga** | Driver/carrier plate number (e.g., "AF588SU") |
| 37 | idLiquidacion | Settlement ID |
| 38 | fechaLiquidacion | Settlement date |
| 39 | idCaja / fechaCaja / cajero | Cash register info |
| 40 | idCliente / nombreCliente | Customer |
| 41 | domicilioCliente / codigoPostal / dsLocalidad | Address |
| 42 | idProvincia / dsProvincia | Province |
| 43 | idSegmentoMkt / dsSegmentoMkt | Market segment |
| 44 | idCanalMkt / dsCanalMkt | Marketing channel |
| 45 | idSubcanalMkt / dsSubcanalMKT | Marketing subchannel |
| 46 | idLinea | Product line |
| 47 | idArticulo / dsArticulo | Product |
| 48 | presentacionArticulo | Units per case |
| 49 | idArea / dsArea | Area ("ALCOHOL", etc.) |
| 50 | cantidadSolicitada | Quantity requested |
| 51 | unidadesSolicitadas | Units requested |
| 52 | cantidadesCorCargo | Quantities with charge |
| 53 | cantidadesSinCargo | Quantities without charge (free) |
| 54 | **cantidadesTotal** | Total quantities (negative for returns) |
| 55 | **cantidadesRechazo** | Rejected quantities (positive number) |
| 56 | precioUnitarioBruto / precioUnitarioNeto | Unit prices |
| 57 | subtotalBruto / subtotalBonificado / subtotalNeto | Subtotals |
| 58 | subtotalFinal | Final amount with taxes |
| 59 | iva21, iva27, iva105, internos, etc. | Tax breakdowns |
| 60 | bonificacion | Discount % |
| 61 | tradespend* fields | Trade spend components |
| 62 | proveedor | Supplier |
| 63 | preciocomprabr / preciocomprant | Purchase prices |
| 64 | idDocumentoRela / dsDocumentoRela | Related document type |
| 65 | letraRela / serieRela / nrodocRela | Related document number |
| 66 | fechaComprobanteRela | Related document date |

---

## How to Identify Rechazos (Rejections)

### Primary indicators

1. **idDocumento = "DVVTA"** (Nota de Credito) -- This is the credit note issued for the rejection
2. **idRechazo != 0** -- Non-zero means a specific rejection reason exists
3. **cantidadesRechazo > 0** -- The rejected quantity
4. **cantidadesTotal < 0** -- Negative quantities = returned product
5. **subtotalNeto < 0** -- Negative amounts = credit to customer
6. **origen = "LIQUIDACION"** -- Returns come through settlement, not BEES

### Normal sale vs Rechazo comparison

| Field | Normal Sale (FCVTA) | Rechazo (DVVTA) |
|-------|-------------------|-----------------|
| idDocumento | FCVTA | DVVTA |
| dsDocumento | FACTURA | NOTA DE CREDITO |
| idRechazo | 0 | 1-19 (non-zero) |
| dsRechazo | "" (empty) | "SIN DINERO", etc. |
| cantidadesTotal | positive (e.g., 1.0) | negative (e.g., -0.083) |
| cantidadesRechazo | 0.0 | positive (e.g., 0.083) |
| subtotalNeto | positive | negative |
| origen | BEES | LIQUIDACION |

### Also observed: PRDVO (Devolucion Presupuesto)
- Similar to DVVTA but for "presupuesto" (budget/proforma) documents
- Has negative cantidadesTotal and positive cantidadesRechazo
- Only 1 record in sample

---

## Rejection Reason Catalog (idRechazo -> dsRechazo)

| ID | Description | Count (2026-04-01) |
|----|-------------|-------------------|
| 0 | (none / normal sale) | 1714 |
| 1 | CERRADO | 2 |
| 3 | ERROR DE CARGA | 1 |
| 6 | SIN DINERO | 9 |
| 9 | PRODUCTO NO APTO | 2 |
| 10 | SIN ENVASES | 1 |
| 12 | ERROR DE PREVENTA | 7 |
| 13 | SIN STOCK | 5 |
| 15 | ERROR DE DISTRIBUCIO(N) | 1 |
| 19 | DEV X TRAMITES INTER(NOS) | 1 |

**Note**: Some descriptions are truncated at ~20 chars in the API response.

---

## How to Identify the Chofer / Driver

The driver (chofer/fletero) is identified by:

- **idFleteroCarga**: Numeric ID of the carrier/driver
- **dsFleteroCarga**: License plate of the vehicle (e.g., "AF588SU")
- **planillaCarga**: Load sheet number linking to a specific delivery run

### Fleteros observed on 2026-04-01

| ID | Plate | Records |
|----|-------|---------|
| 1 | AE908DH | 271 |
| 2 | AE908DG | 161 |
| 4 | AF028YB | 315 |
| 5 | AE908DF | 205 |
| 9 | AE591EI | 111 |
| 15 | AF664NY | 139 |
| 21 | AF588SU | 365 |
| 25 | AF469UR | 174 |
| 98 | SEGUNDA VUELTA | 2 |

**Note**: The field is "fletero" (carrier), identified by vehicle plate. To get the actual driver name, you would need to cross-reference with the GESCOM repartos endpoint which has `codigoChofer` and `nombreChofer`.

---

## Key Takeaways for Building a Rechazos Dashboard

1. **Filter rechazos**: `WHERE idDocumento IN ('DVVTA', 'PRDVO') OR idRechazo != 0`
2. **Group by reason**: Use `idRechazo` / `dsRechazo` to categorize
3. **Group by driver**: Use `idFleteroCarga` / `dsFleteroCarga`
4. **Measure impact**: Sum `cantidadesRechazo` (absolute quantities) or `ABS(subtotalNeto)` for monetary value
5. **Link to original sale**: Use `idDocumentoRela` + `serieRela` + `nrodocRela` to find the original invoice
6. **Date fields**: `fechaComprobate` is the rejection date; `fechaComprobanteRela` is the original invoice date
7. **Each record is one line item** (one article per row), not one per invoice -- group by `serie + nrodoc` to get invoice-level totals
