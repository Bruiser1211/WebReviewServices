using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Text;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Win32;

namespace InternalDocReviewLauncher
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            var runtime = new RuntimeEnvironment();
            runtime.EnsureExtracted();

            if (args.Length > 0 && string.Equals(args[0], "--start-hidden", StringComparison.OrdinalIgnoreCase))
            {
                runtime.StartServer();
                return;
            }

            if (args.Length > 0 && string.Equals(args[0], "--stop-hidden", StringComparison.OrdinalIgnoreCase))
            {
                runtime.StopServer();
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm(runtime));
        }
    }

    internal sealed class LauncherForm : Form
    {
        private readonly RuntimeEnvironment _runtime;
        private readonly Label _statusLabel;
        private readonly Label _urlLabel;
        private readonly Label _hintLabel;
        private readonly Button _startButton;
        private readonly Button _stopButton;
        private readonly Button _consolidateButton;
        private readonly CheckBox _autoStartToggle;
        private readonly CheckBox _closeToTrayToggle;
        private readonly Timer _statusTimer;
        private readonly NotifyIcon _trayIcon;
        private readonly ContextMenuStrip _trayMenu;
        private readonly PrivateFontCollection _fontCollection;
        private bool _suppressAutoStartEvent;
        private bool _allowExit;
        private bool _trayHintShown;

        public LauncherForm(RuntimeEnvironment runtime)
        {
            _runtime = runtime;
            _fontCollection = new PrivateFontCollection();
            LoadFonts();

            Text = "문서 점검 서버";
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(244, 241, 234);
            ClientSize = new Size(452, 376);
            MinimumSize = new Size(452, 376);
            Font = CreateFont(10f, FontStyle.Regular);

            var titleLabel = new Label
            {
                AutoSize = true,
                Text = "문서 점검 서버 제어",
                Font = CreateFont(15f, FontStyle.Bold),
                Location = new Point(24, 22)
            };

            _statusLabel = new Label
            {
                AutoSize = true,
                Text = "상태 확인 전",
                Font = CreateFont(11f, FontStyle.Bold),
                Location = new Point(24, 68)
            };

            _urlLabel = new Label
            {
                AutoSize = true,
                Text = "접속 주소: http://localhost:3000",
                Font = CreateFont(10f, FontStyle.Regular),
                Location = new Point(24, 100)
            };

            _hintLabel = new Label
            {
                AutoSize = true,
                Text = "시작 버튼을 누르면 서버가 실행됩니다.",
                Font = CreateFont(9f, FontStyle.Regular),
                ForeColor = Color.FromArgb(95, 90, 82),
                Location = new Point(24, 128)
            };

            _autoStartToggle = new CheckBox
            {
                AutoSize = true,
                Text = "윈도우 시작 시 자동 실행",
                Font = CreateFont(10f, FontStyle.Regular),
                Location = new Point(24, 158)
            };
            _autoStartToggle.CheckedChanged += AutoStartToggleChanged;

            _closeToTrayToggle = new CheckBox
            {
                AutoSize = true,
                Text = "창 닫기 시 트레이로 숨기기",
                Font = CreateFont(10f, FontStyle.Regular),
                Location = new Point(24, 186)
            };
            _closeToTrayToggle.CheckedChanged += CloseToTrayToggleChanged;

            _startButton = new Button
            {
                Text = "서버 실행",
                Font = CreateFont(10f, FontStyle.Bold),
                Size = new Size(170, 44),
                Location = new Point(24, 234),
                BackColor = Color.FromArgb(12, 92, 72),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            _startButton.Click += delegate { RunAsyncAction(true, "상태: 서버 시작 중"); };

            _stopButton = new Button
            {
                Text = "서버 중지",
                Font = CreateFont(10f, FontStyle.Bold),
                Size = new Size(170, 44),
                Location = new Point(208, 234),
                FlatStyle = FlatStyle.Flat
            };
            _stopButton.Click += delegate { RunAsyncAction(false, "상태: 서버 중지 중"); };

            _consolidateButton = new Button
            {
                Text = "조치 및 미조치 데이터 정리",
                Font = CreateFont(10f, FontStyle.Bold),
                Size = new Size(354, 42),
                Location = new Point(24, 290),
                FlatStyle = FlatStyle.Flat
            };
            _consolidateButton.Click += delegate { RunConsolidationAction(); };

            Controls.Add(titleLabel);
            Controls.Add(_statusLabel);
            Controls.Add(_urlLabel);
            Controls.Add(_hintLabel);
            Controls.Add(_autoStartToggle);
            Controls.Add(_closeToTrayToggle);
            Controls.Add(_startButton);
            Controls.Add(_stopButton);
            Controls.Add(_consolidateButton);

            _trayMenu = new ContextMenuStrip();
            _trayMenu.Items.Add("창 열기", null, delegate { RestoreFromTray(); });
            _trayMenu.Items.Add("서버 실행", null, delegate { RunAsyncAction(true, "상태: 서버 시작 중"); });
            _trayMenu.Items.Add("서버 중지", null, delegate { RunAsyncAction(false, "상태: 서버 중지 중"); });
            _trayMenu.Items.Add("종료", null, delegate
            {
                _allowExit = true;
                _trayIcon.Visible = false;
                Close();
            });

            _trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Text = "문서 점검 서버",
                Visible = false,
                ContextMenuStrip = _trayMenu
            };
            _trayIcon.DoubleClick += delegate { RestoreFromTray(); };

            _statusTimer = new Timer { Interval = 5000 };
            _statusTimer.Tick += delegate { RefreshStatus(); };

            Shown += delegate
            {
                RefreshStatus();
                _statusTimer.Start();
            };

            FormClosing += HandleFormClosing;

            FormClosed += delegate
            {
                _statusTimer.Stop();
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
                _trayMenu.Dispose();
                _fontCollection.Dispose();
            };
        }

        private void LoadFonts()
        {
            foreach (var fontFile in new[]
            {
                _runtime.GetRuntimeFile("public", "fonts", "Pretendard-Regular.otf"),
                _runtime.GetRuntimeFile("public", "fonts", "Pretendard-SemiBold.otf"),
                _runtime.GetRuntimeFile("public", "fonts", "Pretendard-Bold.otf")
            })
            {
                if (File.Exists(fontFile))
                {
                    _fontCollection.AddFontFile(fontFile);
                }
            }
        }

        private Font CreateFont(float size, FontStyle style)
        {
            if (_fontCollection.Families.Length > 0)
            {
                return new Font(_fontCollection.Families[0], size, style);
            }

            return new Font("Segoe UI", size, style);
        }

        private void AutoStartToggleChanged(object sender, EventArgs e)
        {
            if (_suppressAutoStartEvent)
            {
                return;
            }

            try
            {
                _runtime.SetAutoStart(_autoStartToggle.Checked);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "자동 실행 설정 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                _suppressAutoStartEvent = true;
                _autoStartToggle.Checked = !_autoStartToggle.Checked;
                _suppressAutoStartEvent = false;
            }
        }

        private void CloseToTrayToggleChanged(object sender, EventArgs e)
        {
            if (_suppressAutoStartEvent)
            {
                return;
            }

            try
            {
                _runtime.SetCloseToTrayEnabled(_closeToTrayToggle.Checked);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "트레이 설정 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                _suppressAutoStartEvent = true;
                _closeToTrayToggle.Checked = !_closeToTrayToggle.Checked;
                _suppressAutoStartEvent = false;
            }
        }

        private void RunAsyncAction(bool start, string pendingText)
        {
            _startButton.Enabled = false;
            _stopButton.Enabled = false;
            _consolidateButton.Enabled = false;
            _statusLabel.Text = pendingText;

            var worker = new BackgroundWorker();
            worker.DoWork += delegate(object sender, DoWorkEventArgs args)
            {
                try
                {
                    args.Result = new ActionResult
                    {
                        Ok = true,
                        Status = start ? _runtime.StartServer() : _runtime.StopServer()
                    };
                }
                catch (Exception ex)
                {
                    args.Result = new ActionResult
                    {
                        Ok = false,
                        Error = ex.Message
                    };
                }
            };

            worker.RunWorkerCompleted += delegate(object sender, RunWorkerCompletedEventArgs args)
            {
                _startButton.Enabled = true;
                _stopButton.Enabled = true;
                _consolidateButton.Enabled = true;

                var result = (ActionResult)args.Result;
                if (!result.Ok)
                {
                    MessageBox.Show(result.Error, "실행 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    RefreshStatus();
                    return;
                }

                ApplyStatus(result.Status);
            };

            worker.RunWorkerAsync();
        }

        private void RunConsolidationAction()
        {
            _startButton.Enabled = false;
            _stopButton.Enabled = false;
            _consolidateButton.Enabled = false;
            _statusLabel.Text = "상태: 데이터 정리 중";
            _hintLabel.Text = "조치/미조치 누적 데이터를 Codex로 정리하고 있습니다.";

            var worker = new BackgroundWorker();
            worker.DoWork += delegate(object sender, DoWorkEventArgs args)
            {
                try
                {
                    args.Result = new ConsolidationActionResult
                    {
                        Ok = true,
                        Result = _runtime.ConsolidateReviewFeedback()
                    };
                }
                catch (Exception ex)
                {
                    args.Result = new ConsolidationActionResult
                    {
                        Ok = false,
                        Error = ex.Message
                    };
                }
            };

            worker.RunWorkerCompleted += delegate(object sender, RunWorkerCompletedEventArgs args)
            {
                _startButton.Enabled = true;
                _stopButton.Enabled = true;
                _consolidateButton.Enabled = true;

                var result = (ConsolidationActionResult)args.Result;
                if (!result.Ok)
                {
                    MessageBox.Show(result.Error, "데이터 정리 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    RefreshStatus();
                    return;
                }

                RefreshStatus();
                MessageBox.Show(
                    "조치 및 미조치 데이터 정리가 완료되었습니다.\n\n" +
                    "정리 규칙: " + result.Result.ReferenceRuleCount + "건\n" +
                    "초기화된 누적 데이터: " + result.Result.ArchivedCount + "건\n\n" +
                    "참조 규칙 파일: " + result.Result.ReferencePath + "\n" +
                    "초기화 전 백업 파일: " + result.Result.ArchivePath,
                    "데이터 정리 완료",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            };

            worker.RunWorkerAsync();
        }

        private void RefreshStatus()
        {
            try
            {
                _suppressAutoStartEvent = true;
                _autoStartToggle.Checked = _runtime.IsAutoStartEnabled();
                _closeToTrayToggle.Checked = _runtime.IsCloseToTrayEnabled();
                _suppressAutoStartEvent = false;
                ApplyStatus(_runtime.GetStatus());
            }
            catch
            {
                _statusLabel.Text = "상태 확인 실패";
            }
        }

        private void ApplyStatus(ServerStatus status)
        {
            _urlLabel.Text = "접속 주소: " + status.Url;
            _consolidateButton.Enabled = status.Running && status.Healthy;

            if (status.Running && status.Healthy)
            {
                _statusLabel.Text = "상태: 실행 중";
                _hintLabel.Text = "브라우저에서 http://localhost:3000으로 접속하세요.";
                return;
            }

            if (status.Running)
            {
                _statusLabel.Text = "상태: 시작 중";
                _hintLabel.Text = "서버가 응답을 준비하고 있습니다.";
                return;
            }

            _statusLabel.Text = "상태: 중지됨";
            _hintLabel.Text = "시작 버튼을 누르면 서버가 실행됩니다.";
        }

        private void HandleFormClosing(object sender, FormClosingEventArgs e)
        {
            if (_allowExit || e.CloseReason == CloseReason.WindowsShutDown || !_runtime.IsCloseToTrayEnabled())
            {
                return;
            }

            e.Cancel = true;
            HideToTray();
        }

        private void HideToTray()
        {
            Hide();
            ShowInTaskbar = false;
            _trayIcon.Visible = true;

            if (_trayHintShown)
            {
                return;
            }

            _trayIcon.ShowBalloonTip(
                3000,
                "문서 점검 서버",
                "창을 닫으면 트레이로 숨겨집니다. 아이콘을 더블클릭하면 다시 열 수 있습니다.",
                ToolTipIcon.Info
            );
            _trayHintShown = true;
        }

        private void RestoreFromTray()
        {
            Show();
            ShowInTaskbar = true;
            WindowState = FormWindowState.Normal;
            Activate();
            _trayIcon.Visible = false;
        }
    }

    internal sealed class RuntimeEnvironment
    {
        private const string PackageResourceName = "InternalDocReviewLauncher.RuntimePackage";
        private const string AppFolderName = "InternalDocReviewPlatform";
        private const string RunRegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunRegistryName = "InternalDocReviewLauncher";
        private const string SettingsRegistryPath = @"Software\InternalDocReviewPlatform";
        private const string CloseToTrayRegistryName = "CloseToTrayEnabled";
        private const string LauncherVersion = "2026.04.09.11";

        private readonly string _basePath;
        private readonly string _runtimeRoot;
        private readonly string _dataRoot;
        private readonly string _runtimeVersionFile;
        private readonly string _pidFile;
        private readonly string _nodePath;
        private readonly string _serverPath;

        public RuntimeEnvironment()
        {
            _basePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                AppFolderName);
            _runtimeRoot = Path.Combine(_basePath, "runtime");
            _dataRoot = Path.Combine(_basePath, "data");
            _runtimeVersionFile = Path.Combine(_runtimeRoot, "launcher-version.txt");
            _pidFile = Path.Combine(_dataRoot, "server.pid");
            _nodePath = Path.Combine(_runtimeRoot, "node.exe");
            _serverPath = Path.Combine(_runtimeRoot, "server.js");
        }

        public void EnsureExtracted()
        {
            Directory.CreateDirectory(_basePath);
            Directory.CreateDirectory(_dataRoot);

            var extracted = File.Exists(_serverPath) &&
                            File.Exists(_runtimeVersionFile) &&
                            string.Equals(File.ReadAllText(_runtimeVersionFile), LauncherVersion, StringComparison.Ordinal);

            if (extracted)
            {
                return;
            }

            if (Directory.Exists(_runtimeRoot))
            {
                var existingPid = ReadPid();
                StopServer();

                if (existingPid > 0)
                {
                    var deadline = DateTime.UtcNow.AddSeconds(10);
                    while (DateTime.UtcNow < deadline && IsProcessRunning(existingPid))
                    {
                        System.Threading.Thread.Sleep(250);
                    }
                }

                Exception lastDeleteError = null;
                for (var attempt = 0; attempt < 20; attempt++)
                {
                    try
                    {
                        Directory.Delete(_runtimeRoot, true);
                        lastDeleteError = null;
                        break;
                    }
                    catch (UnauthorizedAccessException ex)
                    {
                        lastDeleteError = ex;
                        System.Threading.Thread.Sleep(500);
                    }
                    catch (IOException ex)
                    {
                        lastDeleteError = ex;
                        System.Threading.Thread.Sleep(500);
                    }
                }

                if (lastDeleteError != null)
                {
                    throw new InvalidOperationException("기존 런타임 폴더를 정리하지 못했습니다.", lastDeleteError);
                }
            }

            Directory.CreateDirectory(_runtimeRoot);

            var tempZip = Path.Combine(_basePath, "runtime-package.zip");
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(PackageResourceName))
            {
                if (stream == null)
                {
                    throw new InvalidOperationException("내장 런타임 패키지를 찾을 수 없습니다.");
                }

                using (var output = File.Create(tempZip))
                {
                    stream.CopyTo(output);
                }
            }

            ZipFile.ExtractToDirectory(tempZip, _runtimeRoot);
            File.Delete(tempZip);
            File.WriteAllText(_runtimeVersionFile, LauncherVersion);
        }

        public string GetRuntimeFile(params string[] parts)
        {
            return Path.Combine(new[] { _runtimeRoot }.Concat(parts).ToArray());
        }

        public bool IsAutoStartEnabled()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(RunRegistryPath, false))
            {
                var value = key == null ? null : key.GetValue(RunRegistryName) as string;
                return !string.IsNullOrWhiteSpace(value);
            }
        }

        public void SetAutoStart(bool enabled)
        {
            using (var key = Registry.CurrentUser.CreateSubKey(RunRegistryPath))
            {
                if (key == null)
                {
                    throw new InvalidOperationException("자동 실행 설정을 위한 레지스트리 키를 만들 수 없습니다.");
                }

                if (enabled)
                {
                    key.SetValue(RunRegistryName, "\"" + Application.ExecutablePath + "\"");
                }
                else
                {
                    key.DeleteValue(RunRegistryName, false);
                }
            }
        }

        public ServerStatus GetStatus()
        {
            var pid = ReadPid();
            if (pid <= 0 || !IsProcessRunning(pid))
            {
                DeletePid();
                return new ServerStatus { Running = false, Healthy = false, Url = "http://localhost:3000" };
            }

            return new ServerStatus
            {
                Running = true,
                Healthy = CheckHealth(),
                Url = "http://localhost:3000",
                Pid = pid
            };
        }

        public ServerStatus StartServer()
        {
            EnsureExtracted();

            var existing = GetStatus();
            if (existing.Running)
            {
                return existing;
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = _nodePath,
                Arguments = "\"" + _serverPath + "\"",
                WorkingDirectory = _runtimeRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            startInfo.EnvironmentVariables["PORT"] = "3000";
            startInfo.EnvironmentVariables["HOSTNAME"] = "0.0.0.0";
            startInfo.EnvironmentVariables["NEXT_TELEMETRY_DISABLED"] = "1";
            startInfo.EnvironmentVariables["CODEX_CLI_PATH"] = ResolveCodexCliPath();
            startInfo.EnvironmentVariables["PATH"] = BuildAugmentedPath(startInfo.EnvironmentVariables["PATH"]);

            var process = Process.Start(startInfo);
            if (process == null)
            {
                throw new InvalidOperationException("서버 프로세스를 시작할 수 없습니다.");
            }

            File.WriteAllText(_pidFile, process.Id.ToString());

            var deadline = DateTime.UtcNow.AddSeconds(20);
            while (DateTime.UtcNow < deadline)
            {
                if (CheckHealth())
                {
                    return GetStatus();
                }

                System.Threading.Thread.Sleep(500);
            }

            StopServer();
            throw new InvalidOperationException("서버를 시작했지만 헬스 체크에 응답하지 않습니다.");
        }

        public ServerStatus StopServer()
        {
            var pid = ReadPid();
            if (pid <= 0 || !IsProcessRunning(pid))
            {
                DeletePid();
                return new ServerStatus { Running = false, Healthy = false, Url = "http://localhost:3000" };
            }

            var stopInfo = new ProcessStartInfo
            {
                FileName = "taskkill",
                Arguments = "/PID " + pid + " /T /F",
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            using (var process = Process.Start(stopInfo))
            {
                if (process != null)
                {
                    process.WaitForExit(5000);
                }
            }

            DeletePid();
            return new ServerStatus { Running = false, Healthy = false, Url = "http://localhost:3000" };
        }

        private int ReadPid()
        {
            if (!File.Exists(_pidFile))
            {
                return 0;
            }

            int pid;
            return int.TryParse(File.ReadAllText(_pidFile).Trim(), out pid) ? pid : 0;
        }

        private void DeletePid()
        {
            if (File.Exists(_pidFile))
            {
                File.Delete(_pidFile);
            }
        }

        private static bool IsProcessRunning(int pid)
        {
            try
            {
                var process = Process.GetProcessById(pid);
                return !process.HasExited;
            }
            catch
            {
                return false;
            }
        }

        private static bool CheckHealth()
        {
            try
            {
                var request = WebRequest.Create("http://127.0.0.1:3000/api/health");
                request.Timeout = 1500;
                using (request.GetResponse())
                {
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }

        public bool IsCloseToTrayEnabled()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(SettingsRegistryPath, false))
            {
                var value = key == null ? null : key.GetValue(CloseToTrayRegistryName);
                if (value == null)
                {
                    return true;
                }

                return string.Equals(value.ToString(), "1", StringComparison.Ordinal);
            }
        }

        public void SetCloseToTrayEnabled(bool enabled)
        {
            using (var key = Registry.CurrentUser.CreateSubKey(SettingsRegistryPath))
            {
                if (key == null)
                {
                    throw new InvalidOperationException("트레이 설정을 위한 레지스트리 키를 만들 수 없습니다.");
                }

                key.SetValue(CloseToTrayRegistryName, enabled ? "1" : "0");
            }
        }

        public ConsolidationResult ConsolidateReviewFeedback()
        {
            var status = GetStatus();
            if (!status.Running || !status.Healthy)
            {
                throw new InvalidOperationException("서버가 실행 중일 때만 조치 및 미조치 데이터를 정리할 수 있습니다.");
            }

            var request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:3000/api/feedback/consolidate");
            request.Method = "POST";
            request.ContentType = "application/json";
            request.Timeout = 1800000;

            var payload = System.Text.Encoding.UTF8.GetBytes("{}");
            using (var requestStream = request.GetRequestStream())
            {
                requestStream.Write(payload, 0, payload.Length);
            }

            try
            {
                using (var response = (HttpWebResponse)request.GetResponse())
                using (var responseStream = response.GetResponseStream())
                using (var reader = new StreamReader(responseStream ?? Stream.Null))
                {
                    var body = reader.ReadToEnd();
                    return ParseConsolidationResult(body);
                }
            }
            catch (WebException ex)
            {
                var responseBody = string.Empty;
                if (ex.Response != null)
                {
                    using (var responseStream = ex.Response.GetResponseStream())
                    using (var reader = new StreamReader(responseStream ?? Stream.Null))
                    {
                        responseBody = reader.ReadToEnd();
                    }
                }

                var errorMessage = ExtractJsonString(responseBody, "error");
                throw new InvalidOperationException(
                    string.IsNullOrWhiteSpace(errorMessage)
                        ? "조치 및 미조치 데이터 정리 요청에 실패했습니다."
                        : errorMessage
                );
            }
        }

        private static ConsolidationResult ParseConsolidationResult(string json)
        {
            return new ConsolidationResult
            {
                ArchivedCount = ExtractJsonInt(json, "archivedCount"),
                ReferenceRuleCount = ExtractJsonInt(json, "referenceRuleCount"),
                ReferencePath = ExtractJsonString(json, "referencePath"),
                ArchivePath = ExtractJsonString(json, "archivePath")
            };
        }

        private static int ExtractJsonInt(string json, string propertyName)
        {
            var match = Regex.Match(
                json ?? string.Empty,
                "\"" + Regex.Escape(propertyName) + "\"\\s*:\\s*(?<value>-?\\d+)"
            );

            int value;
            return match.Success && int.TryParse(match.Groups["value"].Value, out value) ? value : 0;
        }

        private static string ExtractJsonString(string json, string propertyName)
        {
            var match = Regex.Match(
                json ?? string.Empty,
                "\"" + Regex.Escape(propertyName) + "\"\\s*:\\s*\"(?<value>(?:\\\\.|[^\"])*)\""
            );

            return match.Success ? Regex.Unescape(match.Groups["value"].Value) : string.Empty;
        }

        private static string ResolveCodexCliPath()
        {
            var candidates = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".cargo", "bin", "codex.cmd"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".cargo", "bin", "codex.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "npm", "codex.cmd"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "npm", "codex")
            };

            foreach (var candidate in candidates)
            {
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }

            return "codex";
        }

        private static string BuildAugmentedPath(string currentPath)
        {
            var segments = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".cargo", "bin"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "npm"),
                currentPath ?? string.Empty
            };

            return string.Join(";", segments);
        }
    }

    internal sealed class ServerStatus
    {
        public bool Running { get; set; }
        public bool Healthy { get; set; }
        public string Url { get; set; }
        public int Pid { get; set; }
    }

    internal sealed class ActionResult
    {
        public bool Ok { get; set; }
        public ServerStatus Status { get; set; }
        public string Error { get; set; }
    }

    internal sealed class ConsolidationActionResult
    {
        public bool Ok { get; set; }
        public ConsolidationResult Result { get; set; }
        public string Error { get; set; }
    }

    internal sealed class ConsolidationResult
    {
        public int ArchivedCount { get; set; }
        public int ReferenceRuleCount { get; set; }
        public string ReferencePath { get; set; }
        public string ArchivePath { get; set; }
    }
}





