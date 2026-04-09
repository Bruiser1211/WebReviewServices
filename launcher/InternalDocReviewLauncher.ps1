Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:ProjectRoot = Split-Path -Parent $PSScriptRoot
$script:ControllerPath = Join-Path $script:ProjectRoot "scripts\server-control.mjs"
$script:NodePath = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $script:NodePath) {
    $script:NodePath = "C:\Program Files\nodejs\node.exe"
}

$script:FontCollection = New-Object System.Drawing.Text.PrivateFontCollection
foreach ($fontPath in @(
    (Join-Path $script:ProjectRoot "public\fonts\Pretendard-Regular.otf"),
    (Join-Path $script:ProjectRoot "public\fonts\Pretendard-SemiBold.otf"),
    (Join-Path $script:ProjectRoot "public\fonts\Pretendard-Bold.otf")
)) {
    if (Test-Path $fontPath) {
        $script:FontCollection.AddFontFile($fontPath)
    }
}

$fontFamilyName = if ($script:FontCollection.Families.Count -gt 0) {
    $script:FontCollection.Families[0].Name
} else {
    "Pretendard"
}

function New-AppFont {
    param(
        [float]$Size,
        [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular
    )

    return New-Object System.Drawing.Font($fontFamilyName, $Size, $Style)
}

function Invoke-Controller {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Action
    )

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $script:NodePath
    $psi.Arguments = "`"$script:ControllerPath`" $Action"
    $psi.WorkingDirectory = $script:ProjectRoot
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true

    $process = [System.Diagnostics.Process]::Start($psi)
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    if ($process.ExitCode -ne 0) {
        if ($stderr) {
            throw $stderr.Trim()
        }

        throw $stdout.Trim()
    }

    return ($stdout | ConvertFrom-Json)
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "문서 점검 서버"
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.Size = New-Object System.Drawing.Size(430, 250)
$form.MinimumSize = New-Object System.Drawing.Size(430, 250)
$form.BackColor = [System.Drawing.Color]::FromArgb(244, 241, 234)
$form.Font = New-AppFont 10

$title = New-Object System.Windows.Forms.Label
$title.Text = "문서 점검 서버 제어"
$title.Font = New-AppFont 15 ([System.Drawing.FontStyle]::Bold)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(24, 24)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = "상태 확인 전"
$statusLabel.Font = New-AppFont 11 ([System.Drawing.FontStyle]::Bold)
$statusLabel.AutoSize = $true
$statusLabel.Location = New-Object System.Drawing.Point(24, 70)

$urlLabel = New-Object System.Windows.Forms.Label
$urlLabel.Text = "접속 주소: http://localhost:3000"
$urlLabel.Font = New-AppFont 10
$urlLabel.AutoSize = $true
$urlLabel.Location = New-Object System.Drawing.Point(24, 102)

$hintLabel = New-Object System.Windows.Forms.Label
$hintLabel.Text = "시작 시 build 후 start가 실행됩니다."
$hintLabel.Font = New-AppFont 9
$hintLabel.ForeColor = [System.Drawing.Color]::FromArgb(95, 90, 82)
$hintLabel.AutoSize = $true
$hintLabel.Location = New-Object System.Drawing.Point(24, 130)

$startButton = New-Object System.Windows.Forms.Button
$startButton.Text = "서버 실행"
$startButton.Font = New-AppFont 10 ([System.Drawing.FontStyle]::Bold)
$startButton.Size = New-Object System.Drawing.Size(160, 44)
$startButton.Location = New-Object System.Drawing.Point(24, 166)
$startButton.BackColor = [System.Drawing.Color]::FromArgb(12, 92, 72)
$startButton.ForeColor = [System.Drawing.Color]::White
$startButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat

$stopButton = New-Object System.Windows.Forms.Button
$stopButton.Text = "서버 중지"
$stopButton.Font = New-AppFont 10 ([System.Drawing.FontStyle]::Bold)
$stopButton.Size = New-Object System.Drawing.Size(160, 44)
$stopButton.Location = New-Object System.Drawing.Point(196, 166)
$stopButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat

$form.Controls.AddRange(@(
    $title,
    $statusLabel,
    $urlLabel,
    $hintLabel,
    $startButton,
    $stopButton
))

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000

function Update-StatusUi {
    param($payload)

    switch ($payload.status) {
        "running" {
            $statusLabel.Text = "상태: 실행 중"
            $hintLabel.Text = "브라우저에서 내부망 IP:3000으로 접속하세요."
        }
        "starting" {
            $statusLabel.Text = "상태: 시작 중"
            $hintLabel.Text = "서버가 응답을 준비하고 있습니다."
        }
        default {
            $statusLabel.Text = "상태: 중지됨"
            $hintLabel.Text = "시작 버튼을 누르면 build 후 서버가 실행됩니다."
        }
    }
}

function Run-AsyncAction {
    param(
        [string]$Action,
        [string]$PendingText
    )

    $startButton.Enabled = $false
    $stopButton.Enabled = $false
    $statusLabel.Text = $PendingText

    $worker = New-Object System.ComponentModel.BackgroundWorker
    $worker.add_DoWork({
        param($sender, $eventArgs)
        try {
            $eventArgs.Result = @{
                Ok = $true
                Payload = Invoke-Controller -Action $eventArgs.Argument
            }
        } catch {
            $eventArgs.Result = @{
                Ok = $false
                Error = $_.Exception.Message
            }
        }
    })
    $worker.add_RunWorkerCompleted({
        param($sender, $eventArgs)
        $startButton.Enabled = $true
        $stopButton.Enabled = $true

        if (-not $eventArgs.Result.Ok) {
            [System.Windows.Forms.MessageBox]::Show(
                $eventArgs.Result.Error,
                "실행 오류",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Error
            ) | Out-Null
            try {
                $status = Invoke-Controller -Action "status"
                Update-StatusUi $status
            } catch {
                $statusLabel.Text = "상태 확인 실패"
            }
            return
        }

        Update-StatusUi $eventArgs.Result.Payload
    })
    $worker.RunWorkerAsync($Action)
}

$startButton.Add_Click({
    Run-AsyncAction -Action "start" -PendingText "상태: 빌드 및 실행 중"
})

$stopButton.Add_Click({
    Run-AsyncAction -Action "stop" -PendingText "상태: 서버 중지 중"
})

$timer.Add_Tick({
    try {
        $status = Invoke-Controller -Action "status"
        Update-StatusUi $status
    } catch {
        $statusLabel.Text = "상태 확인 실패"
    }
})

$form.Add_Shown({
    try {
        $status = Invoke-Controller -Action "status"
        Update-StatusUi $status
    } catch {
        $statusLabel.Text = "상태 확인 실패"
    }
    $timer.Start()
})

$form.Add_FormClosed({
    $timer.Stop()
})

[void]$form.ShowDialog()
