<#
.SYNOPSIS
  Export variables from a local .env file to GitHub repository secrets using the GitHub CLI (`gh`).

USAGE
  1) Install GitHub CLI: https://cli.github.com/
  2) Authenticate: `gh auth login`
  3) From the repo root run (PowerShell):
       pwsh scripts/export-dotenv-to-gh-secrets.ps1
     or dry-run to preview without setting:
       pwsh scripts/export-dotenv-to-gh-secrets.ps1 -DryRun

NOTES
  - This reads the repo-root `.env` file. It will skip blank lines and lines starting with `#`.
  - Do NOT commit your `.env` file. This script only uploads secrets to the remote GitHub repository.
  - You must have write access to the repository and `gh` must be authenticated.
#>

param(
  [string]$EnvPath = ".env",
  [switch]$DryRun
)

if (-not (Test-Path $EnvPath)) {
  Write-Error "Env file not found at: $EnvPath"
  exit 1
}

# Read and parse .env (simple KEY=VALUE parser)
try {
  $content = Get-Content -Raw -Path $EnvPath -ErrorAction Stop
} catch {
  Write-Error ("Failed to read {0}: {1}" -f $EnvPath, $_)
  exit 1
}

$lines = $content -split "`r?`n"
$entries = @()
foreach ($line in $lines) {
  $trim = $line.Trim()
  if ([string]::IsNullOrWhiteSpace($trim)) { continue }
  if ($trim.StartsWith('#')) { continue }
  $entries += $trim
}

if ($entries.Count -eq 0) {
  Write-Output "No variables found in $EnvPath"
  exit 0
}

Write-Output "Found $($entries.Count) entries in $EnvPath"

foreach ($entry in $entries) {
  if ($entry -match '^(?<k>[^=]+)=(?<v>.*)$') {
    $key = $Matches['k'].Trim()
    $val = $Matches['v']
    # Strip surrounding single/double quotes if present (avoid regex quoting issues)
    if ($val -ne $null -and $val.Length -ge 2) {
      $first = $val[0]
      $last = $val[$val.Length - 1]
      if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
        $val = $val.Substring(1, $val.Length - 2)
      }
    }

    if ($DryRun) {
      Write-Output "DRYRUN: would set secret '$key'"
      continue
    }

    Write-Output "Setting secret '$key'..."
    try {
      & gh secret set $key --body "$val"
      if ($LASTEXITCODE -ne 0) {
        Write-Warning "gh returned exit code $LASTEXITCODE while setting '$key'"
      }
    } catch {
      Write-Warning ("Failed to set secret '{0}': {1}" -f $key, $_)
    }
  } else {
    Write-Verbose "Skipping non KEY=VALUE line: $entry"
  }
}

Write-Output "Done. If you didn't run with -DryRun, secrets were uploaded to the current GitHub repository (as configured in gh)."
