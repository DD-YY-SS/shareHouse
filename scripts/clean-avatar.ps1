param([string]$InputPath = 'public/minji-pixel.png', [string]$OutputPath = 'public/minji-avatar.png')
Add-Type -AssemblyName System.Drawing
$source = [Drawing.Bitmap]::FromFile((Resolve-Path $InputPath))
$bitmap = New-Object Drawing.Bitmap(256,256,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics=[Drawing.Graphics]::FromImage($bitmap)
$graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$graphics.PixelOffsetMode=[Drawing.Drawing2D.PixelOffsetMode]::Half
$graphics.DrawImage($source,0,0,256,256)
$graphics.Dispose()
$source.Dispose()
$visited = New-Object 'bool[,]' $bitmap.Width,$bitmap.Height
$queue = New-Object 'System.Collections.Generic.Queue[System.Drawing.Point]'
$queue.Enqueue([Drawing.Point]::new(0,0))
$minX=$bitmap.Width; $minY=$bitmap.Height; $maxX=0; $maxY=0
while($queue.Count -gt 0){
  $point=$queue.Dequeue(); $x=$point.X; $y=$point.Y
  if($x -lt 0 -or $y -lt 0 -or $x -ge $bitmap.Width -or $y -ge $bitmap.Height -or $visited[$x,$y]){continue}
  $visited[$x,$y]=$true; $color=$bitmap.GetPixel($x,$y)
  if($color.R -lt 225 -or $color.G -lt 225 -or $color.B -lt 225){continue}
  $bitmap.SetPixel($x,$y,[Drawing.Color]::FromArgb(0,$color.R,$color.G,$color.B))
  $queue.Enqueue([Drawing.Point]::new($x+1,$y));$queue.Enqueue([Drawing.Point]::new($x-1,$y));$queue.Enqueue([Drawing.Point]::new($x,$y+1));$queue.Enqueue([Drawing.Point]::new($x,$y-1))
}
for($y=0;$y -lt $bitmap.Height;$y++){for($x=0;$x -lt $bitmap.Width;$x++){if($bitmap.GetPixel($x,$y).A -gt 0){if($x -lt $minX){$minX=$x};if($x -gt $maxX){$maxX=$x};if($y -lt $minY){$minY=$y};if($y -gt $maxY){$maxY=$y}}}}
$rect=[Drawing.Rectangle]::new([Math]::Max(0,$minX-8),[Math]::Max(0,$minY-8),[Math]::Min($bitmap.Width-$minX+8,$maxX-$minX+17),[Math]::Min($bitmap.Height-$minY+8,$maxY-$minY+17))
$cropped=$bitmap.Clone($rect,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
$cropped.Save((Join-Path (Get-Location) $OutputPath),[Drawing.Imaging.ImageFormat]::Png)
$cropped.Dispose();$bitmap.Dispose()
