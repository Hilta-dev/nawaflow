# NAWA project rules (read this first, every time)

## What NAWA is
NAWA is a voice first bookkeeping app for small business owners in Namibia.
The owner speaks or types a sale, NAWA understands it, the owner reviews it, and it is saved.
It also tracks stock, customers who owe money, expenses and simple reports.

Stack today: React frontend (Vite), Node and Express backend in the server folder, Supabase for login and data, Meta AI for transcription and parsing, hosted on Render.
Native apps will be made with Capacitor from the same React code.

## The goal
A real working app that Google Play, Apple App Store and Huawei AppGallery accept.
It must solve real problems for Namibian traders. It is not a demo.

## Hard rules
1. Never show, print, log or commit any key or password. Never show the content of any .env file.
2. Work only on the git branch called store-ready. Never push to main.
3. Do one feature at a time. When it is done, list the files you changed, tell me how to test it, then stop and wait.
4. Keep it simple. No new frameworks. Capacitor and its official plugins are approved. Ask me before adding any other package.
5. Do not use dashes in any app text or code comments. Keep comments short and simple, like "//customer part". No divider style comments.
6. No demo wording anywhere in the product. Never write: demo, sample data, prototype, guided example, simulated, preview.
7. Everything saves for real to Supabase. Each user can only see their own business data (Row Level Security).
8. The Supabase service role key lives only in server/.env on the server. It must never be inside the frontend or the mobile app.
9. Money is Namibian dollars (N$). Round to 2 decimals. Recalculate totals on the server. Never trust totals sent from the phone.
10. Voice: record with the browser MediaRecorder, send the audio to our own server for transcription. Never use Chrome speech recognition, because it does not exist inside app webviews or on Huawei phones. The user always reviews before anything is saved.
11. The app must work on phones without Google services (Huawei). No Firebase, no FCM push, no Google Sign In, no Google Maps. Use local notifications only.
12. Store rules: account deletion must be inside the app, the privacy policy link must be in Settings and on the create account screen, the microphone permission needs a clear plain sentence.
13. Do not add money transfers, payments, loans or card features. NAWA only records business activity. That keeps it out of regulated finance rules.
14. Mobile first. Design width 430px. Respect safe areas. Tap targets at least 44px tall. Must work in Android WebView and iOS WKWebView.
15. Design source: docs/design (images) and docs/SCREENS.md. Colors, radius, spacing and font come only from the variables in docs/theme-tokens.css. No hard coded colors.

## How to talk to me
I am a second year Computer Science student. Use beginner friendly language.
Explain before or alongside the code. Give full code, not descriptions.
When an error happens, explain it in plain language, with a Java comparison when it helps.
