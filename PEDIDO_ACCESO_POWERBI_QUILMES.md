# Pedido a IT de AB-InBev / Quilmes — acceso programático a los reportes NPS y RMD

**Solicita:** MERCOSUR REGION PAMPEANA (EN FORMACION) S.R.L. (distribuidor)
**Fecha:** 17/09/2026
**Contacto técnico:** (completar)

## Qué pasa

Desde el **14/09/2026** el proceso automático que baja todas las semanas los datos de
**NPS** y **RMD (Rate My Delivery)** de los reportes de Power BI de Quilmes dejó de
funcionar. El último dato que tenemos es del **07/09/2026**.

Ese proceso alimenta el tablero de calidad de entrega del distribuidor: sin él no
podemos hacer el seguimiento de detractores ni los planes de acción por cliente, que
son parte de los requisitos de DPO (punto 4.1 de Planeamiento).

## Qué error devuelve

La autenticación se hacía con un **refresh token de usuario** (flujo device-code) de una
cuenta `@ab-inbev.com`. Hoy Azure AD rechaza la emisión del token:

```
AADSTS53003: Access has been blocked by Conditional Access policies.
The access policy does not allow token issuance.
```

Datos para rastrearlo:

| Dato | Valor |
|---|---|
| Trace ID | `afa90aa3-0a58-4d7d-b9ba-8d0d505f8100` |
| Correlation ID | `1bf72d01-e646-43b4-bec7-7eee27dae280` |
| Timestamp (UTC) | 2026-09-17 10:30:05Z |
| Tenant | `cef04b19-7776-4a94-b89b-375c77a8f936` |
| Client ID usado | `04b07795-8ddb-461a-bbee-02f9e1bf7b46` (Azure CLI) |
| Scope | `https://analysis.windows.net/powerbi/api/.default` |

El bloqueo afecta a **las dos cuentas** que veníamos usando, así que no se resuelve
volviendo a loguear: es la política, no el token. (La semana anterior el error era
`AADSTS50078` — MFA vencida —, que sí se recuperaba con un re-login manual cada pocas
semanas.)

### Verificado a mano el 17/09/2026

Hicimos el re-login (device-code) completando la autenticación **en un navegador, con la
sesión de `leomedin@ab-inbev.com` ya iniciada y desde Argentina**. Azure aceptó la
identidad y aun así cortó el acceso:

> «Ha iniciado sesión correctamente, pero **no cumple los criterios para poder acceder a
> este recurso**. Puede que haya iniciado sesión en un navegador, una aplicación o una
> **ubicación restringidos por su administrador**.»

Dos datos que probablemente expliquen la política que lo bloquea:

1. En la pantalla de confirmación, Azure informa que el dispositivo que solicita el acceso
   **se encuentra en Países Bajos** — es el datacenter donde está alojado nuestro servidor.
   Si la restricción es por ubicación, ése es el disparador.
2. La aplicación que figura pidiendo el token es **"Microsoft Azure Cross-platform Command
   Line Interface"** (Azure CLI), que suele estar restringida por política.

Con esto confirmamos que **no es algo que podamos resolver de nuestro lado**: la
autenticación es válida y el bloqueo es de la política del tenant.

## Qué pedimos (cualquiera de las dos nos sirve)

**Opción A — Service principal (preferida).** Un registro de aplicación en el tenant de
AB-InBev con permiso de lectura sobre el workspace donde viven estos dos reportes:

- Reporte **NPS**: `b5db778d-0318-4ed7-a681-3ff2a0430cfb` (páginas "Base Distri" y "Detalle Distri")
- Reporte **RMD**: `f7a458f2-d501-40f6-875b-e5ccf13cb19e` (página "BASE Distribuidores")

Alcance mínimo: solo lectura, solo los datos filtrados a nuestro distribuidor. Requiere
habilitar "Service principals can use Power BI APIs" para ese grupo de seguridad.
Esta opción no vence ni depende de que una persona esté disponible para el MFA.

**Opción B — Excepción de Conditional Access.** Permitir la emisión de token para la
cuenta de servicio contra la API de Power BI desde nuestra IP fija de salida
(la informamos cuando nos digan a quién).

## Mientras tanto

Estamos cargando los datos a mano con el export del reporte. Funciona, pero depende de
que alguien se acuerde de hacerlo todas las semanas, así que no es sostenible como
proceso definitivo.
