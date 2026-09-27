!macro customUnInstall

  ; Kill all running amit processes
  ExecWait 'taskkill /F /IM "amit.exe" /T'

  ; Remove amit Windows startup entry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.amit"

  ; Remove any old development Electron startup entry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Electron"

!macroend