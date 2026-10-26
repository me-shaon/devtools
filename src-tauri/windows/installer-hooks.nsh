; Removes the Electron version of DevToolsApp (v1.3.0 and earlier) before this version installs.
; The Electron installer was a one-click, per-user installer with a fixed install folder.
; Its uninstaller also deletes its own uninstall entry.
!define ELECTRON_INSTALL_DIR "$LOCALAPPDATA\Programs\devtools"
!define ELECTRON_UNINSTALLER "Uninstall DevToolsApp.exe"

!macro NSIS_HOOK_PREINSTALL
  ${If} ${FileExists} "${ELECTRON_INSTALL_DIR}\${ELECTRON_UNINSTALLER}"
    DetailPrint "Removing the previous Electron version from ${ELECTRON_INSTALL_DIR}"
    ; _?= runs the uninstaller in place, so ExecWait waits until it finishes.
    ExecWait '"${ELECTRON_INSTALL_DIR}\${ELECTRON_UNINSTALLER}" /S /currentuser _?=${ELECTRON_INSTALL_DIR}'
    ; An uninstaller that runs in place cannot delete itself.
    Delete "${ELECTRON_INSTALL_DIR}\${ELECTRON_UNINSTALLER}"
    RMDir /r "${ELECTRON_INSTALL_DIR}"
  ${EndIf}
!macroend
