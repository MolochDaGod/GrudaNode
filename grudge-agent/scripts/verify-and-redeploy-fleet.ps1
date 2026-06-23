# Verify Grudge fleet connectivity and redeploy key Vercel projects
param(
    [string]$Scope = "grudgenexus",
    [string[]]$Projects = @("grudachain", "grudaagent"),
    [switch]$SkipDeploy,
    [switch]$SkipEnvSync
)

$ErrorActionPreference = "Continue"
$authPath = Join-Path $env:APPDATA "com.vercel.cli\Data\auth.json"
if (-not (Test-Path $authPath)) { throw "Vercel auth.json not found — run: vercel login" }
$token = (Get-Content $authPath -Raw | ConvertFrom-Json).token
$env:VERCEL_TOKEN = $token

$checks = @(
    @{ Name = "Nexus fleet/connect"; Url = "https://grudachain.grudge-studio.com/api/fleet/connect" },
    @{ Name = "Nexus fleet/mismatch"; Url = "https://grudachain.grudge-studio.com/api/fleet/mismatch" },
    @{ Name = "Nexus RAG status"; Url = "https://grudachain.grudge-studio.com/api/ai/rag/status" },
    @{ Name = "Grudge ID health"; Url = "https://id.grudge-studio.com/api/health" },
    @{ Name = "Game API health"; Url = "https://api.grudge-studio.com/api/health" },
    @{ Name = "AI Gateway health"; Url = "https://ai.grudge-studio.com/api/health" },
    @{ Name = "ObjectStore catalog"; Url = "https://objectstore.grudge-studio.com/api/v1/catalog" },
    @{ Name = "grudaAgent health"; Url = "https://grudaagent.vercel.app/api/health" },
    @{ Name = "grudaAgent fleet mismatch"; Url = "https://grudaagent.vercel.app/api/fleet/mismatch" },
    @{ Name = "GDevelop config"; Url = "https://grudachain.grudge-studio.com/api/gdevelop/config" },
    @{ Name = "Puter dashboard source"; Url = "https://grudachain.grudge-studio.com/puter-cloud-dashboard.html" }
)

Write-Host "`n=== Fleet connectivity ===" -ForegroundColor Cyan
$results = @()
foreach ($c in $checks) {
    try {
        $r = Invoke-WebRequest -Uri $c.Url -UseBasicParsing -TimeoutSec 20 -Method GET
        $ok = $r.StatusCode -ge 200 -and $r.StatusCode -lt 400
        $results += [pscustomobject]@{ Check = $c.Name; Status = $r.StatusCode; Ok = $ok }
        $color = if ($ok) { "Green" } else { "Yellow" }
        Write-Host ("  [{0}] {1}" -f $r.StatusCode, $c.Name) -ForegroundColor $color
    } catch {
        $results += [pscustomobject]@{ Check = $c.Name; Status = "ERR"; Ok = $false }
        Write-Host ("  [ERR] {0} — {1}" -f $c.Name, $_.Exception.Message) -ForegroundColor Red
    }
}

if (-not $SkipEnvSync) {
    Write-Host "`n=== Sync env (grudachain + grudaagent) ===" -ForegroundColor Cyan
    $syncScript = Join-Path $PSScriptRoot "set-vercel-env.ps1"
    & $syncScript -Scope $Scope
}

Write-Host "`n=== Vercel env audit (names only) ===" -ForegroundColor Cyan
$required = @{
    grudachain = @(
        "ANYTHINGLLM_API_KEY", "ANYTHINGLLM_BASE_URL", "DATABASE_URL",
        "GRUDGE_AI_KEY", "GRUDGE_AI_HUB_URL", "SUPABASE_URL", "GAME_API_URL"
    )
    grudaagent = @(
        "ANYTHINGLLM_API_KEY", "GRUDGE_AI_KEY", "GRUDGE_NEXUS_URL",
        "XAI_API_KEY", "DATABASE_URL", "GRUDGE_AUTH_URL"
    )
}

foreach ($proj in $Projects) {
    Write-Host "`n--- $proj ---" -ForegroundColor Yellow
    npx vercel link --yes --project $proj --scope $Scope --token $token 2>&1 | Out-Null
    $envList = npx vercel env ls production --scope $Scope --token $token 2>&1 | Out-String
    $present = @()
    foreach ($line in ($envList -split "`n")) {
        if ($line -match '^\s+([A-Z0-9_]+)\s') { $present += $Matches[1] }
    }
    if ($required.ContainsKey($proj)) {
        foreach ($key in $required[$proj]) {
            if ($present -contains $key) {
                Write-Host "  OK $key"
            } else {
                Write-Host "  MISSING $key" -ForegroundColor Red
            }
        }
    } else {
        Write-Host $envList
    }
}

if (-not $SkipDeploy) {
    Write-Host "`n=== Redeploy production ===" -ForegroundColor Cyan
    $deployDirs = @{
        grudachain = "C:\Users\nugye\.grok\worktrees\github-grudanode\grudachain"
        grudaagent = "C:\Users\nugye\.grok\worktrees\github-grudanode\grudgestudio\grudge-agent"
    }
    foreach ($proj in $Projects) {
        $dir = $deployDirs[$proj]
        if (-not (Test-Path $dir)) {
            Write-Host "  SKIP $proj — dir not found: $dir" -ForegroundColor Yellow
            continue
        }
        Write-Host "  Deploying $proj from $dir ..."
        Push-Location $dir
        npx vercel link --yes --project $proj --scope $Scope --token $token 2>&1 | Out-Null
        npx vercel deploy --prod --yes --scope $Scope --token $token 2>&1
        Pop-Location
    }
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize
$fail = ($results | Where-Object { -not $_.Ok }).Count
if ($fail -eq 0) { Write-Host "All connectivity checks passed." -ForegroundColor Green }
else { Write-Host "$fail connectivity check(s) failed — see above." -ForegroundColor Yellow }