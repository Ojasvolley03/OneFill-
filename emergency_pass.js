/**
 * OneFill Emergency Document Pass
 * Builds an ordered PDF from explicitly selected documents in the existing vault.
 */

(() => {
  const EMERGENCY_CATEGORIES = [
    { name: 'Aadhaar Card', keywords: ['aadhaar card', 'aadhar card', 'uidai', 'aadhaar number'] },
    { name: 'PAN Card', keywords: ['pan card', 'permanent account number', 'income tax department pan'] },
    { name: 'Voter ID', keywords: ['voter id', 'voter identity card', 'elector photo identity', 'epic card'] },
    { name: 'Driving Licence', keywords: ['driving licence', 'driving license', 'dl number', 'motor driving licence'] },
    { name: 'Passport', keywords: ['passport', 'passport number', 'passport authority'] },
    { name: 'Birth Certificate', keywords: ['birth certificate', 'certificate of birth', 'date of birth certificate'] },
    { name: 'Address Proof', keywords: ['address proof', 'proof of address', 'residence proof', 'utility bill', 'rental agreement'] },
    { name: 'ABHA Health ID', keywords: ['abha health id', 'abha number', 'ayushman bharat health account'] },
    { name: 'Previous Medical History', keywords: ['previous medical history', 'past medical history', 'medical history', 'clinical history'] },
    { name: 'Medical Prescriptions', keywords: ['medical prescription', 'prescription', 'prescribed medication', 'rx'] },
    { name: 'Blood Group Report', keywords: ['blood group report', 'blood group', 'blood type report'] },
    { name: 'Allergy Information', keywords: ['allergy information', 'allergy report', 'allergies', 'allergic to'] },
    { name: 'Current Medication List', keywords: ['current medication list', 'medication list', 'current medications', 'medicines list'] },
    { name: 'Hospital Discharge Summary', keywords: ['hospital discharge summary', 'discharge summary', 'discharge report'] },
    { name: 'Blood Test Reports', keywords: ['blood test report', 'blood test', 'complete blood count', 'cbc report', 'pathology report'] },
    { name: 'X-ray Reports', keywords: ['x-ray report', 'x ray report', 'radiograph report', 'xray'] },
    { name: 'MRI Reports', keywords: ['mri report', 'mri scan', 'magnetic resonance imaging'] },
    { name: 'CT Scan Reports', keywords: ['ct scan report', 'ct scan', 'computed tomography'] },
    { name: 'Ultrasound Reports', keywords: ['ultrasound report', 'ultrasound scan', 'sonography report'] },
    { name: 'Vaccination Records', keywords: ['vaccination record', 'vaccination certificate', 'immunization record', 'vaccine certificate'] },
    { name: 'Health Insurance Card', keywords: ['health insurance card', 'medical insurance card', 'health insurance id card'] },
    { name: 'Health Insurance Policy', keywords: ['health insurance policy', 'medical insurance policy', 'health policy document'] },
    { name: 'TPA Card', keywords: ['tpa card', 'third party administrator card', 'tpa id card'] },
    { name: 'Ayushman Bharat Card', keywords: ['ayushman bharat card', 'pmjay card', 'pm jay card', 'ayushman card'] },
    { name: 'CGHS/ECHS Card', keywords: ['cghs card', 'echs card', 'central government health scheme', 'ex-servicemen contributory health scheme'] },
    { name: 'Corporate Health Insurance Card', keywords: ['corporate health insurance card', 'group health insurance card', 'employee health insurance card'] },
    { name: 'Doctor Referral Letter', keywords: ['doctor referral letter', 'referral letter', 'medical referral'] },
    { name: 'Hospital Admission Advice', keywords: ['hospital admission advice', 'admission advice', 'admission letter'] },
    { name: 'Emergency Contact Details', keywords: ['emergency contact details', 'emergency contact', 'next of kin contact'] },
    { name: 'Disability Certificate', keywords: ['disability certificate', 'disability card', 'person with disability certificate', 'pwd certificate'] }
  ];

  const MAX_COMBINED_BYTES = 100 * 1024 * 1024;
  const OFFLINE_DB_NAME = 'onefill-emergency-offline';
  const OFFLINE_STORE = 'passes';
  let documentsById = new Map();
  let selectedIds = [];
  let generatedUrl = null;
  let generatedBlob = null;
  let generatedFilename = 'onefill-emergency-pass.pdf';
  let currentUser = null;
  let isGenerating = false;

  const categoryList = document.getElementById('emergency-category-list');
  if (!categoryList) return;

  const selectedList = document.getElementById('emergency-selected-list');
  const selectedCount = document.getElementById('emergency-selected-count');
  const generateButton = document.getElementById('emergency-generate');
  const downloadButton = document.getElementById('emergency-download');
  const shareButton = document.getElementById('emergency-share');
  const offlineSaveButton = document.getElementById('emergency-offline-save');
  const previewWrap = document.getElementById('emergency-pdf-preview');
  const previewFrame = document.getElementById('emergency-pdf-frame');
  const authNotice = document.getElementById('emergency-auth-notice');

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else console[type === 'error' ? 'error' : 'log'](message);
  }

  function classifyEmergencyDocument(doc) {
    const title = `${doc.title || ''} ${doc.name || ''}`.toLowerCase();
    const content = `${title} ${doc.description || ''} ${doc.extractedText || ''}`.toLowerCase();
    const aiClassification = window.DocumentClassifier
      ? window.DocumentClassifier.classify(`${doc.title || ''} ${doc.description || ''} ${doc.extractedText || ''}`, doc.name || '')
      : null;
    let bestCategory = null;
    let bestScore = 0;

    EMERGENCY_CATEGORIES.forEach((category) => {
      let score = 0;
      category.keywords.forEach((keyword) => {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
        if (pattern.test(title)) score += 12;
        if (pattern.test(content)) score += 3;
      });
      if (aiClassification && aiClassification.category === 'Health & Medical' &&
          category.name.match(/Medical|Blood|Allergy|Medication|Hospital|X-ray|MRI|CT Scan|Ultrasound|Vaccination|Health|TPA|Ayushman|CGHS|Doctor|Disability|ABHA/)) {
        score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category.name;
      }
    });

    return bestScore >= 3 ? bestCategory : null;
  }

  function renderCategories() {
    const matched = new Map();
    documentsById.forEach((doc) => {
      const categoryName = classifyEmergencyDocument(doc);
      if (!categoryName) return;
      if (!matched.has(categoryName)) matched.set(categoryName, []);
      matched.get(categoryName).push(doc);
    });

    categoryList.innerHTML = EMERGENCY_CATEGORIES.map((category) => {
      const docs = matched.get(category.name) || [];
      docs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const isAvailable = docs.length > 0;
      const status = isAvailable ? 'Available' : 'Missing';
      const itemControl = isAvailable
        ? docs.map((doc) => `<label class="emergency-document-select">
             <input type="checkbox" class="emergency-select-checkbox" data-doc-id="${escapeHtml(doc.id)}" ${selectedIds.includes(doc.id) ? 'checked' : ''} ${isGenerating ? 'disabled' : ''}>
             <span>${escapeHtml(doc.title || doc.name)}</span>
           </label>`).join('')
        : `<button type="button" class="btn-secondary emergency-upload-button" data-category="${escapeHtml(category.name)}">Upload Document</button>`;
      return `<article class="emergency-category-card ${isAvailable ? 'is-available' : 'is-missing'}">
        <div class="emergency-category-copy">
          <h3>${escapeHtml(category.name)}</h3>
          <span class="emergency-status ${isAvailable ? 'status-available' : 'status-missing'}">${status}</span>
          ${itemControl}
        </div>
      </article>`;
    }).join('');

    renderSelected();
  }

  function renderSelected() {
    const selectedDocs = selectedIds.map((id) => documentsById.get(id)).filter(Boolean);
    selectedCount.textContent = `${selectedDocs.length} selected`;
    selectedList.innerHTML = selectedDocs.map((doc, index) => {
      const category = classifyEmergencyDocument(doc) || 'Document';
      return `<li class="emergency-selected-item" data-index="${index}">
        <div><strong>${escapeHtml(category)}</strong><span>${escapeHtml(doc.title || doc.name)}</span></div>
        <div class="emergency-order-controls">
          <button type="button" class="btn-secondary emergency-order-button" data-move="up" data-index="${index}" aria-label="Move ${escapeHtml(doc.title || doc.name)} up" ${index === 0 || isGenerating ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn-secondary emergency-order-button" data-move="down" data-index="${index}" aria-label="Move ${escapeHtml(doc.title || doc.name)} down" ${index === selectedDocs.length - 1 || isGenerating ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn-secondary emergency-remove-button" data-remove-id="${escapeHtml(doc.id)}" ${isGenerating ? 'disabled' : ''}>Remove</button>
        </div>
      </li>`;
    }).join('');
    generateButton.disabled = selectedDocs.length === 0 || !currentUser || isGenerating;
    offlineSaveButton.disabled = !generatedBlob || !currentUser;
    if (selectedDocs.length === 0) clearGenerated();
  }

  async function refreshCategories() {
    try {
      currentUser = await window.docStorage.checkAuth();
      authNotice.hidden = Boolean(currentUser);
      if (!currentUser) {
        documentsById = new Map();
        selectedIds = [];
        renderCategories();
        return;
      }
      const documents = await window.docStorage.getAllDocuments();
      documentsById = new Map(documents.map((doc) => [doc.id, doc]));
      selectedIds = selectedIds.filter((id) => documentsById.has(id));
      renderCategories();
    } catch (error) {
      notify(`Could not load emergency document availability: ${error.message}`, 'error');
    }
  }

  function clearGenerated() {
    if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    generatedUrl = null;
    generatedBlob = null;
    previewFrame.removeAttribute('src');
    previewWrap.hidden = true;
    downloadButton.disabled = true;
    shareButton.disabled = true;
    offlineSaveButton.disabled = true;
  }

  function addImagePage(pdf, image, width, height) {
    const pageSize = [width, height];
    const page = pdf.addPage(pageSize);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }

  async function imageBytesForPdf(blob, doc) {
    const type = blob.type.toLowerCase();
    if (type === 'image/png' || /\.png$/i.test(doc.name)) return { kind: 'png', bytes: await blob.arrayBuffer() };
    if (type === 'image/jpeg' || type === 'image/jpg' || /\.(jpe?g)$/i.test(doc.name)) return { kind: 'jpg', bytes: await blob.arrayBuffer() };

    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image conversion is unavailable in this browser.');
      context.drawImage(bitmap, 0, 0);
      const pngBlob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not convert image for PDF.')), 'image/png');
      });
      return { kind: 'png', bytes: await pngBlob.arrayBuffer() };
    } finally {
      bitmap.close();
    }
  }

  async function appendDocument(pdf, blob, doc) {
    const lowerName = (doc.name || '').toLowerCase();
    if (blob.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
      const source = await PDFLib.PDFDocument.load(await blob.arrayBuffer(), { updateMetadata: false });
      const pageIndices = source.getPageIndices();
      if (pageIndices.length === 0) throw new Error('The PDF contains no readable pages.');
      const pages = await pdf.copyPages(source, pageIndices);
      pages.forEach((page) => pdf.addPage(page));
      return;
    }

    if (blob.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(lowerName)) {
      const imageSource = await imageBytesForPdf(blob, doc);
      const image = imageSource.kind === 'jpg'
        ? await pdf.embedJpg(imageSource.bytes)
        : await pdf.embedPng(imageSource.bytes);
      const scale = Math.min(1, 842 / image.height, 595 / image.width);
      addImagePage(pdf, image, image.width * scale, image.height * scale);
      return;
    }
    throw new Error(`"${doc.name}" is not a PDF or supported image. Upload a PDF or image to include it.`);
  }

  async function generatePdf() {
    if (!currentUser) {
      notify('Sign in before generating an emergency pass.', 'error');
      return;
    }
    if (!window.PDFLib) {
      notify('PDF generation library is unavailable. Check your connection and reload the app.', 'error');
      return;
    }
    const idsToRetrieve = selectedIds.filter((id) => documentsById.has(id));
    if (!idsToRetrieve.length) return;
    const totalBytes = idsToRetrieve.reduce((sum, id) => sum + (documentsById.get(id).size || 0), 0);
    if (totalBytes > MAX_COMBINED_BYTES) {
      notify('The selected files exceed the 100 MB Emergency Pass limit. Select fewer or smaller documents.', 'error');
      return;
    }

    clearGenerated();
    isGenerating = true;
    renderCategories();
    generateButton.disabled = true;
    generateButton.textContent = 'Retrieving selected documents...';
    try {
      const pdf = await PDFLib.PDFDocument.create();
      pdf.setTitle('OneFill Emergency Document Pass');
      pdf.setCreator('OneFill');

      for (let index = 0; index < idsToRetrieve.length; index += 1) {
        const id = idsToRetrieve[index];
        const doc = documentsById.get(id);
        generateButton.textContent = `Processing ${index + 1} of ${idsToRetrieve.length}...`;
        const { blob } = await window.docStorage.downloadDocument(id);
        try {
          await appendDocument(pdf, blob, doc);
        } catch (error) {
          throw new Error(`Could not include "${doc.title || doc.name}": ${error.message}`);
        }
      }

      const bytes = await pdf.save({ useObjectStreams: true });
      generatedBlob = new Blob([bytes], { type: 'application/pdf' });
      generatedFilename = 'onefill-emergency-pass.pdf';
      generatedUrl = URL.createObjectURL(generatedBlob);
      previewFrame.src = generatedUrl;
      previewWrap.hidden = false;
      downloadButton.disabled = false;
      shareButton.disabled = false;
      offlineSaveButton.disabled = false;
      notify('Emergency PDF created from selected documents only.', 'success');
    } catch (error) {
      clearGenerated();
      notify(error.message || 'PDF generation failed. Verify selected files and try again.', 'error');
    } finally {
      generateButton.textContent = 'Generate / Regenerate PDF';
      isGenerating = false;
      renderCategories();
    }
  }

  function downloadGenerated() {
    if (!generatedBlob || !generatedUrl) return;
    const link = document.createElement('a');
    link.href = generatedUrl;
    link.download = generatedFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function shareGenerated() {
    if (!generatedBlob) return;
    if (!document.getElementById('emergency-share-consent').checked) {
      notify('Confirm your consent before sharing this sensitive PDF.', 'error');
      return;
    }
    if (!currentUser) {
      notify('Sign in before sharing an emergency pass.', 'error');
      return;
    }
    const file = new File([generatedBlob], generatedFilename, { type: 'application/pdf' });
    if (!navigator.share || !navigator.canShare || !navigator.canShare({ files: [file] })) {
      notify('File sharing is not supported on this device. Download the PDF to share it securely.', 'error');
      return;
    }
    try {
      await navigator.share({ title: 'OneFill Emergency Document Pass', files: [file] });
    } catch (error) {
      if (error.name !== 'AbortError') notify(`Could not share the PDF: ${error.message}`, 'error');
    }
  }

  function openOfflineDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(OFFLINE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(OFFLINE_STORE)) {
          request.result.createObjectStore(OFFLINE_STORE, { keyPath: 'userId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Encrypted offline storage is unavailable.'));
    });
  }

  async function saveOfflineCopy() {
    if (!generatedBlob || !currentUser) return;
    const passphrase = prompt('Create a passphrase (at least 8 characters) to encrypt this offline copy. You will need it to open the pass later.');
    if (passphrase === null) return;
    if (passphrase.length < 8) {
      notify('The offline passphrase must be at least 8 characters.', 'error');
      return;
    }
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await generatedBlob.arrayBuffer());
      const db = await openOfflineDatabase();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(OFFLINE_STORE, 'readwrite');
        transaction.objectStore(OFFLINE_STORE).put({
          userId: currentUser.id,
          salt: Array.from(salt),
          iv: Array.from(iv),
          ciphertext,
          filename: generatedFilename,
          savedAt: new Date().toISOString()
        });
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('Offline copy could not be saved.'));
      });
      db.close();
      localStorage.setItem('onefill_emergency_offline_user', currentUser.id);
      notify('Encrypted offline copy saved on this device.', 'success');
    } catch (error) {
      notify(`Could not save an encrypted offline copy: ${error.message}`, 'error');
    }
  }

  async function openOfflineCopy() {
    if (!window.crypto || !crypto.subtle || !window.indexedDB) {
      notify('Encrypted offline access requires a secure browser context (HTTPS or localhost).', 'error');
      return;
    }
    const userId = currentUser ? currentUser.id : localStorage.getItem('onefill_emergency_offline_user');
    if (!userId) {
      notify('No offline Emergency Pass has been saved on this device.', 'error');
      return;
    }
    const passphrase = prompt('Enter the passphrase for your encrypted offline Emergency Pass.');
    if (passphrase === null) return;
    let db;
    try {
      db = await openOfflineDatabase();
      const record = await new Promise((resolve, reject) => {
        const request = db.transaction(OFFLINE_STORE, 'readonly').objectStore(OFFLINE_STORE).get(userId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Could not read the encrypted offline pass.'));
      });
      db.close();
      if (!record) throw new Error('No offline Emergency Pass is saved for this account.');
      const salt = new Uint8Array(record.salt);
      const iv = new Uint8Array(record.iv);
      const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, record.ciphertext);
      clearGenerated();
      generatedBlob = new Blob([plaintext], { type: 'application/pdf' });
      generatedFilename = record.filename || 'onefill-emergency-pass.pdf';
      generatedUrl = URL.createObjectURL(generatedBlob);
      previewFrame.src = generatedUrl;
      previewWrap.hidden = false;
      downloadButton.disabled = false;
      shareButton.disabled = false;
      offlineSaveButton.disabled = !currentUser;
      notify('Encrypted offline Emergency Pass unlocked.', 'success');
    } catch (error) {
      if (db) db.close();
      notify(error.name === 'OperationError' ? 'Incorrect passphrase or damaged offline copy.' : error.message, 'error');
    }
  }

  categoryList.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.emergency-select-checkbox');
    if (!checkbox) return;
    if (checkbox.checked && !selectedIds.includes(checkbox.dataset.docId)) selectedIds.push(checkbox.dataset.docId);
    if (!checkbox.checked) selectedIds = selectedIds.filter((id) => id !== checkbox.dataset.docId);
    clearGenerated();
    renderSelected();
  });

  categoryList.addEventListener('click', (event) => {
    const uploadButton = event.target.closest('.emergency-upload-button');
    if (!uploadButton) return;
    const category = uploadButton.dataset.category;
    document.getElementById('tab-nav-docs').click();
    document.getElementById('doc-title').value = category;
    document.getElementById('doc-category').value = 'AUTO';
    document.getElementById('doc-description').value = `Emergency Pass category: ${category}`;
    document.getElementById('file-input').click();
    document.getElementById('upload-heading').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  selectedList.addEventListener('click', (event) => {
    const moveButton = event.target.closest('.emergency-order-button');
    const removeButton = event.target.closest('.emergency-remove-button');
    if (moveButton) {
      const index = Number(moveButton.dataset.index);
      const next = moveButton.dataset.move === 'up' ? index - 1 : index + 1;
      if (next < 0 || next >= selectedIds.length) return;
      [selectedIds[index], selectedIds[next]] = [selectedIds[next], selectedIds[index]];
      clearGenerated();
      renderCategories();
    } else if (removeButton) {
      selectedIds = selectedIds.filter((id) => id !== removeButton.dataset.removeId);
      clearGenerated();
      renderCategories();
    }
  });

  document.getElementById('emergency-refresh').addEventListener('click', refreshCategories);
  document.getElementById('emergency-sign-in').addEventListener('click', () => document.getElementById('btn-open-auth')?.click());
  document.getElementById('emergency-generate').addEventListener('click', generatePdf);
  document.getElementById('emergency-download').addEventListener('click', downloadGenerated);
  document.getElementById('emergency-share').addEventListener('click', shareGenerated);
  document.getElementById('emergency-offline-save').addEventListener('click', saveOfflineCopy);
  document.getElementById('emergency-offline-open').addEventListener('click', openOfflineCopy);
  document.getElementById('emergency-remove-pdf').addEventListener('click', clearGenerated);
  document.querySelectorAll('.emergency-shortcut').forEach((button) => {
    button.addEventListener('click', () => document.getElementById('tab-nav-emergency').click());
  });
  window.addEventListener('onefill:documents-changed', () => {
    clearGenerated();
    refreshCategories();
  });
  window.addEventListener('onefill:auth-changed', async (event) => {
    const nextUser = event.detail && event.detail.user;
    if ((currentUser && currentUser.id) !== (nextUser && nextUser.id)) {
      clearGenerated();
      selectedIds = [];
      document.getElementById('emergency-share-consent').checked = false;
    }
    currentUser = nextUser;
    await refreshCategories();
  });
  window.addEventListener('pagehide', clearGenerated);

  renderCategories();
  refreshCategories();
})();
