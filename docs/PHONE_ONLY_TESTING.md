# FORGE on an iPhone using only Safari

## What was actually verified

In Codex, the existing SDK 57 app dependencies were reused. Expo's supported `@expo/ngrok` helper was installed in a separate tooling directory, without modifying the app manifests or lockfile. One Expo Go tunnel attempt ended with **`ngrok tunnel took too long to connect`**. No public URL was allocated or externally verified. Repeating the same attempt is not recommended.

An internal SDK 57 manifest and iOS development bundle returned HTTP 200. With Expo's `EXPO_PACKAGER_PROXY_URL` pointing at a test hostname, the manifest advertised that HTTPS hostname instead of a container/LAN address. This verifies the local forwarding configuration, **not** an actual Codespace or a physical iPhone session.

Official sources confirm that personal GitHub accounts have included monthly Codespaces usage, that Codespaces can run in a browser, and that forwarded ports can be public. Expo Go's official iOS registration includes `exps`, the HTTPS project URI scheme. Your account's remaining quota and actual Codespaces availability could not be inspected because GitHub API access was blocked from Codex. No Codespace, paid service, account, purchase or signed build was created.

## Safari-only steps

1. Install **Expo Go** from the [iPhone App Store](https://apps.apple.com/app/expo-go/id982107779). It must support SDK 58. If it reports a version mismatch, preserve the error rather than upgrading dependencies blindly.
2. Sign in to GitHub in Safari. Check your personal **Settings → Billing and licensing → Usage** for remaining included Codespaces usage. Create a Codespace only if included free usage is available; do not enable paid usage or add payment information. Stop if GitHub says your free allowance is exhausted.
3. Open [FORGE's implementation branch](https://github.com/Lsaint06/Forge-App/tree/feat/forge-app). Select **Code → Codespaces → Create codespace on feat/forge-app**, using the smallest **2-core** machine and your personal account. The selected branch must contain `package.json` and `scripts/start-codespaces-phone.sh`; main may still contain only the original README.
4. If the editor is cramped, rotate the phone to landscape and use Safari's page menu → **Request Desktop Website**. In the editor menu, choose **Terminal → New Terminal** (or View → Command Palette → Terminal: Create New Terminal).
5. Paste and run:

   ```sh
   bash scripts/start-codespaces-phone.sh
   ```

   It selects Node 24 through the default container's nvm if necessary, runs frozen `npm ci`, starts a small launch-button page on 8080, and runs Expo Go Metro on 8081. No ngrok account or tunnel package is required. Keep this terminal running.

6. Open the editor's **Ports** panel. If necessary, add **8080** and **8081**. Change both ports' **Port Visibility** to **Public**. Keep their upstream **Port Protocol** as **HTTP**: GitHub's outward-facing URL is still HTTPS, and changing the upstream protocol to HTTPS can make the port private again. A private GitHub login gate cannot be used by Expo Go.

   If accessing the menu from touch is difficult, you can try this in a second terminal:

   ```sh
   gh codespace ports visibility 8080:public 8081:public --codespace "$CODESPACE_NAME"
   ```

   If the injected token cannot change visibility, use the Ports panel; do not paste tokens or credentials.

7. In the second terminal, run:

   ```sh
   python3 scripts/check-codespaces-phone.py
   ```

   Require **`PASS: public HTTPS status, FORGE SDK 58 manifest and iOS bundle`**. The check sends no GitHub cookies or authorization header. If it gets a login page, 403, 404 or a non-HTTPS/local bundle URL, the endpoint is not ready; correct the port settings or Metro startup before opening Expo Go.

8. Copy the **Safari launch page** printed by the helper/check into a new Safari tab. It is your real allocated `https://<codespace-name>-8080.app.github.dev` address, not an example URL. Tap **Open FORGE in Expo Go**, then accept iOS's Open prompt. The button uses the actual `exps://<codespace-name>-8081.app.github.dev` URL. Use this button rather than the CLI QR, which may encode an unsuitable exp:// scheme for HTTPS forwarding.
9. In FORGE, skip optional onboarding and test guest mode. No Supabase credentials are needed. Start a workout, add an exercise, enter reps/load and complete a set. If startup fails, retain the exact Expo Go error; public endpoint success alone does not establish native execution.
10. Keep the Codespace and Metro active while testing. If it auto-stops, resume it in Safari and rerun the helper. When finished, stop Metro with Ctrl+C and **Stop codespace** in GitHub to end compute usage; delete it later if you do not need its storage. No server lifetime beyond the provider's limits is promised.

The launch HTTP server serves only a fresh temporary directory containing a single button page. It never serves the repository or `.env` directory. The public Metro port is intended for temporary app testing. This changes hosting configuration, not FORGE's architecture or features.

## Official references

- [What are GitHub Codespaces?](https://docs.github.com/en/codespaces/about-codespaces/what-are-codespaces)
- [Creating a Codespace for a repository](https://docs.github.com/en/codespaces/developing-in-a-codespace/creating-a-codespace-for-a-repository)
- [Forwarding ports in Codespaces](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)
- [Expo Go iOS URL scheme registration](https://github.com/expo/expo/blob/main/apps/expo-go/ios/Exponent/Supporting/Info.plist)

The helpers passed shell/Python syntax checks and the underlying Expo proxy configuration was exercised locally. The complete Codespaces → Safari → Expo Go flow remains unverified until you create the free Codespace, run its public check and open it on your phone.
