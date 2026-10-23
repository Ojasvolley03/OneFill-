# OneFill — Document Scanning & Classification System

A simple, clean, and modern web application built for **OneFill**, featuring an Antigravity-inspired dark theme and intelligent document scanning and classification.

---

## ✨ Core Features

### 1. Document Scanning & Text Extraction (OCR)
- **Scanning Side Panel**: When a user uploads a document, a dedicated scanner panel docks on the side of the screen displaying the document preview alongside an animated laser beam sweep.
- **Real Text Extraction & OCR**:
  - **Images (`.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`)**: Uses **Tesseract.js** client-side OCR running optical character recognition.
  - **PDFs (`.pdf`)**: Uses **PDF.js** to parse text streams across pages and renders Page 1 onto an offscreen canvas for a crisp visual thumbnail.
  - **Word Documents (`.docx`)**: Uses **JSZip** to parse `word/document.xml` text nodes directly.
  - **Text / Code (`.txt`, `.csv`, `.json`, `.md`)**: Native stream text reading.
  - **Graceful Fallbacks**: Unsupported or corrupted files are handled gracefully via filename and metadata classification without crashing.

### 2. Automatic 10-Domain Category Classifier
Analyzes the extracted text content against weighted domain dictionaries to automatically assign the document into **exactly one of these 10 categories**:
1. **Personal Documents** (Passports, driver's licenses, IDs, birth certificates)
2. **Education** (Degrees, diplomas, transcripts, syllabi, student IDs)
3. **Legal Documents** (Contracts, agreements, NDAs, affidavits, court docs)
4. **Career & Jobs** (Resumes, CVs, offer letters, payslips, experience letters)
5. **Finance & Banking** (Bank statements, tax invoices, balance sheets, credit cards)
6. **Business Documents** (Business plans, proposals, pitch decks, meeting minutes)
7. **Health & Medical** (Prescriptions, lab reports, doctor notes, medical bills)
8. **Bills & Utilities** (Electricity, water, gas, broadband, telecom bills)
9. **Government Documents** (Tax returns, SSN, PAN, Aadhaar, visas, official notices)
10. **Other Documents** (General documents not matching specific criteria)

### 3. Category Correction
- Users can review the assigned category in the **Scanning Panel** or directly in the **Repository View** (cards and table rows) and correct it using an intuitive dropdown. Corrections are immediately saved to the database.

### 4. Pale Cream Aesthetic & Persistent Storage
- Styled with a warm **Pale Cream / Light Ivory aesthetic** (`#FDF6E3`, RGB: 253, 246, 227) paired with crisp white cards, warm espresso typography, and refined ivory borders.
- Stored persistently in browser **IndexedDB** (`OneFillDB`).
- Clean repository: Starts empty, storing strictly documents uploaded by the user with an on-demand "Clear All" action.

---

## 🚀 Running Locally

```bash
node server.js
```
Open **`http://localhost:3000`** in any web browser.

---

## 🌐 Free Public Web Hosting (GitHub Pages)

Your code is pushed to: **`https://github.com/Ojasvolley03/OneFill-`**

To activate your free public web link:
1. Go to: **`https://github.com/Ojasvolley03/OneFill-/settings/pages`**
2. Under **Build and deployment > Source**, select **Deploy from a branch**.
3. Select branch **`main`** and folder **`/ (root)`**, then click **Save**.
4. Live site URL: **`https://ojasvolley03.github.io/OneFill-/`**
