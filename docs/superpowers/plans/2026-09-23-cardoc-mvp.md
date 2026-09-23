# Cardoc MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this workspace, use a fresh agentic worker for each task and review its tests, diff, and commit before assigning the next task.

**Goal:** Build an Android-first mobile document wallet that opens the correct cached vehicle or driver document within three meaningful taps after unlock, including in airplane mode.

**Architecture:** Expo Router screens call small TypeScript services for Supabase Auth, PostgreSQL, and private Storage. Each signed-in account has an app-private local file directory and a persisted, account-scoped metadata index so Present Mode can start without a network request. A local authentication gate protects restored sessions and the offline path.

**Tech Stack:** React Native, Expo, TypeScript, Expo Router, Supabase Auth/PostgreSQL/Storage/RLS, Expo FileSystem/SecureStore/LocalAuthentication/Notifications, Zod, Jest, React Native Testing Library, Supabase CLI/pgTAP.

**Spec:** The user-supplied “Cardoc MVP Implementation Plan” in the 2026-09-23 request; no separate repository spec exists. This file resolves implementation details while preserving that request's completion gate.

## Global Constraints

- Keep one Expo mobile app in `D:\cardoc`; do not create a nested `cardoc/cardoc` project or a custom backend.
- Use email and password registration, login, logout, and persisted sessions only. Do not add social login, phone OTP, family accounts, or sharing links.
- Support multiple vehicles and exactly these initial document types: registration, driving_license, insurance, puc, warranty, service, invoice, finance, other. A driving licence is driver scoped and has no vehicle ID; other types are vehicle scoped.
- Accept only PDF, JPEG, and PNG from Files or Photo Library; reject zero-byte and over-20-MiB files before upload. Keep metadata manual. No camera scanner, OCR, classification, or expiry extraction.
- Use a private Supabase bucket and owner-scoped RLS on vehicles, documents, and Storage. Never bundle a service-role key. Never print document contents, URLs, registration numbers, or tokens to logs.
- Treat `offlineAvailable` as device-local derived state, not shared PostgreSQL state. Persist metadata and files per user so a cached document can open after process restart in airplane mode. Clear that user's local files and index on logout.
- Present Mode always uses local metadata first, never waits for a network call to render, includes driver documents and only the selected vehicle's documents, shows required missing slots, and opens a cached file before attempting a download.
- Require a local device authentication gate before displaying a restored session. If biometrics are unavailable, permit the operating system device credential when supported; if no device lock is configured, block document viewing and explain how to enable one.
- Interpret date-only expiry at local calendar-day granularity: before today expired, today through 30 days expiring, later valid, null unknown. Schedule only future local reminders at 30, 7, and 1 days before expiry; cancel prior reminders on update or delete.
- Keep the document viewer focused on the file, name, validity, and close control. PDF support must work on the installable Android build and without internet; Expo Go alone is insufficient to validate the native PDF viewer.
- Do not build CarPlay, Android Auto, Android Automotive, DigiLocker, mParivahan, payments, booking, FASTag, fleet tools, web app, admin dashboard, or analytics. Do not claim end-to-end encryption.
- Every implementation task gets a fresh worker, a focused red/green test where practical, a small self-contained commit, and a review gate. Do not claim physical-device, Supabase-project, or driver-study acceptance without recorded evidence.

## Verified starting state and prerequisites

- `D:\cardoc` was empty and was not a Git repository when this plan was written. There are no existing code or test conventions to preserve.
- Bootstrap at the workspace root. Because this plan makes the root nonempty, scaffold Expo in a temporary sibling directory, copy the generated project files without its `.git`, then initialize Git in `D:\cardoc`. Verify both resolved paths before removing any temporary directory.
- Use the Expo SDK version and dependency ranges generated at execution time by `create-expo-app@latest`; lock them in `package-lock.json` and run `npx expo install --check`. Do not guess SDK-specific versions in advance.
- The generated Expo scaffold includes `AGENTS.md`. Its SDK-documentation and lint/typecheck requirements apply. Task 1 will align its generated `src/app` routing note to this plan's user-specified root `app/` layout.
- The generated project uses Expo SDK 57; its installed React Native Testing Library `render` is asynchronous. Await it in component tests before reading queries or firing events.
- A Supabase project URL and publishable key are needed for device integration. Keep values in untracked `.env.local` and only commit `.env.example`. A local RLS test requires Supabase CLI and Docker. A physical Android device or configured emulator is needed for interactive and airplane-mode gates.
- Expo's current FileSystem API uses `File`, `Directory`, and `Paths`. Its deprecated `FileSystem.downloadAsync`/`deleteAsync` top-level functions throw in the current runtime. Use current APIs.
- `react-native-pdf` requires `react-native-blob-util` and a custom development build; validate the community config plugin against the generated Expo version before relying on it. Do not treat an Expo Go image-only smoke test as PDF acceptance.

## File responsibility map

| File or group | Responsibility |
| --- | --- |
| `app/_layout.tsx`, `app/(auth)/*`, `app/(tabs)/*` | Session/app-lock gate, auth screens, home, vehicles, settings |
| `app/vehicle/*`, `app/document/*`, `app/present/[vehicleId].tsx` | Vehicle CRUD, document entry/view, and presentation flow |
| `components/VehicleCard.tsx`, `DocumentCard.tsx`, `PresentDocumentCard.tsx`, `ExpiryBadge.tsx`, `DocumentViewer.tsx` | Focused display components with no data access |
| `types/vehicle.ts`, `types/document.ts` | Shared domain types and document type constants |
| `validation/vehicle.ts`, `validation/document.ts` | Zod input rules and selected-file checks |
| `lib/supabase.ts`, `session-storage.ts`, `auth.ts`, `app-lock.ts` | Public-key client, secure session adapter, auth state, local unlock |
| `lib/vehicles.ts`, `documents.ts`, `document-upload.ts` | Owner-scoped data calls, upload and deletion orchestration |
| `lib/document-cache.ts`, `offline-index.ts` | App-private files and per-user persisted vehicle/document metadata |
| `lib/present.ts`, `document-status.ts`, `notifications.ts` | Present slots, calendar status, local reminder lifecycle |
| `supabase/migrations/001_initial_schema.sql`, `supabase/tests/001_rls.test.sql` | Schema, grants, RLS, private bucket and cross-user tests |
| `tests/*` | Unit, component, and service tests outside the Expo Router `app` directory |
| `.env.example`, `app.json`, `eas.json`, `README.md` | Configuration template, native settings, installable build, operator steps |

## Shared contracts

```ts
type DocumentType = 'registration' | 'driving_license' | 'insurance' | 'puc' |
  'warranty' | 'service' | 'invoice' | 'finance' | 'other';
type DocumentScope = 'vehicle' | 'driver';
type Vehicle = { id: string; userId: string; nickname: string;
  registrationNumber: string; manufacturer: string | null; model: string | null;
  year: number | null; createdAt: string; updatedAt: string };
type CarDocument = { id: string; userId: string; vehicleId: string | null;
  scope: DocumentScope; type: DocumentType; displayName: string;
  filePath: string; mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  sizeBytes: number; expiryDate: string | null; offlineAvailable: boolean;
  createdAt: string; updatedAt: string };
```

`filePath` is the private Storage object key `<userId>/<documentId>.<ext>`, never a public URL. Database rows omit `offlineAvailable`; the client adds it from `DocumentCache.exists`. Date strings use `YYYY-MM-DD`. `getPresentSlots(vehicleId, documents, today)` returns the fixed order registration, driving licence, insurance, PUC, with missing/unknown/valid/expiring/expired states and only one selected document per slot (latest `updatedAt`, then ID for a stable tie break). Extra document types remain accessible from the vehicle/document list, not the four required slots.

## Execution protocol

For each task, give one fresh worker only that task's files and interfaces; never let two workers edit the same file concurrently. The worker writes the focused test before implementation when practical, records the failing result, implements the minimum, runs the focused test, `npx expo lint`, and `npx tsc --noEmit` (once available), and commits only its files. The coordinator reviews the diff, test output, and scope before assigning the next task. Execute Task 6's cache contract before Task 5's upload integration, because Task 5 must call that cache; keep their task numbers aligned with the supplied spec. If a required device, Supabase project, or Docker service is unavailable, record the blocked acceptance check; continue with independent tasks and do not mark the gate passed.

### Task 1: Bootstrap Cardoc

**Files:** Create generated Expo files, `components/`, `lib/`, `types/`, `validation/`, `tests/`, `supabase/`, `.env.example`, `jest.config.js`; test `tests/bootstrap.test.ts`.

**Interfaces:** Produces the Expo Router app, `npm test -- --runInBand`, `npx tsc --noEmit`, `npx expo install --check`, and an Android launch path for all later tasks.

- [ ] Inspect `node --version`, `npm --version`, `adb devices`, and the empty/nonempty workspace. Scaffold the default TypeScript Expo Router template in a verified temporary sibling, copy it into `D:\cardoc` excluding the temporary `.git`, then initialize Git in the workspace. Set the app name and Android package to Cardoc values in `app.json`.
- [ ] Install `@supabase/supabase-js`, `zod`, `@react-native-async-storage/async-storage`, `react-native-url-polyfill`, `expo-document-picker`, `expo-image-picker`, `expo-file-system`, `expo-secure-store`, `expo-local-authentication`, `expo-notifications`, and `expo-dev-client` with `npx expo install` where Expo manages versions. Install `jest-expo`, `jest`, `@types/jest`, and `@testing-library/react-native` as dev dependencies following the generated SDK documentation.
- [ ] Add `jest.config.js` with `module.exports = { preset: 'jest-expo' }`; add `"test": "jest"` to scripts. Write `tests/bootstrap.test.ts` with `test('Jest is configured', () => expect(1 + 1).toBe(2));`. First run `npm test -- --runInBand` before config and record the expected missing-script/config failure; rerun after setup and expect PASS.
- [ ] Replace template demo routes with a minimal `app/_layout.tsx` and `app/(tabs)/index.tsx` that render “Cardoc”; do not implement auth yet. Add `.env.example` with `EXPO_PUBLIC_SUPABASE_URL=` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=` and ignore `.env.local`.
- [ ] Run `npm test -- --runInBand`, `npx tsc --noEmit`, `npx expo install --check`, and `npx expo start --android` if an Android target exists. Record whether Android startup was observed or blocked by missing hardware/SDK. Commit `chore: bootstrap cardoc mobile app`.

### Task 2: Database and owner isolation

**Files:** Create `supabase/migrations/001_initial_schema.sql`, `supabase/tests/001_rls.test.sql`, `types/vehicle.ts`, `types/document.ts`, `supabase/config.toml` via CLI if needed.

**Interfaces:** Produces `vehicles` and `documents` rows with snake_case columns; private `cardoc-documents` bucket; one owner folder per user; composite ownership FK for vehicle documents.

- [ ] Write pgTAP tests that set `role = authenticated` and `request.jwt.claim.sub` to two fixed UUIDs, asserting A can select A's vehicle/document, B sees neither, B cannot insert a document for A's vehicle, B cannot read A's Storage object, and `anon` sees no rows or objects. Run `npx supabase test db` against local Supabase and record the expected failure before the migration.
- [ ] Add SQL for `public.vehicles` with `id uuid primary key default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, fields from `Vehicle`, `unique(id,user_id)`, and `check (length(trim(nickname)) >= 1 and length(trim(registration_number)) >= 4)`. Add `public.documents` with all persisted `CarDocument` fields except `offlineAvailable`, `foreign key (vehicle_id,user_id) references public.vehicles(id,user_id)`, `size_bytes > 0 and <= 20971520`, MIME/type/scope checks, and `check ((scope='driver' and type='driving_license' and vehicle_id is null) or (scope='vehicle' and type<>'driving_license' and vehicle_id is not null))`.
- [ ] Enable RLS on both tables, revoke `anon` table privileges, grant only required CRUD to `authenticated`, and add separate `SELECT/INSERT/UPDATE/DELETE` policies with `(select auth.uid()) = user_id` in `using` and `with check` where applicable. Insert a private `storage.buckets` row with `id='cardoc-documents'`, `public=false`, `file_size_limit=20971520`, and allowed MIME types. Add Storage object policies for `authenticated` only, constrained to this bucket and `(storage.foldername(name))[1] = (select auth.uid())::text` for read/insert/delete; allow no client update/upsert.
- [ ] Rerun `npx supabase test db`; inspect RLS and bucket state with SQL, including cross-user write and unauthenticated denials. Run `npx tsc --noEmit`. Commit `feat: add vehicle and document data model`.

### Task 3: Authentication and offline identity

**Files:** Create `lib/session-storage.ts`, `lib/supabase.ts`, `lib/auth.ts`, `app/(auth)/login.tsx`, `app/(auth)/register.tsx`; modify `app/_layout.tsx`, `app/(tabs)/settings.tsx`; test `tests/auth.test.tsx`.

**Interfaces:** `register(email,password)`, `login(email,password)`, `logout()`, `subscribeAuth(listener)`, `getOfflineUserId(): Promise<string|null>`. The Supabase client uses only URL and publishable key.

- [ ] Write mocked auth tests for invalid credentials showing an error, successful login reaching home, restored session after remount, and logout clearing both Supabase session and saved offline user ID. Run `npm test -- --runInBand tests/auth.test.tsx`; expect failures for missing exports/screens.
- [ ] Implement a Supabase `SupportedStorage` adapter using `SecureStore.getItemAsync/setItemAsync/deleteItemAsync` for session values and a separate `cardoc.offlineUserId` key. Catch SecureStore persistence errors and surface a blocked login state instead of silently losing restart support. Initialize `createClient` with `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false` and the custom adapter.
- [ ] Build minimal email/password screens with validation, loading and error states, plus a settings logout action. On app startup, first use a restored session; if unavailable only because network refresh fails, use the saved offline user ID for local-only entry after Task 7's lock gate. Never treat an explicit sign-out as an offline session.
- [ ] Rerun auth tests, `npx tsc --noEmit`, and a restart test on Android when available. Commit `feat: add cardoc authentication`.

### Task 4: Vehicle management and local metadata

**Files:** Create `validation/vehicle.ts`, `lib/vehicles.ts`, `lib/offline-index.ts`, `components/VehicleCard.tsx`, `app/(tabs)/vehicles.tsx`, `app/vehicle/new.tsx`, `app/vehicle/[id].tsx`; test `tests/vehicle.test.tsx`, `tests/offline-index.test.ts`.

**Interfaces:** `listVehicles(userId)`, `createVehicle(input)`, `updateVehicle(id,input)`, `deleteVehicle(id)`; `readOfflineIndex(userId)` and `writeOfflineIndex(userId, {vehicles,documents})` use a versioned account-scoped key.

- [ ] Write Zod tests for empty nickname, registration shorter than four, valid optional year, and trimming. Add a component/service test in which saving “My BMW” / “GJ05AB1234” shows the vehicle immediately. Write an index test proving user A's cached vehicles are never returned for user B. Run focused tests and record missing-code failures.
- [ ] Implement `vehicleInputSchema` with `nickname.trim().min(1)`, `registrationNumber.trim().min(4)`, optional manufacturer/model/year and a sensible integer year bound. Map database snake_case rows to `Vehicle` once inside the service. On successful reads/mutations, update the account-scoped offline index; while offline, show the last known vehicle list read-only and label sync state.
- [ ] Implement list, add, detail/edit, and confirmed delete. If a vehicle has documents, require a visible confirmation and use database cascade only after cloud objects/local cache have been removed by the Task 10 deletion service; until then, block deleting a vehicle with documents rather than orphaning Storage objects.
- [ ] Run focused tests, `npm test -- --runInBand`, `npx tsc --noEmit`, and the add-vehicle Android flow when available. Commit `feat: add vehicle management`.

### Task 5: Secure document upload

**Files:** Create `validation/document.ts`, `lib/documents.ts`, `lib/document-upload.ts`, `app/document/new.tsx`, `components/DocumentCard.tsx`; consume the Task 6 `lib/document-cache.ts` contract; test `tests/document-upload.test.ts`.

**Interfaces:** `selectFile(): Promise<SelectedFile|null>`, `selectPhoto(): Promise<SelectedFile|null>`, `uploadDocument(input,selectedFile): Promise<CarDocument>`, `listDocuments(userId): Promise<CarDocument[]>`; `SelectedFile = {uri:string; mimeType:string; sizeBytes:number; name:string}`.

- [ ] Write tests for accepted PDF/JPEG/PNG, unsupported type, zero size, >20 MiB, invalid scope/vehicle combination, and Storage upload failure leaving no DB row. Run focused tests and record failures.
- [ ] Add a Zod document input schema and `validateSelectedFile` that checks actual picker MIME plus extension consistency, nonzero size, and the cap. Use `DocumentPicker.getDocumentAsync({type:['application/pdf','image/jpeg','image/png'],copyToCacheDirectory:true})` for Files and `ImagePicker.launchImageLibraryAsync({mediaTypes:['images']})` for photos; reject HEIC/other results explicitly. Never trust `fileName` alone.
- [ ] Generate a UUID before upload, form the private object key `<userId>/<documentId>.<ext>`, upload bytes with the signed-in Supabase client and `upsert:false`, then insert the DB row. If insert fails, remove the just-uploaded object and show an explicit error; do not claim success if rollback fails. Download/cache the new file and update the offline index; if cache fails, save the cloud record but show `Offline unavailable` and a retry action.
- [ ] Add the manual type, file, expiry, vehicle form. Driver scope forces `vehicleId=null`; vehicle scope requires a selected vehicle. Run the upload tests, typecheck, and real PDF/JPEG/PNG upload on the configured project when available. Commit `feat: add secure document uploads`.

### Task 6: Offline document cache

**Files:** Create `lib/document-cache.ts`; test `tests/document-cache.test.ts`. Task 5 consumes this service after it exists.

**Interfaces:** `interface DocumentCache { save(documentId:string,sourceUri:string):Promise<string>; get(documentId:string):Promise<string|null>; remove(documentId:string):Promise<void>; exists(documentId:string):Promise<boolean> }`; `createDocumentCache(userId)` returns that interface.

- [ ] Write tests first for save/get after a new cache instance (simulated process restart), missing/deleted files, remove, same document ID under different user IDs, and partial-copy failure. Run `npm test -- --runInBand tests/document-cache.test.ts`; expect failure before implementation.
- [ ] Use current Expo `Directory`, `File`, and `Paths.document` APIs under an account-scoped `cardoc/<userId>/` directory. Copy to a temporary file, verify nonzero size, then move to the final name; `get` must check the physical file on every call. Do not store a source picker URI as the cache pointer. Keep the file extension from the validated MIME type so native PDF viewing works.
- [ ] Export `createDocumentCache(userId)` for Task 5. Do not add upload code in this task. `get` returns a URI only after checking the physical file; missing content returns `null` even if an old metadata flag says offline.
- [ ] Run focused and broader tests plus lint and typecheck. The full upload → force-close → airplane-mode → Present → RC device acceptance is run after Task 5 and Task 8 wire this cache into the app; leave that gate open if no device is available. Commit `feat: add offline document storage`.

### Task 7: Protected image/PDF viewer

**Files:** Create `lib/app-lock.ts`, `components/DocumentViewer.tsx`, `app/document/[id].tsx`; modify `app/_layout.tsx`, `app.json`, `package.json`; test `tests/app-lock.test.tsx`, `tests/document-viewer.test.tsx`.

**Interfaces:** `unlockApp(): Promise<'unlocked'|'retry'|'device-lock-required'>`; `DocumentViewer({document,localUri,onClose})` renders JPG/PNG via `Image` and PDF via a native PDF component.

- [ ] Write tests that a restored session shows a lock screen before any sensitive route, failed/canceled device authentication leaves it locked, unlock reveals content, and viewer receives a local file URI for each supported MIME. Run focused tests for expected failures.
- [ ] Use `LocalAuthentication.hasHardwareAsync`, `isEnrolledAsync`, and `authenticateAsync({promptMessage:'Unlock Cardoc',disableDeviceFallback:false})`. Check supported device-credential behavior on Android; if no protected device credential exists, block document content and guide setup. Re-lock on background/foreground return, while avoiding duplicate prompts.
- [ ] Install `react-native-pdf`, `react-native-blob-util`, and the compatible community Expo config plugin; add the plugin to `app.json` and build a custom development client. Verify a local multi-page PDF renders on Android with Wi-Fi disabled. If the generated Expo SDK and plugin cannot build together, resolve that compatibility within this task before declaring PDF support.
- [ ] Render image/PDF in full screen with only document name, validity, and close control. Run tests, typecheck, Android dev build, and offline PDF/image viewing. Commit `feat: add protected document viewer`.

### Task 8: Present Mode

**Files:** Create `lib/present.ts`, `components/PresentDocumentCard.tsx`, `app/present/[vehicleId].tsx`; modify `app/(tabs)/index.tsx`, `app/vehicle/[id].tsx`; test `tests/present-mode.test.tsx`.

**Interfaces:** `getPresentSlots(vehicleId,documents,today): PresentSlot[]`, where `PresentSlot = {type:'registration'|'driving_license'|'insurance'|'puc'; document:CarDocument|null; status:DocumentStatus|'missing'}`.

- [ ] Write tests showing one driver licence plus selected vehicle's RC/insurance/PUC, another vehicle's document excluded, expired status, missing placeholder, stable duplicate choice, and tapping an offline slot opening its local file. Run focused tests and record failures.
- [ ] Implement the pure slot selector. Read the offline index first and render four slots before starting a background sync. Add one prominent Present button on home and each vehicle detail; open `/present/<vehicleId>` with no tabs or settings chrome. Use plain, high-contrast labels and one tap per document.
- [ ] On slot tap, call `DocumentCache.get` before any network method, then navigate to the full-screen viewer. Show a retryable message if a noncached file cannot download. Never show another vehicle's documents, including on stale local metadata.
- [ ] Run focused tests, typecheck, and an Android tap-count check: app open → vehicle → Present → RC, at most three meaningful taps after unlock. Commit `feat: add cardoc present mode`.

### Task 9: Expiry states and local reminders

**Files:** Create `lib/document-status.ts`, `lib/notifications.ts`, `components/ExpiryBadge.tsx`; modify document form and Present cards; test `tests/document-status.test.ts`, `tests/notifications.test.ts`.

**Interfaces:** `getDocumentStatus(expiryDate:string|null,today:Date): {kind:'unknown'|'valid'|'expiring'|'expired';daysRemaining:number|null}`; `rescheduleReminders(userId,document):Promise<void>`; `cancelReminders(userId,documentId):Promise<void>`.

- [ ] Write tests for null, yesterday, today, 1/7/30/31 days away, and DST/calendar boundary; test that changing expiry cancels old notification IDs before new scheduling and deleting a document cancels all IDs. Run focused tests and record failures.
- [ ] Compare `YYYY-MM-DD` calendar parts in local time rather than elapsed 24-hour intervals. Render `Valid`, `Expires in N days`, `Expired N days ago`, or `No expiry date`; show unknown without a misleading checkmark.
- [ ] Request local notification permission with an explicit UI explanation. Keep notification IDs in per-user offline metadata. For each future 30/7/1-day point at 09:00 local time, call `Notifications.scheduleNotificationAsync` with a date trigger and content that avoids registration number/document content; cancel previous IDs before rescheduling. If permission is denied, retain correct in-app status and show reminders disabled.
- [ ] Run focused tests, typecheck, and one short-dated device notification check when available. Commit `feat: add document expiry tracking`.

### Task 10: MVP security and deletion pass

**Files:** Modify `lib/documents.ts`, `lib/vehicles.ts`, `lib/auth.ts`, `lib/document-cache.ts`, `app.json`, migration/policies only if evidence requires; create `tests/security.test.ts` and `docs/security-review.md`.

**Interfaces:** `deleteDocument(document):Promise<void>` removes Storage object, DB row, cache file, offline metadata, and reminders; `logout()` clears only the active account's local sensitive state after Supabase sign-out.

- [ ] Add tests for cross-account fetch/delete denial, signed URL absence or bounded expiry, failed cloud deletion leaving a visible retry state, successful deletion removing all copies, logout removing cached files/index/reminders, and no service-role key in bundled config. Run focused tests for expected failures.
- [ ] Implement explicit deletion order with retry semantics: remove private Storage object first, then DB metadata, then local file/index/reminders. If a cloud step fails, do not falsely report deletion; keep a retryable record. Restrict vehicle deletion until its documents have gone through this path.
- [ ] Inspect generated native backup and screen-capture behavior. Exclude app-private document cache from Android Auto Backup or disable backup for this MVP; keep file sharing off. Add screen capture prevention for document and Present screens if supported by the generated SDK. Record the resulting device-security assumptions in `docs/security-review.md` without claiming client-side encryption.
- [ ] Verify live `storage.buckets.public=false`, `pg_class.relrowsecurity=true` for public tables, no `service_role` reference in app source/build config, no sensitive `console.*` calls, and that any signed URL is short-lived and never persisted. Run SQL RLS tests, Jest, typecheck, and deletion/logout device checks. Commit `security: harden document access`.

### Task 11: Real-world MVP retrieval test

**Files:** Create `docs/mvp-field-test.md`; modify only proven blockers from the observed flow, each with a regression test and separate small commit.

**Interfaces:** Evidence record includes device/build ID, network state, document set, elapsed seconds, meaningful tap count, hesitation/loading observations, and result.

- [ ] On an installable build, create one driver, one vehicle, and DL/RC/insurance/PUC with non-sensitive test documents. Confirm each local file exists, then force-close the app.
- [ ] In airplane mode, ask a driver to “show me your insurance” without coaching. Time from entering Cardoc to rendered insurance, count taps after unlock, and note hesitation or loading. Repeat for RC and after process restart.
- [ ] Record pass only when cached documents render with zero network dependency, retrieval is under 10 seconds, and at most three meaningful taps after unlock. If a result fails, fix that specific blocker with a regression test before adding features. Commit the evidence document as `test: record cardoc retrieval trial` after an actual trial; otherwise leave this task open.

### Task 12: Internal Android release

**Files:** Create `eas.json`, `docs/internal-release.md`; modify build config only as required by a real build.

**Interfaces:** An installable Android APK or internal distribution build with recorded artifact/build ID, plus a completed MVP gate checklist.

- [ ] Configure an EAS internal profile with Android `buildType: 'apk'`, run `npx eas-cli@latest build --platform android --profile internal`, and install the resulting build. Confirm the PDF plugin and local authentication work in that binary, not only in Metro/development mode.
- [ ] On the installed build, execute Wi-Fi, mobile data, airplane mode, expired/missing, near-limit PDF, image, logout/login, and app-restart scenarios; record exact outcomes in `docs/internal-release.md`. Use a small driver group with the insurance retrieval scenario, not a preference survey.
- [ ] Mark the MVP complete only after every specified completion check passes: account creation, vehicle add, vehicle upload, driver upload, viewing, offline cache, Present Mode, expiry states, reminders, private storage, biometric/device protection, airplane-mode retrieval, and installable build. Record any incomplete check explicitly. Commit `chore: prepare cardoc internal release` after a real build and checks.

## Validation commands and sources

Run from `D:\cardoc`: `npm test -- --runInBand`, `npx expo lint`, `npx tsc --noEmit`, `npx expo install --check`, `npx supabase test db` (when local Supabase/Docker exists), and `npx expo run:android` or an EAS development build for native PDF testing. Use a physical-device airplane-mode restart as a separate acceptance gate; mocks do not prove it.

- Expo project setup: https://docs.expo.dev/get-started/create-a-project/
- Expo Router tests and Jest: https://docs.expo.dev/router/reference/testing/ and https://docs.expo.dev/develop/unit-testing/
- Expo FileSystem current API: https://docs.expo.dev/versions/latest/sdk/filesystem/
- Supabase React Native Auth: https://supabase.com/docs/guides/auth/quickstarts/react-native
- Supabase Storage private buckets and RLS: https://supabase.com/docs/guides/storage/buckets/fundamentals and https://supabase.com/docs/guides/storage/security/access-control
- React Native PDF native requirements: https://github.com/wonday/react-native-pdf/blob/master/README.md
- Expo local authentication and notifications: https://docs.expo.dev/versions/latest/sdk/local-authentication/ and https://docs.expo.dev/versions/latest/sdk/notifications/
