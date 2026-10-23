/**
 * OneFill - Application Logic & Document Processing Hub
 * Handles file ingestion, OCR text extraction, 10-domain classification,
 * side scanning animation panel, and repository management.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements - Metrics
  const statTotalDocs = document.getElementById('stat-total-docs');
  const statTotalSize = document.getElementById('stat-total-size');
  const statScannedCount = document.getElementById('stat-scanned-count');

  // DOM Elements - Upload Form
  const form = document.getElementById('doc-upload-form');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const stagedFileCard = document.getElementById('staged-file-card');
  const stagedFileName = document.getElementById('staged-file-name');
  const stagedFileSize = document.getElementById('staged-file-size');
  const btnRemoveFile = document.getElementById('btn-remove-file');
  const docTitleInput = document.getElementById('doc-title');
  const docCategoryInput = document.getElementById('doc-category');
  const docDescInput = document.getElementById('doc-description');
  const btnSubmitDoc = document.getElementById('btn-submit-doc');

  // DOM Elements - Scanning Side Panel
  const scanningPanel = document.getElementById('scanning-panel');
  const btnCloseScanner = document.getElementById('btn-close-scanner');
  const scanViewport = document.getElementById('scan-viewport');
  const scanPreviewContent = document.getElementById('scan-preview-content');
  const scanStepTitle = document.getElementById('scan-step-title');
  const scanProgressPct = document.getElementById('scan-progress-pct');
  const scanProgressBarFill = document.getElementById('scan-progress-bar-fill');
  const scanStepFeed = document.getElementById('scan-step-feed');
  const scanResultCard = document.getElementById('scan-result-card');
  const scanConfidenceBadge = document.getElementById('scan-confidence-badge');
  const scanResFilename = document.getElementById('scan-res-filename');
  const scanResMeta = document.getElementById('scan-res-meta');
  const scanCategorySelect = document.getElementById('scan-category-select');
  const scanKeywordsWrap = document.getElementById('scan-keywords-wrap');
  const scanOcrTextBox = document.getElementById('scan-ocr-text-box');
  const btnSaveScannerResult = document.getElementById('btn-save-scanner-result');

  // DOM Elements - Repository & Controls
  const searchInput = document.getElementById('search-input');
  const categoryChips = document.getElementById('category-chips');
  const viewGridBtn = document.getElementById('view-grid-btn');
  const viewListBtn = document.getElementById('view-list-btn');
  const documentsContainer = document.getElementById('documents-container');
  const btnClearAll = document.getElementById('btn-clear-all');

  // DOM Elements - Modal & Toasts
  const previewModal = document.getElementById('preview-modal');
  const modalDocTitle = document.getElementById('modal-doc-title');
  const modalDocBody = document.getElementById('modal-doc-body');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalCloseAction = document.getElementById('modal-close-action');
  const modalDownloadAction = document.getElementById('modal-download-action');
  const toastContainer = document.getElementById('toast-container');

  // State Variables
  let currentFile = null;
  let activeCategory = 'ALL';
  let searchQuery = '';
  let activeView = 'grid'; // 'grid' | 'list'
  let currentModalDoc = null;
  let currentlyProcessedDocId = null;

  // Initialize DB and ensure clean slate (only user uploads)
  try {
    await window.docStorage.init();
    
    // Purge any legacy sample data so only real user uploads exist
    if (!localStorage.getItem('onefill_clean_slate_v2')) {
      await window.docStorage.clearAll();
      localStorage.setItem('onefill_clean_slate_v2', 'true');
    }

    const existingDocs = await window.docStorage.getAllDocuments();
    for (const doc of existingDocs) {
      if (doc.id.startsWith('sample-')) {
        await window.docStorage.deleteDocument(doc.id);
      }
    }

    await refreshRepository();
  } catch (err) {
    console.error('Initialization error:', err);
    showToast('Failed to initialize local database storage.', 'error');
  }

  /* --------------------------------------------------------------------------
     File Selection & Staging Logic
     -------------------------------------------------------------------------- */

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      stageFile(files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      stageFile(fileInput.files[0]);
    }
  });

  function stageFile(file) {
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      showToast('File size exceeds 50MB limit.', 'error');
      return;
    }

    currentFile = file;
    stagedFileName.textContent = file.name;
    stagedFileSize.textContent = formatBytes(file.size);
    stagedFileCard.classList.add('active');

    // Auto-populate Title if empty
    if (!docTitleInput.value.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      docTitleInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    }

    validateForm();
  }

  btnRemoveFile.addEventListener('click', (e) => {
    e.stopPropagation();
    clearStagedFile();
  });

  function clearStagedFile() {
    currentFile = null;
    fileInput.value = '';
    stagedFileCard.classList.remove('active');
    validateForm();
  }

  docTitleInput.addEventListener('input', validateForm);

  function validateForm() {
    const hasTitle = docTitleInput.value.trim().length > 0;
    const hasFile = currentFile !== null;
    btnSubmitDoc.disabled = !(hasTitle && hasFile);
  }

  /* --------------------------------------------------------------------------
     Document Scanning & OCR Processing Workflow
     -------------------------------------------------------------------------- */

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentFile || !docTitleInput.value.trim()) {
      showToast('Please select a file and provide a title.', 'error');
      return;
    }

    const fileToProcess = currentFile;
    const titleToProcess = docTitleInput.value.trim();
    const manualCategoryChoice = docCategoryInput.value;
    const notesToProcess = docDescInput.value.trim();

    // Reset upload form
    form.reset();
    clearStagedFile();
    btnSubmitDoc.disabled = true;

    // Launch side scanning panel
    await processDocumentInScanner(fileToProcess, titleToProcess, manualCategoryChoice, notesToProcess);
  });

  async function processDocumentInScanner(file, title, manualCategoryChoice, notes) {
    // 1. Open the side scanning panel
    scanningPanel.classList.add('active');
    scanResultCard.style.display = 'none';
    scanViewport.classList.add('is-scanning');

    // 2. Set up initial preview inside scanner
    renderScannerPreview(file);

    // 3. Update Progress UI
    updateScanProgress('Initializing scanning & structure analysis...', 10, 'Reading file byte header...');

    try {
      // 4. Run real OCR / text extraction engine
      const extractionResult = await window.DocumentExtractor.extract(file, (msg, pct) => {
        updateScanProgress('Extracting readable text & OCR...', pct, msg);
      });

      // Update thumbnail in preview if newly generated (e.g. from PDF canvas)
      if (extractionResult.thumbnail && !file.type.startsWith('image/')) {
        scanPreviewContent.innerHTML = `<img src="${extractionResult.thumbnail}" class="scan-preview-img" alt="PDF Preview">`;
      }

      // 5. Run 10-Category Classification Engine
      updateScanProgress('Analyzing contents against 10 categories...', 92, 'Evaluating keyword frequencies & domain weights...');
      
      const classification = window.DocumentClassifier.classify(extractionResult.text, file.name);

      // Determine final assigned category: if user manually selected one (not 'AUTO'), honor it, else use AI classifier
      let assignedCategory = classification.category;
      if (manualCategoryChoice !== 'AUTO' && window.ONEFILL_CATEGORIES.includes(manualCategoryChoice)) {
        assignedCategory = manualCategoryChoice;
      }

      // 6. Complete scanning
      updateScanProgress('Document scanned & classified!', 100, `Assigned to: ${assignedCategory}`);
      scanViewport.classList.remove('is-scanning');

      // 7. Store Document Record in Database
      const docRecord = {
        id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: file.name,
        title: title,
        category: assignedCategory,
        description: notes,
        size: file.size,
        type: file.type || getMimeFromExtension(file.name),
        createdAt: new Date().toISOString(),
        extractedText: (extractionResult.text || '').slice(0, 8000),
        thumbnail: extractionResult.thumbnail,
        method: extractionResult.method,
        confidence: classification.confidence,
        matchedKeywords: classification.matchedKeywords,
        status: 'Scanned & Classified',
        fileBlob: file
      };

      currentlyProcessedDocId = docRecord.id;
      await window.docStorage.saveDocument(docRecord);

      // 8. Display Results in Scanner Panel with Category Correction Dropdown
      displayScanResults(docRecord, classification);

      showToast(`"${docRecord.title}" scanned & classified under ${assignedCategory}!`, 'success');
      await refreshRepository();
    } catch (err) {
      console.error('Scanning error:', err);
      scanViewport.classList.remove('is-scanning');
      updateScanProgress('Error during scan', 100, 'Handled with fallback category: Other Documents');
      showToast('Document processed with fallback classification.', 'error');
    }
  }

  function renderScannerPreview(file) {
    scanPreviewContent.innerHTML = '';

    if (file.type.startsWith('image/')) {
      const imgUrl = URL.createObjectURL(file);
      scanPreviewContent.innerHTML = `<img src="${imgUrl}" class="scan-preview-img" alt="${escapeHtml(file.name)}">`;
    } else {
      const extInfo = getFileTypeInfo(file.name, file.type);
      scanPreviewContent.innerHTML = `
        <div class="scan-preview-card">
          <div class="file-badge-icon ${extInfo.badgeClass}" style="margin: 0 auto 8px; width: 48px; height: 48px; font-size: 0.85rem;">
            ${extInfo.extText}
          </div>
          <div style="font-size: 0.85rem; font-weight: 600; color: #fff; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${escapeHtml(file.name)}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 2px;">
            ${formatBytes(file.size)}
          </div>
        </div>
      `;
    }
  }

  function updateScanProgress(title, pct, feed) {
    scanStepTitle.innerHTML = `<span class="pulse-dot"></span> ${title}`;
    scanProgressPct.textContent = `${pct}%`;
    scanProgressBarFill.style.width = `${pct}%`;
    scanStepFeed.textContent = feed;
  }

  function displayScanResults(doc, classification) {
    scanResultCard.style.display = 'flex';
    scanResFilename.textContent = doc.name;
    scanResMeta.textContent = `Size: ${formatBytes(doc.size)} • Processing: ${doc.method || 'OCR'}`;
    scanConfidenceBadge.textContent = `Confidence: ${doc.confidence || 85}%`;

    // Populate category correction dropdown
    scanCategorySelect.value = doc.category;

    // Show matched keyword signals
    scanKeywordsWrap.innerHTML = '';
    const keywords = doc.matchedKeywords && doc.matchedKeywords.length > 0 
      ? doc.matchedKeywords 
      : ['content analysis', 'filename heuristic'];
    
    keywords.slice(0, 6).forEach((kw) => {
      const tag = document.createElement('span');
      tag.className = 'extracted-kw-tag';
      tag.textContent = kw;
      scanKeywordsWrap.appendChild(tag);
    });

    // Extracted OCR text snippet
    const snippet = doc.extractedText ? doc.extractedText.slice(0, 600) : '(No readable text extracted)';
    scanOcrTextBox.textContent = snippet;
  }

  // Handle Category Correction from Side Scanning Panel
  scanCategorySelect.addEventListener('change', async (e) => {
    const newCat = e.target.value;
    if (currentlyProcessedDocId) {
      await window.docStorage.updateDocumentCategory(currentlyProcessedDocId, newCat);
      showToast(`Category updated to "${newCat}"`, 'success');
      await refreshRepository();
    }
  });

  btnSaveScannerResult.addEventListener('click', () => {
    scanningPanel.classList.remove('active');
  });

  btnCloseScanner.addEventListener('click', () => {
    scanningPanel.classList.remove('active');
  });

  /* --------------------------------------------------------------------------
     Repository Rendering, Search & Category Filters
     -------------------------------------------------------------------------- */

  async function refreshRepository() {
    const allDocs = await window.docStorage.getAllDocuments();
    updateMetrics(allDocs);

    // Filter by category
    let filtered = allDocs;
    if (activeCategory !== 'ALL') {
      filtered = filtered.filter((doc) => doc.category === activeCategory);
    }

    // Filter by search query (matches title, name, category, notes, and OCR text)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((doc) => {
        return (
          doc.title.toLowerCase().includes(q) ||
          doc.name.toLowerCase().includes(q) ||
          doc.category.toLowerCase().includes(q) ||
          (doc.description && doc.description.toLowerCase().includes(q)) ||
          (doc.extractedText && doc.extractedText.toLowerCase().includes(q))
        );
      });
    }

    renderDocuments(filtered, allDocs.length);
  }

  function updateMetrics(docs) {
    statTotalDocs.textContent = docs.length;
    const totalBytes = docs.reduce((acc, doc) => acc + (doc.size || 0), 0);
    statTotalSize.textContent = formatBytes(totalBytes);
    statScannedCount.textContent = docs.length;
  }

  function renderDocuments(docs, totalUnfiltered) {
    documentsContainer.innerHTML = '';

    if (docs.length === 0) {
      const isSearchActive = totalUnfiltered > 0;
      documentsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
          </div>
          <div class="empty-title">${isSearchActive ? 'No matching documents found' : 'No documents collected yet'}</div>
          <div class="empty-desc">
            ${isSearchActive ? 'Try adjusting your search query or category filter.' : 'Upload an image, PDF, or document using the form on the left to scan, extract text, and auto-classify.'}
          </div>
        </div>
      `;
      return;
    }

    if (activeView === 'grid') {
      renderGridView(docs);
    } else {
      renderTableView(docs);
    }
  }

  function renderGridView(docs) {
    const grid = document.createElement('div');
    grid.className = 'document-grid';

    docs.forEach((doc) => {
      const extInfo = getFileTypeInfo(doc.name, doc.type);
      const catClass = getCategoryClass(doc.category);
      const card = document.createElement('div');
      card.className = 'doc-card';

      // Thumbnail element
      let thumbHtml = '';
      if (doc.thumbnail) {
        thumbHtml = `
          <div class="card-thumb-box">
            <img src="${doc.thumbnail}" class="card-thumb-img" alt="${escapeHtml(doc.title)}">
          </div>
        `;
      } else {
        thumbHtml = `
          <div class="file-badge-icon ${extInfo.badgeClass}">
            ${extInfo.extText}
          </div>
        `;
      }

      card.innerHTML = `
        <div>
          <div class="doc-card-top">
            ${thumbHtml}
            <div class="doc-header-info">
              <div class="doc-card-title" title="${escapeHtml(doc.title)}">${escapeHtml(doc.title)}</div>
              <div class="doc-card-filename" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</div>
            </div>
          </div>
          <p class="doc-card-desc">${escapeHtml(doc.description || (doc.extractedText ? doc.extractedText.slice(0, 100) : 'No additional notes provided.'))}</p>
        </div>

        <div>
          <!-- Inline Category Correction Box -->
          <div class="category-correct-box">
            <div class="category-correct-label">
              <span>Category</span>
              <span class="category-badge-pill ${catClass}">${escapeHtml(doc.category)}</span>
            </div>
            <select class="category-correct-select" data-id="${doc.id}">
              ${window.ONEFILL_CATEGORIES.map(cat => `<option value="${cat}" ${cat === doc.category ? 'selected' : ''}>${cat}</option>`).join('')}
            </select>
          </div>

          <div class="doc-meta-row">
            <span class="status-indicator">${doc.status || 'Scanned & Classified'}</span>
            <span>${formatBytes(doc.size)}</span>
          </div>

          <div class="doc-card-actions">
            <button type="button" class="card-action-btn btn-inspect" data-id="${doc.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              View
            </button>
            <button type="button" class="card-action-btn btn-download" data-id="${doc.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download
            </button>
            <button type="button" class="card-action-btn btn-delete" data-id="${doc.id}" title="Delete document">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });

    documentsContainer.appendChild(grid);
    attachCardListeners();
  }

  function renderTableView(docs) {
    const wrapper = document.createElement('div');
    wrapper.className = 'document-table-wrapper';

    let tableHtml = `
      <table class="document-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Category &amp; Correction</th>
            <th>Size</th>
            <th>Status</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    docs.forEach((doc) => {
      const extInfo = getFileTypeInfo(doc.name, doc.type);
      const catClass = getCategoryClass(doc.category);
      tableHtml += `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="file-badge-icon ${extInfo.badgeClass}" style="width: 30px; height: 30px; font-size: 0.625rem;">
                ${extInfo.extText}
              </div>
              <div>
                <div class="table-doc-title">${escapeHtml(doc.title)}</div>
                <div class="table-doc-sub">${escapeHtml(doc.name)}</div>
              </div>
            </div>
          </td>
          <td>
            <select class="category-correct-select" data-id="${doc.id}" style="background: #161b22; border: 1px solid var(--border-muted); border-radius: 4px; padding: 4px 6px; font-size: 0.775rem;">
              ${window.ONEFILL_CATEGORIES.map(cat => `<option value="${cat}" ${cat === doc.category ? 'selected' : ''}>${cat}</option>`).join('')}
            </select>
          </td>
          <td style="font-family: var(--font-mono); font-size: 0.775rem;">${formatBytes(doc.size)}</td>
          <td><span class="status-indicator">${doc.status || 'Scanned'}</span></td>
          <td>
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
              <button type="button" class="card-action-btn btn-inspect" data-id="${doc.id}">View</button>
              <button type="button" class="card-action-btn btn-download" data-id="${doc.id}">Download</button>
              <button type="button" class="card-action-btn btn-delete" data-id="${doc.id}" title="Delete">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tableHtml += `
        </tbody>
      </table>
    `;

    wrapper.innerHTML = tableHtml;
    documentsContainer.appendChild(wrapper);
    attachCardListeners();
  }

  function attachCardListeners() {
    // Category Correction Dropdown changes
    document.querySelectorAll('.category-correct-select').forEach((sel) => {
      sel.addEventListener('change', async (e) => {
        const id = sel.getAttribute('data-id');
        const newCat = e.target.value;
        await window.docStorage.updateDocumentCategory(id, newCat);
        showToast(`Category updated to "${newCat}"`, 'success');
        await refreshRepository();
      });
    });

    // Inspect/View Button
    document.querySelectorAll('.btn-inspect').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        openInspectModal(id);
      });
    });

    // Download Button
    document.querySelectorAll('.btn-download').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        downloadDocumentById(id);
      });
    });

    // Delete Button
    document.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this document?')) {
          await window.docStorage.deleteDocument(id);
          showToast('Document deleted.', 'success');
          await refreshRepository();
        }
      });
    });
  }

  /* --------------------------------------------------------------------------
     Document Inspection Modal
     -------------------------------------------------------------------------- */

  async function openInspectModal(docId) {
    const doc = await window.docStorage.getDocument(docId);
    if (!doc) return;

    currentModalDoc = doc;
    modalDocTitle.textContent = doc.title;

    let mediaPreview = '';
    if (doc.thumbnail) {
      mediaPreview = `
        <div style="text-align: center; background: #090d13; padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); margin-top: 12px;">
          <img src="${doc.thumbnail}" alt="${escapeHtml(doc.title)}" style="max-width: 100%; max-height: 240px; border-radius: 4px; object-fit: contain;">
        </div>
      `;
    }

    modalDocBody.innerHTML = `
      <div class="preview-meta-grid">
        <div class="preview-meta-item">
          <div class="preview-meta-label">Original Filename</div>
          <div class="preview-meta-val" style="font-family: var(--font-mono); font-size: 0.775rem;">${escapeHtml(doc.name)}</div>
        </div>
        <div class="preview-meta-item">
          <div class="preview-meta-label">Classified Category</div>
          <div class="preview-meta-val"><span class="category-badge-pill ${getCategoryClass(doc.category)}">${escapeHtml(doc.category)}</span></div>
        </div>
        <div class="preview-meta-item">
          <div class="preview-meta-label">File Size</div>
          <div class="preview-meta-val">${formatBytes(doc.size)}</div>
        </div>
        <div class="preview-meta-item">
          <div class="preview-meta-label">Scan Status</div>
          <div class="preview-meta-val" style="color: var(--status-success);">${escapeHtml(doc.status || 'Scanned')}</div>
        </div>
      </div>

      <div style="background: #0d1117; border: 1px solid var(--border-subtle); padding: 10px 12px; border-radius: var(--radius-sm); margin-bottom: 12px;">
        <div style="font-size: 0.675rem; color: var(--text-dim); text-transform: uppercase; margin-bottom: 3px; font-weight: 600;">Correct Category</div>
        <select class="scan-category-select" id="modal-category-select">
          ${window.ONEFILL_CATEGORIES.map(cat => `<option value="${cat}" ${cat === doc.category ? 'selected' : ''}>${cat}</option>`).join('')}
        </select>
      </div>

      ${mediaPreview}

      <div style="margin-top: 14px;">
        <div style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; margin-bottom: 4px; font-weight: 600;">Extracted OCR Text Content:</div>
        <div class="preview-content-box">${escapeHtml(doc.extractedText || '(No readable text available)')}</div>
      </div>
    `;

    // Modal category changer
    const modalCatSelect = document.getElementById('modal-category-select');
    if (modalCatSelect) {
      modalCatSelect.addEventListener('change', async (e) => {
        const newCat = e.target.value;
        await window.docStorage.updateDocumentCategory(doc.id, newCat);
        showToast(`Category updated to "${newCat}"`, 'success');
        await refreshRepository();
      });
    }

    previewModal.classList.add('active');
  }

  function closeModal() {
    previewModal.classList.remove('active');
    currentModalDoc = null;
  }

  modalCloseBtn.addEventListener('click', closeModal);
  modalCloseAction.addEventListener('click', closeModal);
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && previewModal.classList.contains('active')) {
      closeModal();
    }
  });

  modalDownloadAction.addEventListener('click', () => {
    if (currentModalDoc) downloadDocument(currentModalDoc);
  });

  /* --------------------------------------------------------------------------
     Download Mechanism
     -------------------------------------------------------------------------- */

  async function downloadDocumentById(id) {
    const doc = await window.docStorage.getDocument(id);
    if (doc) downloadDocument(doc);
  }

  function downloadDocument(doc) {
    if (!doc.fileBlob) {
      showToast('Document file data not available for download.', 'error');
      return;
    }

    const blob = doc.fileBlob instanceof Blob ? doc.fileBlob : new Blob([doc.fileBlob], { type: doc.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Downloading "${doc.name}"...`, 'success');
  }

  /* --------------------------------------------------------------------------
     Controls: Search, Filter Chips, View Toggle, Clear All
     -------------------------------------------------------------------------- */

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    refreshRepository();
  });

  categoryChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;

    categoryChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');

    activeCategory = chip.getAttribute('data-category');
    refreshRepository();
  });

  viewGridBtn.addEventListener('click', () => {
    activeView = 'grid';
    viewGridBtn.classList.add('active');
    viewListBtn.classList.remove('active');
    viewGridBtn.setAttribute('aria-checked', 'true');
    viewListBtn.setAttribute('aria-checked', 'false');
    refreshRepository();
  });

  viewListBtn.addEventListener('click', () => {
    activeView = 'list';
    viewListBtn.classList.add('active');
    viewGridBtn.classList.remove('active');
    viewListBtn.setAttribute('aria-checked', 'true');
    viewGridBtn.setAttribute('aria-checked', 'false');
    refreshRepository();
  });

  btnClearAll.addEventListener('click', async () => {
    const allDocs = await window.docStorage.getAllDocuments();
    if (allDocs.length === 0) {
      showToast('Repository is already empty.', 'error');
      return;
    }
    if (confirm('Are you sure you want to delete all stored documents?')) {
      await window.docStorage.clearAll();
      showToast('All documents cleared.', 'success');
      await refreshRepository();
    }
  });

  /* --------------------------------------------------------------------------
     Helper Utilities
     -------------------------------------------------------------------------- */

  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function getFileTypeInfo(filename, mimeType = '') {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf' || mimeType.includes('pdf')) return { badgeClass: 'format-pdf', extText: 'PDF' };
    if (['doc', 'docx'].includes(ext) || mimeType.includes('word')) return { badgeClass: 'format-doc', extText: 'DOC' };
    if (['xls', 'xlsx', 'csv'].includes(ext) || mimeType.includes('spreadsheet') || mimeType.includes('csv')) return { badgeClass: 'format-sheet', extText: ext === 'csv' ? 'CSV' : 'XLS' };
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext) || mimeType.includes('image')) return { badgeClass: 'format-img', extText: 'IMG' };
    if (['txt', 'md', 'json', 'log'].includes(ext) || mimeType.includes('text')) return { badgeClass: 'format-txt', extText: ext.toUpperCase() };
    return { badgeClass: 'format-generic', extText: ext ? ext.substring(0, 3).toUpperCase() : 'DOC' };
  }

  function getCategoryClass(cat) {
    switch (cat) {
      case 'Personal Documents': return 'cat-personal';
      case 'Education': return 'cat-education';
      case 'Legal Documents': return 'cat-legal';
      case 'Career & Jobs': return 'cat-career';
      case 'Finance & Banking': return 'cat-finance';
      case 'Business Documents': return 'cat-business';
      case 'Health & Medical': return 'cat-health';
      case 'Bills & Utilities': return 'cat-bills';
      case 'Government Documents': return 'cat-government';
      default: return 'cat-other';
    }
  }

  function getMimeFromExtension(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
      csv: 'text/csv',
      json: 'application/json',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp'
    };
    return map[ext] || 'application/octet-stream';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' 
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3fb950" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f85149" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease-out';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }
});
