# Builds the Working Title WT21 (Collins Pro Line style, as used by the CJ4) from the Microsoft avionics mirror, entirely locally.
#
# Chain (same idea as C:\Projetos\f27-efis\build-g1000.ps1): wtlinesdk -> wt21 shared (+ .tgz) -> wt21 instruments (PFD, MFD, FMC).
# The mirror needs @microsoft/msfs-sdk 2.4.3, @microsoft/msfs-wtlinesdk 0.1.0-dev.7 and msfs-wt21-shared 3.2.13, none of which are on npm
# in those versions (npm has sdk 2.3.3, wtlinesdk dev.5, wt21 3.2.8), so they are built from the mirror sources and packed as local tarballs.
# The msfs-sdk tarball must already exist: run C:\Projetos\f27-efis\build-g1000.ps1 first.
# tspc is called with forceConsistentCasingInFileNames off for the same ADC.ts/Adc.ts reason as the G1000 build.
# The original npm scripts copy css/assets with `robocopy` using an odd argument order; this script copies them explicitly instead.
#
# Usage: powershell -ExecutionPolicy Bypass -File C:\Projetos\f27-g1000\tools\build-wt21.ps1
$ErrorActionPreference = 'Stop'
$mirror = 'C:\Projetos\msfs-avionics-mirror\src'
$lp     = 'C:\Projetos\f27-efis\localpkgs'
$sdkTgz = "$lp\microsoft-msfs-sdk-2.4.3.tgz"
if (-not (Test-Path $sdkTgz)) { throw "missing $sdkTgz; run C:\Projetos\f27-efis\build-g1000.ps1 first" }

function Run([string]$what, [scriptblock]$body) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { & $body 2>&1 | Out-Host; if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" } }
    finally { $ErrorActionPreference = $prev }
    "ok: $what"
}

function New-LocalPackage([string]$name, [string]$version, [string]$libFile, [string]$srcDist, [string[]]$extraFiles = @()) {
    # Mimics the published layout: <lib>.js + <lib>-iife.js + <lib>.d.ts (+ extras) + package.json
    $stage = "$lp\stage\$name"
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item -ItemType Directory -Force $stage | Out-Null
    Copy-Item "$srcDist\$libFile.js"   "$stage\$libFile.js"      -Force
    Copy-Item "$srcDist\$libFile.js"   "$stage\$libFile-iife.js" -Force
    Copy-Item "$srcDist\$libFile.d.ts" "$stage\$libFile.d.ts"    -Force
    foreach ($e in $extraFiles) { Copy-Item "$srcDist\$e" "$stage\$e" -Force }
    @{ name = "@microsoft/$name"; version = $version; main = "$libFile.js"; typings = "$libFile.d.ts"; license = 'MIT' } |
        ConvertTo-Json | Set-Content "$stage\package.json" -Encoding utf8
    Push-Location $stage
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'   # npm prints "npm notice" on stderr
    try { npm pack --pack-destination $lp 2>&1 | Out-Null } finally { $ErrorActionPreference = $prev; Pop-Location }
}

function Copy-Tree([string]$src, [string]$dst, [string[]]$include) {
    # Copies files matching $include (e.g. *.css) from $src to $dst keeping the relative layout; skips node_modules/build/dist.
    foreach ($f in Get-ChildItem $src -Recurse -File -Include $include) {
        if ($f.FullName -match '\\(node_modules|build|dist)\\') { continue }
        $rel = $f.FullName.Substring($src.Length).TrimStart('\')
        $target = Join-Path $dst $rel
        New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
        Copy-Item $f.FullName $target -Force
    }
}

# 1) wtlinesdk
$wl = "$mirror\wtlinesdk"
Push-Location $wl
try {
    Run 'wtlinesdk install'  { npm install --no-save --ignore-scripts --no-audit --no-fund $sdkTgz }
    Run 'wtlinesdk compile'  { npx tspc --forceConsistentCasingInFileNames false }
    Run 'wtlinesdk bundle'   { npx rollup -c rollup.config.mjs }
} finally { Pop-Location }
New-LocalPackage 'msfs-wtlinesdk' '0.1.0-dev.7' 'wtlinesdk' "$wl\dist"
$wlTgz = "$lp\microsoft-msfs-wtlinesdk-0.1.0-dev.7.tgz"
if (-not (Test-Path $wlTgz)) { throw "missing $wlTgz" }

# 2) wt21 shared (also produces dist\msfs-wt21-shared-3.2.13.tgz, which the instruments package references by relative path)
$sh = "$mirror\workingtitle-instruments-wt21\shared"
Push-Location $sh
try {
    Run 'shared install'  { npm install --no-save --ignore-scripts --no-audit --no-fund $sdkTgz $wlTgz }
    Run 'shared compile'  { npx tspc --forceConsistentCasingInFileNames false }
    Copy-Tree $sh "$sh\build" @('*.css')
    Run 'shared bundle'   { npx rollup -c rollup.config.mjs }
    Copy-Item "$sh\package.json.src" "$sh\dist\package.json" -Force
    Push-Location "$sh\dist"
    try { Run 'shared pack' { npm pack } } finally { Pop-Location }
} finally { Pop-Location }
$shTgz = "$sh\dist\msfs-wt21-shared-3.2.13.tgz"
if (-not (Test-Path $shTgz)) { throw "missing $shTgz" }

# 3) wt21 instruments (PFD, MFD, FMC)
$in = "$mirror\workingtitle-instruments-wt21\instruments"
$out = "$in\dist\workingtitle-instruments-wt21-v2"
Push-Location $in
try {
    Run 'instruments install' { npm install --no-save --ignore-scripts --no-audit --no-fund $sdkTgz $wlTgz $shTgz }
    Run 'instruments compile' { npx tspc --forceConsistentCasingInFileNames false }
    Copy-Tree "$in\html_ui" "$in\build\workingtitle-instruments-wt21-v2\html_ui" @('*.css')
    Run 'instruments bundle'  { npx rollup -c rollup.config.mjs }
    Copy-Tree "$in\html_ui" "$out\html_ui" @('*.svg', '*.png', '*.html', '*.ttf')
    $lib = "$out\html_ui\Pages\VCockpit\Instruments\WT21v2\Libraries"
    New-Item -ItemType Directory -Force $lib | Out-Null
    Copy-Item "$in\node_modules\@microsoft\msfs-sdk\msfssdk-iife.js"           "$lib\msfssdk.js"     -Force
    Copy-Item "$in\node_modules\@microsoft\msfs-wtlinesdk\wtlinesdk-iife.js"   "$lib\wtlinesdk.js"   -Force
    Copy-Item "$in\node_modules\@microsoft\msfs-wt21-shared\wt21shared.js"     "$lib\wt21shared.js"  -Force
    Copy-Item "$in\node_modules\@microsoft\msfs-wt21-shared\wt21shared.css"    "$lib\wt21shared.css" -Force
} finally { Pop-Location }

$f = Get-ChildItem $out -Recurse -File
"Done. {0} files, {1:N1} MB in {2}" -f $f.Count, (($f | Measure-Object Length -Sum).Sum / 1MB), $out
