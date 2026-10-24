/**
 * OneFill Browser Extension - Popup Script
 * Connects with OneFill backend, fetches synced profile, and triggers form filling on active tab.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const userNameEl = document.getElementById('user-name');
  const userEmailEl = document.getElementById('user-email');
  const fieldsCountEl = document.getElementById('fields-count');
  const statusDotEl = document.getElementById('server-status');
  const btnAutoFill = document.getElementById('btn-autofill-page');
  const btnOpenDash = document.getElementById('btn-open-dashboard');

  let activeProfile = null;

  async function loadProfile() {
    try {
      // Check auth and profile from local OneFill instance
      const authRes = await fetch('http://localhost:3000/api/auth/me', { credentials: 'include' });
      if (!authRes.ok) {
        statusDotEl.style.background = '#E11D48';
        userNameEl.textContent = 'Not Signed In';
        userEmailEl.textContent = 'Please log in at http://localhost:3000';
        fieldsCountEl.textContent = 'Auth Required';
        btnAutoFill.disabled = true;
        btnAutoFill.style.opacity = '0.6';
        return;
      }

      const authData = await authRes.json();
      const user = authData.user;

      const profRes = await fetch('http://localhost:3000/api/autofill/profile', { credentials: 'include' });
      if (profRes.ok) {
        const profData = await profRes.json();
        activeProfile = profData.profile;

        // Count non-empty values
        let count = 0;
        for (const [k, v] of Object.entries(activeProfile || {})) {
          if (k !== 'updatedAt' && k !== 'customFields' && typeof v === 'string' && v.trim().length > 0) count++;
        }
        if (Array.isArray(activeProfile.customFields)) {
          count += activeProfile.customFields.filter(c => c && c.value).length;
        }

        statusDotEl.style.background = '#059669';
        userNameEl.textContent = activeProfile.fullName || user.username;
        userEmailEl.textContent = activeProfile.email || user.email;
        fieldsCountEl.textContent = `${count} Fields Configured`;
        btnAutoFill.disabled = false;
        btnAutoFill.style.opacity = '1';
      }
    } catch (err) {
      statusDotEl.style.background = '#E11D48';
      userNameEl.textContent = 'Server Offline';
      userEmailEl.textContent = 'Ensure OneFill server is running on :3000';
      fieldsCountEl.textContent = 'Offline';
      btnAutoFill.disabled = true;
      btnAutoFill.style.opacity = '0.6';
    }
  }

  btnAutoFill.addEventListener('click', async () => {
    if (!activeProfile) return;

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'TRIGGER_AUTOFILL',
          profile: activeProfile
        }, (response) => {
          if (chrome.runtime.lastError) {
            alert('Cannot autofill on this page: Make sure you are on a webpage (e.g. Google Form or standard web form) and refresh the page if the extension was just installed.');
          } else {
            window.close();
          }
        });
      }
    }
  });

  btnOpenDash.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: 'http://localhost:3000' });
    } else {
      window.open('http://localhost:3000', '_blank');
    }
  });

  loadProfile();
});
