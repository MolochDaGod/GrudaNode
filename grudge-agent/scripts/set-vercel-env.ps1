# Sync Grudge fleet secrets to Vercel (grudgenexus team)
# Reads canonical .env — never commit secrets into this file.
param(
    [string]$Scope = "grudgenexus",
    [string]$EnvFile = "C:\Users\nugye\Documents\1111111\GrudgeBuilder\.env"
)

$ErrorActionPreference = "Continue"
Remove-Item Env:VERCEL_TOKEN -ErrorAction SilentlyContinue

function Read-DotEnv([string]$Path) {
    $map = @{}
    if (-not (Test-Path $Path)) { throw "Env file not found: $Path" }
    Get-Content $Path | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
        $i = $_.IndexOf('=')
        $k = $_.Substring(0, $i).Trim()
        $v = $_.Substring($i + 1).Trim().Trim('"')
        $map[$k] = $v
    }
    return $map
}

$src = Read-DotEnv $EnvFile
$GRUDGE_AI_KEY = if ($src["GRUDGE_AI_KEY"]) { $src["GRUDGE_AI_KEY"] } else { $src["LEGION_HUB_API_KEY"] }
if (-not $GRUDGE_AI_KEY) { throw "GRUDGE_AI_KEY or LEGION_HUB_API_KEY missing in $EnvFile" }
$hubUrl = if ($src["GRUDGE_AI_HUB_URL"]) { $src["GRUDGE_AI_HUB_URL"] } else { "https://ai.grudge-studio.com" }

$envMap = @{
    GRUDGE_AI_KEY        = $GRUDGE_AI_KEY
    LEGION_HUB_API_KEY   = $GRUDGE_AI_KEY
    GRUDGE_AI_HUB_URL    = $hubUrl
    XAI_API_KEY          = $src["XAI_API_KEY"]
    DATABASE_URL         = $src["DATABASE_URL"]
    ELEVENLABS_API_KEY   = $src["ELEVEN_LABS_API"]
    GRUDGE_AUTH_URL      = if ($src["GRUDGE_AUTH_URL"]) { $src["GRUDGE_AUTH_URL"] } else { $src["GRUDGE_ID_URL"] }
    AUTH_GATEWAY_URL     = if ($src["AUTH_GATEWAY_URL"]) { $src["AUTH_GATEWAY_URL"] } else { "https://id.grudge-studio.com" }
    GAME_API_URL         = if ($src["GAME_API_URL"]) { $src["GAME_API_URL"] } else { "https://api.grudge-studio.com" }
    GRUDA_LEGION_URL     = "https://api.grudge-studio.com"
    GRUDGE_PLATFORM_URL  = "https://grudge-platform.vercel.app"
    GDEVELOP_URL         = "https://gdevelop-assistant.vercel.app"
    GRUDGE_R2_CDN        = $src["OBJECT_STORAGE_PUBLIC_URL"]
    GRUDGE_ASSET_API     = "https://api.grudge-studio.com"
    OPENAI_API_KEY       = $src["OPENAI_API_KEY"]
    ANTHROPIC_API_KEY    = $src["ANTHROPIC_API_KEY"]
    INTERNAL_API_KEY     = $src["INTERNAL_API_KEY"]
    ANYTHINGLLM_API_KEY  = $src["ANYTHINGLLM_API_KEY"]
    ANYTHINGLLM_BASE_URL = $src["ANYTHINGLLM_BASE_URL"]
    ANYTHINGLLM_DEFAULT_WORKSPACE = $src["ANYTHINGLLM_DEFAULT_WORKSPACE"]
    GRUDGE_NEXUS_URL     = "https://grudachain.grudge-studio.com"
    SUPABASE_URL         = $src["SUPABASE_URL"]
    SUPABASE_ANON_KEY    = if ($src["SUPABASE_ANON_KEY"]) { $src["SUPABASE_ANON_KEY"] } else { $src["SUPABASE_PUBLISHABLE_KEY"] }
    SUPABASE_SERVICE_ROLE_KEY = $src["SUPABASE_SERVICE_ROLE_KEY"]
    SESSION_SECRET       = $src["SESSION_SECRET"]
}

$fleetAi = @("GRUDGE_AI_KEY", "LEGION_HUB_API_KEY", "GRUDGE_AI_HUB_URL")
$agentFull = @("GRUDGE_AI_KEY", "LEGION_HUB_API_KEY", "GRUDGE_AI_HUB_URL", "XAI_API_KEY", "DATABASE_URL", "ELEVENLABS_API_KEY", "GRUDGE_AUTH_URL", "GRUDGE_R2_CDN", "GRUDGE_ASSET_API", "OPENAI_API_KEY", "ANYTHINGLLM_API_KEY", "ANYTHINGLLM_BASE_URL", "ANYTHINGLLM_DEFAULT_WORKSPACE", "GRUDGE_NEXUS_URL")

$nexusFull = @(
    "GRUDGE_AI_KEY", "LEGION_HUB_API_KEY", "GRUDGE_AI_HUB_URL",
    "DATABASE_URL", "GRUDGE_AUTH_URL", "AUTH_GATEWAY_URL", "GAME_API_URL",
    "GRUDA_LEGION_URL", "GRUDGE_PLATFORM_URL", "GDEVELOP_URL",
    "ANYTHINGLLM_API_KEY", "ANYTHINGLLM_BASE_URL", "ANYTHINGLLM_DEFAULT_WORKSPACE",
    "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY", "INTERNAL_API_KEY", "SESSION_SECRET"
)

$projectKeys = [ordered]@{
    "grudaagent"            = $agentFull
    "gruda-agent"           = $agentFull
    "grudachain"            = $nexusFull
    "grudgecontrol"         = $fleetAi
    "grudge-builder"        = $fleetAi + @("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "INTERNAL_API_KEY")
    "rts-grudge"            = $fleetAi
    "grudge-studio-editor"  = $fleetAi
    "grudge-game-core"      = $fleetAi
    "grudge-ui-editor"      = $fleetAi
    "grudge-game-data-hub"  = $fleetAi
    "grudgedot-launcher"    = $fleetAi
    "hero-rts"              = $fleetAi
    "grand-battle-arena"    = $fleetAi
    "flare-boss-arena"      = $fleetAi
    "asset-rig-editor"      = $fleetAi
    "grudge-mockup-sandbox" = $fleetAi
    "grudge-mech-builder"   = $fleetAi
    "voxel-builder"         = $fleetAi
}

function Add-VercelEnv([string]$Key, [string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
    foreach ($envName in @("production", "preview", "development")) {
        npx vercel env add $Key $envName --value $Value --yes --force --scope $Scope 2>&1 | Out-Null
    }
    return $true
}

Set-Location $PSScriptRoot
$results = @()

foreach ($project in $projectKeys.Keys) {
    Write-Host "=== $project ==="
    npx vercel link --yes --project $project --scope $Scope 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  SKIP link failed"
        $results += [pscustomobject]@{ Project = $project; Status = "link_failed" }
        continue
    }
    $ok = 0
    foreach ($key in $projectKeys[$project]) {
        if (Add-VercelEnv -Key $key -Value $envMap[$key]) {
            Write-Host "  OK $key"
            $ok++
        }
    }
    $results += [pscustomobject]@{ Project = $project; Status = "ok"; Vars = $ok }
}

$results | Format-Table
Write-Host "Redeploy production for env changes to apply."