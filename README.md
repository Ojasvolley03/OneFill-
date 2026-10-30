# OneFill — Secure AI Document Scanning & Classification System

A clean, modern document management application featuring an authenticated **encrypted-at-rest vault**, client-side **OCR & text extraction**, **10-domain automatic classification**, and **Pale Cream (`#FDF6E3`) / Light Ivory** styling.

---

## 🔒 Security & Privacy Implementation Report

### 1. Authentication & Access Control
- **User Authentication**: Secure user registration and login with salt-based password hashing (`scrypt`).
- **Strict Authorization Checks**: Every document operation (`list`, `read`, `download`, `category patch`, `delete`) enforces ownership on the backend.
- **IDOR Protection**: Requests with altered document IDs return `404 Not Found` / `403 Forbidden` without leaking the document's existence or metadata across users.

### 2. Private Document Storage (AES-256-GCM)
- Uploaded files are **never** stored in public web-accessible directories.
- Stored exclusively in a private vault directory (`private_data/vault/<userId>/<docId>.enc`), encrypted using **AES-256-GCM** with unique 96-bit initialization vectors (IVs) and 128-bit authentication tags per file.
- Direct permanent public URLs are completely avoided. Access is provided only through authenticated streams.

### 3. File Integrity & Tamper Detection (SHA-256)
- A cryptographic **SHA-256 checksum** is calculated on the raw uploaded file buffer prior to encryption.
- Upon retrieval/download, the file is decrypted and verified using timing-safe comparisons (`crypto.timingSafeEqual`). If any bit in the ciphertext or auth tag has been altered, the server refuses to serve the file and returns a `500 File Integrity Mismatch` alert.

### 4. Secure File Uploads
- **Magic Byte / Signature Validation**: Verifies file signatures on the server before accepting uploads (e.g. `%PDF-` for PDFs, PNG magic bytes, JPEG headers, OpenXML ZIP headers for `.docx`). Disallows executable and script extensions (`.exe`, `.sh`, `.bat`, `.js`, etc.).
- **Filename Sanitization**: Sanitizes names using `path.basename` and strips control characters, path traversal sequences (`../`, `..\\`), and null bytes.
- **File Size Safety**: Strict 50MB payload limit.

### 5. Session Security
- **Cryptographic Tokens**: 256-bit random session tokens.
- **Cookie Security**: Set with `HttpOnly`, `SameSite=Strict`, `Path=/`, and a 2-hour sliding window expiration.
- **Re-authentication**: Destructive operations (such as purging an entire vault) require password re-authentication.

### 6. Document Privacy & Zero-Leak Logging
- **Local Processing**: OCR and text extraction run client-side (via Tesseract.js WebAssembly / PDF.js) and within the user's browser.
- **Zero Third-Party Sharing**: Document contents are never sent to external AI services or third-party trackers.
- **Sanitized Logging**: Server request logs record only timestamps, HTTP methods, paths, and response codes. Request payloads, passwords, and extracted text are strictly excluded from logs.

### 7. Realistic Browser-Level Privacy Protections
- **Anti-Copying**: Text selection disabled on sensitive document preview containers (`user-select: none`).
- **Anti-Shoulder Surfing**: Browser window blur detection automatically blurs sensitive document previews when the tab/window loses focus.
- **Confidential Dynamic Watermark**: Overlays a faint diagonal watermark displaying the authenticated user's email and view timestamp.
- **Print Blocking**: `@media print` CSS policy hides all page content and displays a security notice to prevent print-to-PDF leaks.

---

## ⚠️ Configuration Requirements & Limitations Disclosure

### Configuration Requirements for Production Deployment
1. **HTTPS / TLS Certificate**: When deploying publicly (e.g., via Nginx reverse proxy, Cloudflare, or Vercel), enable HTTPS so that cookies automatically receive the `Secure` flag and all traffic is encrypted in transit.
2. **Master Storage Key**: In production, set the environment variable:
   ```bash
   export ONEFILL_STORAGE_KEY="<64-hex-character-256-bit-key>"
   ```
   If omitted, a random 256-bit key is automatically generated and securely stored in `private_data/keys/storage.key` (excluded from git).

### Remaining Limitations (Honest Assessment)
- **Browser-Level Capture**: As with any web application, CSS/JavaScript cannot physically prevent an operating system-level screenshot, hardware screen recorder, or browser developer tools from capturing displayed pixels.
- **Antivirus / Sandbox Scanning**: File signature checking and magic-byte validation are implemented natively. For high-assurance enterprise defense, an external daemon like ClamAV can be integrated to scan binaries before ingestion.

---

## ⚡ Feature 2 — AI AutoFill (Automatic Form Filling System)

A secure, intelligent form analysis and auto-filling system that matches user details with strict semantic type-checking and explicit user confirmation.

### 1. Personal Information Profile (Encrypted at Rest)
- **Save Once**: Users can save identity, family, contact, address, academic, and dynamic custom fields once.
- **100% Optional**: Every field is optional. Users can save only what they want, edit or delete anytime.
- **AES-256-GCM Encrypted**: Personal profile data is encrypted at rest using AES-256-GCM in `private_data/profiles/<userId>.enc.json`.
- **Zero Third-Party AI Leakage**: Semantic matching and OCR processing run 100% locally on your machine without external cloud API calls.

### 2. Uploaded Form Processing & AI Matching Studio
- **File Support**: PDF forms, form images (PNG/JPG/WEBP), and digital application forms (DOCX, HTML, TXT, JSON).
- **OCR & Question Detection**: Scans and parses questions, labels, choice options, and input types.
- **Contextual Semantic Matching**: Distinguishes subtle meanings (e.g., "Father's Name" matches "Parent/Guardian Name" appropriately, "College" vs "University", "Roll Number" vs "Phone").
- **Reliability Meter**:
  - **Reliable Match (>= 80%)**: Pre-filled and flagged `Ready to Fill`.
  - **Uncertain / Missing**: Left un-filled or flagged for manual user review.
- **Form Actions**:
  - **Download Filled Form (Formatted PDF)**: Generates a clean, official application document PDF with filled values.
  - **Export JSON**: Downloads filled data for system integration.
  - **Copy All Fields**: Copies key-value pairs for quick pasting.

### 3. Live Online Web Form Filling & Browser Extension
- **Platform Support**:
  - **Google Forms (`docs.google.com/forms/*`)**: In-depth support for custom Material list items, question text, input fields, textareas, and radio options.
  - **Generic Web Forms**: Standard `<form>`, `<input>`, `<select>`, and `<textarea>` controls across any website.
- **Explicit Permission Modal**: Displays all matched fields, confidence scores, and preview of values before any field is modified.
- **No Auto-Submit Policy**: Form submission is never triggered automatically; the user must manually confirm and click submit.
- **Download Extension**: One-click download available at `GET /api/autofill/extension/download` or directly from the in-app dashboard.

---

## ⏰ Feature 3 — Deadline & Expiry Intelligence System

An autonomous document lifecycle tracker and multi-interval expiry alarm system that detects upcoming due dates, renewal periods, and deadlines using client-side OCR and natural language heuristics.

### 1. Three Intake Methods
- **Upload Document**: Drag & drop or pick PDF, image, or doc file. Client-side OCR + DateExtractor detects category, document type, expiry/due dates, and amounts.
- **Scan Using Camera**: Live webcam / smartphone camera stream with visual framing guides. Captures snapshot and runs instant neural OCR date extraction.
- **Add Manually**: Direct manual reminder creation with custom intervals, repeat options, amount, and priority without requiring document uploads.

### 2. Document Scanning & AI Date Extraction
- **10 Supported Reminder Categories**:
  1. *Government & Identity* (Passports, Visas, Driving Licenses, National IDs)
  2. *Vehicle & Transportation* (Registration Certificates, PUC, Vehicle Insurance, FASTag)
  3. *Electricity & Household Bills* (Power, Water, Gas/LPG, Broadband, Utilities)
  4. *Banking & Finance* (Credit Card Due Dates, Loan EMIs, Term Deposits, Mutual Fund SIPs)
  5. *Medical & Healthcare* (Prescription Refills, Follow-ups, Vaccinations)
  6. *Education & Student* (Tuition Fees, Exam Registration, Scholarships)
  7. *Personal & Family* (Memberships, Streaming Subscriptions, Rent Agreements)
  8. *Insurance* (Life, Health, Auto, Term Insurance Premiums)
  9. *Government Schemes & Tax* (ITR Filing, Advance Tax, Property Tax, GST)
  10. *Others* (General Deadlines, Custom Tasks)
- **Multi-Format Date Extraction**: Detects `YYYY-MM-DD`, `DD-MM-YYYY`, `DD Month YYYY`, `Month DD YYYY`. Distinguishes expiry dates, renewal dates, payment deadlines, and issue dates.
- **Verification Review Card**: Allows user to review detected information and candidate dates before saving.

### 3. Automated Notifications & Scheduler Engine
- **In-App Notifications**: Header bell icon with real-time unread counter badge, floating notification drawer with filter tabs (*All, Unread, Upcoming, Overdue*), and 1-click "Mark All Read".
- **External Web Push & Background Alarms**: Registered Service Worker (`sw.js`) and Web Push API support for dispatching desktop/mobile notifications even when the application tab is closed.
- **FCM Token Support**: Mobile push registration ready for native Android/iOS applications.
- **Multi-Interval Alarms**: Default alert intervals at 30, 15, 7, 3, 2, 1 days before deadline and on deadline day (0d), plus custom day intervals.
- **Deduplication Engine**: Background scheduler runs every 60 seconds and prevents duplicate alarms per interval cycle.

### 4. Reminder Lifecycle Management
- **Status Workflows**: Active, Completed, and Snoozed.
- **Auto-Repeat Renewal**: Marking recurring reminders completed automatically advances the deadline to the next cycle (Daily, Weekly, Monthly, Quarterly, Half-Yearly, Yearly) and resets alert intervals.
- **Quick Snooze**: Snooze presets for +1 hour, +1 day, +3 days, +1 week, or custom datetime.
- **Interactive Monthly Calendar**: Full calendar view with urgency-coded reminder chips, date navigation, and day inspection drawer.
- **Document Linking**: Connect reminders directly with AES-256-GCM encrypted vault documents via `documentId`.
- **Configurable Limit**: Default limit of 300 active reminders per user, configurable in settings.

### 5. Java Spring Boot & MySQL Reference Module
Located in `backend-spring-boot/`:
- `schema.sql`: Full DDL schema for MySQL 8.0+.
- Entities: `Reminder.java`, `ReminderSettings.java`, `NotificationHistory.java`.
- Repositories: `ReminderRepository.java`, `ReminderSettingsRepository.java`, `NotificationHistoryRepository.java`.
- Services: `ReminderService.java`, `NotificationSchedulerService.java`.
- Controller: `ReminderController.java` (`/api/reminders`).

---

## 🧪 Automated Test Suites

### 1. Security & Storage Vault Tests
```bash
node test_security.js
```
Validates 21 security assertions: AES-256-GCM vault encryption, IDOR user isolation, SHA-256 tamper detection, magic byte validation, and session revocation.

### 2. AI AutoFill & Semantic Matching Tests
```bash
node test_autofill.js
```
Validates 19 functional and security assertions: profile encryption, semantic question matching, and browser extension packaging.

### 3. Deadline & Expiry Intelligence Tests
```bash
node test_reminders.js
```
Validates 13 assertions:
- Category & date extraction heuristics
- Manual reminder creation without documents
- Strict IDOR cross-user protection
- 300 active reminder limit enforcement
- Recurring reminder auto-repeat advancement
- Snooze workflow and status transitions
- In-app notification deduplication and mark-all-read

### Run All Test Suites
```bash
npm test
```
All **53 automated assertions** execute and pass.

---

## 🚀 Running Locally

```bash
node server.js
```
Open **`http://localhost:3000`** in any web browser.

- **Document Scanner & Vault**: `http://localhost:3000` (Tab 1)
- **AI AutoFill & Form Studio**: `http://localhost:3000` (Tab 2)
- **Deadline & Expiry Intelligence**: `http://localhost:3000` (Tab 3)
- **Live Form Simulator & Extension Hub**: `http://localhost:3000` (Tab 4)


