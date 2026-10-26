; Removes the Electron version of DevToolsApp (v1.3.0 and earlier) before this version installs.
; The Electron installer used a different uninstall key and install folder.
; Its key is the electron-builder GUID for the app ID com.meshaon.devtoolsapp.
!define ELECTRON_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\4255d8c1-2180-5d21-b4ff-327fb490628a"

!macro REMOVE_ELECTRON_APP ROOT_KEY
  ReadRegStr $R0 ${ROOT_KEY} "${ELECTRON_UNINSTALL_KEY}" "InstallLocation"
  ${If} $R0 != ""
  ${AndIf} ${FileExists} "$R0\Uninstall DevToolsApp.exe"
    DetailPrint "Removing the previous Electron version from $R0"
    ; _?= runs the uninstaller in place, so ExecWait waits until it finishes.
    ExecWait '"$R0\Uninstall DevToolsApp.exe" /S /currentuser _?=$R0'
    Delete "$R0\Uninstall DevToolsApp.exe"
    RMDir /r "$R0"
    DeleteRegKey ${ROOT_KEY} "${ELECTRON_UNINSTALL_KEY}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro REMOVE_ELECTRON_APP HKCU
  !insertmacro REMOVE_ELECTRON_APP HKLM
!macroend
