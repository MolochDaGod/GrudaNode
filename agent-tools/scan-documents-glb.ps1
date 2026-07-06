# Fast NDJSON scan — one line per file, low memory
$root = "C:\Users\nugye\Documents"
$out = Join-Path $PSScriptRoot "documents-glb-scan.ndjson"
$skip = @('node_modules','.git','Library','Temp','Logs','Cache','DerivedDataCache','Build','obj','bin','.vs','.idea')
if (Test-Path $out) { Remove-Item $out -Force }
$count = 0
Get-ChildItem -Path $root -Recurse -Include *.glb,*.gltf -File -ErrorAction SilentlyContinue | ForEach-Object {
  $parts = $_.FullName.Split([IO.Path]::DirectorySeparatorChar)
  if ($parts | Where-Object { $skip -contains $_ }) { return }
  $obj = [ordered]@{ fullPath = $_.FullName; size = $_.Length; mtime = $_.LastWriteTimeUtc.ToString('o') }
  ($obj | ConvertTo-Json -Compress) | Add-Content -Path $out -Encoding utf8
  $count++
  if ($count % 100 -eq 0) { Write-Host "scanned $count" }
}
Write-Host "DONE total=$count file=$out"