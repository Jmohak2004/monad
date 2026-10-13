# Ghar for Android

A **Trusted Web Activity** (TWA): a native Android app, built and run from Android
Studio and publishable on Google Play, that shows the Ghar web app full-screen
using Chrome's engine.

## Why a TWA and not a WebView (Capacitor, Cordova)

Mera passkey accounts need WebAuthn with the **PRF extension**. Mera documents
Chrome on Android with Google Password Manager as supported. Android WebView
does not reliably support WebAuthn, let alone PRF. A TWA *is* Chrome, so
passkeys work exactly as they do on the website. They are also bound to the
same domain, which means a person who signed up on the web and then installs
the app still has the same account.

You also get:
- **Claim links open in the app.** App Links capture `https://<your-domain>/claim#k=…` when it's tapped in WhatsApp.
- One codebase. Every web deploy updates the app, with no new Play release needed.

## Open in Android Studio

1. **File → Open…** and select this `android/` folder (not the repo root).
2. Let Gradle sync. It uses AGP 8.13 and Gradle 8.14 (wrapper), with JDK 17+ (Studio's bundled JDK works).
3. Pick the `app` run configuration and a device. The emulator needs a **Google Play** system image (it ships Chrome), and the device should be signed in to a Google account so passkeys can be saved to Google Password Manager.

## Run against your local dev server

`ghar.url` in [`gradle.properties`](gradle.properties) defaults to `http://localhost:3000`.

```bash
# terminal 1: the stack from the root README (hardhat node + deploy + web)
cd web && npm run dev

# terminal 2: make the device's localhost:3000 reach your machine
adb reverse tcp:3000 tcp:3000
```

Then press **Run** in Android Studio. `localhost` counts as a secure context, so
passkeys work. The origin can't be verified, though, so Chrome shows a small URL
bar. That's expected in development.

Dev-mode notes:
- If something else already uses port 3000 on your machine, run the web app on another port and map to it with `adb reverse tcp:3000 tcp:3100`. The app still opens `localhost:3000` on the device.
- Claim links only open *in the app* over `https`. android-browser-helper ignores `http://` intent URLs, so in local dev, open claim links in Chrome on the device instead.
- On a fresh emulator, Chrome shows its welcome screen once before the app loads. Choose "Use without an account", but sign in to a Google account (Settings → Passwords & accounts) if you want to create passkeys.

## Point it at your deployed site

```properties
# gradle.properties, or pass -Pghar.url=... / set in ~/.gradle/gradle.properties
ghar.url=https://ghar.example.com
```

Then publish the Digital Asset Links file. The web app already serves
`/.well-known/assetlinks.json` from env vars:

1. Get your signing certificate's SHA-256:
   ```bash
   ./gradlew signingReport          # debug + release keys
   ```
   For Play releases, also copy the **App signing key** SHA-256 from Play Console → *Test and release → App integrity*.
2. Set them in the web deployment's env:
   ```
   ANDROID_PACKAGE_NAME=io.github.jmohak2004.ghar
   ANDROID_SHA256_CERT_FINGERPRINTS=AA:BB:…,CC:DD:…
   ```
3. Check that `https://ghar.example.com/.well-known/assetlinks.json` returns your fingerprints. Reinstall the app, and the URL bar disappears.

The release build refuses to run with a non-`https` `ghar.url`.

## Release build (Play Store)

```bash
keytool -genkeypair -v -keystore ghar-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
cat > keystore.properties <<EOF
storeFile=ghar-upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
EOF
./gradlew bundleRelease -Pghar.url=https://ghar.example.com   # → app/build/outputs/bundle/release/app-release.aab
```

`*.jks` and `keystore.properties` are gitignored. Keep the keystore safe: it's
your upload key.

## Configuration

| Property (`gradle.properties`) | Default | Notes |
|---|---|---|
| `ghar.url` | `http://localhost:3000` | Origin the app opens. It's also the App Links host and the Digital Asset Links site. |
| `ghar.applicationId` | `io.github.jmohak2004.ghar` | Play package name, permanent once published. Keep it in sync with `ANDROID_PACKAGE_NAME`. |

The app has no Kotlin or Java code. The launcher is
`com.google.androidbrowserhelper.trusted.LauncherActivity` from
[android-browser-helper](https://github.com/GoogleChrome/android-browser-helper),
configured in [`AndroidManifest.xml`](app/src/main/AndroidManifest.xml). Icons
and the splash screen are vector drawables taken from the web icon.
