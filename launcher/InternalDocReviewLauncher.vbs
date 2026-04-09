Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
launcherPath = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "InternalDocReviewLauncher.ps1")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & launcherPath & """", 0, False
