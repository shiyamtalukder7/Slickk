# Slickk source and offline APK handoff

## Source code

The complete working source is the `slickk` folder. The mobile app is in
`src/`, the local tutor server is in `server/`, and the Android project is in
`android/`. Do not copy `node_modules/`, `server/data/`, or `.env.local` when
sharing source code: they contain generated files, local learner data, or
machine-specific settings.

## What works with the laptop unplugged

The release APK works as a normal installed Android app. It does not need Expo,
Metro, a QR code, USB, or Wi-Fi to launch. It keeps the student profile, camera
captures, selected learning materials, and the embedded English-medium school
directory on the phone.

The on-device directory includes the 118 schools in the Dhaka Education Board
English-medium registry, including Maple Leaf International School (EIIN
190075).

## Honest offline AI boundary

The current Slickk LLM runs through Ollama on the laptop. Therefore live
tutoring, OCR analysis, and server-only curriculum searches need either USB
reverse, the same Wi-Fi network, or a deployed server. They cannot work after
unplugging solely because an APK was installed.

Putting a real LLM entirely on the phone is a separate native-engineering
phase. A realistic approach is a small, quantized model with an Android native
runtime, downloadable model packs, battery/heat limits, and a safe offline
fallback. It is not achieved by bundling the laptop's Ollama model inside the
APK.

## Delivery plan

1. Build and install the updated standalone APK with the embedded directory.
2. Verify Maple Leaf search while USB and Wi-Fi are both off.
3. Keep the existing laptop LLM available over Wi-Fi for full tutoring.
4. Add an optional on-device model runtime only after choosing the target phone
   performance, model size, and languages.
