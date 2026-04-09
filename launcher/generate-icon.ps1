param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot,

    [Parameter(Mandatory = $true)]
    [string]$OutputIcoPath
)

Add-Type -AssemblyName System.Drawing

$logoPath = Join-Path $ProjectRoot "launcher\assets\adco.jpg"
if (-not (Test-Path $logoPath)) {
    throw "원본 로고 파일을 찾을 수 없습니다: $logoPath"
}

$size = 256
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.Clear([System.Drawing.Color]::White)

$logoImage = [System.Drawing.Image]::FromFile($logoPath)
try {
    $padding = 10
    $targetWidth = $size - ($padding * 2)
    $targetHeight = $size - ($padding * 2)

    $scale = [Math]::Min($targetWidth / $logoImage.Width, $targetHeight / $logoImage.Height)
    $drawWidth = [int]([Math]::Round($logoImage.Width * $scale))
    $drawHeight = [int]([Math]::Round($logoImage.Height * $scale))
    $drawX = [int]([Math]::Round(($size - $drawWidth) / 2))
    $drawY = [int]([Math]::Round(($size - $drawHeight) / 2))

    $graphics.DrawImage($logoImage, $drawX, $drawY, $drawWidth, $drawHeight)
} finally {
    $logoImage.Dispose()
}

$iconHandle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)

$outputDir = Split-Path -Parent $OutputIcoPath
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

$stream = [System.IO.File]::Open($OutputIcoPath, [System.IO.FileMode]::Create)
try {
    $icon.Save($stream)
} finally {
    $stream.Close()
    $icon.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
