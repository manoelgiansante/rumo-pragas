# Rumo Pragas — Native iOS App for Agricultural Pest Management (Core MVP)


## Overview

A beautiful native iOS app for Brazilian farmers and agronomists to identify and manage crop pests using AI. Take a photo of a pest or symptom, get instant AI-powered identification with treatment recommendations, track your diagnosis history, and browse a comprehensive pest library.

The design uses a rich green/earth-tone palette inspired by agriculture, with a dark theme as default for field use (bright sun readability). Clean, professional layout following Apple's design language.

---

## Features

### 📸 AI Pest Diagnosis
- Take a photo or choose from gallery of a pest or crop symptom
- Select which crop you're growing (soy, corn, coffee, cotton, sugarcane, wheat)
- AI identifies the pest with confidence level and severity rating
- Get detailed treatment recommendations: cultural, conventional, and organic
- See prevention tips and similar diseases to watch for
- Weather-based risk assessment for your location
- Save diagnoses as favorites for quick reference

### 📋 Diagnosis History
- View all past diagnoses in a timeline
- Filter by crop type, severity, or date
- Search by pest name
- Swipe to delete or favorite
- Empty state when no diagnoses yet

### 📚 Pest Library
- Browse pests organized by crop (Soy, Corn, Coffee, Cotton, Sugarcane, Wheat)
- Each pest entry shows: photo, scientific name, symptoms, treatments, and prevention
- Search across all pests
- Detailed pest profile pages

### ⚙️ Settings & Profile
- Edit profile (name, role, crops, city/state)
- Dark mode toggle (functional)
- Language selector (Portuguese / Spanish)
- Subscription plan management (Free / Básico / Pro)
- Push notification preferences
- About, privacy policy, and support links

### 🔐 Authentication
- Sign up / Sign in with email and password via Supabase Auth
- Profile creation on first sign-up
- Secure token storage

---

## Design

- **Theme:** Dark mode default with rich agricultural green accents (`#2D7A3A`) — feels professional and works well in bright outdoor conditions
- **Typography:** SF Pro with varied weights — bold titles, medium body, light captions
- **Cards:** Rounded cards with subtle shadows on grouped backgrounds
- **Tab bar:** 4 tabs — Home (diagnosis), History, Library, Settings
- **Diagnosis flow:** Full-screen camera/gallery picker → crop selector → loading animation with progress → rich result screen with expandable sections
- **Result screen:** Hero image of the pest photo at top, severity badge, confidence indicator, collapsible treatment sections with color-coded headers (green for cultural, blue for conventional, orange for organic)
- **History:** List with thumbnail, pest name, crop badge, severity color indicator, and date
- **Library:** Crop category cards at top (horizontal scroll), then pest grid below
- **Haptics:** Success feedback on diagnosis complete, selection feedback on crop picker

---

## Screens

1. **Splash / Auth Gate** — Checks if user is signed in, routes to auth or home
2. **Auth Screen** — Clean sign-in / sign-up form with toggle, green gradient header
3. **Home (Diagnosis Tab)** — Large "Diagnose" button with camera icon, recent diagnosis card, quick tips carousel
4. **Crop Selector Sheet** — Grid of crop icons with names (soy, corn, coffee, cotton, sugarcane, wheat)
5. **Diagnosis Loading** — Animated progress view with status messages ("Analyzing image...", "Identifying pest...", "Generating recommendations...")
6. **Diagnosis Result** — Scrollable result with hero photo, pest info, severity, treatments (cultural/conventional/organic), prevention, similar diseases, risk card
7. **History Tab** — Searchable list of past diagnoses with filters
8. **Library Tab** — Crop categories + searchable pest grid
9. **Pest Detail** — Full pest profile with symptoms, lifecycle, treatments, images
10. **Settings Tab** — Profile section, appearance, language, subscription, about
11. **Edit Profile Sheet** — Form to update name, role, crops, location
12. **Paywall Sheet** — Plan comparison (Free / Básico / Pro) with feature matrix

---

## App Icon

- A green leaf with a small magnifying glass overlay, on a rich dark green gradient background
- Modern, clean, and instantly recognizable as an agriculture/inspection tool
- Style: flat with subtle depth, Apple-quality icon design

---

## Technical Notes (for reference)

- Connects to Supabase for auth, database, and storage
- Calls Supabase Edge Functions for AI diagnosis (Agrio visual ID + Claude enrichment)
- Stores diagnosis photos in Supabase Storage
- Uses device location for weather-based risk assessment
- Supports offline viewing of cached history and library data
- Environment variables needed: Supabase URL, Supabase Anon Key, and any additional API keys
