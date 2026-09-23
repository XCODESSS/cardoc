# Cardoc internal Android release

## Build state

The `internal` EAS profile is configured to produce an installable Android APK. It uses the EAS `preview` environment and does not include developer tools or an app store submission. No APK or build ID has been recorded yet.

At preparation time (2026-09-23), neither `EXPO_PUBLIC_SUPABASE_URL` nor `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` was available in the process environment or a local `.env.local`. The project also had no EAS project ID in `app.json`, and `npx eas-cli@latest whoami` returned `Not logged in`. The cloud `preview` environment has not been verified. Do not build or distribute an APK until the intended Supabase project, database migration, private Storage bucket, and these two public client values are configured and checked. Never put a Supabase service-role key in this app or its EAS environment.

## Build and install

1. Link the intended Expo/EAS project and confirm the Android package is `com.cardoc.app`. EAS may prompt to create Android signing credentials on the first build. Record which Expo account and EAS project own the binary.
2. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the EAS project's **preview** environment. They are embedded in client JavaScript. Check their presence and target project without copying their values into this document or a commit.
3. Apply `supabase/migrations/001_initial_schema.sql` to that Supabase project. Confirm the `cardoc-documents` bucket is private and the owner policies are active. Run the RLS test against an isolated database when available.
4. From the repository root, run `npm test -- --runInBand`, `npx expo lint`, `npx tsc --noEmit`, `npx expo install --check`, and `npx expo-doctor`. Resolve failures before building.
5. Run `npx eas-cli@latest build --platform android --profile internal`. Record the EAS build ID, source commit, artifact URL, and SHA-256 checksum below. Install the APK from the build URL on an Android device. The internal build link itself grants access to the APK unless Expo project settings require sign-in; share it only with the intended test group.
6. On the installed binary, verify PDF rendering and local device authentication before involving drivers. Record device model and Android version. This binary must work after a force-close and restart without Metro running.

## Artifact record

| Item | Result |
| --- | --- |
| EAS project and account | Pending |
| Build ID and source commit | Pending |
| APK artifact and SHA-256 | Pending |
| Device and Android version | Pending |
| Install and cold start | Not tested |
| Native PDF viewer | Not tested |
| Biometric/device credential gate | Not tested |

## Installed-build checks

Use non-sensitive sample documents: one driver licence, one vehicle, and that vehicle's RC, insurance, and PUC. Record each outcome and any loading or access error. Airplane-mode tests require the documents to have finished caching first; then force-close and restart the app.

| Scenario | Expected result | Observed result |
| --- | --- | --- |
| Normal Wi-Fi | Register/sign in, add vehicle, upload and view driver and vehicle documents | Not tested |
| Mobile data | Previously uploaded documents and new uploads work | Not tested |
| Airplane mode after restart | Unlock, open Present Mode, render cached RC and insurance with no network wait | Not tested |
| Expired document | Present Mode marks the document expired and still opens it | Not tested |
| Missing required document | Present Mode shows a missing slot and never opens another vehicle's file | Not tested |
| Near-limit multi-page PDF | Upload and render every page offline; oversize PDF is rejected | Not tested |
| JPEG and PNG images | Upload and render each offline | Not tested |
| Logout/login | Logout clears local sensitive state; next login restores authorized cloud data | Not tested |
| App restart | Restored session requires device unlock and cached documents remain available | Not tested |
| Expiry reminders | 30/7/1-day scheduling and rescheduling behave as specified | Not tested |
| Delete document | Cloud object, metadata, local file, and reminders are removed or a retryable error appears | Not tested |

## Retrieval trial and completion gate

With the installed build, give a driver the scenario “Imagine someone asks for your insurance right now. Find it.” Measure time from entering Cardoc to the rendered document, meaningful taps after unlock, hesitation, loading, and network state. Repeat for RC after force-close in airplane mode. Record actual observations in `docs/mvp-field-test.md`. The target is under 10 seconds, at most three meaningful taps, and no network dependency for cached files.

MVP completion remains open until account creation, vehicle creation, vehicle and driver uploads, viewing, offline cache, Present Mode, expiry states, reminders, private cloud storage, local device protection, airplane-mode retrieval, and an installed Android build are each observed on the configured system. Unit tests and a build configuration do not close these gates.

## Sources

- [Expo EAS build profiles](https://docs.expo.dev/build/eas-json/)
- [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/)
- [Expo Android APK builds](https://docs.expo.dev/build-reference/apk/)
- [Expo EAS build environment variables](https://docs.expo.dev/eas/environment-variables/usage/)
