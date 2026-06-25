# Grudge asset migration — local disk cleanup
# 1) Refresh scan  2) Purge CDN duplicates  3) Upload+purge stragglers  4) Optional worktree junk removal
param(
    [switch]$SkipScan,
    [switch]$RemoveWorktreeJunk,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$scanOut = Join-Path $here "documents-glb-scan.ndjson"
$rts = "C:\Users\nugye\.grok\worktrees\github-grudanode\RTS-Grudge"
$deployRoot = Split-Path $here -Parent

function Invoke-Audit {
    param([string[]]$ExtraArgs)
    Push-Location $rts
    try {
        $cmd = @("npx", "tsx", "scripts/audit-documents-assets.ts", "--from-json", $scanOut) + $ExtraArgs
        Write-Host ">> $($cmd -join ' ')"
        if (-not $DryRun) { & npx tsx scripts/audit-documents-assets.ts --from-json $scanOut @ExtraArgs }
        else { Write-Host "(dry-run: skipped)" }
    } finally { Pop-Location }
}

if (-not $SkipScan) {
    Write-Host "=== Refresh GLB scan ==="
    if (-not $DryRun) { & (Join-Path $here "scan-documents-glb.ps1") }
}

Write-Host "=== Purge CDN-verified duplicates (no upload) ==="
Invoke-Audit @("--purge-only")

Write-Host "=== Upload remaining + purge ==="
Invoke-Audit @("--upload", "--purge", "--priority", "--max-mb", "200")

if ($RemoveWorktreeJunk) {
    Write-Host "=== Remove stray worktree folders ==="
    $junk = @(
        "Grudge-Studio-Game",
        "grudgedot-launcher-temp",
        "CoreGRUDA-temp",
        "grudge-coregruda",
        "grudge-game-core",
        "grudge-ui-editor",
        "voxel-builder",
        ".wrangler",
        "terminals",
        ".gemini"
    )
    foreach ($name in $junk) {
        $p = Join-Path $deployRoot $name
        if (-not (Test-Path $p)) { continue }
        $mb = [math]::Round((Get-ChildItem $p -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum / 1MB, 1)
        if ($DryRun) { Write-Host "[dry] would remove $name ($mb MB)"; continue }
        Write-Host "Removing $name ($mb MB)…"
        Remove-Item $p -Recurse -Force -EA Stop
    }
}

Write-Host "=== Done ==="