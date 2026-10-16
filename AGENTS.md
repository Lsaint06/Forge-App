# Forge-App agent instructions

## Finishing a big update

At the end of every significant update (new features, programming changes, UI redesigns or multi-file refactors), end your final message with the PowerShell command to boot the app on Windows:

```powershell
cd C:\Users\LStAm\source\repos\Forge-App; npm.cmd start
```

Mention that the app is opened by scanning the QR code with Expo Go on the phone. Browser preview is retired (see `docs/WEB.md`).
