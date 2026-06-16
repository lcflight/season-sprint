; Inno Setup script for Season Sprint Tracker (Windows).
;
; Produces a single SeasonSprintSetup.exe that installs per-user (no UAC),
; copies the Python sources + a Steam-launch wrapper into
; %LOCALAPPDATA%\Programs\SeasonSprint\, and collects all first-run config
; inside the wizard itself (no separate cmd window):
;
;   Welcome
;     -> Enter API key            (native wizard page)
;     -> Installing dependencies   (progress; runs install-deps.bat from a
;                                   temp copy, logged to .season-sprint\install.log)
;     -> Pick game monitor         (native page, populated from the real
;                                   tracker via `season_tracker.py --list-monitors`;
;                                   auto-skipped when there is only one monitor)
;     -> Install (copies files, writes .env)
;     -> Finish (two ways to run: paste the Steam launch line, or start
;                "Season Sprint Tracker" from the Start menu for non-Steam
;                launchers; or a deps-failure message)
;
; Dependencies are installed mid-wizard (on the API-key page's Next) so the
; monitor picker can be enumerated by mss exactly as the tracker sees it. The
; finish page branches on whether the venv python actually got produced.
;
; Build (on Windows with Inno Setup 6 installed):
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
;
; Output: dist\SeasonSprintSetup.exe (relative to this file).

#define AppName       "Season Sprint Tracker"
#define AppVersion    "0.1.9"
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
; No install-location prompt — this is a fixed per-user app dir, not something
; the user needs to choose. Installs straight to DefaultDirName.
DisableDirPage=yes

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
Source: "..\tray.py";           DestDir: "{app}"; Flags: ignoreversion
Source: "..\requirements.txt";  DestDir: "{app}"; Flags: ignoreversion
Source: "..\test_ocr.py";       DestDir: "{app}"; Flags: ignoreversion
Source: "..\setup.bat";         DestDir: "{app}"; Flags: ignoreversion
Source: "..\install-deps.bat";  DestDir: "{app}"; Flags: ignoreversion
Source: "..\launch.bat";        DestDir: "{app}"; Flags: ignoreversion
Source: "..\watch-tracker.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\icon.ico";          DestDir: "{app}"; Flags: ignoreversion
Source: "..\icon.png";          DestDir: "{app}"; Flags: ignoreversion

; Temp-extractable copies (dontcopy) used DURING the wizard, before the files
; above are installed to {app}: install-deps.bat + requirements.txt run the
; dependency bootstrap, and season_tracker.py enumerates monitors. Extracted to
; {tmp} via ExtractTemporaryFile in [Code].
Source: "..\install-deps.bat";  Flags: dontcopy
Source: "..\requirements.txt";  Flags: dontcopy
Source: "..\season_tracker.py"; Flags: dontcopy

[Icons]
; Forward-facing launcher (searchable as "Season Sprint Tracker" in the Start
; menu) for players who don't use Steam. Runs tray.py headless via pythonw, so
; no console window appears; the tracker shows a system-tray icon while running.
Name: "{group}\Season Sprint Tracker"; Filename: "{%USERPROFILE}\.season-sprint\venv\Scripts\pythonw.exe"; Parameters: """{app}\tray.py"""; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"; Comment: "Start the Season Sprint tracker (runs in the system tray)"
Name: "{group}\Reconfigure tracker";  Filename: "{app}\setup.bat"; Parameters: "--install-only"; WorkingDir: "{app}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"

[UninstallDelete]
; Tidy up venv + state + config + logs on uninstall. The whole .season-sprint
; dir (venv + install.log) goes via filesandordirs.
Type: filesandordirs; Name: "{%USERPROFILE}\.season-sprint"
Type: files; Name: "{app}\.env"
Type: files; Name: "{app}\.last-wtp"
Type: files; Name: "{app}\.tracker-pid"
Type: files; Name: "{app}\tracker.log"

[Code]
var
  TokenPage: TInputQueryWizardPage;
  MonitorPage: TInputOptionWizardPage;
  MonitorIndices: array of Integer;  // option index -> mss MONITOR_INDEX
  DepsOK: Boolean;                   // venv python produced by install-deps
  DepsAttempted: Boolean;            // guard so Back/Next doesn't re-run deps
  LaunchEdit: TNewEdit;              // selectable Steam launch line on finish page
  Method2Label: TNewStaticText;     // non-Steam (Start-menu) instructions on finish page

// True once install-deps.bat has produced the venv python. Drives the monitor
// page skip and the finish-page success/failure branch.
function VenvPythonExists: Boolean;
begin
  Result := FileExists(ExpandConstant('{%USERPROFILE}\.season-sprint\venv\Scripts\python.exe'));
end;

// Mirror of _API_KEY_RE in season_tracker.py: "sk_" + 64 lowercase hex chars.
function IsValidApiKey(const S: String): Boolean;
var
  i: Integer;
  c: Char;
begin
  Result := False;
  if Length(S) <> 67 then exit;
  if Copy(S, 1, 3) <> 'sk_' then exit;
  for i := 4 to 67 do begin
    c := S[i];
    if not (((c >= '0') and (c <= '9')) or ((c >= 'a') and (c <= 'f'))) then exit;
  end;
  Result := True;
end;

procedure InitializeWizard;
begin
  DepsOK := False;
  DepsAttempted := False;
  SetArrayLength(MonitorIndices, 0);

  TokenPage := CreateInputQueryPage(wpWelcome,
    'Season Sprint account',
    'Enter your personal API key',
    'Paste the key from the web app''s "API Keys" banner (the full key in the green banner, not the truncated prefix). It starts with "sk_" and is 67 characters long. Clicking Next sets up Python and dependencies, which takes 1-2 minutes on the first install.');
  TokenPage.Add('API key:', True);

  MonitorPage := CreateInputOptionPage(TokenPage.ID,
    'Game monitor',
    'Choose the monitor that runs The Finals',
    'The tracker reads the World Tour Points from the bottom-centre of this screen.',
    True, False);

  // Read-only, selectable edit that holds the Steam launch line on the finish
  // page. A plain label can't be copied (and a long caption clips), so the
  // "paste this exactly" line lives here. Positioned + filled in CurPageChanged.
  LaunchEdit := TNewEdit.Create(WizardForm);
  LaunchEdit.Parent := WizardForm.FinishedPage;
  LaunchEdit.ReadOnly := True;
  LaunchEdit.Visible := False;

  // Second instruction block on the finish page, for non-Steam launchers.
  Method2Label := TNewStaticText.Create(WizardForm);
  Method2Label.Parent := WizardForm.FinishedPage;
  Method2Label.AutoSize := False;
  Method2Label.WordWrap := True;
  Method2Label.Visible := False;
end;

// Run install-deps.bat from a temp copy (logged), then, if it produced the
// venv, enumerate monitors via the tracker and populate the picker page.
procedure RunDepsAndEnumerate;
var
  Progress: TOutputProgressWizardPage;
  rc, i, p1, p2, idx: Integer;
  TmpBat, TmpScript, LogPath, MonFile, VenvPy: String;
  Lines: TArrayOfString;
  line, rest, rest2, idxStr, resStr, posStr: String;
begin
  ForceDirectories(ExpandConstant('{%USERPROFILE}\.season-sprint'));
  ExtractTemporaryFile('install-deps.bat');
  ExtractTemporaryFile('requirements.txt');
  ExtractTemporaryFile('season_tracker.py');

  TmpBat    := ExpandConstant('{tmp}\install-deps.bat');
  TmpScript := ExpandConstant('{tmp}\season_tracker.py');
  LogPath   := ExpandConstant('{%USERPROFILE}\.season-sprint\install.log');
  MonFile   := ExpandConstant('{tmp}\monitors.txt');
  VenvPy    := ExpandConstant('{%USERPROFILE}\.season-sprint\venv\Scripts\python.exe');

  Progress := CreateOutputProgressPage('Installing dependencies',
    'Setting up Python and the Season Sprint tracker.');
  Progress.Show;
  try
    Progress.SetText('Installing Python, PyTorch and EasyOCR...',
      'This can take 1-2 minutes on the first install. Please wait.');
    Progress.SetProgress(10, 100);
    // cmd /C with a redirect; the doubled "" are literal quotes in the Pascal
    // string. cmd strips the outer pair, leaving: "<bat>" > "<log>" 2>&1
    Exec(ExpandConstant('{cmd}'),
      '/C ""' + TmpBat + '" > "' + LogPath + '" 2>&1"',
      ExpandConstant('{tmp}'), SW_HIDE, ewWaitUntilTerminated, rc);

    DepsOK := VenvPythonExists;
    if DepsOK then begin
      Progress.SetText('Detecting monitors...', '');
      Progress.SetProgress(90, 100);
      Exec(ExpandConstant('{cmd}'),
        '/C ""' + VenvPy + '" "' + TmpScript + '" --list-monitors > "' + MonFile + '" 2>&1"',
        ExpandConstant('{tmp}'), SW_HIDE, ewWaitUntilTerminated, rc);

      if LoadStringsFromFile(MonFile, Lines) then begin
        for i := 0 to GetArrayLength(Lines) - 1 do begin
          line := Trim(Lines[i]);
          // Expect: MON|<idx>|<w>x<h>|<left>,<top>  (prefix filters noise)
          if Copy(line, 1, 4) = 'MON|' then begin
            rest := Copy(line, 5, Length(line));
            p1 := Pos('|', rest);
            if p1 > 0 then begin
              idxStr := Copy(rest, 1, p1 - 1);
              rest2  := Copy(rest, p1 + 1, Length(rest));
              p2 := Pos('|', rest2);
              if p2 > 0 then begin
                resStr := Copy(rest2, 1, p2 - 1);
                posStr := Copy(rest2, p2 + 1, Length(rest2));
                idx := StrToIntDef(idxStr, 0);
                if idx > 0 then begin
                  SetArrayLength(MonitorIndices, GetArrayLength(MonitorIndices) + 1);
                  MonitorIndices[GetArrayLength(MonitorIndices) - 1] := idx;
                  MonitorPage.Add('Monitor ' + idxStr + '  -  ' + resStr + '  @ (' + posStr + ')');
                end;
              end;
            end;
          end;
        end;
      end;
      if GetArrayLength(MonitorIndices) > 0 then
        MonitorPage.SelectedValueIndex := 0;
    end;
  finally
    Progress.Hide;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = TokenPage.ID then begin
    if not IsValidApiKey(Trim(TokenPage.Values[0])) then begin
      MsgBox('That does not look like a valid API key.' + #13#10 + #13#10 +
             'It should be 67 characters: "sk_" followed by 64 hex characters.' + #13#10 +
             'Copy the full key from the web app''s "API Keys" banner (not the truncated prefix).',
             mbError, MB_OK);
      Result := False;
      exit;
    end;
    if not DepsAttempted then begin
      DepsAttempted := True;
      RunDepsAndEnumerate;
    end;
  end;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  // Skip the monitor page if deps failed (nothing to enumerate) or there is
  // only one monitor (auto-selected).
  if PageID = MonitorPage.ID then
    Result := (not DepsOK) or (GetArrayLength(MonitorIndices) <= 1);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvLines: TArrayOfString;
  idx, sel: Integer;
begin
  // Write {app}\.env once the files are in place. Done in Inno (not by calling
  // the script) so the token never lands on a command line.
  if CurStep = ssPostInstall then begin
    idx := 1;
    if GetArrayLength(MonitorIndices) > 0 then begin
      sel := MonitorPage.SelectedValueIndex;
      if (sel < 0) or (sel >= GetArrayLength(MonitorIndices)) then sel := 0;
      idx := MonitorIndices[sel];
    end;
    SetArrayLength(EnvLines, 2);
    EnvLines[0] := 'AUTH_TOKEN=' + Trim(TokenPage.Values[0]);
    EnvLines[1] := 'MONITOR_INDEX=' + IntToStr(idx);
    SaveStringsToFile(ExpandConstant('{app}\.env'), EnvLines, False);
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
var
  L: TNewStaticText;
begin
  if CurPageID = wpFinished then begin
    L := WizardForm.FinishedLabel;
    L.AutoSize := False;
    L.WordWrap := True;
    if not VenvPythonExists then begin
      // Deps install failed — point the user at the log and the re-runnable
      // Start Menu shortcut rather than implying a working install.
      LaunchEdit.Visible := False;
      Method2Label.Visible := False;
      L.Height := ScaleY(220);
      L.Caption :=
        'Setup could not finish installing the tracker''s dependencies.' + #13#10 + #13#10 +
        'A common cause is no internet connection, or "winget" being ' +
        'unavailable on older Windows 10 builds (install Python 3.11+ from ' +
        'python.org first, then re-run setup).' + #13#10 + #13#10 +
        'Details were written to:' + #13#10 +
        ExpandConstant('{%USERPROFILE}\.season-sprint\install.log') + #13#10 + #13#10 +
        'After fixing the cause, re-run via Start Menu > ' +
        '"Season Sprint Tracker" > "Reconfigure tracker".';
      exit;
    end;
    // Success: two ways to run. Method 1 (Steam) is the copy-paste launch line
    // in the selectable edit; Method 2 (other launchers) is the Start-menu /
    // tray instructions below it. Heights are kept tight so nothing clips.
    L.Height := ScaleY(92);
    L.Caption :=
      'Installation complete.' + #13#10 + #13#10 +
      'Two ways to run the tracker:' + #13#10 + #13#10 +
      '1) Steam - paste this into your game''s Properties > General > Launch Options:';
    LaunchEdit.SetBounds(L.Left, L.Top + ScaleY(96), L.Width, ScaleY(23));
    LaunchEdit.Text := '"' + ExpandConstant('{app}') + '\launch.bat" %command%';
    LaunchEdit.Visible := True;
    Method2Label.SetBounds(L.Left, L.Top + ScaleY(126), L.Width, ScaleY(104));
    Method2Label.Caption :=
      '2) Other launchers (Epic, Xbox, a direct .exe) - before playing, open ' +
      '"Season Sprint Tracker" from the Start menu (search for it). It runs in ' +
      'the system tray; right-click the tray icon and choose Quit when done.';
    Method2Label.Visible := True;
  end;
end;
