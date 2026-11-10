# Releasing

Nothing is released yet. When the Mac app exists, it will follow the same steps as the other OneOrigin apps:

- tag `desktop-vx.y.z`
- CI builds the `.dmg` for GitHub Releases
- update every version file and `CHANGELOG.md` first

The packages stay at 0.x and aren't published to npm.

Release notes will give both ways past the macOS warning for an app that isn't notarized:
- **System Settings:** try to open the app once, then go to System Settings > Privacy & Security, click **Open Anyway**, and click **Open** when the warning comes back. Apple says to do this only for an app you trust.
- **Terminal:** `xattr -dr com.apple.quarantine "/Applications/OneLineage.app"`
