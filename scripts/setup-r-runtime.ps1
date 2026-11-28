<#

.SYNOPSIS

  R 运行时一键装配（替代 r-scripts 里 30 多个 install-*/check-* 试验脚本）

.DESCRIPTION

  便携 R 运行时是构建产物，不该塞进 git（历史里已有 309MB LFS，而 LDM 从来没被

  提交成功——fresh clone 拉完 LFS 也跑不了中介分析）。本脚本按 r-runtime.lock.json

  装配出与开发机一致的运行时，四种来源：

    verify        只校验现有 r-portable 是否满足 lockfile（默认，最快）

    fromLocal     从本机另一份完整运行时目录 / zip 复制过来（离线首选）

    fromRelease   从 GitHub Release 附件下载 603MB 整包 zip（不占 LFS 流量）

    fromRepos     下 R 安装器静默装到 r-portable，再按 lockfile 从 CRAN/Bioconductor 装包

    auto          依次尝试 verify -> fromRelease -> fromRepos，并把下一步该做什么说清楚

  所有模式最后都会跑 r-scripts/tools/verify_r_runtime.R（含 PERMANOVA-med 与

  Non-random 两个真实冒烟），红了就明确列出缺哪个包，而不是等用户点“运行分析”。

.EXAMPLE

  powershell -ExecutionPolicy Bypass -File scripts/setup-r-runtime.ps1

  powershell -ExecutionPolicy Bypass -File scripts/setup-r-runtime.ps1 -Mode fromLocal -From "C:\Custom\CodeRepository\Demo\r-portable-4.3.3-backup"

  powershell -ExecutionPolicy Bypass -File scripts/setup-r-runtime.ps1 -Mode fromRepos -RVersion 4.6.1

  powershell -ExecutionPolicy Bypass -File scripts/setup-r-runtime.ps1 -Mode exportLock

.NOTES

  不需要管理员权限：安装目录在项目内；下载方法用 wininet 以适配热点/代理证书场景。

#>

[CmdletBinding()]

param(

  [ValidateSet('verify', 'fromLocal', 'fromRelease', 'fromRepos', 'exportLock', 'auto')]

  [string]$Mode = 'auto',

  [string]$From,                                  # fromLocal：目录或 zip 路径

  [string]$Url,                                   # fromRelease：附件直链，留空则读 lockfile

  [string]$Sha256,                                # fromRelease：期望校验和

  [string]$RVersion = '',                         # fromRepos：R 版本，留空则读 lockfile

  [string]$Target = 'r-portable',

  [switch]$Force,                                 # 允许覆盖已存在的 r-portable

  [switch]$KeepDownloads

)

$ErrorActionPreference = 'Stop'

Set-StrictMode -Version Latest

$ErrorActionPreferenceForNative = 'Continue'

# GBK 控制台下中文会乱码，尽量把输出编码拉到 UTF-8（失败不影响主流程）

try {

  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

  $OutputEncoding = [Console]::OutputEncoding

} catch { }

# PS 5.1 里 ErrorActionPreference='Stop' 会把原生命令写到 stderr 的内容当异常抛出，

# 导致「Rscript 明明可用却被判不可用」。所有外部命令统一走这个口子。

function Run-Native {

  param([string]$Exe, [string[]]$ArgList = @())

  $prev = $ErrorActionPreference

  $ErrorActionPreference = 'Continue'

  try {

    if ($ArgList.Count) { $out = & $Exe @ArgList 2>&1 } else { $out = & $Exe 2>&1 }

    $code = $LASTEXITCODE

  } finally { $ErrorActionPreference = $prev }

  @{ Out = $out; Code = $code }

}

# --- 路径：脚本在 <ROOT>/scripts/ 下 ---

$ROOT = Split-Path -Parent $PSScriptRoot

if ([IO.Path]::IsPathRooted($Target)) { $TARGET_DIR = [IO.Path]::GetFullPath($Target) }
else { $TARGET_DIR = [IO.Path]::GetFullPath((Join-Path $ROOT $Target)) }
# 不能一律 Join-Path ROOT 再接 Target：PS 5.1 的 Join-Path 不认"子路径本身已是绝对路径",
# 会拼出"项目根 + 绝对路径"这种非法路径, New-Item 直接报 format is not supported.
Write-Host ("==> 运行时目标目录: " + $TARGET_DIR) -ForegroundColor Cyan

Set-Location $ROOT

$LOCKFILE = Join-Path $ROOT 'r-runtime.lock.json'


# PS 5.1 没有 $IsWindows，配合 StrictMode 会直接报错，用文件存在性判断平台

$RSCRIPT = Join-Path $TARGET_DIR 'bin\Rscript.exe'

if (-not (Test-Path $RSCRIPT)) { $RSCRIPT = Join-Path $TARGET_DIR 'bin/Rscript' }

$DL = Join-Path $env:TEMP 'r-runtime-download'

function Step($msg) { Write-Host ("==> " + $msg) -ForegroundColor Cyan }

function Ok($msg) { Write-Host ("  [OK]   " + $msg) -ForegroundColor Green }

function Warn($msg) { Write-Host ("  [WARN] " + $msg) -ForegroundColor Yellow }

function Fail($msg) { Write-Host ("  [FAIL] " + $msg) -ForegroundColor Red }

function Info($msg) { Write-Host ("  [info] " + $msg) -ForegroundColor DarkGray }


# 热点/校园网下 curl 常因证书失败，wininet 走系统证书库更稳

$CRAN_MIRRORS = @(

  'https://mirrors.tuna.tsinghua.edu.cn/CRAN/',   # 国内首选

  'https://cloud.r-project.org',

  'https://cran.r-project.org',

  'https://cran.us.r-project.org'

)



function Read-Lock {

  if (-not (Test-Path $LOCKFILE)) { return $null }

  Get-Content $LOCKFILE -Raw -Encoding UTF8 | ConvertFrom-Json

}

function Test-Runtime([string]$dir) {

  $rs = Join-Path $dir 'bin\Rscript.exe'

  if (-not (Test-Path $rs)) { return $false }

  $r = Run-Native -Exe $rs -ArgList @('--version')

  return ($r.Code -eq 0)

}

function Invoke-Verify {

  Step '运行运行时校验（含真实冒烟）'

  if (-not (Test-Runtime $TARGET_DIR)) { Fail "找不到可用的 Rscript：$RSCRIPT"; return 1 }

  $r = Run-Native -Exe $RSCRIPT -ArgList @((Join-Path $ROOT 'r-scripts\tools\verify_r_runtime.R'))

  $r.Out | ForEach-Object { Write-Host $_ }

  $code = $r.Code

  if ($code -eq 0) { Ok '运行时校验通过' }

  elseif ($code -eq 1) { Fail '缺包或版本/API 不符，见上方 FAIL 行' }

  elseif ($code -eq 2) { Fail '冒烟分析失败（包装上了但跑不通），请贴出上面日志' }

  return $code

}

function Backup-Existing {

  if (-not (Test-Path $TARGET_DIR)) { return $null }

  if ($Force) {

    Step '按要求移除现有运行时'

    Remove-Item $TARGET_DIR -Recurse -Force

    return $null

  }

  if (Test-Runtime $TARGET_DIR) {

    Info "$Target 已存在且可用，不动它（要重装请加 -Force）"

    return 'keep'

  }

  $bak = "$TARGET_DIR.invalid-$(Get-Date -Format yyyyMMdd-HHmmss)"

  Warn "$Target 存在但不可用，改名保留为 $bak"

  Rename-Item $TARGET_DIR (Split-Path $bak -Leaf)

  return $null

}

function Install-FromLocal([string]$src) {

  if (-not $src) { Fail 'fromLocal 需要 -From <运行时分发包目录或 zip>'; return 1 }

  if (-not (Test-Path $src)) { Fail "路径不存在: $src"; return 1 }

  $srcRoot = $src

  if ((Get-Item $src).PSIsContainer) {

    # 允许直接指到含 bin\Rscript.exe 的目录，或其上一层

    if (-not (Test-Path (Join-Path $src 'bin\Rscript.exe'))) {

      $hit = Get-ChildItem $src -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'bin\Rscript.exe') } | Select-Object -First 1

      if (-not $hit) { Fail "$src 下找不到 bin\Rscript.exe，也不含这样的子目录"; return 1 }

      $srcRoot = $hit.FullName

    }

    Step "从本地目录复制运行时: $srcRoot"

    robocopy $srcRoot $TARGET_DIR /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null

    if ($LASTEXITCODE -gt 7) { Fail "robocopy 失败，代码 $LASTEXITCODE"; return 1 }

    Ok '复制完成'

    return 0

  }

  # zip

  $tmp = Join-Path $env:TEMP 'r-runtime-extract'

  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }

  Step "解压: $src"

  Expand-Archive -LiteralPath $src -DestinationPath $tmp -Force

  $inner = Get-ChildItem $tmp -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'bin\Rscript.exe') } | Select-Object -First 1

  if (-not $inner) { Fail '压缩包里没找到 bin\Rscript.exe（顶层应有一个 r-portable 目录）'; return 1 }

  robocopy $inner.FullName $TARGET_DIR /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null

  if ($LASTEXITCODE -gt 7) { Fail "robocopy 失败，代码 $LASTEXITCODE"; return 1 }

  Remove-Item $tmp -Recurse -Force

  Ok '解压装配完成'

  return 0

}

# 下载一个文件：带真实进度、停滞检测与总超时。

# 上一版用同步 Start-BitsTransfer：BITS 遇到 403/证书/重定向会进 TransientError 静默重试，

# 屏幕上什么都不会出现，看起来就像卡死；而且提示语"已有 N MB"只在开始前打印一次，

# 并不是进度（用户报的就是这个现象）。

# 看一个文件像不像 Windows 可执行体：只读前两字节看 MZ 头，不移动文件也不占内存。

function Test-InstallerHint($file) {

  try {

    $fs = [IO.File]::OpenRead($file)

    try { $b = New-Object byte[] 2; $n = $fs.Read($b, 0, 2) } finally { $fs.Close() }

    return ($n -eq 2 -and $b[0] -eq 77 -and $b[1] -eq 90)   # 'M' 'Z'

  } catch { return $false }

}

# 在安装产物里找出真正的 R 目录：以 bin\Rscript.exe 存在为准，不靠目录名猜。

# 把安装产物搬到 $targetDir。这一步曾经删过用户刚装好的 R：

# 当时写的是 TrimEnd('')（反斜杠在编辑过程中被吃掉），于是

#   $want = "…\r-portable\"（尾部斜杠没去掉）

#   $installed.FullName = "…\r-portable"

# 两者不相等 -> 走进"删掉目标再搬"的分支 -> 把已经装好的 r-portable 整个删了 -> Move 报源不存在。

# 教训两条：(1) 路径比较用 [IO.Path]::GetFullPath 归一，别手写 TrimEnd('\')；

#          (2) 真要覆盖目标时先备份，不许直接 Remove-Item —— 这是用户的既有产物。

function Place-Runtime($installed, $targetDir) {

  if (-not $installed) { Fail '没有可搬移的安装产物'; return $false }

  if (-not (Test-Path (Join-Path $installed.FullName 'bin\Rscript.exe'))) {

    Fail ('源目录里没有 bin\Rscript.exe，不动目标：' + $installed.FullName); return $false

  }

  # GetFullPath 不会去掉尾部分隔符，所以还要显式 TrimEnd —— 但绝不能写 TrimEnd('')：
  # 那个反斜杠在编辑过程中被吃掉过一次，直接把用户装好的 R 删了（见 7-11 的回归测试）。
  # 这里用 .NET 的分隔符常量，源码里不出现反斜杠字面量，就没有可被吃掉的字符。
  $sep = [IO.Path]::DirectorySeparatorChar
  $alt = [IO.Path]::AltDirectorySeparatorChar
  $want = [IO.Path]::GetFullPath($targetDir).TrimEnd($sep, $alt)
  $got = [IO.Path]::GetFullPath($installed.FullName).TrimEnd($sep, $alt)

  if ($got -eq $want) {

    Ok ('安装产物已就位（安装器直接写进了目标目录）：' + $want)

    return $true

  }

  # Backup-Existing 用的是全局 $TARGET_DIR，不接收参数：以前写 Backup-Existing $targetDir

  # 属于"看着接上了其实没有"，这里显式说明并按它的语义走。

  if (Test-Path $targetDir) { $null = Backup-Existing }   # 它会往管道吧 'keep'/$null，不接住就会污染本函数的布尔返回值

  try {

    Move-Item -LiteralPath $got -Destination $want -ErrorAction Stop

  } catch {

    Fail ('搬移失败：' + $got + ' -> ' + $want + ' ：' + $_.Exception.Message.Split("`n")[0]); return $false

  }

  if (-not (Test-Path (Join-Path $want 'bin\Rscript.exe'))) {

    Fail '搬移后校验失败：目标里没有 bin\Rscript.exe'; return $false

  }

  Ok ('安装产物已搬入目标目录：' + $want)

  return $true

}

function Find-InstalledR($targetDir, $parentDir, $rv) {

  if (Test-Path (Join-Path $targetDir 'bin\Rscript.exe')) { return Get-Item $targetDir }

  foreach ($d in (Get-ChildItem $parentDir -Directory -ErrorAction SilentlyContinue)) {

    if ($d.Name -like "R-$rv*" -and (Test-Path (Join-Path $d.FullName 'bin\Rscript.exe'))) { return $d }

  }

  return $null

}

# 写文件但**不带 BOM**：PowerShell 5.1 的 Set-Content -Encoding UTF8 会写入 EF BB BF，
# 而 Rscript 读到文件头的 BOM 会直接报「错误: 意外的输入在"﻿"里 / 停止执行」——
# 现场那条报错就是这个，跟 R 环境、网络、代理都没关系，是我生成的脚本自己读不进去。
# 用 -Encoding ASCII 也能绕过，但路径/镜像地址里一旦出现中文就会被截成问号，
# 所以这里明确写 UTF-8 无 BOM。
function Write-NoBom($path, $content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($path, $content, $enc)
}

function Get-File($u, $out, $StallSeconds = 90, $TotalSeconds = 3600) {

  New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null

  # 先问 Content-Length，但**只有可信时才采用**。现场日志教警：

  #   [WARN] 清除不完整残留 87.5 MB (目标 0 MB)      ← 把用户放好的文件删了

  #   [info] 进度 87.5 MB 160964870.2%              ← 1.6 亿百分比

  # 真相：HEAD 跟随重定向后拿到的是跳转页的 body 长度（几十 KB），不是安装器大小。

  # 拿它当真值连坏三件事：删掉手动放好的完整文件、把已下完的文件判成"不完整"、

  # 百分比算出天文数字。安装器不可能小于 1MB，以此作可信门槛。

  $expected = -1

  try {

    $head = Invoke-WebRequest -Uri $u -Method Head -UseBasicParsing -TimeoutSec 30

    $cl = 0

    if ($head.Headers['Content-Length']) { $cl = [long]$head.Headers['Content-Length'][0] }

    if ($cl -gt 1MB) { $expected = $cl }

    else { Info ('HEAD 给的 Content-Length 不可信（' + $cl + ' 字节，疑似重定向页），改用作业自己报的大小') }

  } catch {

    Info ('HEAD 探测失败，改用作业自己报的大小：' + $_.Exception.Message.Split("`n")[0])

  }

  # 已有文件：只有"确定对不上"才敢删。对不上账时先看它像不像一个真安装器

  # （体积够大 + MZ 头）——像就直接用，这比删掉再赌 BITS 能下好负责。

  $have = 0

  if (Test-Path $out) { $have = (Get-Item $out).Length }

  if ($have -gt 0) {

    if ($expected -gt 0 -and $have -eq $expected) {

      Ok ('文件已完整存在：' + [math]::Round($have / 1MB, 1) + ' MB，跳过下载')

      return $true

    }

    if ($expected -gt 0) {

      Warn ('清除大小对不上的残留 ' + [math]::Round($have / 1MB, 1) + ' MB（目标 ' + [math]::Round($expected / 1MB, 1) + ' MB）')

      Remove-Item $out -Force

    }

    elseif ($have -ge 20MB -and (Test-InstallerHint $out)) {

      Ok ('无法核对大小，但它像个完整安装器（' + [math]::Round($have / 1MB, 1) + ' MB + MZ 头），直接使用')

      return $true

    }

    else {

      Warn ('已有 ' + [math]::Round($have / 1MB, 1) + ' MB，但既无法核对大小也不像安装器，删掉重下')

      Remove-Item $out -Force

    }

  }

  $mb = if ($expected -gt 0) { "共 " + [math]::Round($expected/1MB,1) + " MB" } else { "大小未知" }

  Info ("开始下载 " + $u + " -> " + $out + "（" + $mb + "）")

  $job = $null

  try {

    $job = Start-BitsTransfer -Source $u -Destination $out -Asynchronous -ErrorAction Stop

  } catch {

    Warn ("BITS 起不来，改用 Invoke-WebRequest：" + $_.Exception.Message.Split("`n")[0])

    $ProgressPreference = 'SilentlyContinue'

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    try {

      Invoke-WebRequest -Uri $u -OutFile $out -UseBasicParsing -TimeoutSec $TotalSeconds

    } catch {

      Fail ("下载失败：" + $_.Exception.Message.Split("`n")[0]); return $false

    }

    $n = if (Test-Path $out) { (Get-Item $out).Length } else { 0 }

    if ($expected -gt 0 -and $n -ne $expected) { Fail ("下载不完整：" + $n + " != " + $expected); return $false }

    Ok ("下载完成：" + [math]::Round($n/1MB,1) + " MB")

    return $true

  }

  $t0 = Get-Date; $lastSize = -1; $lastMove = Get-Date; $lastBeat = [DateTime]::MinValue

  while ($job.JobState -in ('Transferring','Queued','Connecting','Suspended','TransientError')) {

    $now = Get-Date

    # 字节数取自作业寱象：BITS 传输期间最终路径根本不存在（本机实测：STATE=Transferred 时目标文件仍 False，

    # 直到 Complete-BitsTransfer 之后才出现）。盯着最终路径算进度，就是"一直 0 MB"的真相。

    $cur = 0; $tot = 0

    try { $cur = [long]$job.BytesTransferred } catch {}

    try { $tot = [long]$job.BytesTotal } catch {}

    if ($cur -ne $lastSize) { $lastSize = $cur; $lastMove = $now }

    if (($now - $lastBeat).TotalSeconds -ge 5 -or $job.JobState -eq 'TransientError') {

      $lastBeat = $now

      $pct = if ($tot -gt 0) { ' ' + [math]::Round(100*$cur/$tot,1) + '%' } else { '' }

      Info ("进度 " + [math]::Round($cur/1MB,1) + " MB" + $pct +

        "（状态 " + $job.JobState + "，距上次变动 " + [int]($now-$lastMove).TotalSeconds + " 秒）")

    }

    if (($now - $lastMove).TotalSeconds -gt $StallSeconds) {

      Warn ("连续 " + $StallSeconds + " 秒字节数没有变化，判定停滞，换下一个源")

      try { Remove-BitsTransfer -BitsJob $job } catch {}

      if (Test-Path $out) { Remove-Item $out -Force }

      return $false

    }

    if (($now - $t0).TotalSeconds -gt $TotalSeconds) {

      Warn ("超过总时长 " + $TotalSeconds + " 秒，换下一个源")

      try { Remove-BitsTransfer -BitsJob $job } catch {}

      return $false

    }

    Start-Sleep -Milliseconds 800

  }

  if ($job.JobState -ne 'Transferred') {
    # 不能直接写 $job 点 ErrorRecord：作业以 Error 结束时，PS 5.1 的这个对象上未必有该
    # 属性，一读就抛 PropertyNotFound 把整个脚本终结（现场最早那条报错就是这个）。
    # 失败信息只能"有就说、没有就闭嘴"，逐属性试探。
    $why = ''
    foreach ($pn in @('ErrorRecord', 'ErrorCode', 'Description')) {
      $prop = $job.PSObject.Properties[$pn]
      if ($prop -and $prop.Value) {
        $v = ($prop.Value | Out-String).Trim()
        if ($v) { $why = ' ' + $pn + '=' + $v.Split([char]10)[0]; break }
      }
    }
    Warn ('BITS 结束状态 ' + $job.JobState + $why)
    try { Remove-BitsTransfer -BitsJob $job -ErrorAction SilentlyContinue } catch {}
    return $false
  }

  try { Complete-BitsTransfer -BitsJob $job } catch { Warn ("完成移交失败：" + $_.Exception.Message.Split("`n")[0]); return $false }

  $n = if (Test-Path $out) { (Get-Item $out).Length } else { 0 }

  if ($expected -gt 0 -and $n -ne $expected) { Fail ("下载不完整：" + $n + " != " + $expected); return $false }

  Ok ("下载完成：" + [math]::Round($n/1MB,1) + " MB（用时 " + [int]((Get-Date)-$t0).TotalSeconds + " 秒）")

  return $true

}

function Assert-Sha256($file, $expect) {

  if (-not $expect) { Warn '未提供 sha256，跳过完整性校验（建议在 r-runtime.lock.json 的 release.sha256 补上）'; return $true }

  $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower()

  if ($actual -ne $expect.ToLower()) { Fail "校验和不匹配：$actual != $expect"; return $false }

  Ok "sha256 校验通过: $actual"

  return $true

}

function Resolve-ReleaseUrl($lock) {

  if ($Url) { return $Url }

  if ($lock -and $lock.release) {

    if ($lock.release.url) { return $lock.release.url }

    if ($lock.release.repo -and $lock.release.asset) {

      # 没填直链就查 GitHub API 取该 tag 的附件（需要网络，内网/无 token 可能限流）

      $repo = $lock.release.repo; $asset = $lock.release.asset

      $tag = if ($lock.release.tag) { $lock.release.tag } else { '' }

      $api = if ($tag) { "https://api.github.com/repos/$repo/releases/tags/$tag" } else { "https://api.github.com/repos/$repo/releases/latest" }

      Info "查询 Release: $api"

      try {

        $rel = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent' = 'setup-r-runtime' } -TimeoutSec 60

        $a = $rel.assets | Where-Object { $_.name -eq $asset } | Select-Object -First 1

        if ($a) {

          if (-not $Sha256 -and $a.digest) { $Sha256 = ($a.digest -replace '^sha256:', '') }

          return $a.browser_download_url

        }

        Warn "Release 里没有找到附件 $asset"

      } catch { Warn "Release 查询失败: $($_.Exception.Message)" }

    }

  }

  return $null

}

function Install-FromRelease($lock) {

  $u = Resolve-ReleaseUrl $lock

  if (-not $u) {

    Fail '无法确定 Release 附件地址。三种办法任选：

    1) 在 r-runtime.lock.json 的 release.url 填上直链（推荐，顺带填 sha256）

    2) 命令行显式给：-Mode fromRelease -Url https://github.com/<repo>/releases/download/<tag>/r-portable-4.6.1-win-x64.zip

    3) 用本机已有的那一份：-Mode fromLocal -From "C:\Custom\CodeRepository\Demo\r-portable-4.3.3-backup"'

    return 1

  }

  $zip = Join-Path $DL ([IO.Path]::GetFileName($u.Split('?')[0]))

  # 不再先 Test-Path 就跳过下载：那会把上次断在中间的半个 zip 当成“已有”，

  # 然后卡到校验和那一步去。Get-File 自己会比大小：完整就用，不完整就清掉重下。

  if (-not (Get-File $u $zip)) { Fail "下载失败：$u"; return 1 }

  if (-not (Assert-Sha256 $zip $Sha256)) { return 1 }

  return (Install-FromLocal $zip)

}

function Install-FromRepos($lock) {

  $rv = if ($RVersion) { $RVersion } elseif ($lock -and $lock.r) { $lock.r.version } else { '4.6.1' }

  Info "目标 R 版本 $rv"

  if (-not (Test-Runtime $TARGET_DIR)) {

    Step "获取 R $rv Windows 安装器并静默安装到 $Target（不需要管理员）"

    New-Item -ItemType Directory -Force -Path $DL | Out-Null

    $exe = Join-Path $DL "R-$rv-win.exe"

    $cands = @(

      "https://cran.r-project.org/bin/windows/base/old/$rv/R-$rv-win.exe",

      "https://cloud.r-project.org/bin/windows/base/old/$rv/R-$rv-win.exe",

      "https://mirrors.tuna.tsinghua.edu.cn/CRAN/bin/windows/base/old/$rv/R-$rv-win.exe",

      "https://cran.r-project.org/bin/windows/base/R-$rv-win.exe"

    )

    # 这里不再写“已存在就复用”的短路：旧写法只 Test-Path，把停在 87 MB 的半成品

    # 当成安装器直接用下去了。完整性判断全部交给 Get-File（它会先 HEAD 拿 Content-Length）。

    $got = $false

    foreach ($c in $cands) {

      # Get-File 现在用返回值说成败（不再靠抛异常）：旧版的 try{...;$got=$true}

      # 会把“BITS 停滞而返回 false”误记成成功。

      if (Get-File $c $exe) { $got = $true; break }

      Warn "该源不行，换下一个：$c"

    }

    if (-not $got) {

      Fail ('所有源都拿不到 R 安装器。可手动下载后放到这个路径（大小会对账）：' + $exe)

      return 1

    }

    $parent = Split-Path $TARGET_DIR -Parent

    $leaf = Split-Path $TARGET_DIR -Leaf

    # /SILENT 而非 /VERYSILENT：历史上 /VERYSILENT 在部分机器上会弹 UAC

    # Inno 的 /DIR 是**精确安装目录**，不是上级目录。上一版传 $parent 并假设安装器会

    # 自建 <parent>\R-<version>，结果 R 的 bin/library/etc 直接铺进了项目根目录，

    # 而事后按 R-<version> 子目录去找当然找不到，于是报"安装后找不到 R-4.6.1 目录"。

    if ((Resolve-Path $TARGET_DIR -ErrorAction SilentlyContinue) -eq (Resolve-Path $ROOT -ErrorAction SilentlyContinue)) {

      Fail '目标目录不能等于项目根目录（否则会把 R 铺进仓库）'; return 1

    }

    Step "静默安装到 $TARGET_DIR（不写注册表机器级键）"

    if (Test-Path $TARGET_DIR) { Backup-Existing $TARGET_DIR }

    New-Item -ItemType Directory -Force -Path $TARGET_DIR | Out-Null

    $p = Start-Process -FilePath $exe -ArgumentList @('/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART', ('/DIR=' + $TARGET_DIR), '/CURRENTUSER') -PassThru -Wait

    if ($p.ExitCode -ne 0) { Warn "安装器返回码 $($p.ExitCode)，继续检查产物" }

    # 产物位置有两种历史形状：直接装进 $TARGET_DIR（现在），或装成 <parent>\R-<version>

    # （旧安装器忽略 /DIR 时）。两种都收，但只认带 bin\Rscript.exe 的那个。

    $installed = Find-InstalledR $TARGET_DIR $parent $rv

    if (-not $installed) {

      Fail ('安装后找不到 bin\Rscript.exe。检查：' + $TARGET_DIR + ' 里有没有 bin 目录；也看看杀毒软件是否拦截；若项目根被误装过 R，先清掉残留再重跑')

      return 1

    }

    if (-not (Place-Runtime $installed $TARGET_DIR)) { return 1 }

  }

  Step '按 lockfile 安装 R 包'

  if (-not (Test-Path $LOCKFILE)) { Fail '缺 r-runtime.lock.json，无法按声明装包'; return 1 }

  if (-not $lock) { $lock = Read-Lock }

  # 生成一次性安装脚本：CRAN 二进制 + Bioconductor + LDM 的 GitHub 兜底

  $needPkgs = @()

  foreach ($feat in $lock.required.PSObject.Properties) { $needPkgs += $feat.Value.packages }

  $needPkgs = $needPkgs | Sort-Object -Unique

  $bioNames = @($lock.packages | Where-Object { $_.source -eq 'Bioconductor' } | ForEach-Object { $_.name })

  $pinMap = @{}

  foreach ($pk in $lock.packages) { $pinMap[$pk.name] = $pk.version }

  $tmpR = Join-Path $env:TEMP 'setup_r_packages.R'

  $mirrorLines = ($CRAN_MIRRORS | ForEach-Object { "        '$_'," }) -join "`n"

  $needList = ($needPkgs | ForEach-Object { "'$_'" }) -join ', '

  $bioList = ($bioNames | ForEach-Object { "'$_'" }) -join ', '

  $pinLines = ($pinMap.GetEnumerator() | ForEach-Object { "        '$($_.Key)' = '$($_.Value)'" }) -join ",`n"

  $pkgScript = @"

# 由 scripts/setup-r-runtime.ps1 生成，勿手工编辑

options(download.file.method = 'wininet')      # 热点/代理下比 libcurl 稳

repos_try <- c(

$mirrorLines

        NULL

)

inst <- rownames(installed.packages())

need <- c($needList)

cat('[setup] 需要:', paste(need, collapse = ' '), '\n')

install_one <- function(pkg, pin = NULL) {

  if (pkg %in% inst) {

    cur <- installed.packages()[pkg, 'Version']

    if (is.null(pin) || identical(as.character(cur), as.character(pin))) { cat('  已有', pkg, cur, '\n'); return(invisible(TRUE)) }

    cat('  版本不符', pkg, '当前', cur, '期望', pin, '-> 重装\n')

  }

  for (m in repos_try) {

    r <- tryCatch({ install.packages(pkg, repos = m, type = 'binary', quiet = TRUE); TRUE },

                  error = function(e) { cat('   源失败:', m, conditionMessage(e), '\n'); FALSE })

    if (r && pkg %in% rownames(installed.packages())) { cat('  装好', pkg, '来自', m, '\n'); return(invisible(TRUE)) }

  }

  cat('  !! 装不上', pkg, '\n'); invisible(FALSE)

}

pins <- list(

$pinLines

)

for (p in need) install_one(p, pins[[p]])

bio <- c($bioList)

if (length(bio)) {

  if (!requireNamespace('BiocManager', quietly = TRUE)) install_one('BiocManager')

  if (requireNamespace('BiocManager', quietly = TRUE)) {

    # 不硬编码 Bioconductor 版本：让 BiocManager 按当前 R 版本选，装完由校验器比对 lockfile 版本

    suppressMessages(BiocManager::install(bio, ask = FALSE, update = FALSE))

  }

}

# LDM 在 CRAN 上偶尔滞后，用作者仓库兜底

if (!requireNamespace('LDM', quietly = TRUE)) {

  if (!requireNamespace('remotes', quietly = TRUE)) install.packages('remotes', repos = repos_try[1], type = 'binary')

  tryCatch(remotes::install_github('yijuanhu/LDM', upgrade = 'never'),

           error = function(e) cat('  !! LDM GitHub 兜底也失败:', conditionMessage(e), '\n'))

}

missing <- setdiff(need, rownames(installed.packages()))

if (length(missing)) { cat('MISSING:', paste(missing, collapse = ', '), '\n'); quit(status = 1) }

cat('ALL_PRESENT\n')

"@
  Write-NoBom $tmpR $pkgScript   # 不能用 Set-Content -Encoding UTF8：PS 5.1 会写 BOM，Rscript 读到就报「意外的输入」

  $rp = Run-Native -Exe $RSCRIPT -ArgList @($tmpR)

  $rp.Out | ForEach-Object { Write-Host $_ }

  $code = $rp.Code

  if ($code -ne 0) { Fail '部分包未装上（见上方 MISSING），可挂热点重试或改用 fromLocal/fromRelease'; return 1 }

  Ok '包安装完成'

  Step '重新生成 lockfile（记录本次实际版本）'

  & $RSCRIPT (Join-Path $ROOT 'r-scripts\tools\export_r_lockfile.R')

  return 0

}

function Export-Lock($lock) {

  if (-not (Test-Runtime $TARGET_DIR)) { Fail 'exportLock 需要一个可用的运行时作为记录对象'; return 1 }

  Step '导出 r-runtime.lock.json'

  $rr = Run-Native -Exe $RSCRIPT -ArgList @((Join-Path $ROOT 'r-scripts\tools\export_r_lockfile.R'))

  $rr.Out | ForEach-Object { Write-Host $_ }

  return $rr.Code

}

# ---------------- 主流程 ----------------

Step "项目根目录: $ROOT"

Step "模式: $Mode"

$lock = Read-Lock

if ($lock) { Info "lockfile: R $($lock.r.version)，$($lock.package_count) 个包" } else { Warn '没有 r-runtime.lock.json（首次可用 -Mode fromRepos 或 fromLocal 后再 exportLock）' }

$rc = 0

switch ($Mode) {

  'verify' { $rc = Invoke-Verify }

  'exportLock' { $rc = Export-Lock $lock }

  'fromLocal' { Backup-Existing | Out-Null; $rc = Install-FromLocal $From }

  'fromRelease' { Backup-Existing | Out-Null; $rc = Install-FromRelease $lock }

  'fromRepos' { Backup-Existing | Out-Null; $rc = Install-FromRepos $lock }

  'auto' {

    if (Test-Runtime $TARGET_DIR) {

      Ok "$Target 可用，直接校验"

      $rc = Invoke-Verify

    } else {

      Warn "$Target 缺失或不可用，尝试 Release 整包"

      $rc = Install-FromRelease $lock

      if ($rc -ne 0) {

        Warn 'Release 不可用，回退到 fromRepos（下 R 安装器 + 按 lockfile 装包）'

        $rc = Install-FromRepos $lock

      }

      if ($rc -eq 0) { $rc = Invoke-Verify }

    }

  }

}

if ($Mode -ne 'exportLock' -and $rc -eq 0) {

  Step '最后确认：应用侧看到的运行时'

  Info "Rscript 路径: $RSCRIPT"

  Info "若 Electron 正在运行且曾打开过 r-portable，请重启它以重新探测"

}

if (-not $KeepDownloads -and (Test-Path $DL)) { Info "下载缓存保留在 $DL（重复运行可复用）" }

Write-Host ''

if ($rc -eq 0) { Write-Host '结果：OK' -ForegroundColor Green } else { Write-Host "结果：失败（代码 $rc）" -ForegroundColor Red }

exit $rc

