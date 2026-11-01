# Releasing a version

Kenning updates itself from GitHub Releases (`apps/desktop/src-tauri/src/update.rs`).
It asks for `latest.json` from the latest release and installs the installer it
names only if the installer's signature matches the public key built into the
app. A release without a valid signature is never installed.

The repository has to be public for this to work: a private repository answers
404, and the app reports that it could not check.

## Once: the update key

```bash
cd apps/desktop
npx tauri signer generate -w ~/.tauri/kenning.key
```

It asks for a password and prints a public key.

- Put the public key in `apps/desktop/src-tauri/tauri.conf.json`, in
  `plugins.updater.pubkey`, in place of `REPLACE_WITH_THE_PUBLIC_KEY_…`.
  Commit that.
- Keep `~/.tauri/kenning.key` and its password out of the repository, in a
  password manager, with a backup. Whoever holds them can ship an update to
  every Kenning. If they are lost, the installed copies cannot be updated any
  more; people have to install a new version by hand.

## Once: the repository's secrets

In the repository's Settings › Secrets and variables › Actions, add:

- `TAURI_SIGNING_PRIVATE_KEY`: the contents of `~/.tauri/kenning.key`.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password.

The release workflow signs with them; nothing else can read them.

## Each release

1. Raise the version in `Cargo.toml` (workspace), `apps/desktop/package.json`
   and `apps/desktop/src-tauri/tauri.conf.json`.
2. Move the changes into the new version's `## X.Y.Z` section of
   `CHANGELOG.md`. That section becomes the release notes, in the release
   and in the app.
3. Commit (`chore(release): vX.Y.Z`), tag and push:

   ```bash
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```

4. The **Release** workflow (`.github/workflows/release.yml`) then:
   - stops if the tag and the three versions differ, or if the update key
     is still the placeholder;
   - builds the NSIS installer and the MSI, signs them for the updater and
     writes `latest.json` (pointing at the NSIS installer);
   - adds `SHA256SUMS.txt`, and build provenance once the repository is
     public (`gh attestation verify <file> -R PTK030/kenning`);
   - leaves all of it in a **draft** release.
5. Read the draft over, try its installer, and publish it. The app looks for
   `https://github.com/PTK030/kenning/releases/latest/download/latest.json`,
   so only a published release that is not a pre-release reaches anyone.

A release can be built again from an existing tag with **Run workflow** on
the Release workflow.

### By hand, without CI

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content ~/.tauri/kenning.key -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "…"
cd apps/desktop
npx tauri build --config src-tauri/tauri.release.conf.json
```

This writes the installers and their `.sig` files; `latest.json` then has
to be written and uploaded by hand (`version`, `notes`, `pub_date`, and under
`platforms.windows-x86_64` the `.sig` contents and the installer's URL).

## When it reaches people

- People who left "Check for updates" on see "Update to X.Y.Z" in the
  sidebar and the tray menu within 12 hours, or at the next start.
- Everyone else sees it when they press "Check for updates" in Settings or
  under the version in the sidebar.
- Nothing installs until they press "Install and restart".
