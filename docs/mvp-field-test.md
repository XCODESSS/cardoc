# Cardoc MVP field test

**Status:** Pending on-device execution. This document is a protocol and blank evidence record, not a test result.

## Prepare one realistic account

Use an **installable Android build** and non-sensitive sample documents. Record the build identifier and device below. Sign in as one driver, add one vehicle, and upload exactly these four documents:

| Scope | Type | Required association |
| --- | --- | --- |
| Driver | Driving Licence (DL) | No vehicle |
| Vehicle | Registration / RC | Test vehicle |
| Vehicle | Insurance | Test vehicle |
| Vehicle | PUC | Test vehicle |

Confirm all four documents open while online and show as available offline. Force-close Cardoc. Turn on airplane mode and confirm Wi-Fi remains off. Restart Cardoc from its launcher icon and unlock it through the app's device-authentication prompt. Keep the phone offline for every trial below. If any document must download, the offline gate fails.

## Retrieval trials

Ask the driver, without pointing to a control: **“Show me your insurance.”** Start timing when they enter Cardoc after phone unlock. Stop when the full document is readable. Count meaningful taps after entering the app, including vehicle, Present, and Insurance; do not count device or app unlock actions. Record hesitation, visible loading, failed taps, and whether the displayed document belongs to the selected vehicle.

Repeat the same procedure for **RC**. Force-close and restart Cardoc while still in airplane mode, then repeat the insurance request to test persisted offline access. Keep the app offline throughout; airplane mode with Wi-Fi off is the network-dependency check. A cached document that fails to render is a failure even if its metadata appears.

Pass each retrieval only if the **correct full document** appears in **less than 10 seconds**, with **at most 3 meaningful taps after entering Cardoc**, and **zero network dependency**. Record a failure for any missing, wrong, or unreadable document. Do not mark the MVP field gate passed until all three trials pass on the installed build. Fix an observed blocker with a focused regression test, then repeat the failed trial before adding features.

## Evidence record (fill in during the actual trial)

- Date/time and location: ______
- Tester (anonymous ID): ______
- Android device/model and OS version: ______
- Cardoc build ID/version and Git commit: ______
- Supabase project environment (identifier only; no keys): ______
- Sample driver and vehicle identifiers (non-sensitive aliases): ______
- Files used (type, format, approximate size; no document contents): ______
- Before force-close: four files opened online and marked offline available? ______
- Airplane mode enabled, Wi-Fi off, app force-closed/restarted? ______
- App lock completed successfully? ______

| Trial | Correct full document readable? | Seconds from app entry | Meaningful taps | Hesitation / loading / errors | Network used? | Pass / fail |
| --- | --- | ---: | ---: | --- | --- | --- |
| Insurance, first offline launch |  |  |  |  |  |  |
| RC, same offline session |  |  |  |  |  |  |
| Insurance, offline restart |  |  |  |  |  |  |

- Observed blocker and reproduction steps (if any): ______
- Regression test / fix commit (if any): ______
- Repeat-trial results after fix (if any): ______
- Overall field gate: **Pending / Pass / Fail**

## Environment check on 2026-09-23

`adb` was not found on PATH. The usual Android SDK platform-tools paths checked in this workspace were absent, and `ANDROID_HOME` / `ANDROID_SDK_ROOT` were unset. No connected Android device or installed build was verified here. The evidence fields above remain blank until an actual device trial.
