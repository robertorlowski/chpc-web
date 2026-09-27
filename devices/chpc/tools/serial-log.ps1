# Odczyt logu diagnostycznego CHPC (build promini_debug) z portu szeregowego.
# Każda linia z płytki trafia do pliku z czasem PC na początku: "2026-09-26 21:15:03.412 {"t":...}".
#
#   powershell -ExecutionPolicy Bypass -File tools/serial-log.ps1 -Port COM3 -Seconds 300
#
# Port musi być wolny: zamknij "pio device monitor" i nie wgrywaj firmware w trakcie odczytu.
# Płytka nie może być w tym czasie na magistrali z co (log idzie bez zapytania).
param(
  [string]$Port = "COM3",
  [int]$Seconds = 300,
  [int]$Baud = 9600,
  [string]$Out = ""
)

if ($Out -eq "") {
  $Out = Join-Path $PSScriptRoot ("..\logs\chpc-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
} elseif (-not [System.IO.Path]::IsPathRooted($Out)) {
  $Out = Join-Path (Get-Location) $Out  # StreamWriter liczy ścieżki względne od katalogu procesu, nie od Get-Location
}
$Out = [System.IO.Path]::GetFullPath($Out)
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null

$sp = New-Object System.IO.Ports.SerialPort $Port, $Baud, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)
$sp.ReadTimeout = 500
$sp.NewLine = "`n"
$sp.DtrEnable = $false  # DTR resetuje Pro Mini przez kondensator auto-reset: bez tego log od bieżącej chwili
$end = (Get-Date).AddSeconds($Seconds)
while (-not $sp.IsOpen) {
  try {
    $sp.Open()
  } catch {
    if ((Get-Date) -ge $end) {
      Write-Error "Nie można otworzyć $Port : $($_.Exception.Message)"
      exit 1
    }
    Write-Host "$Port zajęty lub niedostępny ($($_.Exception.Message)), ponawiam za 2 s..."
    Start-Sleep -Seconds 2
  }
}

$w = New-Object System.IO.StreamWriter($Out, $true, (New-Object System.Text.UTF8Encoding($false)))
$w.AutoFlush = $true
Write-Host "Zapis $Port ($Baud) do $Out do $($end.ToString('HH:mm:ss'))..."
$n = 0
try {
  while ((Get-Date) -lt $end) {
    try {
      $line = $sp.ReadLine().TrimEnd("`r")
    } catch [System.TimeoutException] {
      continue
    }
    $stamped = (Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff") + " " + $line
    $w.WriteLine($stamped)
    Write-Host $stamped
    $n++
  }
} finally {
  $sp.Close()
  $w.Close()
}
Write-Host "Zapisano $n linii: $Out"
