# Cardoc

Cardoc is an Android-first vehicle document wallet. This repository currently contains the Expo bootstrap; the MVP implementation follows [the task plan](docs/superpowers/plans/2026-09-23-cardoc-mvp.md).

## Local development

Use Node.js 22.13 or newer. Install dependencies with `npm ci`, then run `npm start`. Copy `.env.example` to `.env.local` when a Supabase project is available. Keep real Supabase values out of Git.

Run `npm test -- --runInBand`, `npx tsc --noEmit`, `npx expo lint`, and `npx expo install --check` before committing changes. Run `npm run android` with a connected Android device or configured emulator.

The current home screen is a startup placeholder. Account, vehicle, document, offline, and Present Mode flows are subsequent plan tasks.
