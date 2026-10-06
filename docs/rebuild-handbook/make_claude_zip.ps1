# Creates smart-mine-claude-pack.zip at repo root for Claude book generation.
# Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File docs/rebuild-handbook/make_claude_zip.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

$OutZip = Join-Path $RepoRoot "smart-mine-claude-pack.zip"
if (Test-Path $OutZip) { Remove-Item $OutZip -Force }

$Stage = Join-Path $env:TEMP ("smart-mine-claude-pack-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $Stage | Out-Null

function Copy-Tree($Rel) {
  $src = Join-Path $RepoRoot $Rel
  if (-not (Test-Path $src)) { Write-Warning "skip missing $Rel"; return }
  $dst = Join-Path $Stage $Rel
  New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
  Copy-Item -Recurse -Force $src $dst
}

# Core sources (exclude heavy/generated junk via filtered copy for frontend/backend)
Copy-Tree "config"
Copy-Tree "docs"
Copy-Item (Join-Path $RepoRoot "README.md") (Join-Path $Stage "README.md") -Force
Copy-Item (Join-Path $RepoRoot "docker-compose.yml") (Join-Path $Stage "docker-compose.yml") -Force
if (Test-Path (Join-Path $RepoRoot ".env.example")) {
  Copy-Item (Join-Path $RepoRoot ".env.example") (Join-Path $Stage ".env.example") -Force
}

# Backend without caches
$BackendDst = Join-Path $Stage "backend"
New-Item -ItemType Directory -Path $BackendDst | Out-Null
robocopy (Join-Path $RepoRoot "backend") $BackendDst /E /XD __pycache__ .pytest_cache .venv venv /XF *.pyc /NFL /NDL /NJH /NJS | Out-Null

# Frontend without node_modules/dist
$FrontendDst = Join-Path $Stage "frontend"
New-Item -ItemType Directory -Path $FrontendDst | Out-Null
robocopy (Join-Path $RepoRoot "frontend") $FrontendDst /E /XD node_modules dist .vite coverage /NFL /NDL /NJH /NJS | Out-Null

# Ensure prompt is obvious at zip root
Copy-Item (Join-Path $RepoRoot "docs\CLAUDE_BOOK_PROMPT.md") (Join-Path $Stage "READ_ME_FIRST_CLAUDE_PROMPT.md") -Force

Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $OutZip -Force
Remove-Item -Recurse -Force $Stage

$SizeMb = [math]::Round((Get-Item $OutZip).Length / 1MB, 2)
Write-Host "Created $OutZip ($SizeMb MB)"
Write-Host "Upload this zip to Claude, then paste the prompt from docs/CLAUDE_BOOK_PROMPT.md (or READ_ME_FIRST_CLAUDE_PROMPT.md inside the zip)."
