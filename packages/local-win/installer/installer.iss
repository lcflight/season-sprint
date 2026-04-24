; Inno Setup script for Season Sprint Tracker (Windows).
;
; Produces a single SeasonSprintSetup.exe that installs per-user (no UAC),
; copies the Python sources + a Steam-launch wrapper into
; %LOCALAPPDATA%\Programs\SeasonSprint\, then runs setup.bat --install-only
; to bootstrap Python + VC++ Redist + venv + deps + first-run config.
;
; Build (on Windows with Inno Setup 6 installed):
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
;
; Output: dist\SeasonSprintSetup.exe (relative to this file).

#define AppName       "Season Sprint Tracker"
#define AppVersion    "0.1.0"
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
Source: "launch.bat";           DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Reconfigure tracker";  Filename: "{app}\setup.bat"; Parameters: "--install-only"; WorkingDir: "{app}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"

[Run]
; Runs inside a visible cmd window so the user can fill in the prompts
; (server URL, API token, monitor). Blocks the wizard until the bat exits.
Filename: "{app}\setup.bat"; Parameters: "--install-only"; WorkingDir: "{app}"; Flags: runascurrentuser; StatusMsg: "Installing Python, deps, and configuring..."

[UninstallDelete]
; Tidy up venv + state + config on uninstall.
Type: filesandordirs; Name: "{%USERPROFILE}\.season-sprint"
Type: files; Name: "{app}\.env"
Type: files; Name: "{app}\.last-wtp"

[Code]
procedure CurPageChanged(CurPageID: Integer);
var
  LaunchLine: String;
begin
  if CurPageID = wpFinished then begin
    LaunchLine := '"' + ExpandConstant('{app}') + '\launch.bat" %command%';
    WizardForm.FinishedLabel.AutoSize := False;
    WizardForm.FinishedLabel.WordWrap := True;
    WizardForm.FinishedLabel.Caption :=
      'Installation complete.' + #13#10 + #13#10 +
      'In Steam: right-click your game > Properties > General > Launch Options,' + #13#10 +
      'and paste the following line exactly:' + #13#10 + #13#10 +
      LaunchLine + #13#10 + #13#10 +
      'The tracker will then start automatically whenever you launch the game, ' +
      'and stop when you exit it.';
  end;
end;
