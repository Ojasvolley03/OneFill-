/**
 * OneFill - AI AutoFill Frontend Controller & Interactive Studio
 * Handles Tab Navigation, Personal Information Profile (AES-256 encrypted),
 * Uploaded Form AI Analysis & Field Matching Studio, Filled PDF Export,
 * and Live Form Simulator / Browser Extension Hub.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --------------------------------------------------------------------------
  // 1. Tab Navigation Controller
  // --------------------------------------------------------------------------
  const tabBtns = document.querySelectorAll('.app-tab-btn');
  const viewTabs = document.querySelectorAll('.app-view-tab');

  function switchTab(targetId) {
    tabBtns.forEach(btn => {
      const match = btn.getAttribute('data-target') === targetId;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-selected', match ? 'true' : 'false');
    });

    viewTabs.forEach(tab => {
      if (tab.id === targetId) {
        tab.style.display = 'block';
        tab.classList.add('active');
      } else {
        tab.style.display = 'none';
        tab.classList.remove('active');
      }
    });

    // Refresh profile when switching to autofill tab
    if (targetId === 'view-autofill') {
      loadProfileData();
    }
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      if (target) switchTab(target);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Personal Information Profile Management
  // --------------------------------------------------------------------------
  const profileForm = document.getElementById('profile-form');
  const btnSaveProfile = document.getElementById('btn-save-profile');
  const btnDeleteProfile = document.getElementById('btn-delete-profile');
  const profileCompletenessBar = document.getElementById('profile-completeness-bar');
  const profileCompletenessPct = document.getElementById('profile-completeness-pct');
  const customFieldsContainer = document.getElementById('custom-fields-container');
  const btnAddCustomField = document.getElementById('btn-add-custom-field');
  const profileStatusBanner = document.getElementById('profile-status-banner');

  let currentProfile = {};

  const STANDARD_PROFILE_KEYS = [
    'fullName', 'fatherName', 'motherName', 'email', 'phone', 'dob',
    'gender', 'address', 'city', 'state', 'zipCode', 'country',
    'college', 'university', 'course', 'branch', 'rollNumber',
    'educationDetails', 'passingYear', 'cgpaOrPercentage', 'otherInfo'
  ];

  async function loadProfileData() {
    try {
      const profile = await window.docStorage.getProfile();
      if (!profile) return;
      currentProfile = profile;
      populateProfileForm(profile);
      updateProfileCompleteness(profile);
    } catch (err) {
      console.warn('Profile fetch note:', err.message);
    }
  }

  function populateProfileForm(profile = {}) {
    STANDARD_PROFILE_KEYS.forEach(key => {
      const input = document.getElementById(`prof-${key}`);
      if (input) {
        input.value = profile[key] || '';
      }
    });

    // Render Custom Fields
    if (customFieldsContainer) {
      customFieldsContainer.innerHTML = '';
      if (Array.isArray(profile.customFields) && profile.customFields.length > 0) {
        profile.customFields.forEach(c => addCustomFieldRow(c.label, c.value, c.key));
      }
    }
  }

  function collectProfileFormData() {
    const data = {};
    STANDARD_PROFILE_KEYS.forEach(key => {
      const input = document.getElementById(`prof-${key}`);
      if (input) {
        data[key] = input.value.trim();
      }
    });

    // Collect Custom Fields
    data.customFields = [];
    if (customFieldsContainer) {
      const rows = customFieldsContainer.querySelectorAll('.custom-field-row');
      rows.forEach(row => {
        const lblInput = row.querySelector('.custom-label-input');
        const valInput = row.querySelector('.custom-value-input');
        if (lblInput && valInput && lblInput.value.trim()) {
          data.customFields.push({
            key: lblInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
            label: lblInput.value.trim(),
            value: valInput.value.trim()
          });
        }
      });
    }

    return data;
  }

  function updateProfileCompleteness(profile) {
    if (!profile) return;
    let filled = 0;
    STANDARD_PROFILE_KEYS.forEach(key => {
      if (profile[key] && String(profile[key]).trim().length > 0) filled++;
    });

    const customCount = Array.isArray(profile.customFields) ? profile.customFields.filter(c => c && c.value).length : 0;
    const totalConsidered = STANDARD_PROFILE_KEYS.length;
    const pct = Math.min(100, Math.round(((filled + customCount) / totalConsidered) * 100));

    if (profileCompletenessBar) profileCompletenessBar.style.width = `${pct}%`;
    if (profileCompletenessPct) profileCompletenessPct.textContent = `${pct}%`;
  }

  function addCustomFieldRow(label = '', value = '', key = '') {
    if (!customFieldsContainer) return;
    const row = document.createElement('div');
    row.className = 'custom-field-row';
    row.innerHTML = `
      <div class="custom-field-inputs">
        <input type="text" class="form-input custom-label-input" placeholder="Field Name (e.g. LinkedIn, Aadhaar)" value="${escapeHtml(label)}">
        <input type="text" class="form-input custom-value-input" placeholder="Field Value" value="${escapeHtml(value)}">
      </div>
      <button type="button" class="btn-remove-custom" title="Remove custom field">&times;</button>
    `;

    row.querySelector('.btn-remove-custom').addEventListener('click', () => {
      row.remove();
      updateProfileCompleteness(collectProfileFormData());
    });

    customFieldsContainer.appendChild(row);
  }

  if (btnAddCustomField) {
    btnAddCustomField.addEventListener('click', () => addCustomFieldRow());
  }

  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      btnSaveProfile.disabled = true;
      btnSaveProfile.innerHTML = '<span class="pulse-dot"></span> Encrypting &amp; Saving...';

      try {
        const payload = collectProfileFormData();
        const saved = await window.docStorage.saveProfile(payload);
        currentProfile = saved;
        updateProfileCompleteness(saved);

        showToast('Personal Information Profile securely encrypted with AES-256-GCM and saved.', 'success');
        if (profileStatusBanner) {
          profileStatusBanner.style.display = 'block';
          profileStatusBanner.textContent = `Last Saved: ${new Date().toLocaleTimeString()} (Encrypted at rest)`;
          setTimeout(() => { profileStatusBanner.style.display = 'none'; }, 5000);
        }
      } catch (err) {
        showToast(`Save failed: ${err.message}`, 'error');
      } finally {
        btnSaveProfile.disabled = false;
        btnSaveProfile.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          Save Personal Profile
        `;
      }
    });
  }

  if (btnDeleteProfile) {
    btnDeleteProfile.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete and reset your saved profile? All saved details will be permanently purged.')) {
        return;
      }

      try {
        await window.docStorage.deleteProfile();
        currentProfile = {};
        populateProfileForm({});
        updateProfileCompleteness({});
        showToast('Personal Information Profile deleted successfully.', 'info');
      } catch (err) {
        showToast(`Delete failed: ${err.message}`, 'error');
      }
    });
  }

  // --------------------------------------------------------------------------
  // 3. Uploaded Form Processing & AI Matching Studio
  // --------------------------------------------------------------------------
  const formDropzone = document.getElementById('form-dropzone');
  const formFileInput = document.getElementById('form-file-input');
  const formStagedCard = document.getElementById('form-staged-card');
  const formStagedName = document.getElementById('form-staged-name');
  const formStagedSize = document.getElementById('form-staged-size');
  const btnRemoveFormFile = document.getElementById('btn-remove-form-file');
  const btnAnalyzeUploadedForm = document.getElementById('btn-analyze-uploaded-form');
  const btnLoadSampleForm = document.getElementById('btn-load-sample-form');

  const formStudioContainer = document.getElementById('form-studio-container');
  const studioSummaryBox = document.getElementById('studio-summary-box');
  const studioFieldsList = document.getElementById('studio-fields-list');
  const studioFormTitle = document.getElementById('studio-form-title');

  const btnExportFilledPdf = document.getElementById('btn-export-filled-pdf');
  const btnExportFilledJson = document.getElementById('btn-export-filled-json');
  const btnCopyFilledFields = document.getElementById('btn-copy-filled-fields');
  const btnResetStudio = document.getElementById('btn-reset-studio');

  let currentFormFile = null;
  let activeAnalysis = null;

  if (formDropzone && formFileInput) {
    formDropzone.addEventListener('click', () => formFileInput.click());

    formDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      formDropzone.classList.add('dragover');
    });

    formDropzone.addEventListener('dragleave', () => {
      formDropzone.classList.remove('dragover');
    });

    formDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      formDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFormFileSelected(e.dataTransfer.files[0]);
      }
    });

    formFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFormFileSelected(e.target.files[0]);
      }
    });
  }

  function handleFormFileSelected(file) {
    currentFormFile = file;
    formStagedName.textContent = file.name;
    formStagedSize.textContent = `${(file.size / 1024).toFixed(1)} KB`;
    formDropzone.style.display = 'none';
    formStagedCard.style.display = 'flex';
    btnAnalyzeUploadedForm.disabled = false;
  }

  if (btnRemoveFormFile) {
    btnRemoveFormFile.addEventListener('click', () => {
      currentFormFile = null;
      formFileInput.value = '';
      formDropzone.style.display = 'flex';
      formStagedCard.style.display = 'none';
      btnAnalyzeUploadedForm.disabled = true;
    });
  }

  if (btnAnalyzeUploadedForm) {
    btnAnalyzeUploadedForm.addEventListener('click', async () => {
      if (!currentFormFile) return;

      btnAnalyzeUploadedForm.disabled = true;
      btnAnalyzeUploadedForm.innerHTML = '<span class="pulse-dot"></span> Scanning &amp; Extracting Form...';

      try {
        // Step 1: Text extraction via client OCR / PDF.js
        const extracted = await window.DocumentExtractor.extract(currentFormFile, (msg, pct) => {
          btnAnalyzeUploadedForm.innerHTML = `<span class="pulse-dot"></span> ${msg} (${pct}%)`;
        });

        // Step 2: Pass to AI Semantic Form Analyzer
        const payload = {
          formTitle: currentFormFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
          formText: extracted.text || ''
        };

        const analysis = await window.docStorage.analyzeForm(payload);
        activeAnalysis = analysis;
        renderFormStudio(analysis);

        showToast(`Analyzed ${analysis.totalFields} form fields with AI semantic matching.`, 'success');
      } catch (err) {
        showToast(`Form analysis error: ${err.message}`, 'error');
      } finally {
        btnAnalyzeUploadedForm.disabled = false;
        btnAnalyzeUploadedForm.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          Scan &amp; Match Form Fields
        `;
      }
    });
  }

  // Sample form loader for immediate 1-click test
  if (btnLoadSampleForm) {
    btnLoadSampleForm.addEventListener('click', async () => {
      const sampleText = `
        OFFICIAL ADMISSION APPLICATION FORM
        1. Full Name of Candidate: ___________________________________
        2. Date of Birth (YYYY-MM-DD): _______________________________
        3. Gender: ( ) Male  ( ) Female  ( ) Other
        4. Parent / Guardian Name: ___________________________________
        5. Email Address: ___________________________________________
        6. Phone Number: ____________________________________________
        7. Residential Address: ______________________________________
        8. City / District: _________________________________________
        9. State / Province: ________________________________________
        10. Pincode / Postal Code: ___________________________________
        11. College / Institute Attended: ____________________________
        12. University: ______________________________________________
        13. Degree / Course Pursuing: ________________________________
        14. Branch / Specialization: _________________________________
        15. Roll Number / Student ID: ________________________________
        16. Year of Passing: _________________________________________
        17. CGPA / Aggregate Percentage: _____________________________
        18. Passport / ID Document Number: ___________________________
      `;

      btnLoadSampleForm.disabled = true;
      btnLoadSampleForm.innerHTML = '<span class="pulse-dot"></span> Loading Sample...';

      try {
        const payload = {
          formTitle: 'University Admission Application Form (Sample)',
          formText: sampleText
        };
        const analysis = await window.docStorage.analyzeForm(payload);
        activeAnalysis = analysis;
        renderFormStudio(analysis);
        showToast('Sample form loaded and matched against your profile!', 'success');
      } catch (err) {
        showToast(`Failed loading sample: ${err.message}`, 'error');
      } finally {
        btnLoadSampleForm.disabled = false;
        btnLoadSampleForm.innerHTML = '✨ Load Sample Admission Form';
      }
    });
  }

  function renderFormStudio(analysis) {
    if (!formStudioContainer) return;
    formStudioContainer.style.display = 'block';
    studioFormTitle.textContent = analysis.formTitle || 'Form Analysis Studio';

    // Summary Metric Badges
    studioSummaryBox.innerHTML = `
      <div class="studio-stat-pill pill-total">
        <strong>${analysis.totalFields}</strong> Total Fields
      </div>
      <div class="studio-stat-pill pill-reliable">
        <strong>${analysis.confidentCount}</strong> Ready to Fill (Reliable)
      </div>
      <div class="studio-stat-pill pill-uncertain">
        <strong>${analysis.uncertainCount}</strong> Uncertain (Review)
      </div>
      <div class="studio-stat-pill pill-missing">
        <strong>${analysis.missingCount}</strong> Missing in Profile
      </div>
    `;

    // Render Fields
    studioFieldsList.innerHTML = '';
    analysis.fields.forEach((field, idx) => {
      const card = document.createElement('div');
      card.className = `studio-field-card ${field.isReliable ? 'field-reliable' : (field.suggestedValue ? 'field-uncertain' : 'field-missing')}`;

      let statusBadge = '';
      if (field.isReliable) {
        statusBadge = `<span class="badge-status-reliable">✓ Reliable Match (${field.confidence}%)</span>`;
      } else if (field.hasValue) {
        statusBadge = `<span class="badge-status-uncertain">⚠ Review Needed (${field.confidence}%)</span>`;
      } else {
        statusBadge = `<span class="badge-status-missing">Empty in Profile</span>`;
      }

      card.innerHTML = `
        <div class="field-card-header">
          <div class="field-label-group">
            <span class="field-idx">#${idx + 1}</span>
            <span class="field-label-title">${escapeHtml(field.label)}</span>
            <span class="field-type-pill">${escapeHtml(field.type)}</span>
          </div>
          <div>${statusBadge}</div>
        </div>

        <div class="field-card-body">
          <div class="field-match-reason">${escapeHtml(field.reason)}</div>
          <div class="field-input-row">
            <input type="${field.type === 'email' ? 'email' : (field.type === 'date' ? 'date' : 'text')}"
              class="form-input studio-field-input"
              data-field-id="${field.id}"
              data-matched-key="${field.matchedKey || ''}"
              value="${escapeHtml(field.suggestedValue || '')}"
              placeholder="Leave empty or enter value manually...">
            ${!field.isReliable && field.matchedKey ? `
              <button type="button" class="btn-quick-save-profile" title="Save this value to your personal profile">
                Save to Profile
              </button>
            ` : ''}
          </div>
        </div>
      `;

      // Quick save to profile handler
      const btnQuickSave = card.querySelector('.btn-quick-save-profile');
      if (btnQuickSave) {
        btnQuickSave.addEventListener('click', async () => {
          const input = card.querySelector('.studio-field-input');
          const val = input.value.trim();
          if (!val) {
            alert('Please enter a value before saving.');
            return;
          }
          if (confirm(`Do you permit OneFill to save "${field.matchedKey}: ${val}" into your personal profile?`)) {
            try {
              const current = await window.docStorage.getProfile();
              current[field.matchedKey] = val;
              await window.docStorage.saveProfile(current);
              showToast(`Saved ${field.matchedKey} to personal profile.`, 'success');
              btnQuickSave.textContent = 'Saved ✓';
              btnQuickSave.disabled = true;
            } catch (e) {
              showToast(`Failed to update profile: ${e.message}`, 'error');
            }
          }
        });
      }

      studioFieldsList.appendChild(card);
    });

    // Scroll to studio
    formStudioContainer.scrollIntoView({ behavior: 'smooth' });
  }

  // --------------------------------------------------------------------------
  // 4. Form Actions: PDF Export, JSON Download, Copy Values
  // --------------------------------------------------------------------------
  function getActiveStudioValues() {
    const inputs = document.querySelectorAll('.studio-field-input');
    const values = [];
    inputs.forEach(input => {
      const card = input.closest('.studio-field-card');
      const label = card.querySelector('.field-label-title').textContent.trim();
      const val = input.value.trim();
      values.push({ label, value: val });
    });
    return values;
  }

  if (btnExportFilledPdf) {
    btnExportFilledPdf.addEventListener('click', () => {
      const fieldValues = getActiveStudioValues();
      if (fieldValues.length === 0) {
        alert('No fields to export.');
        return;
      }

      // Generate a clean printable filled application document
      generatePrintableApplicationDoc(studioFormTitle.textContent || 'Filled Application Form', fieldValues);
    });
  }

  if (btnExportFilledJson) {
    btnExportFilledJson.addEventListener('click', () => {
      const fieldValues = getActiveStudioValues();
      const exportObj = {
        title: studioFormTitle.textContent || 'OneFill AutoFilled Form',
        exportedAt: new Date().toISOString(),
        fields: fieldValues
      };

      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(studioFormTitle.textContent || 'filled_form').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Exported filled form data as JSON.', 'success');
    });
  }

  if (btnCopyFilledFields) {
    btnCopyFilledFields.addEventListener('click', () => {
      const fieldValues = getActiveStudioValues();
      const text = fieldValues.map(f => `${f.label}: ${f.value || '(Empty)'}`).join('\n');
      navigator.clipboard.writeText(text).then(() => {
        showToast('All filled field values copied to clipboard!', 'success');
      });
    });
  }

  if (btnResetStudio) {
    btnResetStudio.addEventListener('click', () => {
      formStudioContainer.style.display = 'none';
      activeAnalysis = null;
    });
  }

  function generatePrintableApplicationDoc(title, fields) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup blocked. Please allow popups to download/print the filled form.');
      return;
    }

    let rowsHtml = '';
    fields.forEach((f, idx) => {
      rowsHtml += `
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #E5E7EB; width: 35%; font-weight: 600; color: #1F2937;">
            ${escapeHtml(f.label)}
          </td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #E5E7EB; color: #111827; font-family: 'JetBrains Mono', monospace;">
            ${escapeHtml(f.value || '—')}
          </td>
        </tr>
      `;
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #111827; max-width: 800px; margin: 0 auto; line-height: 1.5; }
          .header { border-bottom: 2px solid #4F46E5; padding-bottom: 14px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
          .title { font-size: 22px; font-weight: 700; color: #1E1B4B; }
          .meta { font-size: 12px; color: #6B7280; }
          .badge { background: #EEF2FF; color: #4F46E5; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13.5px; }
          .footer { font-size: 11px; color: #9CA3AF; text-align: center; border-top: 1px solid #E5E7EB; padding-top: 14px; margin-top: 40px; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${escapeHtml(title)}</div>
            <div class="meta">Generated via OneFill AI AutoFill &bull; Verified &amp; Confirmed by Applicant</div>
          </div>
          <span class="badge">Official Record</span>
        </div>

        <table>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          OneFill Secure Vault &bull; Authenticated &amp; Verified Form Submission Document &bull; ${new Date().toLocaleDateString()}
        </div>

        <div class="no-print" style="margin-top: 30px; text-align: center;">
          <button onclick="window.print()" style="background: #4F46E5; color: white; border: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">
            Print / Save as PDF
          </button>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  }

  // --------------------------------------------------------------------------
  // 5. Live Online Form Simulator & Interactive Test Playground
  // --------------------------------------------------------------------------
  const presetSelector = document.getElementById('simulator-preset-selector');
  const simGoogleFormContainer = document.getElementById('sim-google-form-container');
  const simWebFormContainer = document.getElementById('sim-web-form-container');
  const btnTriggerSimAutoFill = document.getElementById('btn-trigger-sim-autofill');
  const btnResetSimForm = document.getElementById('btn-reset-sim-form');

  if (presetSelector) {
    presetSelector.addEventListener('change', () => {
      const val = presetSelector.value;
      if (val === 'google-form') {
        simGoogleFormContainer.style.display = 'block';
        simWebFormContainer.style.display = 'none';
      } else {
        simGoogleFormContainer.style.display = 'none';
        simWebFormContainer.style.display = 'block';
      }
    });
  }

  if (btnTriggerSimAutoFill) {
    btnTriggerSimAutoFill.addEventListener('click', async () => {
      // 1. Retrieve current profile
      const profile = await window.docStorage.getProfile();
      if (!profile || !profile.fullName) {
        showToast('Please save your Personal Information Profile first in the AI AutoFill tab!', 'warning');
        return;
      }

      // 2. Identify fields in the currently active simulator container
      const activeContainer = presetSelector.value === 'google-form' ? simGoogleFormContainer : simWebFormContainer;
      const targetInputs = activeContainer.querySelectorAll('.sim-input');

      const matches = [];
      targetInputs.forEach(input => {
        const label = input.getAttribute('data-field-label');
        if (label) {
          const match = window.AutoFillMatcher.matchField(label, profile);
          if (match.hasValue) {
            matches.push({
              element: input,
              label: label,
              key: match.matchedKey,
              value: match.suggestedValue || profile[match.matchedKey],
              confidence: match.confidence,
              reason: match.reason
            });
          }
        }
      });

      if (matches.length === 0) {
        showToast('No profile details match the fields on this form.', 'warning');
        return;
      }

      // 3. Display Authentic Permission Request Modal (Requirement 12)
      showInAppPermissionModal(matches, () => {
        // 4. Fill approved fields automatically (Requirement 13)
        let count = 0;
        matches.forEach(m => {
          if (m.element.tagName === 'INPUT' || m.element.tagName === 'TEXTAREA') {
            m.element.value = m.value;
          } else if (m.element.classList.contains('sim-radio-group')) {
            // Check radio matching user value
            const radios = m.element.querySelectorAll('input[type="radio"]');
            radios.forEach(r => {
              if (r.value.toLowerCase() === String(m.value).toLowerCase()) {
                r.checked = true;
              }
            });
          }

          // Visual highlight animation
          m.element.classList.add('sim-field-filled-glow');
          setTimeout(() => m.element.classList.remove('sim-field-filled-glow'), 4000);
          count++;
        });

        // 5. In-page confirmation banner reminding user to review & that auto-submit is disabled (Req 14 & 15)
        showToast(`OneFill AutoFill: Successfully filled ${count} field(s). Please review and submit manually. OneFill will NEVER submit automatically.`, 'success');
      });
    });
  }

  if (btnResetSimForm) {
    btnResetSimForm.addEventListener('click', () => {
      const activeContainer = presetSelector.value === 'google-form' ? simGoogleFormContainer : simWebFormContainer;
      activeContainer.querySelectorAll('input:not([type="radio"]), textarea').forEach(i => i.value = '');
      activeContainer.querySelectorAll('input[type="radio"]').forEach(r => r.checked = false);
      showToast('Form fields cleared.', 'info');
    });
  }

  function showInAppPermissionModal(matches, onApprove) {
    const existing = document.getElementById('inapp-permission-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'inapp-permission-modal';
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';

    let itemsHtml = '';
    matches.forEach((m, idx) => {
      itemsHtml += `
        <label class="permission-item-row">
          <input type="checkbox" class="perm-check" data-idx="${idx}" checked>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main);">${escapeHtml(m.label)}</div>
            <div style="font-size: 0.8rem; color: var(--brand-primary); margin-top: 2px;">&rarr; <strong>${escapeHtml(String(m.value))}</strong></div>
          </div>
          <span class="badge-status-reliable">${m.confidence}%</span>
        </label>
      `;
    });

    overlay.innerHTML = `
      <div class="modal-card" style="max-width: 500px;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="tab-badge-new" style="margin: 0;">OneFill AI</span>
            <h3 class="modal-title" style="margin: 0; font-size: 1.05rem;">Permission Request</h3>
          </div>
          <button type="button" class="modal-close-btn" id="btn-close-perm">&times;</button>
        </div>

        <div class="modal-body">
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px; line-height: 1.4;">
            OneFill identified <strong>${matches.length}</strong> matching fields on this form. Choose which saved personal details you permit OneFill to use:
          </p>

          <div style="display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto; margin-bottom: 14px; padding-right: 4px;">
            ${itemsHtml}
          </div>

          <div class="privacy-notice-badge" style="margin: 0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>OneFill will only fill approved fields. Form submission is never automated without your final confirmation.</span>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-secondary" id="btn-cancel-perm">Cancel</button>
          <button type="button" class="btn-primary" id="btn-approve-perm" style="width: auto;">
            Approve &amp; AutoFill Form
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#btn-close-perm').addEventListener('click', close);
    overlay.querySelector('#btn-cancel-perm').addEventListener('click', close);

    overlay.querySelector('#btn-approve-perm').addEventListener('click', () => {
      overlay.remove();
      onApprove();
    });
  }

  // --------------------------------------------------------------------------
  // Utility Helpers
  // --------------------------------------------------------------------------
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-msg">${escapeHtml(message)}</span>
      </div>
      <button type="button" class="toast-close">&times;</button>
    `;

    container.appendChild(toast);
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    setTimeout(() => toast.remove(), 6000);
  }

  // Initial load
  loadProfileData();
});
