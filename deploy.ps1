param(
  [int]$RenderTimeoutSeconds = 600,
  [int]$FrontendTimeoutSeconds = 180,
  [switch]$SkipE2E
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendBaseUrl = 'https://quiet-haze-04ca.trilogenix.workers.dev'
$renderHealthUrl = 'https://backend-xkwn.onrender.com/api/healthz'
$renderReleaseCheckUrl = 'https://backend-xkwn.onrender.com/api/admin/media'
$audiencesCheckUrl = 'https://backend-xkwn.onrender.com/api/audiences'
$adminCategoriesCheckUrl = 'https://backend-xkwn.onrender.com/api/admin/categories'
$categoryDeleteCheckUrl = 'https://backend-xkwn.onrender.com/api/admin/categories/not-a-number'
$adminAudiencesCheckUrl = 'https://backend-xkwn.onrender.com/api/admin/audiences'
$bulkUpdateCheckUrl = 'https://backend-xkwn.onrender.com/api/admin/recipes/bulk-update'
$bulkDeleteCheckUrl = 'https://backend-xkwn.onrender.com/api/admin/recipes/bulk-delete'
$csvImportCheckUrl = 'https://backend-xkwn.onrender.com/api/admin/recipes/import-csv'

function Get-HttpStatus {
  param(
    [string]$Url,
    [switch]$PostJson,
    [switch]$Delete
  )

  $curlArgs = @('--silent', '--output', 'NUL', '--write-out', '%{http_code}', '--max-time', '15')
  if ($PostJson) {
    $curlArgs += @('--request', 'POST', '--header', 'Content-Type: application/json', '--data', '{}')
  }
  if ($Delete) {
    $curlArgs += @('--request', 'DELETE')
  }
  $curlArgs += $Url

  $status = & curl.exe @curlArgs
  if ($LASTEXITCODE -ne 0) {
    return '000'
  }
  return [string]$status
}

Push-Location $repoRoot
try {
  if ((git branch --show-current) -ne 'main') {
    throw 'Deploy from the main branch.'
  }
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to determine the current Git branch.'
  }

  $worktreeStatus = git status --porcelain
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to inspect the Git worktree.'
  }
  if ($worktreeStatus) {
    throw 'Commit or stash all changes before deploying.'
  }

  if ($RenderTimeoutSeconds -le 0 -or $FrontendTimeoutSeconds -le 0) {
    throw 'Deployment timeouts must be positive integers.'
  }

  if ($SkipE2E) {
    Write-Warning 'Skipping E2E tests as explicitly requested. Running typecheck, package builds, and unit tests.'
    pnpm run typecheck
    if ($LASTEXITCODE -ne 0) {
      throw 'Workspace typecheck failed.'
    }
    pnpm -r --if-present run build
    if ($LASTEXITCODE -ne 0) {
      throw 'Workspace package build failed.'
    }
    pnpm run test
    if ($LASTEXITCODE -ne 0) {
      throw 'Workspace unit tests failed.'
    }
  }
  else {
    Write-Host 'Building and testing the workspace, including E2E...'
    pnpm run build
    if ($LASTEXITCODE -ne 0) {
      throw 'Workspace build or tests failed.'
    }
  }

  $deployCommit = (git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $deployCommit) {
    throw 'Unable to determine the commit being deployed.'
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
    $healthStatus = Get-HttpStatus -Url $renderHealthUrl
    $mediaStatus = Get-HttpStatus -Url $renderReleaseCheckUrl
    $audiencesStatus = Get-HttpStatus -Url $audiencesCheckUrl
    $categoryRouteStatus = Get-HttpStatus -Url $adminCategoriesCheckUrl -PostJson
    $categoryDeleteStatus = Get-HttpStatus -Url $categoryDeleteCheckUrl -Delete
    $adminAudiencesRouteStatus = Get-HttpStatus -Url $adminAudiencesCheckUrl -PostJson
    $bulkUpdateRouteStatus = Get-HttpStatus -Url $bulkUpdateCheckUrl -PostJson
    $bulkDeleteRouteStatus = Get-HttpStatus -Url $bulkDeleteCheckUrl -PostJson
    $csvImportRouteStatus = Get-HttpStatus -Url $csvImportCheckUrl -PostJson
    if ($healthStatus -eq '200' -and $mediaStatus -eq '401' -and $audiencesStatus -eq '200' -and $categoryRouteStatus -eq '401' -and $categoryDeleteStatus -eq '401' -and $adminAudiencesRouteStatus -eq '401' -and $bulkUpdateRouteStatus -eq '401' -and $bulkDeleteRouteStatus -eq '401' -and $csvImportRouteStatus -eq '401') {
      $renderReady = $true
      break
    }
    Start-Sleep -Seconds 15
  }

  if (-not $renderReady) {
    throw "Render did not become ready within $RenderTimeoutSeconds seconds. Cloudflare was not deployed."
  }

  Write-Host "Render API is healthy. Deploying commit $deployCommit to Cloudflare..."
  pnpm --filter @workspace/ai-recipes run deploy
  if ($LASTEXITCODE -ne 0) {
    throw 'Cloudflare deployment failed.'
  }

  $frontendDeadline = (Get-Date).AddSeconds($FrontendTimeoutSeconds)
  $frontendReady = $false
  Write-Host 'Checking the live frontend routes and assets...'
  while ((Get-Date) -lt $frontendDeadline) {
    $frontendReady = $true
    foreach ($path in @('/', '/sign-in', '/sign-up', '/taskbakeai-wordmark-light.png', '/taskbakeai-wordmark.png', '/taskbakeai-mark.png')) {
      $status = Get-HttpStatus -Url "$frontendBaseUrl$path"
      if ($status -ne '200') {
        Write-Host "Waiting for $path (HTTP $status)..."
        $frontendReady = $false
        break
      }
    }
    if ($frontendReady) {
      break
    }
    Start-Sleep -Seconds 5
  }

  if (-not $frontendReady) {
    throw "Cloudflare frontend routes did not become ready within $FrontendTimeoutSeconds seconds."
  }

  $pageHtml = & curl.exe --fail --silent --show-error --max-time 30 "$frontendBaseUrl/"
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to download the deployed frontend document.'
  }
  $stylesheetMatch = [regex]::Match([string]::Join('', $pageHtml), 'href="([^"]+\.css)"')
  if (-not $stylesheetMatch.Success) {
    throw 'The deployed frontend document did not reference a stylesheet.'
  }

  $stylesheetUrl = [uri]::new([uri]$frontendBaseUrl, $stylesheetMatch.Groups[1].Value).AbsoluteUri
  $stylesheetDeadline = (Get-Date).AddSeconds($FrontendTimeoutSeconds)
  $stylesheetReady = $false
  while ((Get-Date) -lt $stylesheetDeadline) {
    $stylesheet = & curl.exe --fail --silent --show-error --max-time 30 $stylesheetUrl
    if ($LASTEXITCODE -eq 0 -and [string]::Join('', $stylesheet) -match '\.auth-workflow-canvas') {
      $stylesheetReady = $true
      break
    }
    Write-Host 'Waiting for the deployed stylesheet to become available...'
    Start-Sleep -Seconds 5
  }

  if (-not $stylesheetReady) {
    throw 'The deployed stylesheet is missing the desktop authentication redesign.'
  }

  Write-Host "Deployment completed and verified for commit $deployCommit."
}
finally {
  Pop-Location
}
