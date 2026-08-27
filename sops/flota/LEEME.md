# Borradores de SOP del pilar Flota

Ocho borradores escritos el 25/08/2026 para los puntos de DPO Flota que no
tenian SOP cargado en la app, mas el programa de reconocimiento ATO del punto
4.1 (R4.2.3), escrito el 27/08/2026. Estan en HTML (la fuente, editable y versionada)
y en .docx (generado desde el HTML con Word, para revisar y firmar).

| Punto | Archivo | Estado |
|---|---|---|
| 1.4 | 1-4-residuos-de-mantenimiento | Borrador |
| 2.3 | 2-3-gestion-de-repuestos | Borrador |
| 2.4 | 2-4-mantenimiento-correctivo | Borrador |
| 3.2 | 3-2-presupuesto-de-gastos-de-flota | Borrador |
| 3.3 | 3-3-consumo-de-combustible | Borrador · hay version de Misiones para comparar |
| 3.4 | 3-4-politicas-y-gestion-de-neumaticos | Borrador |
| 4.2 | 4-2-mejoras-y-resultados-de-mantenimiento | Borrador |
| 4.3 | 4-3-metas-de-sustentabilidad | Borrador |
| 4.1 | 4-1-programa-de-reconocimiento-ato | Borrador · escrito el 27/08/2026 |

Cada uno sigue la estructura de los SOP que ya usa la operacion: objetivo,
alcance, definiciones, RACI, flujograma, campo de aplicacion, desarrollo,
control e indicadores, registros y tabla de revisiones.

El procedimiento descrito es **como funciona la app hoy**, no un ideal: los
campos, las pantallas y los indicadores que se nombran existen. Lo que queda
en blanco esta marcado "a completar" y es dato de la operacion (rangos de
consumo del fabricante, lineas de base, metas).

## Como regenerar los .docx desde el HTML

Se convierten con Word. Desde PowerShell, en la raiz del repo:

```powershell
$dir = "$PWD\sops\flota"
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
foreach ($f in Get-ChildItem -Path $dir -Filter *.html) {
  $out = [System.IO.Path]::ChangeExtension($f.FullName, ".docx")
  $doc = $word.Documents.Open($f.FullName, $false, $true)
  $doc.SaveAs2($out, 16); $doc.Close(0)
}
$word.Quit()
```

## Que falta despues de la revision

1. Revisar y aprobar cada uno (completar responsables y los campos "a completar").
2. Subirlos a la app: Pilares -> Flota -> SOP, uno por punto.
3. Fijar la meta de los indicadores que cada SOP define, en Indicadores de flota.
