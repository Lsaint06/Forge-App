# Browser preview retired

At the user’s request, FORGE now targets iOS and Android only. Desktop preview scripts, browser adapters and browser automation have been removed. Use `npx expo start --go` from the repository and scan the QR code with your phone. See [iPhone setup](../IPHONE_TESTING.md).

If you previously used the browser, its records are separate from the phone database. This change does not migrate or erase that browser storage. To recover it, run the earlier browser-capable commit in a separate checkout, export a backup, and import it on the phone only after backing up current phone data: importing replaces local records.
