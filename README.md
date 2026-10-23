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

## 🧪 Security Test Suite

Run the automated security test suite anytime to verify all protections:
```bash
node test_security.js
```
Validates:
- Unauthenticated access prevention (401)
- Direct key / code path traversal blocks (403)
- User registration & session token generation with HttpOnly cookies
- Magic byte validation & spoofing rejection
- Path traversal filename sanitization
- AES-256-GCM encryption at rest in private vault (no plaintext on disk)
- IDOR cross-user access prevention (Bob cannot view, download, update, or delete Alice's documents)
- Tampering detection with bitflip simulation
- Session termination & revocation on logout

---

## 🚀 Running Locally

```bash
node server.js
```
Open **`http://localhost:3000`** in any web browser.
