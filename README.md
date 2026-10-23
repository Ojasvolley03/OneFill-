# OneFill — AI-Powered Document Collection Repository

A simple, clean, and modern website built for **OneFill**, an AI-powered document management project.

This version implements the **single core feature**: a centralized **Document Collection System** where users can upload, categorize, inspect, and store their documents in one place with zero external dependencies.

---

## ✨ Features Implemented

- **Document Intake & Upload Form**:
  - Drag-and-drop zone with file picker fallback.
  - Supports PDF, Word documents (`.doc`, `.docx`), spreadsheets (`.csv`, `.xlsx`), plain text / Markdown (`.txt`, `.md`, `.json`), and images (`.png`, `.jpg`).
  - Staged file pill preview with instant size calculations and remove option.
  - Metadata collection: Document Title, Category (`Technical`, `Financial`, `Legal`, `Research`, `General`), and optional notes.
  - Safe 50MB file validation with client-side feedback.

- **Unified Collection Repository**:
  - **Grid & Table (List) Views**: Instant toggle between visual card grid and compact data table.
  - **Live Search & Filter**: Real-time filtering by keyword, title, filename, or category chips.
  - **Document Inspection Modal**: Detailed view displaying file metadata, category, size, timestamps, and an integrated preview for text/csv and images.
  - **Native Download & Deletion**: One-click download of the exact uploaded file blob and safe removal.

- **Persistent Client-Side Storage**:
  - Uses browser **IndexedDB** (`DocVaultDB`). Files persist across page reloads and browser restarts without needing an external database setup.
  - Pre-seeded with 3 realistic sample documents on initial launch (can be reset anytime via the "Reset Samples" button).

- **Modern Minimal Design System**:
  - Dark mode aesthetic with curated deep slate and violet/indigo accents.
  - Micro-animations, responsive grid layout, and non-intrusive toast notification system.
  - Zero heavy third-party framework dependencies (Vanilla HTML5, CSS3, ES6+ JavaScript).

---

## 🚀 Running the Project

### Option 1: Start the Local Node Server (Recommended)
From this directory:
```bash
node server.js
```
Then open your browser at:
```
http://localhost:3000
```

### Option 2: Open Directly in Browser
You can also directly open `index.html` in any modern web browser (Chrome, Edge, Firefox, Safari).

---

## 📁 File Structure

```
docvault-ai/
├── index.html       # Semantic HTML5 layout with accessible forms and modals
├── styles.css       # Vanilla CSS3 modern design system with glassmorphism & dark theme
├── app.js           # Client-side UI interactions, search, filter, and modal preview logic
├── storage.js       # IndexedDB storage engine for persistent file blob custody
├── server.js        # Lightweight zero-dependency Node HTTP server
└── README.md        # Documentation
```
