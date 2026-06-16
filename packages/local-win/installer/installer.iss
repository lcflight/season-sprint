; Inno Setup script for Season Sprint Tracker (Windows).
;
; Produces a single SeasonSprintSetup.exe that installs per-user (no UAC),
; copies the Python sources + a Steam-launch wrapper into
; %LOCALAPPDATA%\Programs\SeasonSprint\, then runs two [Run] phases:
;   1. install-deps.bat (hidden, logged to {app}\install.log) — bootstraps
;      Python + VC++ Redist + venv + deps.
;   2. season_tracker.py --setup-only (visible) — first-run config prompt.
; Phase 2 is gated on Phase 1 actually producing the venv, so a failed
; dependency install surfaces a clear message instead of an opaque
; "file not found" on the venv python.
;
; Build (on Windows with Inno Setup 6 installed):
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
;
; Output: dist\SeasonSprintSetup.exe (relative to this file).

#define AppName       "Season Sprint Tracker"
#define AppVersion    "0.1.5"
#define AppPublisher  "lcflight"
#define AppURL        "https://github.com/lcflight/season-sprint"

[Setup]
; A stable AppId so future upgrades replace rather than duplicate the install.
AppId={{B4B5F4C5-0E2E-4C2F-8A5F-2B9A12346ABC}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues

; Per-user install, no admin prompt.
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\SeasonSprint
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=no

OutputDir=..\dist
OutputBaseFilename=SeasonSprintSetup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#AppName}

[Files]
; Source paths are relative to this .iss file.
Source: "..\season_tracker.py"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\requirements.txt";  DestDir: "{app}"; Flags: ignoreversion
Source: "..\test_ocr.py";       DestDir: "{app}"; Flags: ignoreversion
Source: "..\setup.bat";         DestDir: "{app}"; Flags: ignoreversion
Source: "..\install-deps.bat";  DestDir: "{app}"; Flags: ignoreversion
Source: "..\launch.bat";        DestDir: "{app}"; Flags: ignoreversion
Source: "..\watch-tracker.bat"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Reconfigure tracker";  Filename: "{app}\setup.bat"; Parameters: "--install-only"; WorkingDir: "{app}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"

[Run]
; Phase 1 — heavy lifting (Python + VCRedist + venv + pip).
; Runs hidden so the user sees Inno's progress bar with our StatusMsg
; instead of a raw cmd window. Takes 1-2 minutes on a cold install
; (PyTorch download dominates).
;
; Invoked via cmd /C so we can redirect all output to {app}\install.log.
; Because the window is hidden, a pip/winget failure would otherwise leave
; the user (and us) with nothing to diagnose; the log is the only record.
; The doubled quotes are Inno escaping — the command cmd actually receives
; is:  /C ""{app}\install-deps.bat" > install.log 2>&1"
Filename: "{cmd}"; Parameters: "/C """"{app}\install-deps.bat"" > install.log 2>&1"""; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; StatusMsg: "Installing Python, PyTorch, and EasyOCR (this takes 1-2 minutes on first install)..."

; Phase 2 — interactive first-run config (prompts for AUTH_TOKEN + monitor).
; Runs in a visible cmd window because the user has to type into it.
; Quick — finishes as soon as the user fills in the prompts.
;
; Check: VenvPythonExists — skip this phase entirely if Phase 1 failed to
; produce the venv python, so we never invoke a non-existent exe (which
; Inno reports as a confusing "system cannot find the file" error). The
; finish page (see [Code]) then shows a deps-failed message instead.
Filename: "{%USERPROFILE}\.season-sprint\venv\Scripts\python.exe"; Parameters: """{app}\season_tracker.py"" --setup-only"; WorkingDir: "{app}"; Flags: runascurrentuser waituntilterminated; StatusMsg: "Configuring your Season Sprint account..."; Check: VenvPythonExists

[UninstallDelete]
; Tidy up venv + state + config + logs on uninstall.
Type: filesandordirs; Name: "{%USERPROFILE}\.season-sprint"
Type: files; Name: "{app}\.env"
Type: files; Name: "{app}\.last-wtp"
Type: files; Name: "{app}\.tracker-pid"
Type: files; Name: "{app}\install.log"
Type: files; Name: "{app}\tracker.log"

[Code]
// True once Phase 1 (install-deps.bat) has produced the venv python. Used
// to gate Phase 2 and to branch the finish page between success and a
// dependency-install failure.
function VenvPythonExists: Boolean;
begin
  Result := FileExists(ExpandConstant('{%USERPROFILE}\.season-sprint\venv\Scripts\python.exe'));
end;

procedure CurPageChanged(CurPageID: Integer);
var
  LaunchLine: String;
begin
  if CurPageID = wpFinished then begin
    WizardForm.FinishedLabel.AutoSize := False;
    WizardForm.FinishedLabel.WordWrap := True;
    if not VenvPythonExists then begin
      // Phase 1 failed — Python/venv/deps never got installed. Point the
      // user at the log and the re-runnable Start Menu shortcut rather than
      // leaving them with a "complete" message for a broken install.
      WizardForm.FinishedLabel.Caption :=
        'Setup could not finish installing the tracker''s dependencies.' + #13#10 + #13#10 +
        'A common cause is no internet connection, or "winget" being ' +
        'unavailable on older Windows 10 builds (install Python 3.11+ from ' +
        'python.org first, then re-run setup).' + #13#10 + #13#10 +
        'Details were written to:' + #13#10 +
        ExpandConstant('{app}') + '\install.log' + #13#10 + #13#10 +
        'After fixing the cause, re-run via Start Menu > ' +
        '"Season Sprint Tracker" > "Reconfigure tracker".';
      exit;
    end;
    LaunchLine := '"' + ExpandConstant('{app}') + '\launch.bat" %command%';
    WizardForm.FinishedLabel.Caption :=
      'Installation complete.' + #13#10 + #13#10 +
      'In Steam: right-click your game > Properties > General > Launch Options,' + #13#10 +
      'and paste the following line exactly:' + #13#10 + #13#10 +
      LaunchLine + #13#10 + #13#10 +
      'The tracker will then start automatically whenever you launch the game, ' +
      'and stop when you exit it.';
  end;
end;
