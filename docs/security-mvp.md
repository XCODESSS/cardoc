# Cardoc MVP security status

This is an implementation checklist, not a claim that the app has passed a live security review.

## Implemented in this repository

- The initial SQL migration enables owner-only RLS on vehicles and documents. The `cardoc-documents` Storage bucket is private, limited to PDF/JPEG/PNG and 20 MiB, with owner-folder policies. The app uses only a Supabase publishable key.
- Uploads validate size, type, and file signature. Object keys are scoped to the signed-in user. If metadata insertion fails, upload cleanup removes the new object.
- Present Mode checks the account and exact object path. Cache hits use a local file without a network call. Cache misses use a 60-second signed URL and verify downloaded size before storing a local copy.
- The app requires device authentication before protected routes after session restoration and after backgrounding. Auth tokens and the pending sign-out marker use SecureStore.
- Cached documents, upload/download staging files, offline metadata, and reminder IDs are scoped by account. Sign-out attempts to clear every local store before ending the session. A pending marker blocks session restoration if cleanup was interrupted; the locked screen offers a retry.
- Document deletion requires confirmation and removes the cloud object, cached copy, reminders, offline entry, and metadata. Partial failures leave metadata for a retry. Offline deletion is disabled.
- Android app backup is disabled. Environment files are ignored by Git except `.env.example`. No analytics SDK or service-role key is present in the app source, and document contents are not logged.

## Validation still required

- Apply the migration to a real Supabase project and run the pgTAP isolation tests there. Exercise Storage through the actual API as user A, user B, and unauthenticated; SQL policy tests alone do not verify the HTTP file path.
- Install a native Android build and repeat login, upload, deletion, restart, airplane-mode retrieval, and device-lock tests on hardware. Unit tests and JS export cannot establish those outcomes.
- Review device backup and local-file protection on each release platform. Offline document bytes are stored in app-private files but Cardoc does not implement client-side document encryption. Do not describe this MVP as end-to-end encrypted.
- Verify sign-in and session restoration with realistic accounts on devices. Expo notes that large SecureStore values can be rejected on some iOS releases, historically around 2048 bytes; Supabase sessions may be larger. The current adapter fails closed on a storage error, but its device behavior has not been measured.
- Confirm that a signed URL stops working after its 60-second expiry and that deleted objects cannot be fetched through an older URL.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Expo Android backup setting](https://docs.expo.dev/versions/v57.0.0/config/app/#allowbackup), [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).
