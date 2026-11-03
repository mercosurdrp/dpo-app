# Arma el PPT de la capacitacion de LUCES del checklist de flota.
#
# El contenido vive en ppt-capacitacion-luces.json y NO en este archivo:
# Windows PowerShell 5.1 lee los .ps1 sin BOM como ANSI y los acentos salen
# roto. El JSON se lee explicitamente como UTF-8, asi que las tildes y las
# enies llegan bien a las diapositivas.
#
# Correr desde la raiz del repo (necesita PowerPoint instalado):
#   powershell -ExecutionPolicy Bypass -File scripts/build-ppt-capacitacion-luces.ps1

$ErrorActionPreference = "Stop"

$jsonPath = Join-Path $PSScriptRoot "ppt-capacitacion-luces.json"
$cfg = [System.IO.File]::ReadAllText($jsonPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json

$outPath = $cfg.salida
if (Test-Path $outPath) { Remove-Item $outPath -Force }

$ppLayoutTitle = 1   # titulo + subtitulo
$ppLayoutText  = 2   # titulo + cuerpo de texto
$softBreak = [char]11   # salto de linea dentro del mismo parrafo (sin vineta)

$ppt = New-Object -ComObject PowerPoint.Application
$pres = $ppt.Presentations.Add()

foreach ($s in $cfg.slides) {
  if ($s.tipo -eq "titulo") {
    $slide = $pres.Slides.Add($pres.Slides.Count + 1, $ppLayoutTitle)
    $slide.Shapes.Item(1).TextFrame.TextRange.Text = $s.titulo
    # El "|" del JSON marca el corte de linea del subtitulo.
    $slide.Shapes.Item(2).TextFrame.TextRange.Text = ($s.subtitulo -replace "\|", $softBreak)
    continue
  }

  $slide = $pres.Slides.Add($pres.Slides.Count + 1, $ppLayoutText)
  $slide.Shapes.Item(1).TextFrame.TextRange.Text = $s.titulo

  $body = $slide.Shapes.Item(2).TextFrame.TextRange
  # El "- " al principio de una linea la baja un nivel de vineta.
  $lineas = @($s.bullets | ForEach-Object { $_ -replace "^- ", "" })
  $body.Text = ($lineas -join "`r")

  for ($i = 1; $i -le $s.bullets.Count; $i++) {
    if ($s.bullets[$i - 1].StartsWith("- ")) {
      $body.Paragraphs($i).IndentLevel = 2
    }
  }

  # Con 6 u 8 lineas el autoajuste de PowerPoint las deja ilegibles de lejos:
  # el cuerpo se fija a mano segun cuanto texto entra.
  if ($s.bullets.Count -ge 6) { $body.Font.Size = 18 } else { $body.Font.Size = 22 }
}

$pres.SaveAs($outPath)
$pres.Close()
$ppt.Quit()

"Listo: $outPath ($($cfg.slides.Count) diapositivas)"
