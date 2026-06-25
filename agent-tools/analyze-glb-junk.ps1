# Analyze documents-glb-scan.json — find space hogs, root junk, CDN-ready purges
param([string]$ScanJson = (Join-Path $PSScriptRoot "documents-glb-scan.json"))

$rows = Get-Content $ScanJson -Raw | ConvertFrom-Json
$cdn = "https://assets.grudge-studio.com"

function Test-Cdn($r2Key) {
    try {
        $r = Invoke-WebRequest -Uri "$cdn/$r2Key" -Method Head -UseBasicParsing -TimeoutSec 8
        return $r.StatusCode -eq 200
    } catch { return $false }
}

# Rough R2 key from path (matches audit script naming)
function Get-R2KeyGuess($fullPath, $fileName) {
    $base = [IO.Path]::GetFileNameWithoutExtension($fileName).ToLower() -replace '[^a-z0-9]+','_'
    if ($fullPath -match 'animation') { return "models/animations/$base.glb" }
    if ($fullPath -match 'weapon|bow|sword|gun|axe') { return "models/weapons/$base.glb" }
    if ($fullPath -match 'character|humanoid|knight|elf|orc') { return "models/characters/$base.glb" }
    if ($fullPath -match 'environment|terrain|map|tree|building') { return "models/environments/$base.glb" }
    return "models/imported/$base.glb"
}

$rootLoose = $rows | Where-Object { $_.FullName -match '^C:\\Users\\nugye\\Documents\\[^\\]+\.glb$' }
$over200 = $rows | Where-Object { $_.Length -gt 200MB }

Write-Host "=== GLB inventory ==="
Write-Host "Total: $($rows.Count) files, $([math]::Round(($rows | Measure-Object Length -Sum).Sum/1GB,2)) GB"
Write-Host "Loose in Documents root: $($rootLoose.Count) files, $([math]::Round(($rootLoose | Measure-Object Length -Sum).Sum/1GB,2)) GB"
Write-Host "Over 200 MB (skipped by default pipeline): $($over200.Count) files"

Write-Host "`n=== Top 15 space hogs ==="
$rows | Sort-Object Length -Descending | Select-Object -First 15 | ForEach-Object {
    Write-Host ("  {0,7:N1} MB  {1}" -f ($_.Length/1MB), $_.FullName)
}

$report = Join-Path $PSScriptRoot "glb-junk-report.txt"
@(
    "Generated: $(Get-Date -Format o)",
    "Root loose files ($($rootLoose.Count)):",
    ($rootLoose | Sort-Object Length -Descending | ForEach-Object { "{0}`t{1}" -f $_.Length, $_.FullName }),
    "",
    "Over 200MB:",
    ($over200 | Sort-Object Length -Descending | ForEach-Object { "{0}`t{1}" -f $_.Length, $_.FullName })
) | Set-Content $report -Encoding utf8
Write-Host "`nReport: $report"