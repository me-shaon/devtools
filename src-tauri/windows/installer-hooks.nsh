; Removes the Electron version of DevToolsApp (v1.3.0 and earlier) before this version installs.
; The Electron installer used its own uninstall entry and install folder.
; Its install folder is the one that contains "Uninstall DevToolsApp.exe".
!define UNINSTALL_ROOT "Software\Microsoft\Windows\CurrentVersion\Uninstall"
!define ELECTRON_UNINSTALLER "Uninstall DevToolsApp.exe"

!macro REMOVE_ELECTRON_APP ROOT_KEY
  StrCpy $R1 0
  ${Do}
    EnumRegKey $R2 ${ROOT_KEY} "${UNINSTALL_ROOT}" $R1
    ${If} $R2 == ""
      ${Break}
    ${EndIf}
    IntOp $R1 $R1 + 1

    ReadRegStr $R0 ${ROOT_KEY} "${UNINSTALL_ROOT}\$R2" "InstallLocation"
    ${If} $R0 != ""
    ${AndIf} ${FileExists} "$R0\${ELECTRON_UNINSTALLER}"
      DetailPrint "Removing the previous Electron version from $R0"
      ; _?= runs the uninstaller in place, so ExecWait waits until it finishes.
      ExecWait '"$R0\${ELECTRON_UNINSTALLER}" /S /currentuser _?=$R0'
      Delete "$R0\${ELECTRON_UNINSTALLER}"
      RMDir /r "$R0"
      DeleteRegKey ${ROOT_KEY} "${UNINSTALL_ROOT}\$R2"
      ; The next entry moved into the slot of the deleted one.
      IntOp $R1 $R1 - 1
    ${EndIf}
  ${Loop}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro REMOVE_ELECTRON_APP HKCU
  !insertmacro REMOVE_ELECTRON_APP HKLM
!macroend
