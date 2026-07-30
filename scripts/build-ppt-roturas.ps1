$ErrorActionPreference = "Stop"

$outPath = "C:\Users\Movil001\OneDrive - Mercosur DRP\Escritorio\VARIOS\DPO 2026\VER\5. Gestion de prevencion de perdidas\5.3 Roturas (WQI)\Capacitacion - Roturas y WQI.pptx"

if (Test-Path $outPath) { Remove-Item $outPath -Force }

$ppt = New-Object -ComObject PowerPoint.Application
$pres = $ppt.Presentations.Add()

$ppLayoutTitle = 1   # ppLayoutTitle (titulo + subtitulo)
$ppLayoutText  = 2   # ppLayoutText  (titulo + texto)

function Add-TitleSlide($pres, $title, $subtitle) {
    $slide = $pres.Slides.Add($pres.Slides.Count + 1, $ppLayoutTitle)
    $slide.Shapes.Item(1).TextFrame.TextRange.Text = $title
    $slide.Shapes.Item(2).TextFrame.TextRange.Text = $subtitle
    return $slide
}

function Add-BulletSlide($pres, $title, $bullets) {
    $slide = $pres.Slides.Add($pres.Slides.Count + 1, $ppLayoutText)
    $slide.Shapes.Item(1).TextFrame.TextRange.Text = $title
    $body = $slide.Shapes.Item(2).TextFrame.TextRange
    $body.Text = ($bullets -join "`r")
    return $slide
}

# 1
$softBreak = [char]11
Add-TitleSlide $pres "Roturas y WQI" ("SOP de Roturas  |  Capacitacion DPO - Pilar Prevencion de Perdidas" + $softBreak + "Mercosur Region Pampeana") | Out-Null

# 2 Objetivo
Add-BulletSlide $pres "Objetivo" @(
    "Controlar y dar seguimiento a las roturas de PT generadas dentro del deposito CD.",
    "Evitar novedades de calidad en el reparto.",
    "Aplica a todo el personal de logistica que manipule producto o envases."
) | Out-Null

# 3 Definiciones
Add-BulletSlide $pres "Definiciones" @(
    "PT: Producto Terminado.",
    "CHESS: sistema para el registro de las operaciones.",
    "SKU: unidad de almacenamiento.",
    "MKTP: productos Marketplace."
) | Out-Null

# 4 RACI
Add-BulletSlide $pres "Responsabilidades (RACI)" @(
    "Operador: relevamiento de la rotura y reproceso de PT no retornable.",
    "Auxiliar de Deposito: confecciona el remito y carga la rotura en Google Forms.",
    "Supervisor de Deposito: aprueba y da de baja en el sistema.",
    "Analista Logistico: arma el informe de rotura y plan de accion.",
    "Jefe de Logistica: revision y actualizacion del SOP."
) | Out-Null

# 5 EPP
Add-BulletSlide $pres "EPP obligatorios" @(
    "Guante anticorte.",
    "Protector ocular.",
    "Casco y chaleco reflectivo.",
    "Zapato de seguridad.",
    "Barbijo.",
    "Faja lumbar."
) | Out-Null

# 6 Vidrio
Add-BulletSlide $pres "Rotura de PT en envases de VIDRIO" @(
    "El operario que detecta o causa la rotura avisa al Supervisor o Auxiliar de Deposito.",
    "El Auxiliar cuenta las cajas y unidades irrecuperables.",
    "Junto al Supervisor confeccionan un remito interno: sector, codigo, descripcion y cantidad.",
    "Se da de baja en WMS.",
    "El operador asignado limpia, recolecta los vidrios y los deposita en el contenedor del sector.",
    "Si el PT puede reprocesarse, se lleva al area de reempaque."
) | Out-Null

# 7 PET
Add-BulletSlide $pres "Rotura de PT PET" @(
    "El operario avisa al Supervisor o Auxiliar al detectar la rotura.",
    "El Auxiliar levanta los packs caidos y los lleva a la zona de reempaque para reproceso.",
    "El remito interno lo emite el encargado de reempaque al finalizar el reproceso.",
    "La rotura PET tiene que quedar identificada para poder cargarse en sistema."
) | Out-Null

# 8 Reproceso
Add-BulletSlide $pres "Reproceso" @(
    "Se segregan los productos que no pueden salir a la venta (ver Politica de Reempaque).",
    "Los productos segregados se dividen por calibres y se acomodan en el sector demarcado.",
    "Al finalizar el dia el Auxiliar emite el remito separando: rotura, pinchado y faltante."
) | Out-Null

# 9 Fuera WH
Add-BulletSlide $pres "Roturas y faltantes fuera del WH" @(
    "Rotura de Acarreo: detectada en recepcion durante el control de carga de planta.",
    "Faltante de Acarreo: detectado por el operador durante el picking o el conteo ciclico.",
    "Roturas y faltantes en Distribucion: remito emitido durante la descarga.",
    "Roturas en clasificacion de envases: el operador avisa al controlador para emitir remito."
) | Out-Null

# 10 Salida CHESS
Add-BulletSlide $pres "Salida del sistema (CHESS)" @(
    "El remito tiene que estar firmado por el SDD o Auxiliar de Deposito, con codigo, descripcion y cantidad.",
    "Aclarar en el remito el responsable (operador o chofer).",
    "Ruta en CHESS: Stock > Ingreso / consulta y movimientos.",
    "Deposito: ELDORADO o IGUAZU. Tipo de movimiento: ENS (envio a deposito).",
    "Si es transporte, asignar el numero correspondiente."
) | Out-Null

# 11 Codigos destino
Add-BulletSlide $pres "Codigos de destino en CHESS" @(
    "(2) Roturas en deposito.",
    "(3) Roturas Distribucion Eldorado.",
    "(4) Roturas Iguazu.",
    "(7) Roturas Acarreo.",
    "(12) Roturas Distribucion Iguazu.",
    "(17) Faltante Acarreo.",
    "(20) Pinchados.",
    "(21) PNC.",
    "(22) Derrame."
) | Out-Null

# 12 Informes y KPI
Add-BulletSlide $pres "Informes y KPI de rotura" @(
    "Analisis mensual a cargo del Analista Logistico, con seguimiento semanal.",
    "Se descarga del CHESS la base de envios del periodo y se exporta a Excel.",
    "KPI de rotura = HL rotos / HL entregados x 100%.",
    "En el dashboard PERDIDAS se compara por mes y contra el presupuesto anual."
) | Out-Null

# 13 WQI
Add-BulletSlide $pres "WQI y reuniones diarias" @(
    "El WQI se calcula y analiza TODOS los dias en la reunion diaria de Logistica.",
    "Queda registrado en Reunion Logistica.",
    "Si hace falta, se define un plan de accion con responsable y fecha limite."
) | Out-Null

# 14 Para recordar
Add-BulletSlide $pres "Para recordar" @(
    "Toda rotura se avisa de inmediato al Supervisor o Auxiliar de Deposito.",
    "Sin remito firmado no hay salida del sistema.",
    "Cada rotura debe llevar su clasificacion correcta (vidrio, PET, acarreo, distribucion).",
    "El reproceso siempre se segrega y se acomoda donde corresponde.",
    "WQI es diario: lo que no se mide no se mejora."
) | Out-Null

$pres.SaveAs($outPath)
$pres.Close()
$ppt.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($pres) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
[GC]::Collect()
[GC]::WaitForPendingFinalizers()

Write-Output "OK: $outPath"
