; The one-click installer always uses the current-user registry and directory.
; Never invoke an old machine-wide uninstaller, even when one is present.
!macro customInit
  ReadRegStr $R0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $R0 != ""
    DetailPrint "An all-users installation exists. It will be left unchanged."
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONINFORMATION "An older installation for all users exists. HAICoMo will install for your account only. Removing the older installation is a separate administrator action."
    ${EndIf}
  ${EndIf}
!macroend
