# Upload test files to GitHub via API
$token = (gh auth token)
$headers = @{
    Authorization = "Bearer $token"
    Accept = "application/vnd.github.v3+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}
$repo = "13485338861/TrailTrace"
$baseTree = "3230d429bba5adbceb0cc24661eb0b44f1fcb462"
$parent = "3230d429bba5adbceb0cc24661eb0b44f1fcb462"

# Create blobs
$files = @(
    @{path="tests/utils.test.ts"; file="C:\Users\Admin\.qclaw\workspace-agent-8b13c56f\app\tests\utils.test.ts"},
    @{path="tests/gpx.test.ts"; file="C:\Users\Admin\.qclaw\workspace-agent-8b13c56f\app\tests\gpx.test.ts"},
    @{path="jest.config.js"; file="C:\Users\Admin\.qclaw\workspace-agent-8b13c56f\app\jest.config.js"},
    @{path="tsconfig.test.json"; file="C:\Users\Admin\.qclaw\workspace-agent-8b13c56f\app\tsconfig.test.json"}
)

$treeItems = @()

foreach ($f in $files) {
    $content = Get-Content $f.file -Raw
    $contentBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($content))
    $body = @{ content = $contentBase64 } | ConvertTo-Json -Compress
    $resp = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/blobs" -Method POST -Headers $headers -Body $body -ContentType "application/json"
    $treeItems += @{ path = $f.path; mode = "100644"; type = "blob"; sha = $resp.sha }
    Write-Host "Uploaded blob: $($f.path) -> $($resp.sha)"
}

# Create tree
$treeBody = @{ base_tree = $baseTree; tree = $treeItems } | ConvertTo-Json -Depth 10
$treeResp = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/trees" -Method POST -Headers $headers -Body $treeBody -ContentType "application/json"
Write-Host "Created tree: $($treeResp.sha)"

# Create commit
$commitMsg = "feat: add unit tests for utils and GPX (`n- 26 tests passing, jest + ts-jest + jsdom `n- utils: haversine/distance/speed/elevation/id/format `n- gpx: parse/toGPX with trkpt/wpt/escape"
$commitBody = @{
    message = $commitMsg
    tree = $treeResp.sha
    parents = @($parent)
} | ConvertTo-Json -Compress
$commitResp = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/commits" -Method POST -Headers $headers -Body $commitBody -ContentType "application/json"
Write-Host "Created commit: $($commitResp.sha)"

# Update ref
$refBody = @{ sha = $commitResp.sha } | ConvertTo-Json -Compress
$null = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/refs/heads/master" -Method PATCH -Headers $headers -Body $refBody -ContentType "application/json"
Write-Host "Ref updated to master"