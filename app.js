/**
 * DocVault AI - Document Collection Application Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements - Metrics
  const statTotalDocs = document.getElementById('stat-total-docs');
  const statTotalSize = document.getElementById('stat-total-size');
  const statLatestDate = document.getElementById('stat-latest-date');

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

  // DOM Elements - Repository View & Filters
  const searchInput = document.getElementById('search-input');
  const categoryChips = document.getElementById('category-chips');
  const viewGridBtn = document.getElementById('view-grid-btn');
  const viewListBtn = document.getElementById('view-list-btn');
  const documentsContainer = document.getElementById('documents-container');
  const btnResetSamples = document.getElementById('btn-reset-samples');

  // DOM Elements - Modal & Toast
  const previewModal = document.getElementById('preview-modal');
  const modalDocTitle = document.getElementById('modal-doc-title');
  const modalDocBody = document.getElementById('modal-doc-body');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalCloseAction = document.getElementById('modal-close-action');
  const modalDownloadAction = document.getElementById('modal-download-action');
  const toastContainer = document.getElementById('toast-container');

  // Application State
  let currentFile = null;
  let activeCategory = 'ALL';
  let searchQuery = '';
  let activeView = 'grid'; // 'grid' | 'list'
  let currentModalDoc = null;

  // Initialize DB and Seed Data
  try {
    await window.docStorage.init();
    await window.docStorage.seedInitialDataIfEmpty();
    await refreshRepository();
  } catch (err) {
    console.error('Initialization error:', err);
    showToast('Failed to initialize local database storage.', 'error');
  }

  /* --------------------------------------------------------------------------
     File Selection & Staging Logic
     -------------------------------------------------------------------------- */

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  // Drag and drop events
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
    // 50 MB safety limit
    const maxSize = 50 * 1024 * 1024;
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
     Form Submission (Document Ingestion)
     -------------------------------------------------------------------------- */

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentFile || !docTitleInput.value.trim()) {
      showToast('Please select a file and provide a title.', 'error');
      return;
    }

    btnSubmitDoc.disabled = true;
    btnSubmitDoc.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>
      Storing...
    `;

    try {
      const docRecord = {
        id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: currentFile.name,
        title: docTitleInput.value.trim(),
        category: docCategoryInput.value,
        description: docDescInput.value.trim(),
        size: currentFile.size,
        type: currentFile.type || getMimeFromExtension(currentFile.name),
        createdAt: new Date().toISOString(),
        fileBlob: currentFile
      };

      await window.docStorage.saveDocument(docRecord);

      // Reset form
      form.reset();
      clearStagedFile();
      showToast(`"${docRecord.title}" stored successfully!`, 'success');
      await refreshRepository();
    } catch (err) {
      console.error('Error saving document:', err);
      showToast('Error storing document to local storage.', 'error');
    } finally {
      btnSubmitDoc.disabled = false;
      btnSubmitDoc.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="17 21 17 13 7 13 7 21"></polyline>
          <polyline points="7 3 7 8 15 8"></polyline>
        </svg>
        Store Document
      `;
      validateForm();
    }
  });

  /* --------------------------------------------------------------------------
     Repository Rendering & Filtering
     -------------------------------------------------------------------------- */

  async function refreshRepository() {
    const allDocs = await window.docStorage.getAllDocuments();
    updateMetrics(allDocs);

    // Filter by category
    let filtered = allDocs;
    if (activeCategory !== 'ALL') {
      filtered = filtered.filter((doc) => doc.category === activeCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((doc) => {
        return (
          doc.title.toLowerCase().includes(q) ||
          doc.name.toLowerCase().includes(q) ||
          doc.category.toLowerCase().includes(q) ||
          (doc.description && doc.description.toLowerCase().includes(q))
        );
      });
    }

    renderDocuments(filtered, allDocs.length);
  }

  function updateMetrics(docs) {
    statTotalDocs.textContent = docs.length;

    const totalBytes = docs.reduce((acc, doc) => acc + (doc.size || 0), 0);
    statTotalSize.textContent = formatBytes(totalBytes);

    if (docs.length > 0) {
      const latest = new Date(docs[0].createdAt);
      statLatestDate.textContent = formatDateRelative(latest);
    } else {
      statLatestDate.textContent = '--';
    }
  }

  function renderDocuments(docs, totalUnfiltered) {
    documentsContainer.innerHTML = '';

    if (docs.length === 0) {
      const isSearchActive = totalUnfiltered > 0;
      documentsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
          </div>
          <div class="empty-title">${isSearchActive ? 'No matching documents found' : 'No documents collected yet'}</div>
          <div class="empty-desc">
            ${isSearchActive ? 'Try adjusting your search query or category filter.' : 'Upload your first document using the intake form on the left to begin building your repository.'}
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
      const card = document.createElement('div');
      card.className = 'doc-card';
      card.innerHTML = `
        <div>
          <div class="doc-card-top">
            <div class="file-badge-icon ${extInfo.badgeClass}">
              ${extInfo.extText}
            </div>
            <div class="doc-header-info">
              <div class="doc-card-title" title="${escapeHtml(doc.title)}">${escapeHtml(doc.title)}</div>
              <div class="doc-card-filename" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</div>
            </div>
          </div>
          <p class="doc-card-desc">${escapeHtml(doc.description || 'No additional notes provided.')}</p>
        </div>

        <div>
          <div class="doc-meta-row">
            <span class="category-pill">${escapeHtml(doc.category)}</span>
            <span class="status-indicator">Stored &bull; AI Ready</span>
          </div>
          <div class="doc-meta-row" style="margin-bottom: 0;">
            <span>${formatBytes(doc.size)}</span>
            <span>${formatDateRelative(new Date(doc.createdAt))}</span>
          </div>

          <div class="doc-card-actions">
            <button type="button" class="card-action-btn btn-inspect" data-id="${doc.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              View
            </button>
            <button type="button" class="card-action-btn btn-download" data-id="${doc.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download
            </button>
            <button type="button" class="card-action-btn btn-delete" data-id="${doc.id}" title="Delete document">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
            <th>Category</th>
            <th>Size</th>
            <th>Uploaded</th>
            <th>Status</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    docs.forEach((doc) => {
      const extInfo = getFileTypeInfo(doc.name, doc.type);
      tableHtml += `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="file-badge-icon ${extInfo.badgeClass}" style="width: 32px; height: 32px; font-size: 0.65rem;">
                ${extInfo.extText}
              </div>
              <div>
                <div class="table-doc-title">${escapeHtml(doc.title)}</div>
                <div class="table-doc-sub">${escapeHtml(doc.name)}</div>
              </div>
            </div>
          </td>
          <td><span class="category-pill">${escapeHtml(doc.category)}</span></td>
          <td style="font-family: var(--font-mono); font-size: 0.8rem;">${formatBytes(doc.size)}</td>
          <td>${formatDateRelative(new Date(doc.createdAt))}</td>
          <td><span class="status-indicator">Stored &bull; AI Ready</span></td>
          <td>
            <div class="table-actions" style="justify-content: flex-end;">
              <button type="button" class="card-action-btn btn-inspect" data-id="${doc.id}">View</button>
              <button type="button" class="card-action-btn btn-download" data-id="${doc.id}">Download</button>
              <button type="button" class="card-action-btn btn-delete" data-id="${doc.id}" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
        if (confirm('Are you sure you want to remove this document from the collection?')) {
          await window.docStorage.deleteDocument(id);
          showToast('Document removed from collection.', 'success');
          await refreshRepository();
        }
      });
    });
  }

  /* --------------------------------------------------------------------------
     Inspection & Preview Modal
     -------------------------------------------------------------------------- */

  async function openInspectModal(docId) {
    const doc = await window.docStorage.getDocument(docId);
    if (!doc) return;

    currentModalDoc = doc;
    modalDocTitle.textContent = doc.title;

    let previewContent = '';

    // Check if we can display text preview
    if (
      doc.type.includes('text') ||
      doc.type.includes('json') ||
      doc.type.includes('csv') ||
      doc.name.endsWith('.txt') ||
      doc.name.endsWith('.csv') ||
      doc.name.endsWith('.json') ||
      doc.name.endsWith('.md')
    ) {
      try {
        let textContent = '';
        if (doc.fileBlob instanceof Blob) {
          textContent = await doc.fileBlob.text();
        } else if (typeof doc.fileBlob === 'string') {
          textContent = doc.fileBlob;
        }

        const snippet = textContent.length > 2000 ? textContent.slice(0, 2000) + '\n\n... [Content Truncated for Preview]' : textContent;
        previewContent = `
          <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 14px; margin-bottom: 4px; font-weight: 600; text-transform: uppercase;">
            Text Preview:
          </div>
          <div class="preview-content-box">${escapeHtml(snippet || '(Empty Document)')}</div>
        `;
      } catch (err) {
        console.warn('Could not read text preview:', err);
      }
    } else if (doc.type.startsWith('image/') && doc.fileBlob instanceof Blob) {
      const imgUrl = URL.createObjectURL(doc.fileBlob);
      previewContent = `
        <div style="margin-top: 16px; text-align: center; background: rgba(0,0,0,0.4); padding: 16px; border-radius: var(--radius-sm);">
          <img src="${imgUrl}" alt="${escapeHtml(doc.name)}" style="max-width: 100%; max-height: 250px; border-radius: 6px; object-fit: contain;">
        </div>
      `;
    }

    modalDocBody.innerHTML = `
      <div class="preview-meta-grid">
        <div class="preview-meta-item">
          <div class="preview-meta-label">Original Filename</div>
          <div class="preview-meta-val" style="font-family: var(--font-mono); font-size: 0.8rem;">${escapeHtml(doc.name)}</div>
        </div>
        <div class="preview-meta-item">
          <div class="preview-meta-label">Category</div>
          <div class="preview-meta-val"><span class="category-pill">${escapeHtml(doc.category)}</span></div>
        </div>
        <div class="preview-meta-item">
          <div class="preview-meta-label">File Size</div>
          <div class="preview-meta-val">${formatBytes(doc.size)}</div>
        </div>
        <div class="preview-meta-item">
          <div class="preview-meta-label">Uploaded Timestamp</div>
          <div class="preview-meta-val">${new Date(doc.createdAt).toLocaleString()}</div>
        </div>
      </div>

      <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-subtle); padding: 12px 14px; border-radius: var(--radius-sm); margin-bottom: 12px;">
        <div style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; margin-bottom: 4px; font-weight: 600;">Description / Notes</div>
        <div style="font-size: 0.85rem; color: var(--text-main);">${escapeHtml(doc.description || 'None provided.')}</div>
      </div>

      <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: var(--radius-sm); padding: 10px 14px; display: flex; align-items: center; gap: 8px;">
        <div class="pulse-dot"></div>
        <div style="font-size: 0.8rem; color: #10b981;">
          <strong>Ingestion Status:</strong> Document safely stored in repository. Prepared for future AI extraction and indexing.
        </div>
      </div>

      ${previewContent}
    `;

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
    if (currentModalDoc) {
      downloadDocument(currentModalDoc);
    }
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
     Search & Category Filters & View Toggle
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

  btnResetSamples.addEventListener('click', async () => {
    if (confirm('Reset repository back to default sample documents?')) {
      await window.docStorage.clearAll();
      await window.docStorage.seedInitialDataIfEmpty();
      showToast('Sample documents re-initialized.', 'success');
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

  function formatDateRelative(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function getFileTypeInfo(filename, mimeType = '') {
    const ext = filename.split('.').pop().toLowerCase();

    if (ext === 'pdf' || mimeType.includes('pdf')) {
      return { badgeClass: 'format-pdf', extText: 'PDF' };
    }
    if (['doc', 'docx'].includes(ext) || mimeType.includes('word')) {
      return { badgeClass: 'format-doc', extText: 'DOC' };
    }
    if (['xls', 'xlsx', 'csv'].includes(ext) || mimeType.includes('spreadsheet') || mimeType.includes('csv')) {
      return { badgeClass: 'format-sheet', extText: ext === 'csv' ? 'CSV' : 'XLS' };
    }
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || mimeType.includes('image')) {
      return { badgeClass: 'format-img', extText: 'IMG' };
    }
    if (['txt', 'md', 'json', 'log'].includes(ext) || mimeType.includes('text')) {
      return { badgeClass: 'format-txt', extText: ext.toUpperCase() };
    }

    return { badgeClass: 'format-generic', extText: ext ? ext.substring(0, 3).toUpperCase() : 'DOC' };
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
      jpeg: 'image/jpeg'
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
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }
});
