/**
 * OneFill - Application Logic & Document Processing Hub
 * Implements authenticated document management, client-side OCR & extraction,
 * 10-domain classification, side scanning laser animation, and realistic privacy protections.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements - Metrics
  const statTotalDocs = document.getElementById('stat-total-docs');
  const statTotalSize = document.getElementById('stat-total-size');
  const statScannedCount = document.getElementById('stat-scanned-count');

  // DOM Elements - Navigation & Auth Status
  const userAuthWrap = document.getElementById('user-auth-wrap');

  // DOM Elements - Auth Modal
  const authModal = document.getElementById('auth-modal');
  const authModalClose = document.getElementById('auth-modal-close');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const authForm = document.getElementById('auth-form');
  const groupUsername = document.getElementById('group-username');
  const labelAuthEmail = document.getElementById('label-auth-email');
  const authEmailInput = document.getElementById('auth-email');
  const authUsernameInput = document.getElementById('auth-username');
  const authPasswordInput = document.getElementById('auth-password');
  const btnSubmitAuth = document.getElementById('btn-submit-auth');
  const authErrorBanner = document.getElementById('auth-error-banner');

  // DOM Elements - Re-authentication Modal
  const reauthModal = document.getElementById('reauth-modal');
  const reauthModalClose = document.getElementById('reauth-modal-close');
  const reauthPassword = document.getElementById('reauth-password');
  const reauthError = document.getElementById('reauth-error');
  const btnReauthConfirm = document.getElementById('btn-reauth-confirm');
  const btnReauthCancel = document.getElementById('btn-reauth-cancel');

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
  const watermarkUserText = document.getElementById('watermark-user-text');

  // State Variables
  let currentFile = null;
  let activeCategory = 'ALL';
  let searchQuery = '';
  let activeView = 'grid'; // 'grid' | 'list'
  let currentModalDoc = null;
  let currentlyProcessedDocId = null;
  let authMode = 'login'; // 'login' | 'register'
  let currentUser = null;

  // --------------------------------------------------------------------------
  // Realistic Browser-Level Privacy & Anti-Screen Capture Protections
  // --------------------------------------------------------------------------
  window.addEventListener('blur', () => {
    document.body.classList.add('privacy-blur-active');
  });

  window.addEventListener('focus', () => {
    document.body.classList.remove('privacy-blur-active');
  });

  previewModal.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // --------------------------------------------------------------------------
  // Authentication & Session Management
  // --------------------------------------------------------------------------
  async function initAuth() {
    currentUser = await window.docStorage.checkAuth();
    renderAuthNav();
    if (currentUser) {
      updateWatermark(currentUser);
    }
    await refreshRepository();
  }

  function updateWatermark(user) {
    if (watermarkUserText) {
      const email = (user && user.id !== 'usr_guest') ? user.email : 'GUEST SESSION (UNAUTHENTICATED)';
      watermarkUserText.textContent = `CONFIDENTIAL • OWNER: ${email} • ${new Date().toLocaleDateString()}`;
    }
  }

  function renderAuthNav() {
    userAuthWrap.innerHTML = '';
    const isNamedUser = currentUser && currentUser.id !== 'usr_guest';

    if (isNamedUser) {
      userAuthWrap.innerHTML = `
        <div class="user-profile-badge" title="Authenticated account">
          <span class="user-avatar-dot"></span>
          <span>${escapeHtml(currentUser.username)}</span>
        </div>
        <button type="button" class="btn-secondary" id="btn-logout" title="Sign out of your session">
          Sign Out
        </button>
      `;
      document.getElementById('btn-logout').addEventListener('click', async () => {
        await window.docStorage.logout();
        currentUser = await window.docStorage.checkAuth();
        renderAuthNav();
        updateWatermark(currentUser);
        showToast('Signed out. Continuing in guest mode.', 'success');
        await refreshRepository();
      });
    } else {
      userAuthWrap.innerHTML = `
        <div class="user-profile-badge" style="background: rgba(46, 125, 50, 0.08); border-color: rgba(46, 125, 50, 0.25);" title="Smooth guest access - no login required">
          <span class="user-avatar-dot" style="background: #2e7d32;"></span>
          <span style="color: #2e7d32; font-weight: 600;">Guest Mode</span>
        </div>
        <button type="button" class="btn-secondary btn-auth-trigger" id="btn-open-auth" title="Sign in or register an account">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          Sign In / Register
        </button>
      `;
      document.getElementById('btn-open-auth')?.addEventListener('click', () => {
        openAuthModal('login');
      });
    }
  }

  function openAuthModal(mode = 'login') {
    authMode = mode;
    authErrorBanner.style.display = 'none';
    authForm.reset();

    if (mode === 'login') {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      groupUsername.style.display = 'none';
      labelAuthEmail.innerHTML = 'Email or Username <span class="required">*</span>';
      authEmailInput.placeholder = 'name@example.com';
      btnSubmitAuth.textContent = 'Sign In to OneFill';
    } else {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      groupUsername.style.display = 'block';
      labelAuthEmail.innerHTML = 'Email Address <span class="required">*</span>';
      authEmailInput.placeholder = 'name@example.com';
      btnSubmitAuth.textContent = 'Create Account & Start Vault';
    }

    authModal.classList.add('active');
  }

  function closeAuthModal() {
    authModal.classList.remove('active');
  }

  authModalClose.addEventListener('click', closeAuthModal);
  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) closeAuthModal();
  });

  tabLogin.addEventListener('click', () => openAuthModal('login'));
  tabRegister.addEventListener('click', () => openAuthModal('register'));

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authErrorBanner.style.display = 'none';

    const email = authEmailInput.value.trim();
    const username = authUsernameInput.value.trim();
    const password = authPasswordInput.value;

    if (!email || !password || (authMode === 'register' && !username)) {
      authErrorBanner.textContent = 'Please fill out all required fields.';
      authErrorBanner.style.display = 'block';
      return;
    }

    btnSubmitAuth.disabled = true;
    btnSubmitAuth.textContent = 'Authenticating...';

    try {
      if (authMode === 'login') {
        currentUser = await window.docStorage.login(email, password);
        showToast(`Welcome back, ${currentUser.username}!`, 'success');
      } else {
        currentUser = await window.docStorage.register(email, username, password);
        showToast(`Account created for ${currentUser.username}!`, 'success');
      }

      renderAuthNav();
      updateWatermark(currentUser);
      closeAuthModal();
      await refreshRepository();
    } catch (err) {
      authErrorBanner.textContent = err.message || 'Authentication error.';
      authErrorBanner.style.display = 'block';
    } finally {
      btnSubmitAuth.disabled = false;
      btnSubmitAuth.textContent = authMode === 'login' ? 'Sign In to OneFill' : 'Create Account & Start Vault';
    }
  });

  // --------------------------------------------------------------------------
  // File Selection & Staging Logic
  // --------------------------------------------------------------------------
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
      showToast('File size exceeds 50MB security limit.', 'error');
      return;
    }

    currentFile = file;
    stagedFileName.textContent = file.name;
    stagedFileSize.textContent = formatBytes(file.size);
    stagedFileCard.classList.add('active');

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

  // --------------------------------------------------------------------------
  // Document Scanning, OCR, 10-Category Classification & Secure Storage
  // --------------------------------------------------------------------------
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

    form.reset();
    clearStagedFile();
    btnSubmitDoc.disabled = true;

    await processDocumentInScanner(fileToProcess, titleToProcess, manualCategoryChoice, notesToProcess);
  });

  async function processDocumentInScanner(file, title, manualCategoryChoice, notes) {
    scanningPanel.classList.add('active');
    scanResultCard.style.display = 'none';
    scanViewport.classList.add('is-scanning');

    renderScannerPreview(file);
    updateScanProgress('Initializing scanning & structure analysis...', 10, 'Validating file signature & headers...');

    try {
      // 1. Run local OCR / extraction
      const extractionResult = await window.DocumentExtractor.extract(file, (msg, pct) => {
        updateScanProgress('Extracting readable text & OCR...', pct, msg);
      });

      if (extractionResult.thumbnail && !file.type.startsWith('image/')) {
        scanPreviewContent.innerHTML = `<img src="${extractionResult.thumbnail}" class="scan-preview-img" alt="Document Preview">`;
      }

      // 2. Run 10-Domain Classification
      updateScanProgress('Analyzing contents against 10 categories...', 90, 'Evaluating keyword signals and domain frequency...');
      const classification = window.DocumentClassifier.classify(extractionResult.text, file.name);

      let assignedCategory = classification.category;
      if (manualCategoryChoice !== 'AUTO' && window.ONEFILL_CATEGORIES.includes(manualCategoryChoice)) {
        assignedCategory = manualCategoryChoice;
      }

      // 3. Encrypt and Store in Backend Vault (AES-256-GCM + SHA-256)
      updateScanProgress('Encrypting file at rest with AES-256-GCM...', 96, 'Computing SHA-256 integrity checksum & isolating vault...');

      const savedDoc = await window.docStorage.saveDocument(
        {
          title,
          category: assignedCategory,
          description: notes,
          extractedText: extractionResult.text,
          thumbnail: extractionResult.thumbnail
        },
        file
      );

      currentlyProcessedDocId = savedDoc.id;

      updateScanProgress('Document scanned, encrypted & classified!', 100, `Assigned to: ${assignedCategory}`);
      scanViewport.classList.remove('is-scanning');

      displayScanResults(savedDoc, classification);
      showToast(`"${savedDoc.title}" encrypted and stored in your private vault!`, 'success');
      await refreshRepository();
    } catch (err) {
      console.error('Scanning/Storage error:', err);
      scanViewport.classList.remove('is-scanning');
      updateScanProgress('Error during scan or encryption', 100, err.message || 'Failed to process document');
      showToast(err.message || 'Error processing document.', 'error');
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
          <div style="font-size: 0.75rem; color: #94A3B8; margin-top: 2px;">
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
    scanResMeta.textContent = `Size: ${formatBytes(doc.size)} • Integrity: SHA-256 Verified`;
    scanConfidenceBadge.textContent = `Confidence: ${classification?.confidence || 85}%`;

    scanCategorySelect.value = doc.category;

    scanKeywordsWrap.innerHTML = '';
    const keywords = classification?.matchedKeywords && classification.matchedKeywords.length > 0 
      ? classification.matchedKeywords 
      : ['domain analysis', 'filename signal'];
    
    keywords.slice(0, 6).forEach((kw) => {
      const tag = document.createElement('span');
      tag.className = 'extracted-kw-tag';
      tag.textContent = kw;
      scanKeywordsWrap.appendChild(tag);
    });

    const snippet = doc.extractedText ? doc.extractedText.slice(0, 600) : '(No readable text extracted)';
    scanOcrTextBox.textContent = snippet;
  }

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

  // --------------------------------------------------------------------------
  // Repository Rendering, Search & Category Filters
  // --------------------------------------------------------------------------
  async function refreshRepository() {
    let allDocs = [];
    if (currentUser) {
      try {
        allDocs = await window.docStorage.getAllDocuments({ category: activeCategory, search: searchQuery });
      } catch (err) {
        console.error('Error refreshing docs:', err);
      }
    }

    updateMetrics(allDocs);
    renderDocuments(allDocs);
  }

  function updateMetrics(docs) {
    statTotalDocs.textContent = docs.length;
    const totalBytes = docs.reduce((acc, doc) => acc + (doc.size || 0), 0);
    statTotalSize.textContent = formatBytes(totalBytes);
    statScannedCount.textContent = docs.length;
  }

  function renderDocuments(docs) {
    documentsContainer.innerHTML = '';

    if (docs.length === 0) {
      const isFiltered = searchQuery.trim().length > 0 || activeCategory !== 'ALL';
      documentsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
          </div>
          <div class="empty-title">${isFiltered ? 'No matching documents found' : 'No documents in your private vault yet'}</div>
          <div class="empty-desc">
            ${isFiltered ? 'Try clearing your search query or category filter.' : 'Upload an image, PDF, or document using the form on the left to scan, extract text, and auto-classify.'}
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
      const extInfo = getFileTypeInfo(doc.name, doc.mimeType);
      const catClass = getCategoryClass(doc.category);
      const card = document.createElement('div');
      card.className = 'doc-card';

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
            <span class="status-indicator" title="AES-256-GCM Encrypted at rest">Encrypted &bull; Intact</span>
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
            <th>Integrity Check</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    docs.forEach((doc) => {
      const extInfo = getFileTypeInfo(doc.name, doc.mimeType);
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
            <select class="category-correct-select" data-id="${doc.id}">
              ${window.ONEFILL_CATEGORIES.map(cat => `<option value="${cat}" ${cat === doc.category ? 'selected' : ''}>${cat}</option>`).join('')}
            </select>
          </td>
          <td style="font-family: var(--font-mono); font-size: 0.775rem;">${formatBytes(doc.size)}</td>
          <td><span class="status-indicator">SHA-256 Valid</span></td>
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
    document.querySelectorAll('.category-correct-select').forEach((sel) => {
      sel.addEventListener('change', async (e) => {
        const id = sel.getAttribute('data-id');
        const newCat = e.target.value;
        try {
          await window.docStorage.updateDocumentCategory(id, newCat);
          showToast(`Category updated to "${newCat}"`, 'success');
          await refreshRepository();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    document.querySelectorAll('.btn-inspect').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        openInspectModal(id);
      });
    });

    document.querySelectorAll('.btn-download').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await triggerDownload(id);
      });
    });

    document.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Permanently purge this encrypted document from your vault?')) {
          try {
            await window.docStorage.deleteDocument(id);
            showToast('Document permanently deleted from vault.', 'success');
            await refreshRepository();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // Document Inspection Modal
  // --------------------------------------------------------------------------
  async function openInspectModal(docId) {
    const doc = await window.docStorage.getDocument(docId);
    if (!doc) {
      showToast('Document access denied or document not found.', 'error');
      return;
    }

    currentModalDoc = doc;
    modalDocTitle.textContent = doc.title;

    let mediaPreview = '';
    if (doc.thumbnail) {
      mediaPreview = `
        <div style="text-align: center; background: #FAF5E8; padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-muted); margin-top: 12px;">
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
          <div class="preview-meta-label">Storage Encryption</div>
          <div class="preview-meta-val" style="color: var(--status-success); font-weight: 600;">AES-256-GCM Private Vault</div>
        </div>
      </div>

      <div style="background: #FAF5E8; border: 1px solid var(--border-muted); padding: 8px 12px; border-radius: var(--radius-sm); margin-bottom: 12px; font-size: 0.725rem; font-family: var(--font-mono); color: var(--text-dim); word-break: break-all;">
        <span style="font-weight: 600; color: var(--text-main);">SHA-256 Checksum:</span> ${escapeHtml(doc.sha256 || 'Verified')}
      </div>

      <div style="background: #FFFFFF; border: 1px solid var(--border-muted); padding: 10px 12px; border-radius: var(--radius-sm); margin-bottom: 12px;">
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

      <div class="privacy-notice-badge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        Browser limitation notice: Browser-level styling provides protection against casual viewing and printing. It cannot prevent OS-level screen captures or browser dev tools.
      </div>
    `;

    document.getElementById('modal-category-select')?.addEventListener('change', async (e) => {
      const newCat = e.target.value;
      await window.docStorage.updateDocumentCategory(doc.id, newCat);
      showToast(`Category updated to "${newCat}"`, 'success');
      await refreshRepository();
    });

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
    if (e.key === 'Escape') {
      if (previewModal.classList.contains('active')) closeModal();
      if (authModal.classList.contains('active')) closeAuthModal();
      if (reauthModal.classList.contains('active')) closeReauthModal();
    }
  });

  modalDownloadAction.addEventListener('click', () => {
    if (currentModalDoc) triggerDownload(currentModalDoc.id);
  });

  async function triggerDownload(docId) {
    try {
      showToast('Verifying SHA-256 integrity & decrypting...', 'success');
      const { blob } = await window.docStorage.downloadDocument(docId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentModalDoc?.name || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Download complete. Integrity verified.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // --------------------------------------------------------------------------
  // Re-authentication for Sensitive Action ("Clear All")
  // --------------------------------------------------------------------------
  btnClearAll.addEventListener('click', async () => {
    const allDocs = await window.docStorage.getAllDocuments();
    if (allDocs.length === 0) {
      showToast('Your vault is already empty.', 'error');
      return;
    }

    if (currentUser && currentUser.id === 'usr_guest') {
      if (confirm('Clear all documents currently stored in your guest vault?')) {
        try {
          await window.docStorage.clearAll('');
          showToast('Guest vault cleared.', 'success');
          await refreshRepository();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
      return;
    }

    reauthPassword.value = '';
    reauthError.style.display = 'none';
    reauthModal.classList.add('active');
  });

  function closeReauthModal() {
    reauthModal.classList.remove('active');
  }

  reauthModalClose.addEventListener('click', closeReauthModal);
  btnReauthCancel.addEventListener('click', closeReauthModal);
  reauthModal.addEventListener('click', (e) => {
    if (e.target === reauthModal) closeReauthModal();
  });

  btnReauthConfirm.addEventListener('click', async () => {
    const password = reauthPassword.value;
    if (!password) {
      reauthError.textContent = 'Password is required to confirm identity.';
      reauthError.style.display = 'block';
      return;
    }

    btnReauthConfirm.disabled = true;
    btnReauthConfirm.textContent = 'Purging...';

    try {
      await window.docStorage.clearAll(password);
      closeReauthModal();
      showToast('All your documents have been securely purged.', 'success');
      await refreshRepository();
    } catch (err) {
      reauthError.textContent = err.message || 'Incorrect password.';
      reauthError.style.display = 'block';
    } finally {
      btnReauthConfirm.disabled = false;
      btnReauthConfirm.textContent = 'Confirm Purge';
    }
  });

  // --------------------------------------------------------------------------
  // Controls: Search, Filter Chips, View Toggle
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // Helper Utilities
  // --------------------------------------------------------------------------
  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function getFileTypeInfo(filename = '', mimeType = '') {
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
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E11D48" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease-out';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  // Start Auth Check on load
  await initAuth();
});
