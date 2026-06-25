# Remove GLB/GLTF files sitting loose in Documents root (not in any project subfolder).
# These are typically Sketchfab/Minecraft downloads — ~56 GB in the June 2026 scan.
param([switch]$DryRun)

$root = "C:\Users\nugye\Documents"
$files = @(
    Get-ChildItem -Path (Join-Path $root "*.glb") -File -ErrorAction SilentlyContinue
    Get-ChildItem -Path (Join-Path $root "*.gltf") -File -ErrorAction SilentlyContinue
)
if (-not $files) { Write-Host "No loose GLBs in Documents root."; exit 0 }

$total = ($files | Measure-Object Length -Sum).Sum
Write-Host "Found $($files.Count) loose files, $([math]::Round($total/1GB,2)) GB"

foreach ($f in $files) {
    if ($DryRun) { Write-Host "[dry] $($f.Name) ($([math]::Round($f.Length/1MB,1)) MB)"; continue }
    Remove-Item $f.FullName -Force
    Write-Host "Removed $($f.Name)"
}

if ($DryRun) { Write-Host "Dry run only. Re-run without -DryRun to delete." }
else { Write-Host "Done. Freed ~$([math]::Round($total/1GB,2)) GB" }