/**
 * OneFill - Deadline & Expiry Intelligence Controller
 * Implements:
 * 1. 3 Intake Options (Upload, Live Camera OCR, Add Manually)
 * 2. Document Scanning & AI Date Extraction Verification Card
 * 3. Reminder Management (Cards Grid, Interactive Monthly Calendar, Filters, Search)
 * 4. Two Notification Systems (In-App Bell & Unread Badge, External Web Push Alarms)
 * 5. Actions: Complete, Snooze, Edit, Delete, Attach Vault Documents
 * 6. Configurable 300 Active Reminders Limit
 */

(function () {
  'use strict';

  let currentReminders = [];
  let currentFilterCategory = 'ALL';
  let currentFilterStatus = 'all';
  let currentSearchQuery = '';
  let currentSort = 'deadline_asc';
  let currentViewMode = 'cards'; // 'cards' | 'calendar'

  // Calendar State
  let calCurrentYear = new Date().getFullYear();
  let calCurrentMonth = new Date().getMonth(); // 0-indexed

  // Camera State
  let cameraStream = null;
  let stagedExtractedData = null;
  let stagedUploadFile = null;

  // Notification State
  let currentNotifications = [];
  let notifFilter = 'all';

  // --------------------------------------------------------------------------
  // Initialization & Service Worker Registration
  // --------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    initServiceWorker();
    initEventListeners();
    refreshAllData();

    // Poll notifications every 30 seconds
    setInterval(fetchNotifications, 30000);
  });

  async function initServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        console.log('OneFill Service Worker registered with scope:', reg.scope);

        // Listen for message from service worker when notification is clicked
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.action === 'OPEN_REMINDERS_TAB') {
            const remTab = document.getElementById('tab-nav-reminders');
            if (remTab) remTab.click();
          }
        });
      } catch (err) {
        console.warn('Service Worker registration skipped or failed:', err.message);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Event Listeners Setup
  // --------------------------------------------------------------------------
  function initEventListeners() {
    // Top tab switcher integration: when switching to reminders, reload
    const remTabBtn = document.getElementById('tab-nav-reminders');
    if (remTabBtn) {
      remTabBtn.addEventListener('click', () => {
        refreshAllData();
      });
    }

    // Hero Action Buttons
    const btnHeroAdd = document.getElementById('btn-create-reminder-hero');
    if (btnHeroAdd) btnHeroAdd.addEventListener('click', () => openReminderModal());

    const btnHeroSettings = document.getElementById('btn-settings-hero');
    if (btnHeroSettings) btnHeroSettings.addEventListener('click', openSettingsModal);

    const btnHeroTestAlarm = document.getElementById('btn-test-alarm-hero');
    if (btnHeroTestAlarm) btnHeroTestAlarm.addEventListener('click', testPushAlarm);

    // Intake Cards
    const btnTriggerUpload = document.getElementById('btn-trigger-upload-rem');
    const remFileInput = document.getElementById('rem-file-input');
    if (btnTriggerUpload && remFileInput) {
      btnTriggerUpload.addEventListener('click', () => remFileInput.click());
      remFileInput.addEventListener('change', handleDocumentUpload);
    }

    const btnTriggerCamera = document.getElementById('btn-trigger-camera-rem');
    if (btnTriggerCamera) btnTriggerCamera.addEventListener('click', openCameraModal);

    const btnTriggerManual = document.getElementById('btn-trigger-manual-rem');
    if (btnTriggerManual) btnTriggerManual.addEventListener('click', () => openReminderModal());

    const btnEmptyAdd = document.getElementById('btn-empty-add-rem');
    if (btnEmptyAdd) btnEmptyAdd.addEventListener('click', () => openReminderModal());

    // Document Verification Card Actions
    const btnApplyVerify = document.getElementById('btn-apply-verify-data');
    if (btnApplyVerify) btnApplyVerify.addEventListener('click', applyExtractedDataToForm);

    const btnDismissVerify = document.getElementById('btn-dismiss-verify');
    if (btnDismissVerify) btnDismissVerify.addEventListener('click', dismissVerifyCard);

    const btnCancelVerify = document.getElementById('btn-cancel-verify');
    if (btnCancelVerify) btnCancelVerify.addEventListener('click', dismissVerifyCard);

    // Toolbar Controls
    const searchInput = document.getElementById('rem-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentSearchQuery = e.target.value;
        renderReminders();
      });
    }

    const catFilterSelect = document.getElementById('rem-category-filter');
    if (catFilterSelect) {
      catFilterSelect.addEventListener('change', (e) => {
        currentFilterCategory = e.target.value;
        renderReminders();
      });
    }

    const statusPills = document.querySelectorAll('.status-pill');
    statusPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        statusPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        currentFilterStatus = pill.getAttribute('data-status') || 'all';
        renderReminders();
      });
    });

    // View Switcher (Cards vs Calendar)
    const btnViewCards = document.getElementById('btn-rem-view-cards');
    const btnViewCal = document.getElementById('btn-rem-view-calendar');
    const cardsViewContainer = document.getElementById('rem-cards-view');
    const calViewContainer = document.getElementById('rem-calendar-view');

    if (btnViewCards && btnViewCal) {
      btnViewCards.addEventListener('click', () => {
        currentViewMode = 'cards';
        btnViewCards.classList.add('active');
        btnViewCards.setAttribute('aria-checked', 'true');
        btnViewCal.classList.remove('active');
        btnViewCal.setAttribute('aria-checked', 'false');
        cardsViewContainer.style.display = 'block';
        calViewContainer.style.display = 'none';
        renderReminders();
      });

      btnViewCal.addEventListener('click', () => {
        currentViewMode = 'calendar';
        btnViewCal.classList.add('active');
        btnViewCal.setAttribute('aria-checked', 'true');
        btnViewCards.classList.remove('active');
        btnViewCards.setAttribute('aria-checked', 'false');
        cardsViewContainer.style.display = 'none';
        calViewContainer.style.display = 'block';
        renderCalendar();
      });
    }

    // Calendar Navigation
    const btnCalPrev = document.getElementById('btn-cal-prev');
    const btnCalNext = document.getElementById('btn-cal-next');
    const btnCalToday = document.getElementById('btn-cal-today');

    if (btnCalPrev) {
      btnCalPrev.addEventListener('click', () => {
        calCurrentMonth--;
        if (calCurrentMonth < 0) {
          calCurrentMonth = 11;
          calCurrentYear--;
        }
        renderCalendar();
      });
    }

    if (btnCalNext) {
      btnCalNext.addEventListener('click', () => {
        calCurrentMonth++;
        if (calCurrentMonth > 11) {
          calCurrentMonth = 0;
          calCurrentYear++;
        }
        renderCalendar();
      });
    }

    if (btnCalToday) {
      btnCalToday.addEventListener('click', () => {
        const now = new Date();
        calCurrentYear = now.getFullYear();
        calCurrentMonth = now.getMonth();
        renderCalendar();
      });
    }

    const btnCloseDrawer = document.getElementById('btn-close-day-drawer');
    if (btnCloseDrawer) {
      btnCloseDrawer.addEventListener('click', () => {
        document.getElementById('calendar-day-drawer').style.display = 'none';
      });
    }

    // Reminder Form Modal
    const remModal = document.getElementById('modal-reminder-form');
    const btnCloseRemModal = document.getElementById('btn-close-rem-modal');
    const btnCancelRemModal = document.getElementById('btn-cancel-rem-modal');
    const remForm = document.getElementById('reminder-upsert-form');

    if (btnCloseRemModal) btnCloseRemModal.addEventListener('click', closeReminderModal);
    if (btnCancelRemModal) btnCancelRemModal.addEventListener('click', closeReminderModal);
    if (remForm) remForm.addEventListener('submit', handleSaveReminderSubmit);

    // Camera Modal
    const btnCloseCamModal = document.getElementById('btn-close-cam-modal');
    const btnCancelCam = document.getElementById('btn-camera-cancel');
    const btnCapturePhoto = document.getElementById('btn-camera-capture');
    const btnRetakePhoto = document.getElementById('btn-camera-retake');
    const btnAnalyzePhoto = document.getElementById('btn-camera-analyze');

    if (btnCloseCamModal) btnCloseCamModal.addEventListener('click', closeCameraModal);
    if (btnCancelCam) btnCancelCam.addEventListener('click', closeCameraModal);
    if (btnCapturePhoto) btnCapturePhoto.addEventListener('click', captureCameraSnapshot);
    if (btnRetakePhoto) btnRetakePhoto.addEventListener('click', retakeCameraSnapshot);
    if (btnAnalyzePhoto) btnAnalyzePhoto.addEventListener('click', analyzeCameraSnapshot);

    // Settings Modal
    const btnCloseSettings = document.getElementById('btn-close-settings-modal');
    const btnCancelSettings = document.getElementById('btn-cancel-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const btnReqPush = document.getElementById('btn-request-push-perm');
    const btnRegFcm = document.getElementById('btn-register-fcm');

    if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettingsModal);
    if (btnCancelSettings) btnCancelSettings.addEventListener('click', closeSettingsModal);
    if (btnSaveSettings) btnSaveSettings.addEventListener('click', handleSaveSettings);
    if (btnReqPush) btnReqPush.addEventListener('click', requestPushPermissionAction);
    if (btnRegFcm) btnRegFcm.addEventListener('click', registerFcmTokenAction);

    // Snooze Modal
    const btnCloseSnooze = document.getElementById('btn-close-snooze-modal');
    const btnCancelSnooze = document.getElementById('btn-cancel-snooze');
    const btnConfirmSnooze = document.getElementById('btn-confirm-snooze');
    const snoozePresetBtns = document.querySelectorAll('.btn-snooze-preset');

    if (btnCloseSnooze) btnCloseSnooze.addEventListener('click', closeSnoozeModal);
    if (btnCancelSnooze) btnCancelSnooze.addEventListener('click', closeSnoozeModal);
    if (btnConfirmSnooze) btnConfirmSnooze.addEventListener('click', handleConfirmSnooze);

    snoozePresetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const hours = parseInt(btn.getAttribute('data-hours') || '24', 10);
        executeSnooze(hours);
      });
    });

    // In-App Notification Bell & Dropdown
    const btnNotifBell = document.getElementById('btn-notif-bell');
    const notifDropdown = document.getElementById('notif-dropdown');
    const btnNotifMarkAll = document.getElementById('btn-notif-mark-all');
    const btnNotifRefresh = document.getElementById('btn-notif-refresh');
    const btnNotifViewAll = document.getElementById('btn-notif-view-all');

    if (btnNotifBell) {
      btnNotifBell.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = notifDropdown.style.display !== 'none';
        notifDropdown.style.display = isOpen ? 'none' : 'block';
        btnNotifBell.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
      });
    }

    // Close notification dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (notifDropdown && !notifDropdown.contains(e.target) && e.target !== btnNotifBell) {
        notifDropdown.style.display = 'none';
        if (btnNotifBell) btnNotifBell.setAttribute('aria-expanded', 'false');
      }
    });

    if (btnNotifMarkAll) btnNotifMarkAll.addEventListener('click', markAllNotificationsRead);
    if (btnNotifRefresh) {
      btnNotifRefresh.addEventListener('click', async () => {
        await triggerBackendSchedulerCheck();
        await fetchNotifications();
        showToast('Deadlines synchronized with server.', 'success');
      });
    }

    if (btnNotifViewAll) {
      btnNotifViewAll.addEventListener('click', () => {
        notifDropdown.style.display = 'none';
        const remTab = document.getElementById('tab-nav-reminders');
        if (remTab) remTab.click();
      });
    }

    // Notification dropdown tabs
    const notifTabs = document.querySelectorAll('.notif-tab-btn');
    notifTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        notifTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        notifFilter = tab.getAttribute('data-filter') || 'all';
        renderNotificationDropdown();
      });
    });
  }

  // --------------------------------------------------------------------------
  // Data Fetching & Sync
  // --------------------------------------------------------------------------
  let reminderSessionPromise;

  function ensureReminderSession() {
    if (!reminderSessionPromise) {
      reminderSessionPromise = fetch('/api/reminders/session', { method: 'POST' })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Reminder session initialization failed (${res.status}).`);
          }
          return res.json();
        })
        .catch((err) => {
          reminderSessionPromise = null;
          throw err;
        });
    }

    return reminderSessionPromise;
  }

  async function reminderFetch(...args) {
    await ensureReminderSession();
    return fetch(...args);
  }

  async function refreshAllData() {
    await Promise.all([fetchReminders(), fetchNotifications()]);
  }

  async function fetchReminders() {
    try {
      const res = await reminderFetch('/api/reminders?status=all');
      if (res.status === 401) {
        // Not authenticated
        currentReminders = [];
        renderReminders();
        updateStatsBar(0, 0, 0, 0, 300);
        return;
      }

      const data = await res.json();
      currentReminders = data.reminders || [];
      const activeCount = data.activeCount || 0;
      const maxLimit = data.maxActiveLimit || 300;

      computeAndRenderStats(activeCount, maxLimit);
      if (currentViewMode === 'cards') {
        renderReminders();
      } else {
        renderCalendar();
      }
    } catch (err) {
      console.warn('Failed to load reminders:', err.message);
    }
  }

  function computeAndRenderStats(activeCount, maxLimit) {
    let dueSoon = 0;
    let overdue = 0;
    let completed = 0;

    currentReminders.forEach((r) => {
      if (r.status === 'completed') {
        completed++;
      } else if (r.status === 'active') {
        if (r.isOverdue) overdue++;
        else if (r.isDueSoon || r.isDueToday) dueSoon++;
      }
    });

    updateStatsBar(activeCount, dueSoon, overdue, completed, maxLimit);
  }

  function updateStatsBar(active, dueSoon, overdue, completed, maxLimit) {
    const elActive = document.getElementById('stat-rem-active');
    const elDueSoon = document.getElementById('stat-rem-due-soon');
    const elOverdue = document.getElementById('stat-rem-overdue');
    const elCompleted = document.getElementById('stat-rem-completed');
    const elLimitText = document.getElementById('rem-limit-text');
    const elLimitSub = document.getElementById('rem-limit-sub');
    const elLimitFill = document.getElementById('rem-limit-fill');

    if (elActive) elActive.textContent = `${active} / ${maxLimit}`;
    if (elDueSoon) elDueSoon.textContent = dueSoon;
    if (elOverdue) elOverdue.textContent = overdue;
    if (elCompleted) elCompleted.textContent = completed;

    if (elLimitText) elLimitText.textContent = `Active Reminders: ${active} / ${maxLimit}`;
    if (elLimitSub) {
      const remaining = Math.max(0, maxLimit - active);
      elLimitSub.textContent = `${remaining} slots remaining`;
    }
    if (elLimitFill) {
      const pct = Math.min(100, Math.round((active / maxLimit) * 100));
      elLimitFill.style.width = `${Math.max(2, pct)}%`;
      if (pct >= 90) {
        elLimitFill.style.background = 'var(--status-danger)';
      } else {
        elLimitFill.style.background = 'linear-gradient(90deg, #4F46E5, #059669)';
      }
    }
  }

  // --------------------------------------------------------------------------
  // Document Upload & Optical Scan Handling (Option 1)
  // --------------------------------------------------------------------------
  async function handleDocumentUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    stagedUploadFile = file;
    showToast(`Scanning "${file.name}" with OCR engine...`, 'info');

    try {
      // 1. Run client-side extraction via DocumentExtractor
      const extraction = await DocumentExtractor.extract(file, (msg) => {
        // Feedback
      });

      const extractedText = extraction.text || '';

      // 2. Run DateExtractor
      const analysis = DateExtractor.analyze(extractedText, file.name);
      stagedExtractedData = {
        ...analysis,
        file: file,
        filename: file.name
      };

      // 3. Render Verification Review Card
      displayVerificationCard(stagedExtractedData);
      showToast('Document analyzed! Review detected expiry and deadline below.', 'success');
    } catch (err) {
      console.error('Document analysis error:', err);
      showToast('Failed to analyze document. Opening manual form.', 'error');
      openReminderModal({ title: file.name.replace(/\.[^/.]+$/, '') });
    } finally {
      e.target.value = '';
    }
  }

  function displayVerificationCard(data) {
    const wrap = document.getElementById('rem-verification-wrapper');
    const elCat = document.getElementById('verify-category-display');
    const elDocType = document.getElementById('verify-doctype-display');
    const elDateLabel = document.getElementById('verify-deadline-type-label');
    const elDate = document.getElementById('verify-date-display');
    const elAmount = document.getElementById('verify-amount-display');
    const elConfidence = document.getElementById('verify-confidence');
    const candidateBox = document.getElementById('candidate-dates-box');
    const candidateList = document.getElementById('candidate-chips-list');

    if (!wrap) return;

    if (elCat) elCat.textContent = data.category || 'Others';
    if (elDocType) elDocType.textContent = data.documentType || 'General Document';
    if (elDateLabel) elDateLabel.textContent = data.deadlineType || 'Detected Deadline Date';
    if (elDate) elDate.textContent = data.deadlineDate || 'No date detected';
    if (elAmount) elAmount.textContent = data.detectedAmount || 'None detected';
    if (elConfidence) elConfidence.textContent = `${data.confidence || 85}% Confidence`;

    // Candidate dates
    if (candidateBox && candidateList) {
      if (Array.isArray(data.allDetectedDates) && data.allDetectedDates.length > 1) {
        candidateList.innerHTML = '';
        data.allDetectedDates.forEach((d) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'candidate-date-btn';
          btn.textContent = `${d.isoDate} (${d.contextType})`;
          btn.addEventListener('click', () => {
            if (elDate) elDate.textContent = d.isoDate;
            data.deadlineDate = d.isoDate;
          });
          candidateList.appendChild(btn);
        });
        candidateBox.style.display = 'block';
      } else {
        candidateBox.style.display = 'none';
      }
    }

    wrap.style.display = 'block';
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function dismissVerifyCard() {
    const wrap = document.getElementById('rem-verification-wrapper');
    if (wrap) wrap.style.display = 'none';
    stagedExtractedData = null;
    stagedUploadFile = null;
  }

  function applyExtractedDataToForm() {
    if (!stagedExtractedData) return;

    openReminderModal({
      title: stagedExtractedData.suggestedTitle || stagedExtractedData.documentType,
      category: stagedExtractedData.category,
      deadlineDate: stagedExtractedData.deadlineDate,
      amount: stagedExtractedData.detectedAmount || '',
      file: stagedExtractedData.file
    });

    dismissVerifyCard();
  }

  // --------------------------------------------------------------------------
  // Live Camera Scanner Handling (Option 2)
  // --------------------------------------------------------------------------
  async function openCameraModal() {
    const modal = document.getElementById('modal-camera-scanner');
    const video = document.getElementById('camera-feed-video');
    const snapshotImg = document.getElementById('camera-snapshot-preview');
    const viewfinder = document.getElementById('camera-viewfinder');
    const btnCapture = document.getElementById('btn-camera-capture');
    const btnRetake = document.getElementById('btn-camera-retake');
    const btnAnalyze = document.getElementById('btn-camera-analyze');
    const statusBox = document.getElementById('camera-scan-status');
    const errorBanner = document.getElementById('camera-error-banner');

    if (!modal) return;
    modal.classList.add('active');
    errorBanner.style.display = 'none';
    statusBox.style.display = 'none';
    snapshotImg.style.display = 'none';
    video.style.display = 'block';
    viewfinder.style.display = 'block';
    btnCapture.style.display = 'inline-flex';
    btnRetake.style.display = 'none';
    btnAnalyze.style.display = 'none';

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera device access is not supported on this browser.');
      }

      // Enumerate cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      const select = document.getElementById('camera-device-select');
      if (select) {
        select.innerHTML = '';
        videoDevices.forEach((dev, idx) => {
          const opt = document.createElement('option');
          opt.value = dev.deviceId;
          opt.textContent = dev.label || `Camera ${idx + 1}`;
          select.appendChild(opt);
        });
        select.onchange = () => startVideoStream(select.value);
      }

      await startVideoStream(videoDevices[0]?.deviceId);
    } catch (err) {
      console.warn('Camera error:', err);
      errorBanner.textContent = `Camera Error: ${err.message}. Please check camera permissions.`;
      errorBanner.style.display = 'block';
    }
  }

  async function startVideoStream(deviceId = null) {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
    }

    const constraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }
    };

    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = document.getElementById('camera-feed-video');
    if (video) {
      video.srcObject = cameraStream;
    }
  }

  function captureCameraSnapshot() {
    const video = document.getElementById('camera-feed-video');
    const canvas = document.getElementById('camera-capture-canvas');
    const snapshotImg = document.getElementById('camera-snapshot-preview');
    const viewfinder = document.getElementById('camera-viewfinder');
    const btnCapture = document.getElementById('btn-camera-capture');
    const btnRetake = document.getElementById('btn-camera-retake');
    const btnAnalyze = document.getElementById('btn-camera-analyze');

    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    snapshotImg.src = dataUrl;
    snapshotImg.style.display = 'block';
    video.style.display = 'none';
    viewfinder.style.display = 'none';

    btnCapture.style.display = 'none';
    btnRetake.style.display = 'inline-flex';
    btnAnalyze.style.display = 'inline-flex';
  }

  function retakeCameraSnapshot() {
    const video = document.getElementById('camera-feed-video');
    const snapshotImg = document.getElementById('camera-snapshot-preview');
    const viewfinder = document.getElementById('camera-viewfinder');
    const btnCapture = document.getElementById('btn-camera-capture');
    const btnRetake = document.getElementById('btn-camera-retake');
    const btnAnalyze = document.getElementById('btn-camera-analyze');

    snapshotImg.style.display = 'none';
    video.style.display = 'block';
    viewfinder.style.display = 'block';

    btnCapture.style.display = 'inline-flex';
    btnRetake.style.display = 'none';
    btnAnalyze.style.display = 'none';
  }

  async function analyzeCameraSnapshot() {
    const canvas = document.getElementById('camera-capture-canvas');
    const statusBox = document.getElementById('camera-scan-status');
    const statusMsg = document.getElementById('camera-status-msg');

    statusBox.style.display = 'flex';
    statusMsg.textContent = 'Extracting document text using Neural OCR...';

    canvas.toBlob(async (blob) => {
      try {
        const file = new File([blob], `Camera_Scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
        stagedUploadFile = file;

        const extraction = await DocumentExtractor.extract(file, (msg) => {
          if (statusMsg) statusMsg.textContent = msg;
        });

        const analysis = DateExtractor.analyze(extraction.text || '', file.name);
        stagedExtractedData = {
          ...analysis,
          file: file,
          filename: file.name
        };

        closeCameraModal();
        displayVerificationCard(stagedExtractedData);
        showToast('Camera scan complete! Review extracted dates below.', 'success');
      } catch (err) {
        console.error('Camera OCR analysis error:', err);
        showToast('Camera OCR failed to extract clear text. Please type manually.', 'error');
        closeCameraModal();
        openReminderModal({ title: 'Scanned Document' });
      }
    }, 'image/jpeg', 0.95);
  }

  function closeCameraModal() {
    const modal = document.getElementById('modal-camera-scanner');
    if (modal) modal.classList.remove('active');
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
  }

  // --------------------------------------------------------------------------
  // Reminder Creation & Editing Modal (Option 3 & Universal Editor)
  // --------------------------------------------------------------------------
  async function openReminderModal(prefill = null) {
    const modal = document.getElementById('modal-reminder-form');
    const form = document.getElementById('reminder-upsert-form');
    const errorBanner = document.getElementById('rem-form-error');
    const modalTitle = document.getElementById('modal-rem-title');
    const idInput = document.getElementById('rem-form-id');
    const titleInput = document.getElementById('rem-form-title');
    const catSelect = document.getElementById('rem-form-category');
    const dateInput = document.getElementById('rem-form-date');
    const timeInput = document.getElementById('rem-form-time');
    const amountInput = document.getElementById('rem-form-amount');
    const notesInput = document.getElementById('rem-form-notes');
    const repeatSelect = document.getElementById('rem-form-repeat');
    const prioritySelect = document.getElementById('rem-form-priority');
    const customIntervalsInput = document.getElementById('rem-form-custom-intervals');
    const inappCheck = document.getElementById('rem-form-inapp');
    const pushCheck = document.getElementById('rem-form-push');
    const vaultDocSelect = document.getElementById('rem-form-vault-doc');
    const attachStatus = document.getElementById('rem-attached-status');

    if (!modal || !form) return;
    form.reset();
    errorBanner.style.display = 'none';
    attachStatus.style.display = 'none';

    // Populate user's vault documents in dropdown
    await populateVaultDocumentsSelect(vaultDocSelect);

    if (prefill && prefill.id) {
      // Editing existing reminder
      modalTitle.textContent = 'Edit Deadline Reminder';
      idInput.value = prefill.id;
      titleInput.value = prefill.title || '';
      catSelect.value = prefill.category || 'Electricity & Household Bills';
      dateInput.value = prefill.deadlineDate || '';
      timeInput.value = prefill.deadlineTime || '09:00';
      amountInput.value = prefill.amount || '';
      notesInput.value = prefill.notes || '';
      repeatSelect.value = prefill.repeatOption || 'none';
      prioritySelect.value = prefill.priority || 'normal';
      inappCheck.checked = prefill.inAppEnabled !== false;
      pushCheck.checked = prefill.pushEnabled !== false;

      // Intervals checkboxes
      const intervals = prefill.intervals || [30, 15, 7, 3, 2, 1, 0];
      const standardVals = ['30', '15', '7', '3', '2', '1', '0'];
      const customVals = [];
      const checkboxes = form.querySelectorAll('input[name="rem-interval"]');
      checkboxes.forEach((cb) => {
        cb.checked = intervals.includes(Number(cb.value));
      });
      intervals.forEach((iv) => {
        if (!standardVals.includes(String(iv))) customVals.push(iv);
      });
      customIntervalsInput.value = customVals.join(', ');

      if (prefill.documentId) {
        vaultDocSelect.value = prefill.documentId;
        attachStatus.textContent = `Attached Document: ${prefill.attachedDocument?.name || prefill.documentId}`;
        attachStatus.style.display = 'block';
      }
    } else {
      // Creating new reminder
      modalTitle.textContent = 'Create Deadline Reminder';
      idInput.value = '';
      timeInput.value = '09:00';
      inappCheck.checked = true;
      pushCheck.checked = true;

      // Default intervals: all checked
      const checkboxes = form.querySelectorAll('input[name="rem-interval"]');
      checkboxes.forEach((cb) => (cb.checked = true));

      if (prefill) {
        if (prefill.title) titleInput.value = prefill.title;
        if (prefill.category) catSelect.value = prefill.category;
        if (prefill.deadlineDate) dateInput.value = prefill.deadlineDate;
        if (prefill.amount) amountInput.value = prefill.amount;
        if (prefill.file) {
          attachStatus.textContent = `File ready to upload & encrypt: ${prefill.file.name}`;
          attachStatus.style.display = 'block';
        }
      } else {
        // Set default date to 7 days from now
        const d = new Date();
        d.setDate(d.getDate() + 7);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dateInput.value = `${y}-${m}-${day}`;
      }
    }

    modal.classList.add('active');
  }

  async function populateVaultDocumentsSelect(selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">-- No Document Linked --</option>';

    try {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        const docs = data.documents || [];
        docs.forEach((doc) => {
          const opt = document.createElement('option');
          opt.value = doc.id;
          opt.textContent = `${doc.title} (${doc.category})`;
          selectEl.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn('Could not populate vault documents select:', e.message);
    }
  }

  function closeReminderModal() {
    const modal = document.getElementById('modal-reminder-form');
    if (modal) modal.classList.remove('active');
  }

  async function handleSaveReminderSubmit(e) {
    e.preventDefault();
    const errorBanner = document.getElementById('rem-form-error');
    errorBanner.style.display = 'none';

    const id = document.getElementById('rem-form-id').value;
    const title = document.getElementById('rem-form-title').value.trim();
    const category = document.getElementById('rem-form-category').value;
    const deadlineDate = document.getElementById('rem-form-date').value.trim();
    const deadlineTime = document.getElementById('rem-form-time').value.trim();
    const amount = document.getElementById('rem-form-amount').value.trim();
    const notes = document.getElementById('rem-form-notes').value.trim();
    const repeatOption = document.getElementById('rem-form-repeat').value;
    const priority = document.getElementById('rem-form-priority').value;
    const inAppEnabled = document.getElementById('rem-form-inapp').checked;
    const pushEnabled = document.getElementById('rem-form-push').checked;
    const vaultDocId = document.getElementById('rem-form-vault-doc').value;
    const newFileInput = document.getElementById('rem-form-file');

    if (!title) {
      errorBanner.textContent = 'Please provide a reminder name / title.';
      errorBanner.style.display = 'block';
      return;
    }

    if (!deadlineDate) {
      errorBanner.textContent = 'Please choose a valid deadline date.';
      errorBanner.style.display = 'block';
      return;
    }

    // Collect intervals
    const intervals = [];
    const checkboxes = e.target.querySelectorAll('input[name="rem-interval"]:checked');
    checkboxes.forEach((cb) => intervals.push(parseInt(cb.value, 10)));

    const customVal = document.getElementById('rem-form-custom-intervals').value.trim();
    if (customVal) {
      customVal.split(',').forEach((numStr) => {
        const n = parseInt(numStr.trim(), 10);
        if (!isNaN(n) && n >= 0 && !intervals.includes(n)) {
          intervals.push(n);
        }
      });
    }

    // Handle optional file upload to encrypted vault first
    let documentId = vaultDocId || null;
    const fileToUpload = (newFileInput && newFileInput.files && newFileInput.files[0]) || stagedUploadFile;

    if (fileToUpload) {
      try {
        const fileBase64 = await fileToBase64(fileToUpload);
        const docRes = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: fileToUpload.name,
            title: title,
            category: category,
            description: `Attached to reminder: ${title}`,
            fileBase64: fileBase64
          })
        });

        if (docRes.ok) {
          const docData = await docRes.json();
          documentId = docData.document?.id || documentId;
        }
      } catch (uploadErr) {
        console.warn('Vault upload warning:', uploadErr.message);
      }
    }

    const payload = {
      title,
      category,
      deadlineDate,
      deadlineTime,
      amount,
      notes,
      repeatOption,
      priority,
      inAppEnabled,
      pushEnabled,
      intervals,
      documentId
    };

    try {
      let res;
      if (id) {
        // Update
        res = await reminderFetch(`/api/reminders/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        // Create
        res = await reminderFetch('/api/reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to save reminder.');
      }

      closeReminderModal();
      stagedUploadFile = null;
      stagedExtractedData = null;
      showToast(id ? 'Reminder updated successfully!' : 'Reminder created successfully!', 'success');
      await refreshAllData();
    } catch (err) {
      errorBanner.textContent = err.message;
      errorBanner.style.display = 'block';
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // --------------------------------------------------------------------------
  // Reminder Rendering (Card / Grid View)
  // --------------------------------------------------------------------------
  function renderReminders() {
    const grid = document.getElementById('reminders-grid');
    const emptyState = document.getElementById('rem-empty-state');
    if (!grid) return;

    grid.innerHTML = '';

    // Filter
    let filtered = currentReminders.slice();

    if (currentFilterCategory !== 'ALL') {
      filtered = filtered.filter((r) => r.category === currentFilterCategory);
    }

    if (currentFilterStatus !== 'all') {
      filtered = filtered.filter((r) => {
        if (currentFilterStatus === 'active') return r.status === 'active';
        if (currentFilterStatus === 'completed') return r.status === 'completed';
        if (currentFilterStatus === 'snoozed') return r.status === 'snoozed';
        if (currentFilterStatus === 'overdue') return r.isOverdue;
        if (currentFilterStatus === 'due_soon') return r.isDueSoon || r.isDueToday;
        if (currentFilterStatus === 'upcoming') return r.status === 'active' && !r.isOverdue;
        return true;
      });
    }

    if (currentSearchQuery.trim()) {
      const q = currentSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((r) => {
        return (
          r.title.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          (r.notes && r.notes.toLowerCase().includes(q)) ||
          (r.amount && r.amount.toLowerCase().includes(q))
        );
      });
    }

    if (filtered.length === 0) {
      emptyState.style.display = 'block';
      return;
    } else {
      emptyState.style.display = 'none';
    }

    filtered.forEach((rem) => {
      const card = createReminderCardElement(rem);
      grid.appendChild(card);
    });
  }

  function createReminderCardElement(rem) {
    const card = document.createElement('div');
    card.className = `reminder-card ${rem.status}`;
    if (rem.isOverdue) card.classList.add('overdue');
    else if (rem.isDueToday) card.classList.add('due-today');
    else if (rem.isDueSoon) card.classList.add('due-soon');

    // Urgency Badge
    let urgencyClass = 'upcoming';
    let urgencyLabel = `${rem.daysRemaining} days left`;
    if (rem.status === 'completed') {
      urgencyClass = 'completed';
      urgencyLabel = '✓ Completed';
    } else if (rem.status === 'snoozed') {
      urgencyClass = 'snoozed';
      urgencyLabel = '💤 Snoozed';
    } else if (rem.isOverdue) {
      urgencyClass = 'overdue';
      urgencyLabel = `⚠️ Overdue by ${Math.abs(rem.daysRemaining)}d`;
    } else if (rem.isDueToday) {
      urgencyClass = 'today';
      urgencyLabel = '🚨 Due Today!';
    } else if (rem.daysRemaining === 1) {
      urgencyClass = 'soon';
      urgencyLabel = '⏰ Due Tomorrow';
    }

    card.innerHTML = `
      <div class="rem-card-header">
        <span class="rem-cat-badge" title="${escapeHtml(rem.category)}">${escapeHtml(rem.category)}</span>
        <span class="rem-urgency-badge ${urgencyClass}">${urgencyLabel}</span>
      </div>

      <div class="rem-card-title">${escapeHtml(rem.title)}</div>

      <div class="rem-card-deadline">
        <span class="rem-date-val">${rem.deadlineDate}</span>
        ${rem.deadlineTime ? `<span class="rem-time-val">${escapeHtml(rem.deadlineTime)}</span>` : ''}
      </div>

      ${rem.amount ? `<div class="rem-amount-val">${escapeHtml(rem.amount)}</div>` : ''}

      <div class="rem-card-meta">
        ${rem.repeatOption && rem.repeatOption !== 'none' ? `<span class="rem-meta-pill">🔁 ${rem.repeatOption}</span>` : ''}
        ${rem.priority === 'high' ? `<span class="rem-meta-pill" style="color: #DC2626;">⚡ High Priority</span>` : ''}
        ${rem.attachedDocument ? `<span class="rem-meta-pill" style="color: #059669;">📎 Doc Attached</span>` : ''}
      </div>

      ${rem.notes ? `<div class="rem-card-notes">${escapeHtml(rem.notes)}</div>` : ''}

      <div class="rem-card-actions">
        ${
          rem.status === 'completed'
            ? `<button type="button" class="btn-card-action complete" data-action="uncomplete" title="Mark as active">Undo</button>`
            : `<button type="button" class="btn-card-action complete" data-action="complete" title="Mark as completed">✓ Done</button>`
        }
        <button type="button" class="btn-card-action" data-action="snooze" title="Snooze reminder">💤 Snooze</button>
        <button type="button" class="btn-card-action" data-action="edit" title="Edit reminder">✏️ Edit</button>
        ${
          rem.documentId
            ? `<button type="button" class="btn-card-action doc-link" data-action="view-doc" title="View attached document">📄 View Doc</button>`
            : ''
        }
        <button type="button" class="btn-card-action delete" data-action="delete" title="Delete reminder" style="margin-left: auto;">🗑</button>
      </div>
    `;

    // Bind action buttons
    card.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');

      if (action === 'complete') toggleReminderStatus(rem.id, 'completed');
      else if (action === 'uncomplete') toggleReminderStatus(rem.id, 'active');
      else if (action === 'snooze') openSnoozeModal(rem.id);
      else if (action === 'edit') openReminderModal(rem);
      else if (action === 'delete') confirmDeleteReminder(rem.id, rem.title);
      else if (action === 'view-doc') viewAttachedDocument(rem.documentId);
    });

    return card;
  }

  // --------------------------------------------------------------------------
  // Monthly Interactive Calendar Rendering
  // --------------------------------------------------------------------------
  function renderCalendar() {
    const monthTitle = document.getElementById('calendar-month-title');
    const daysGrid = document.getElementById('calendar-days-grid');
    if (!daysGrid) return;

    daysGrid.innerHTML = '';

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    if (monthTitle) {
      monthTitle.textContent = `${monthNames[calCurrentMonth]} ${calCurrentYear}`;
    }

    const firstDay = new Date(calCurrentYear, calCurrentMonth, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(calCurrentYear, calCurrentMonth, 0).getDate();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Previous month filler days
    for (let i = firstDay - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const cell = document.createElement('div');
      cell.className = 'cal-day-cell other-month';
      cell.innerHTML = `<span class="cal-day-number">${dayNum}</span>`;
      daysGrid.appendChild(cell);
    }

    // Days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${calCurrentYear}-${String(calCurrentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cell = document.createElement('div');
      cell.className = 'cal-day-cell';
      if (dateStr === todayStr) cell.classList.add('today');

      // Find reminders matching this date
      const matching = currentReminders.filter((r) => r.deadlineDate === dateStr);

      let chipsHtml = '';
      if (matching.length > 0) {
        chipsHtml = `<div class="cal-reminder-chips-box">`;
        matching.slice(0, 3).forEach((r) => {
          let chipClass = '';
          if (r.status === 'completed') chipClass = 'completed';
          else if (r.isOverdue) chipClass = 'overdue';
          else if (r.isDueToday) chipClass = 'today';
          chipsHtml += `<div class="cal-rem-chip ${chipClass}" title="${escapeHtml(r.title)}">${escapeHtml(r.title)}</div>`;
        });
        if (matching.length > 3) {
          chipsHtml += `<div class="cal-rem-chip" style="background: #FAF5E8; color: var(--text-dim);">+${matching.length - 3} more</div>`;
        }
        chipsHtml += `</div>`;
      }

      cell.innerHTML = `
        <span class="cal-day-number">${day}</span>
        ${chipsHtml}
      `;

      cell.addEventListener('click', () => {
        document.querySelectorAll('.cal-day-cell').forEach((c) => c.classList.remove('selected'));
        cell.classList.add('selected');
        openCalendarDayDrawer(dateStr, matching);
      });

      daysGrid.appendChild(cell);
    }
  }

  function openCalendarDayDrawer(dateStr, remindersList) {
    const drawer = document.getElementById('calendar-day-drawer');
    const title = document.getElementById('drawer-date-title');
    const list = document.getElementById('drawer-reminders-list');

    if (!drawer || !title || !list) return;

    title.textContent = `Reminders for ${dateStr} (${remindersList.length} items)`;
    list.innerHTML = '';

    if (remindersList.length === 0) {
      list.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); padding: 8px 0;">No reminders due on this date. Click "+ Add Reminder" to schedule one.</p>`;
    } else {
      remindersList.forEach((rem) => {
        const item = document.createElement('div');
        item.style.padding = '8px 12px';
        item.style.borderBottom = '1px solid var(--border-subtle)';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.innerHTML = `
          <div>
            <span style="font-weight: 700; font-size: 0.9rem; color: var(--text-main);">${escapeHtml(rem.title)}</span>
            <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 8px;">(${escapeHtml(rem.category)})</span>
            ${rem.amount ? `<span style="font-size: 0.8rem; font-weight: 700; color: var(--brand-primary); margin-left: 8px;">${escapeHtml(rem.amount)}</span>` : ''}
          </div>
          <div>
            <button type="button" class="btn-text-sm" data-action="open-edit">Edit</button>
          </div>
        `;
        item.querySelector('button')?.addEventListener('click', () => openReminderModal(rem));
        list.appendChild(item);
      });
    }

    drawer.style.display = 'block';
  }

  // --------------------------------------------------------------------------
  // Reminder Actions: Complete, Snooze, Delete, View Attached Document
  // --------------------------------------------------------------------------
  async function toggleReminderStatus(id, newStatus) {
    try {
      const res = await reminderFetch(`/api/reminders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        showToast(newStatus === 'completed' ? 'Reminder marked as completed.' : 'Reminder set back to active.', 'success');
        await refreshAllData();
      }
    } catch (e) {
      showToast('Status update failed.', 'error');
    }
  }

  function openSnoozeModal(reminderId) {
    const modal = document.getElementById('modal-snooze');
    const targetInput = document.getElementById('snooze-target-id');
    const customInput = document.getElementById('snooze-custom-input');
    if (!modal) return;

    targetInput.value = reminderId;
    if (customInput) customInput.value = '';
    modal.classList.add('active');
  }

  function closeSnoozeModal() {
    const modal = document.getElementById('modal-snooze');
    if (modal) modal.classList.remove('active');
  }

  async function executeSnooze(hours) {
    const targetId = document.getElementById('snooze-target-id').value;
    if (!targetId) return;

    try {
      const res = await reminderFetch(`/api/reminders/${targetId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours })
      });

      if (res.ok) {
        closeSnoozeModal();
        showToast(`Reminder snoozed for ${hours} hours.`, 'success');
        await refreshAllData();
      }
    } catch (e) {
      showToast('Snooze failed.', 'error');
    }
  }

  async function handleConfirmSnooze() {
    const targetId = document.getElementById('snooze-target-id').value;
    const customTime = document.getElementById('snooze-custom-input').value;
    if (!customTime) {
      showToast('Please select a custom snooze date & time or pick a preset.', 'error');
      return;
    }

    try {
      const res = await reminderFetch(`/api/reminders/${targetId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snoozeUntil: new Date(customTime).toISOString() })
      });

      if (res.ok) {
        closeSnoozeModal();
        showToast('Reminder snoozed to custom time.', 'success');
        await refreshAllData();
      }
    } catch (e) {
      showToast('Snooze failed.', 'error');
    }
  }

  async function confirmDeleteReminder(id, title) {
    if (confirm(`Are you sure you want to delete the reminder "${title}"?`)) {
      try {
        const res = await reminderFetch(`/api/reminders/${id}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Reminder deleted successfully.', 'success');
          await refreshAllData();
        }
      } catch (e) {
        showToast('Failed to delete reminder.', 'error');
      }
    }
  }

  async function viewAttachedDocument(docId) {
    if (!docId) return;
    try {
      const res = await fetch(`/api/documents/${docId}`);
      if (!res.ok) {
        showToast('Attached document not found or access restricted.', 'error');
        return;
      }
      const data = await res.json();
      const doc = data.document;

      // Open existing document preview modal
      const previewModal = document.getElementById('preview-modal');
      const docTitle = document.getElementById('modal-doc-title');
      const docBody = document.getElementById('modal-doc-body');
      const downloadBtn = document.getElementById('modal-download-action');

      if (previewModal && docTitle && docBody) {
        docTitle.textContent = doc.title || doc.name;
        docBody.innerHTML = `
          <div style="font-size: 0.85rem; line-height: 1.5; color: var(--text-main);">
            <div style="margin-bottom: 8px;"><strong>Category:</strong> ${escapeHtml(doc.category)}</div>
            <div style="margin-bottom: 8px;"><strong>Filename:</strong> ${escapeHtml(doc.name)}</div>
            <div style="margin-bottom: 8px;"><strong>SHA-256 Verified:</strong> <span style="font-family: var(--font-mono); font-size: 0.75rem;">${doc.sha256}</span></div>
            <hr style="margin: 12px 0; border: none; border-top: 1px solid var(--border-subtle);">
            <div><strong>Extracted Content Preview:</strong></div>
            <pre style="margin-top: 6px; padding: 10px; background: #FAF5E8; border-radius: 6px; font-family: var(--font-mono); font-size: 0.78rem; max-height: 200px; overflow-y: auto;">${escapeHtml(doc.extractedText || 'No text content available.')}</pre>
          </div>
        `;

        if (downloadBtn) {
          downloadBtn.onclick = () => {
            window.location.href = `/api/documents/${doc.id}/download`;
          };
        }

        previewModal.classList.add('active');
      }
    } catch (e) {
      showToast('Error opening attached document.', 'error');
    }
  }

  // --------------------------------------------------------------------------
  // Notifications System (In-App Bell & Unread Counter)
  // --------------------------------------------------------------------------
  async function fetchNotifications() {
    try {
      const res = await reminderFetch('/api/reminders/notifications');
      if (res.status === 401) {
        currentNotifications = [];
        updateNotificationBellBadge(0);
        return;
      }

      const data = await res.json();
      currentNotifications = data.notifications || [];
      const unreadCount = data.unreadCount || 0;

      updateNotificationBellBadge(unreadCount);
      renderNotificationDropdown();
    } catch (e) {
      console.warn('Notifications fetch skipped:', e.message);
    }
  }

  function updateNotificationBellBadge(unreadCount) {
    const badge = document.getElementById('notif-badge');
    const bellBtn = document.getElementById('btn-notif-bell');
    const unreadSub = document.getElementById('notif-unread-sub');

    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display = 'block';
        if (bellBtn) bellBtn.classList.add('has-unread');
      } else {
        badge.style.display = 'none';
        if (bellBtn) bellBtn.classList.remove('has-unread');
      }
    }

    if (unreadSub) {
      unreadSub.textContent = `${unreadCount} unread alert${unreadCount === 1 ? '' : 's'}`;
    }
  }

  function renderNotificationDropdown() {
    const list = document.getElementById('notif-list-container');
    if (!list) return;

    let filtered = currentNotifications.slice();
    if (notifFilter === 'unread') {
      filtered = filtered.filter((n) => !n.isRead);
    } else if (notifFilter === 'upcoming') {
      filtered = filtered.filter((n) => n.type === 'upcoming' || n.type === 'due_today');
    } else if (notifFilter === 'overdue') {
      filtered = filtered.filter((n) => n.type === 'overdue');
    }

    if (filtered.length === 0) {
      list.innerHTML = `<div class="notif-empty-state">No notifications matching "${notifFilter}". You are all caught up!</div>`;
      return;
    }

    list.innerHTML = '';
    filtered.forEach((notif) => {
      const item = document.createElement('div');
      item.className = `notif-item ${notif.isRead ? '' : 'unread'}`;

      let iconSymbol = '⏰';
      if (notif.type === 'due_today') iconSymbol = '🚨';
      else if (notif.type === 'overdue') iconSymbol = '⚠️';
      else if (notif.type === 'snoozed') iconSymbol = '💤';
      else if (notif.type === 'system') iconSymbol = '🔄';

      const timeAgo = formatTimeAgo(notif.createdAt);

      item.innerHTML = `
        <div class="notif-item-icon ${notif.type}">${iconSymbol}</div>
        <div class="notif-item-body">
          <div class="notif-item-title">${escapeHtml(notif.title)}</div>
          <div class="notif-item-msg">${escapeHtml(notif.message)}</div>
          <div class="notif-item-meta">
            <span>${timeAgo}</span>
            <div>
              ${!notif.isRead ? `<button type="button" class="btn-text-sm" data-action="mark-read">Mark read</button>` : ''}
              <button type="button" class="btn-text-sm" data-action="delete-notif">&times;</button>
            </div>
          </div>
        </div>
      `;

      item.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (btn) {
          const act = btn.getAttribute('data-action');
          if (act === 'mark-read') {
            await markSingleNotificationRead(notif.id);
          } else if (act === 'delete-notif') {
            await deleteSingleNotification(notif.id);
          }
        } else {
          // Click item: mark read and switch to reminders tab
          if (!notif.isRead) await markSingleNotificationRead(notif.id);
          const dropdown = document.getElementById('notif-dropdown');
          if (dropdown) dropdown.style.display = 'none';
          const remTab = document.getElementById('tab-nav-reminders');
          if (remTab) remTab.click();
        }
      });

      list.appendChild(item);
    });
  }

  async function markSingleNotificationRead(notifId) {
    try {
      await reminderFetch(`/api/reminders/notifications/${notifId}/read`, { method: 'PATCH' });
      await fetchNotifications();
    } catch (e) {}
  }

  async function markAllNotificationsRead() {
    try {
      await reminderFetch('/api/reminders/notifications/read-all', { method: 'POST' });
      await fetchNotifications();
      showToast('All notifications marked as read.', 'success');
    } catch (e) {}
  }

  async function deleteSingleNotification(notifId) {
    try {
      await reminderFetch(`/api/reminders/notifications/${notifId}`, { method: 'DELETE' });
      await fetchNotifications();
    } catch (e) {}
  }

  async function triggerBackendSchedulerCheck() {
    try {
      await reminderFetch('/api/reminders/trigger-check', { method: 'POST' });
    } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // Settings & Push Notifications (External Push System)
  // --------------------------------------------------------------------------
  async function openSettingsModal() {
    const modal = document.getElementById('modal-reminder-settings');
    const limitInput = document.getElementById('settings-max-limit');
    const badge = document.getElementById('settings-push-badge');
    const toggleInapp = document.getElementById('settings-toggle-inapp');
    const togglePush = document.getElementById('settings-toggle-push');
    const toggleSound = document.getElementById('settings-toggle-sound');
    const fcmInput = document.getElementById('settings-fcm-token');

    if (!modal) return;

    // Check push status in browser
    if ('Notification' in window) {
      const perm = Notification.permission;
      if (badge) {
        badge.textContent = `Status: ${perm.toUpperCase()}`;
        badge.className = `push-status-pill ${perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : ''}`;
      }
    }

    try {
      const res = await reminderFetch('/api/reminders/settings');
      if (res.ok) {
        const data = await res.json();
        const settings = data.settings || {};
        if (limitInput) limitInput.value = settings.maxActiveReminders || 300;
        if (toggleInapp) toggleInapp.checked = settings.inAppEnabled !== false;
        if (togglePush) togglePush.checked = settings.pushEnabled !== false;
        if (toggleSound) toggleSound.checked = settings.soundEnabled !== false;
      }
    } catch (e) {}

    modal.classList.add('active');
  }

  function closeSettingsModal() {
    const modal = document.getElementById('modal-reminder-settings');
    if (modal) modal.classList.remove('active');
  }

  async function handleSaveSettings() {
    const limitInput = document.getElementById('settings-max-limit');
    const toggleInapp = document.getElementById('settings-toggle-inapp');
    const togglePush = document.getElementById('settings-toggle-push');
    const toggleSound = document.getElementById('settings-toggle-sound');

    const payload = {
      maxActiveReminders: parseInt(limitInput?.value || '300', 10),
      inAppEnabled: Boolean(toggleInapp?.checked),
      pushEnabled: Boolean(togglePush?.checked),
      soundEnabled: Boolean(toggleSound?.checked)
    };

    try {
      const res = await reminderFetch('/api/reminders/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        closeSettingsModal();
        showToast('Reminder settings saved successfully.', 'success');
        await refreshAllData();
      }
    } catch (e) {
      showToast('Failed to save settings.', 'error');
    }
  }

  async function requestPushPermissionAction() {
    if (!('Notification' in window)) {
      showToast('Push Notifications are not supported by your current browser.', 'error');
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      const badge = document.getElementById('settings-push-badge');
      if (badge) {
        badge.textContent = `Status: ${perm.toUpperCase()}`;
        badge.className = `push-status-pill ${perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : ''}`;
      }

      if (perm === 'granted') {
        showToast('Push notifications permission granted!', 'success');
        // Register Push Subscription with Service Worker
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          // Subscribe to pushManager
          const sub = await reg.pushManager.getSubscription() || {
            endpoint: `https://push.onefill.local/sub_${Date.now()}`,
            keys: { p256dh: 'mock-key', auth: 'mock-auth' }
          };

          await reminderFetch('/api/reminders/push-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub)
          });
        }
      } else {
        showToast(`Push notifications permission: ${perm}`, 'info');
      }
    } catch (err) {
      showToast(`Push request error: ${err.message}`, 'error');
    }
  }

  async function registerFcmTokenAction() {
    const tokenInput = document.getElementById('settings-fcm-token');
    const token = tokenInput ? tokenInput.value.trim() : '';
    if (!token) {
      showToast('Please paste a valid FCM device token.', 'error');
      return;
    }

    try {
      const res = await reminderFetch('/api/reminders/fcm-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      if (res.ok) {
        showToast('FCM device token registered for mobile push notifications.', 'success');
        tokenInput.value = '';
      }
    } catch (e) {
      showToast('Failed to register FCM token.', 'error');
    }
  }

  async function testPushAlarm() {
    showToast('Triggering push alarm test...', 'info');

    // 1. Play sound chime if enabled
    playAlarmChime();

    // 2. Dispatch Service Worker notification
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        title: '🚨 Test Deadline Alarm: Electricity Bill Due',
        options: {
          body: 'Your Electricity Bill of $145.20 is due in 3 days. All alarm intervals are active.'
        }
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🚨 Test Deadline Alarm: Electricity Bill Due', {
        body: 'Your Electricity Bill of $145.20 is due in 3 days. All alarm intervals are active.',
        icon: '/favicon.ico'
      });
    }

    // 3. Trigger backend check and toast
    await triggerBackendSchedulerCheck();
    await fetchNotifications();
    showToast('Push alarm notification dispatched!', 'success');
  }

  function playAlarmChime() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // Utility Helpers
  // --------------------------------------------------------------------------
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTimeAgo(isoString) {
    if (!isoString) return '';
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function showToast(message, type = 'info') {
    if (window.showToast) {
      window.showToast(message, type);
      return;
    }
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  // Export controller object globally for inter-module communication
  window.RemindersUI = {
    refreshAllData,
    openReminderModal,
    openSettingsModal,
    testPushAlarm
  };

})();
