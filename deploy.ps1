param(
  [int]$RenderTimeoutSeconds = 600
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$renderHealthUrl = 'https://backend-xkwn.onrender.com/api/healthz'
$renderReleaseCheckUrl = 'https://backend-xkwn.onrender.com/api/admin/media'
$audiencesCheckUrl = 'https://backend-xkwn.onrender.com/api/audiences'
$adminCategoriesCheckUrl = 'https://backend-xkwn.onrender.com/api/admin/categories'
$adminAudiencesCheckUrl = 'https://backend-xkwn.onrender.com/api/admin/audiences'

Push-Location $repoRoot
try {
  if ((git branch --show-current) -ne 'main') {
    throw 'Deploy from the main branch.'
  }

  if ((git status --porcelain) -ne '') {
    throw 'Commit or stash all changes before deploying.'
  }

  Write-Host 'Building and testing the workspace...'
  pnpm run build
  if ($LASTEXITCODE -ne 0) {
    throw 'Workspace build or tests failed.'
  }

  Write-Host 'Pushing main to trigger the Render deployment...'
  git push origin main
  if ($LASTEXITCODE -ne 0) {
    throw 'Push to origin/main failed.'
  }

  $deadline = (Get-Date).AddSeconds($RenderTimeoutSeconds)
  $renderReady = $false
  Write-Host 'Waiting for Render to serve the new API...'
  while ((Get-Date) -lt $deadline) {
    $healthStatus = & curl.exe --silent --output NUL --write-out '%{http_code}' --max-time 15 $renderHealthUrl
    $mediaStatus = & curl.exe --silent --output NUL --write-out '%{http_code}' --max-time 15 $renderReleaseCheckUrl
    $audiencesStatus = & curl.exe --silent --output NUL --write-out '%{http_code}' --max-time 15 $audiencesCheckUrl
    $categoryRouteStatus = & curl.exe --silent --output NUL --write-out '%{http_code}' --max-time 15 --request POST --header 'Content-Type: application/json' --data '{}' $adminCategoriesCheckUrl
    $adminAudiencesRouteStatus = & curl.exe --silent --output NUL --write-out '%{http_code}' --max-time 15 --request POST --header 'Content-Type: application/json' --data '{}' $adminAudiencesCheckUrl
    if ($LASTEXITCODE -eq 0 -and $healthStatus -eq '200' -and $mediaStatus -eq '401' -and $audiencesStatus -eq '200' -and $categoryRouteStatus -eq '401' -and $adminAudiencesRouteStatus -eq '401') {
      $renderReady = $true
      break
    }
    Start-Sleep -Seconds 15
  }

  if (-not $renderReady) {
    throw "Render did not become ready within $RenderTimeoutSeconds seconds. Cloudflare was not deployed."
  }

  Write-Host 'Render is healthy. Deploying the frontend and Worker to Cloudflare...'
  pnpm --filter @workspace/ai-recipes run deploy
  if ($LASTEXITCODE -ne 0) {
    throw 'Cloudflare deployment failed.'
  }

  Write-Host 'Frontend and backend deployment completed.'
}
finally {
  Pop-Location
}
