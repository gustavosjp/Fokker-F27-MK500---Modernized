# Builds the F27-500 Modernized package with the MSFS 2024 SDK package tool into f27-g1000\out (never into Community).
#
# The package definition is regenerated on every build from the top-level folders of PackageSources\bgt-f27500-modernized,
# so adding a folder there needs no XML edit. Lessons from the baseline build (see C:\Projetos\f27-efis\README.md):
#   * package_order_hint must be non-empty (CUSTOM_SIMOBJECTS) or validation fails and the tool hangs without layout.json
#   * a stale gamelaunchhelper.exe from an earlier run makes the next run fail instantly, so stale ones are stopped first
#   * the launcher prints on stderr, so errors must be non-terminating around the call
#
# Usage: powershell -ExecutionPolicy Bypass -File C:\Projetos\f27-g1000\build-package.ps1 [-TimeoutMin 8]
param([int]$TimeoutMin = 8)
$ErrorActionPreference = 'Stop'
$proj    = 'C:\Projetos\f27-g1000'
$pkgName = 'bgt-f27500-modernized'
$src     = "$proj\PackageSources\$pkgName"
$projXml = "$proj\f27g1000.xml"                              # SDK layout: project xml, PackageDefinitions\ and PackageSources\ side by side
$defXml  = "$proj\PackageDefinitions\$pkgName.xml"
$out     = "$proj\out"
$layout  = "$out\Packages\$pkgName\layout.json"
$utf8    = New-Object System.Text.UTF8Encoding($false)

New-Item -ItemType Directory -Force "$proj\PackageDefinitions" | Out-Null
[System.IO.File]::WriteAllText($projXml, @"
<?xml version="1.0" encoding="utf-8"?>
<Project Version="2" Name="f27g1000" FolderName="Packages">
    <OutputDirectory>.</OutputDirectory>
    <TemporaryOutputDirectory>_PackageInt</TemporaryOutputDirectory>
    <Packages>
        <Package>PackageDefinitions\$pkgName.xml</Package>
    </Packages>
</Project>
"@, $utf8)

$groups = foreach ($d in Get-ChildItem $src -Directory | Select-Object -ExpandProperty Name) {
@"
        <AssetGroup Name="copy-$d">
            <Type>Copy</Type>
            <Flags>
                <FSXCompatibility>false</FSXCompatibility>
            </Flags>
            <AssetDir>PackageSources\$pkgName\$d\</AssetDir>
            <OutputDir>$d\</OutputDir>
        </AssetGroup>
"@
}
[System.IO.File]::WriteAllText($defXml, @"
<?xml version="1.0" encoding="utf-8"?>
<AssetPackage Version="0.1.0">
    <PackageOrderHint>CUSTOM_SIMOBJECTS</PackageOrderHint>
    <ItemSettings>
        <ContentType>AIRCRAFT</ContentType>
        <Title>Fokker F27-500 Modernized</Title>
        <Manufacturer>Fokker</Manufacturer>
        <Creator>bgaurant (Modernized conversion)</Creator>
    </ItemSettings>
    <Flags>
        <VisibleInStore>false</VisibleInStore>
        <CanBeReferenced>false</CanBeReferenced>
    </Flags>
    <AssetGroups>
$($groups -join "`n")
    </AssetGroups>
</AssetPackage>
"@, $utf8)

Get-CimInstance Win32_Process |
    Where-Object { $_.Name -in 'gamelaunchhelper.exe', 'fspackagetool.exe' -and $_.CommandLine -match 'f27-g1000' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Remove-Item $out, "$proj\_PackageInt" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $out | Out-Null

$watchdog = Start-Job -ArgumentList $layout, $TimeoutMin -ScriptBlock {
    param($layout, $timeoutMin)
    $deadline = (Get-Date).AddMinutes($timeoutMin)
    while (-not (Test-Path $layout) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
    Start-Sleep -Seconds 5
    Get-CimInstance Win32_Process |
        Where-Object { $_.Name -in 'gamelaunchhelper.exe', 'fspackagetool.exe' -and $_.CommandLine -match 'f27-g1000' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
$ErrorActionPreference = 'Continue'
& 'C:\MSFS 2024 SDK\Tools\bin\fspackagetool.exe' $projXml -outputdir $out -nopause 2>&1 | Out-Null
$ErrorActionPreference = 'Stop'
Stop-Job $watchdog -ErrorAction SilentlyContinue; Remove-Job $watchdog -Force -ErrorAction SilentlyContinue

"layout.json present: $(Test-Path $layout)"
if (-not (Test-Path $layout)) {
    "packager log: $env:LOCALAPPDATA\Packages\Microsoft.Limitless_8wekyb3d8bbwe\LocalCache\BuilderLogError.txt"
    exit 1
}
