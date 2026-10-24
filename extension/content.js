/**
 * OneFill Browser Extension - Content Script
 * Injected into web pages and Google Forms to safely inspect forms,
 * request explicit user permission, and fill approved fields.
 */

(() => {
  if (window.__ONEFILL_CONTENT_INJECTED__) return;
  window.__ONEFILL_CONTENT_INJECTED__ = true;

  // Listen for messages from popup or background
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'PING') {
        sendResponse({ status: 'PONG', isGoogleForm: isGoogleFormsPage() });
        return true;
      }
      if (request.action === 'TRIGGER_AUTOFILL') {
        initiateAutoFill(request.profile);
        sendResponse({ status: 'STARTED' });
        return true;
      }
    });
  }

  function isGoogleFormsPage() {
    return window.location.hostname.includes('docs.google.com') && window.location.pathname.includes('/forms/');
  }

  /**
   * Scan page DOM and return form targets
   */
  function scanPageFields(profile) {
    const targets = [];

    // Case A: Google Forms
    if (isGoogleFormsPage()) {
      const items = document.querySelectorAll('div[role="listitem"]');
      items.forEach((item, idx) => {
        // Question title is usually in class .M7eMe or role="heading"
        const titleEl = item.querySelector('.M7eMe, div[role="heading"], span.V7Sr0');
        const questionText = titleEl ? titleEl.textContent.trim() : `Question ${idx + 1}`;

        const match = window.OneFillEngine.matchFieldSemantics(questionText, profile);
        if (match) {
          // Find text input or textarea
          const inputEl = item.querySelector('input[type="text"], input[type="email"], input[type="tel"], textarea');
          if (inputEl) {
            targets.push({
              id: `gf_${idx}`,
              label: questionText,
              key: match.key,
              value: match.value,
              confidence: match.confidence,
              element: inputEl,
              type: 'text'
            });
            return;
          }

          // Find radio options if gender or choice
          if (match.key === 'gender') {
            const radios = item.querySelectorAll('div[role="radio"]');
            radios.forEach((radio) => {
              const label = radio.getAttribute('aria-label') || radio.textContent.trim();
              if (label && match.value && label.toLowerCase().startsWith(match.value.toLowerCase().slice(0, 3))) {
                targets.push({
                  id: `gf_${idx}_radio`,
                  label: `${questionText} (${label})`,
                  key: match.key,
                  value: label,
                  confidence: 90,
                  element: radio,
                  type: 'radio'
                });
              }
            });
          }
        }
      });
      return targets;
    }

    // Case B: Generic Web Forms
    const formControls = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="password"]), select, textarea');
    formControls.forEach((el, idx) => {
      // Find associated label
      let labelText = '';
      if (el.id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl) labelText = lbl.textContent.trim();
      }
      if (!labelText) {
        const parentLbl = el.closest('label');
        if (parentLbl) labelText = parentLbl.textContent.trim();
      }
      if (!labelText && el.getAttribute('aria-label')) {
        labelText = el.getAttribute('aria-label').trim();
      }
      if (!labelText && el.getAttribute('placeholder')) {
        labelText = el.getAttribute('placeholder').trim();
      }
      if (!labelText && el.getAttribute('name')) {
        labelText = el.getAttribute('name').replace(/[_-]/g, ' ').trim();
      }

      if (labelText) {
        const match = window.OneFillEngine.matchFieldSemantics(labelText, profile);
        if (match) {
          targets.push({
            id: `input_${idx}`,
            label: labelText,
            key: match.key,
            value: match.value,
            confidence: match.confidence,
            element: el,
            type: el.tagName.toLowerCase() === 'select' ? 'select' : 'text'
          });
        }
      }
    });

    return targets;
  }

  /**
   * Show permission request modal overlay
   */
  function initiateAutoFill(profile) {
    if (!profile) {
      alert('OneFill: No Personal Profile found. Please sign in to OneFill at http://localhost:3000 to configure your profile.');
      return;
    }

    const matches = scanPageFields(profile);
    if (matches.length === 0) {
      showTopToast('OneFill: No matching form fields detected on this page.', 'warning');
      return;
    }

    // Remove existing modal if any
    const existing = document.getElementById('onefill-permission-modal');
    if (existing) existing.remove();

    // Create Permission Modal
    const overlay = document.createElement('div');
    overlay.id = 'onefill-permission-modal';
    overlay.className = 'onefill-modal-overlay';

    let itemsHtml = '';
    matches.forEach((m, idx) => {
      itemsHtml += `
        <label class="onefill-field-item">
          <input type="checkbox" class="onefill-field-check" data-idx="${idx}" checked>
          <div class="onefill-field-meta">
            <div class="onefill-field-label">${escapeHtml(m.label)}</div>
            <div class="onefill-field-value">&rarr; <strong>${escapeHtml(String(m.value))}</strong></div>
          </div>
          <span class="onefill-confidence-tag">${m.confidence}%</span>
        </label>
      `;
    });

    overlay.innerHTML = `
      <div class="onefill-modal-box">
        <div class="onefill-modal-header">
          <div class="onefill-header-brand">
            <span class="onefill-logo-pill">OneFill AI</span>
            <span class="onefill-modal-title">Permission Request</span>
          </div>
          <button type="button" class="onefill-close-btn" id="onefill-cancel-btn">&times;</button>
        </div>

        <div class="onefill-modal-body">
          <p class="onefill-modal-desc">
            Found <strong>${matches.length}</strong> matching fields on this page. Review the details below and select which fields you permit OneFill to fill:
          </p>
          <div class="onefill-fields-list">
            ${itemsHtml}
          </div>

          <div class="onefill-security-notice">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>OneFill will fill only approved fields. Form submission remains 100% under your manual control.</span>
          </div>
        </div>

        <div class="onefill-modal-footer">
          <button type="button" class="onefill-btn-secondary" id="onefill-btn-cancel-action">Cancel</button>
          <button type="button" class="onefill-btn-primary" id="onefill-btn-approve-action">Approve &amp; AutoFill</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Event Listeners
    const close = () => overlay.remove();
    document.getElementById('onefill-cancel-btn').addEventListener('click', close);
    document.getElementById('onefill-btn-cancel-action').addEventListener('click', close);

    document.getElementById('onefill-btn-approve-action').addEventListener('click', () => {
      const checkboxes = overlay.querySelectorAll('.onefill-field-check');
      let filledCount = 0;

      checkboxes.forEach((cb) => {
        if (cb.checked) {
          const idx = parseInt(cb.getAttribute('data-idx'), 10);
          const item = matches[idx];
          if (item && item.element) {
            fillElement(item.element, item.value, item.type);
            filledCount++;
          }
        }
      });

      overlay.remove();
      showTopToast(`OneFill AutoFill: Successfully filled ${filledCount} field(s). Please review and submit manually.`, 'success');
    });
  }

  /**
   * Set value and dispatch framework-compatible events
   */
  function fillElement(el, val, type) {
    if (!el) return;

    if (type === 'radio') {
      el.click();
      highlightField(el);
      return;
    }

    // Set value directly and via prototype setter (for React/Angular virtual DOM)
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    const nativeTextAreaSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;

    if (el.tagName === 'INPUT' && nativeInputValueSetter) {
      nativeInputValueSetter.call(el, val);
    } else if (el.tagName === 'TEXTAREA' && nativeTextAreaSetter) {
      nativeTextAreaSetter.call(el, val);
    } else {
      el.value = val;
    }

    // Dispatch input, change, and blur events
    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));

    highlightField(el);
  }

  function highlightField(el) {
    el.classList.add('onefill-autofilled-glow');
    setTimeout(() => {
      el.classList.remove('onefill-autofilled-glow');
    }, 4000);
  }

  function showTopToast(message, type = 'info') {
    const existing = document.getElementById('onefill-toast-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'onefill-toast-banner';
    banner.className = `onefill-toast-banner onefill-toast-${type}`;
    banner.innerHTML = `
      <div class="onefill-toast-content">
        <span class="onefill-toast-badge">OneFill</span>
        <span class="onefill-toast-msg">${escapeHtml(message)}</span>
      </div>
      <button type="button" class="onefill-toast-close">&times;</button>
    `;

    document.body.appendChild(banner);
    banner.querySelector('.onefill-toast-close').addEventListener('click', () => banner.remove());
    setTimeout(() => banner.remove(), 7000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
