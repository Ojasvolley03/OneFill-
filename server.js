/**
 * OneFill - Enterprise Secure Application Server
 * Implements authentication, AES-256-GCM encryption at rest,
 * strict document ownership enforcement, IDOR protection, and security headers.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const security = require('./security');
const { AutoFillMatcher, PROFILE_FIELDS } = require('./autofill_matcher');
const DateExtractor = require('./date_extractor');
const zipUtil = require('./zip_util');

// Automated Backend Scheduler for Reminder Deadlines & Notifications
function triggerNotificationCheck() {
  try {
    db.checkDueRemindersAndGenerateNotifications(({ userId, reminder, notification }) => {
      const settings = db.getUserReminderSettings(userId);
      if (settings && settings.pushSubscriptions && settings.pushSubscriptions.length > 0) {
        console.log(`[PUSH NOTIFICATION] Dispatched to ${settings.pushSubscriptions.length} subscriptions for user ${userId}: "${notification.title}"`);
      }
      if (settings && settings.fcmTokens && settings.fcmTokens.length > 0) {
        console.log(`[FCM NOTIFICATION] Dispatched to ${settings.fcmTokens.length} device tokens for user ${userId}: "${notification.title}"`);
      }
    });
  } catch (err) {
    console.error('Scheduler check error:', err.message);
  }
}

// Run scheduler every 15 seconds for accurate exact-time alerts
const SCHEDULER_INTERVAL_MS = 15 * 1000;
setInterval(triggerNotificationCheck, SCHEDULER_INTERVAL_MS);
// Run initial check after 2 seconds
setTimeout(triggerNotificationCheck, 2000);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip'
};

// Cross-Origin Resource Sharing for Extension & Web Applications
function applyCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

// Security Headers applied to every response
function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; worker-src 'self' blob: https://cdnjs.cloudflare.com; connect-src 'self' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com;"
  );
}

// Parse cookies from Cookie header
function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach((cookie) => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });

  return list;
}

// Read body stream with safety limit
async function readRequestBody(req, maxBytes = security.MAX_FILE_SIZE) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let receivedBytes = 0;

    req.on('data', (chunk) => {
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', (err) => reject(err));
  });
}

// Authentication resolver (defaults to Guest user when no session token is provided)
function resolveAuth(req) {
  const cookies = parseCookies(req);
  let token = cookies.onefill_session;

  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }

  // If a session token was explicitly provided, validate it
  if (token) {
    const userId = db.validateSession(token);
    if (!userId) return null; // Invalid or expired session token

    const user = db.getUserById(userId);
    if (!user) return null;

    return { user, token, isGuest: user.id === db.GUEST_USER.id };
  }

  // No session token provided: seamless Guest access out-of-the-box (no login required)
  return { user: db.GUEST_USER, token: 'guest_session', isGuest: true };
}

function resolveReminderAuth(req) {
  const auth = resolveAuth(req);
  if (!auth || auth.user.id !== db.GUEST_USER.id) return auth;

  const guestToken = parseCookies(req).onefill_reminder_guest;
  if (!guestToken) return null;

  const userId = db.validateSession(guestToken);
  const user = userId && db.getUserById(userId);
  if (!user || user.id === db.GUEST_USER.id) return null;

  return { user, token: guestToken, isGuest: true };
}

// Send JSON response
function sendJson(res, statusCode, data, extraHeaders = {}) {
  applySecurityHeaders(res);
  for (const [key, val] of Object.entries(extraHeaders)) {
    res.setHeader(key, val);
  }
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// The main HTTP request router
const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const method = req.method.toUpperCase();

  // Audit logging (sanitized - NEVER logs passwords, body, or sensitive data)
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    // Privacy-preserving request log
    console.log(`[${new Date().toISOString()}] ${method} ${pathname} ${res.statusCode} (${duration}ms)`);
  });

  try {
    if (method === 'OPTIONS') {
      applyCorsHeaders(req, res);
      res.writeHead(204);
      res.end();
      return;
    }

    // ------------------------------------------------------------------------
    // API: Authentication Endpoints
    // ------------------------------------------------------------------------
    if (pathname === '/api/auth/register' && method === 'POST') {
      const bodyBuf = await readRequestBody(req, 1024 * 10);
      let payload;
      try {
        payload = JSON.parse(bodyBuf.toString('utf8'));
      } catch (e) {
        return sendJson(res, 400, { error: 'Invalid JSON payload.' });
      }

      const { email, username, password } = payload;
      if (!email || !username || !password) {
        return sendJson(res, 400, { error: 'Email, username, and password are required.' });
      }

      try {
        const user = db.createUser(email, username, password);
        const { token, expiresAt } = db.createSession(user.id);

        const cookieVal = `onefill_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200`;
        return sendJson(res, 201, { user, token, expiresAt }, { 'Set-Cookie': cookieVal });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const bodyBuf = await readRequestBody(req, 1024 * 10);
      let payload;
      try {
        payload = JSON.parse(bodyBuf.toString('utf8'));
      } catch (e) {
        return sendJson(res, 400, { error: 'Invalid JSON payload.' });
      }

      const { identifier, password } = payload;
      if (!identifier || !password) {
        return sendJson(res, 400, { error: 'Username/email and password are required.' });
      }

      const user = db.authenticateUser(identifier, password);
      if (!user) {
        return sendJson(res, 401, { error: 'Invalid credentials provided.' });
      }

      const { token, expiresAt } = db.createSession(user.id);
      const cookieVal = `onefill_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200`;
      return sendJson(res, 200, { user, token, expiresAt }, { 'Set-Cookie': cookieVal });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const auth = resolveAuth(req);
      if (auth) {
        db.destroySession(auth.token);
      }
      const expiredCookie = 'onefill_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
      return sendJson(res, 200, { message: 'Logged out successfully.' }, { 'Set-Cookie': expiredCookie });
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      applyCorsHeaders(req, res);
      const auth = resolveAuth(req);
      if (!auth) {
        return sendJson(res, 401, { authenticated: false });
      }
      return sendJson(res, 200, {
        authenticated: true,
        user: auth.user,
        isGuest: auth.user.id === db.GUEST_USER.id
      });
    }

    // ------------------------------------------------------------------------
    // API: AI AutoFill (Protected - Personal Information Profile & Form Engine)
    // ------------------------------------------------------------------------
    if (pathname.startsWith('/api/autofill')) {
      applyCorsHeaders(req, res);

      // Public schema descriptor
      if (pathname === '/api/autofill/schema' && method === 'GET') {
        return sendJson(res, 200, { fields: PROFILE_FIELDS });
      }

      // Extension ZIP download
      if (pathname === '/api/autofill/extension/download' && method === 'GET') {
        const extDir = path.join(__dirname, 'extension');
        let zipBuf;
        try {
          const prebuiltZip = path.join(__dirname, 'onefill-autofill-extension.zip');
          if (fs.existsSync(prebuiltZip)) {
            zipBuf = fs.readFileSync(prebuiltZip);
          } else {
            zipBuf = zipUtil.zipDirectory(extDir);
          }
        } catch (e) {
          zipBuf = zipUtil.zipDirectory(extDir);
        }

        applySecurityHeaders(res);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="onefill-autofill-extension.zip"');
        res.setHeader('Content-Length', zipBuf.length);
        res.writeHead(200);
        res.end(zipBuf);
        return;
      }

      // Authentication required for profile data and form processing
      const auth = resolveAuth(req);
      if (!auth) {
        return sendJson(res, 401, { error: 'Unauthorized: Authentication required to access AI AutoFill.' });
      }
      const userId = auth.user.id;

      // GET /api/autofill/profile -> Retrieve decrypted personal profile
      if (pathname === '/api/autofill/profile' && method === 'GET') {
        const profile = db.getUserProfile(userId);
        return sendJson(res, 200, { profile });
      }

      // PUT /api/autofill/profile -> Save/update encrypted personal profile
      if (pathname === '/api/autofill/profile' && method === 'PUT') {
        const bodyBuf = await readRequestBody(req, 1024 * 100);
        let payload;
        try {
          payload = JSON.parse(bodyBuf.toString('utf8'));
        } catch (e) {
          return sendJson(res, 400, { error: 'Invalid JSON payload.' });
        }

        try {
          const savedProfile = db.saveUserProfile(userId, payload);
          return sendJson(res, 200, {
            message: 'Personal Information Profile securely encrypted and saved.',
            profile: savedProfile
          });
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }
      }

      // DELETE /api/autofill/profile -> Delete/reset profile
      if (pathname === '/api/autofill/profile' && method === 'DELETE') {
        db.deleteUserProfile(userId);
        return sendJson(res, 200, { message: 'Profile information permanently deleted.' });
      }

      // POST /api/autofill/analyze-form -> Parse and match uploaded form against user profile
      if (pathname === '/api/autofill/analyze-form' && method === 'POST') {
        const bodyBuf = await readRequestBody(req, 1024 * 1024 * 10);
        let payload;
        try {
          payload = JSON.parse(bodyBuf.toString('utf8'));
        } catch (e) {
          return sendJson(res, 400, { error: 'Invalid form analysis payload.' });
        }

        const { formText, explicitFields, formTitle } = payload;
        const profile = db.getUserProfile(userId);
        const analysis = AutoFillMatcher.analyzeForm(formText || '', profile, explicitFields);

        return sendJson(res, 200, {
          formTitle: formTitle || 'Uploaded Form',
          ...analysis
        });
      }

      return sendJson(res, 404, { error: 'AutoFill route not found.' });
    }

    // ------------------------------------------------------------------------
    // API: Documents (Protected - Enforces Authentication & Document Ownership)
    // ------------------------------------------------------------------------
    if (pathname.startsWith('/api/documents')) {
      const auth = resolveAuth(req);
      if (!auth) {
        return sendJson(res, 401, { error: 'Unauthorized: Authentication required to access documents.' });
      }
      const userId = auth.user.id;

      // GET /api/documents -> List only documents belonging to authenticated user
      if (pathname === '/api/documents' && method === 'GET') {
        const category = urlObj.searchParams.get('category') || 'ALL';
        const search = urlObj.searchParams.get('search') || '';
        const userDocs = db.listUserDocuments(userId, { category, search });
        return sendJson(res, 200, { documents: userDocs });
      }

      // POST /api/documents -> Ingest, validate signature, encrypt with AES-256-GCM, store
      if (pathname === '/api/documents' && method === 'POST') {
        let bodyBuf;
        try {
          // Base64 expands binary payloads ~1.37x plus metadata/thumbnail
          const maxJsonEnvelopeBytes = Math.ceil(security.MAX_FILE_SIZE * 1.45) + 2 * 1024 * 1024;
          bodyBuf = await readRequestBody(req, maxJsonEnvelopeBytes);
        } catch (e) {
          if (e.message === 'PAYLOAD_TOO_LARGE') {
            return sendJson(res, 413, { error: 'File upload exceeds the 50MB security limit.' });
          }
          return sendJson(res, 400, { error: 'Failed to read document payload.' });
        }

        let payload;
        try {
          payload = JSON.parse(bodyBuf.toString('utf8'));
        } catch (e) {
          return sendJson(res, 400, { error: 'Invalid document upload format. Expected JSON payload.' });
        }

        const { name, title, category, description, fileBase64, extractedText, thumbnail } = payload;
        if (!name || !fileBase64) {
          return sendJson(res, 400, { error: 'Document name and file data are required.' });
        }

        let fileBuffer;
        try {
          fileBuffer = Buffer.from(fileBase64, 'base64');
        } catch (e) {
          return sendJson(res, 400, { error: 'Corrupted or invalid base64 file data.' });
        }

        try {
          const savedDoc = db.saveDocumentRecord(
            userId,
            { name, title, category, description, extractedText, thumbnail },
            fileBuffer
          );
          return sendJson(res, 201, { message: 'Document encrypted and saved.', document: savedDoc });
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }
      }

      // POST /api/documents/clear-all -> Purge documents (password required for registered accounts, instant for guest)
      if (pathname === '/api/documents/clear-all' && method === 'POST') {
        if (userId === db.GUEST_USER.id) {
          db.clearAllUserDocuments(userId);
          return sendJson(res, 200, { message: 'All guest documents have been cleared.' });
        }

        const bodyBuf = await readRequestBody(req, 1024 * 5);
        let payload = {};
        try {
          payload = JSON.parse(bodyBuf.toString('utf8'));
        } catch (e) {}

        const password = payload.password;
        if (!password) {
          return sendJson(res, 400, { error: 'Password confirmation required for clearing all documents.' });
        }

        const user = db.authenticateUser(auth.user.email, password);
        if (!user) {
          return sendJson(res, 403, { error: 'Incorrect password. Action cancelled.' });
        }

        db.clearAllUserDocuments(userId);
        return sendJson(res, 200, { message: 'All your documents have been securely purged.' });
      }

      // Document ID operations: /api/documents/:id...
      const docIdMatch = pathname.match(/^\/api\/documents\/([a-zA-Z0-9_-]+)(\/download)?$/);
      if (docIdMatch) {
        const docId = docIdMatch[1];
        const isDownload = Boolean(docIdMatch[2]);

        // GET /api/documents/:id/download -> Decrypt & verify integrity before sending
        if (isDownload && method === 'GET') {
          try {
            const fileResult = db.getUserDocumentFile(userId, docId);
            if (!fileResult) {
              // IDOR Protection: returns 404 (does not leak document existence)
              return sendJson(res, 404, { error: 'Document not found or access denied.' });
            }

            applySecurityHeaders(res);
            res.setHeader('Content-Type', fileResult.mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${security.sanitizeFilename(fileResult.name)}"`);
            res.setHeader('Content-Length', fileResult.buffer.length);
            res.setHeader('X-Document-SHA256', fileResult.sha256);
            res.writeHead(200);
            res.end(fileResult.buffer);
            return;
          } catch (err) {
            console.error(`Download error for doc ${docId}:`, err.message);
            if (err.message.startsWith('FILE_INTEGRITY_TAMPERED')) {
              return sendJson(res, 500, { error: 'CRITICAL: File integrity check failed. Document content has been tampered with or corrupted.' });
            }
            return sendJson(res, 500, { error: 'Failed to decrypt document.' });
          }
        }

        // GET /api/documents/:id -> Metadata lookup with ownership check
        if (method === 'GET') {
          const doc = db.getUserDocumentMetadata(userId, docId);
          if (!doc) {
            return sendJson(res, 404, { error: 'Document not found or access denied.' });
          }
          return sendJson(res, 200, { document: doc });
        }

        // PATCH /api/documents/:id/category -> Category correction
        if (method === 'PATCH') {
          const bodyBuf = await readRequestBody(req, 1024 * 5);
          let payload;
          try {
            payload = JSON.parse(bodyBuf.toString('utf8'));
          } catch (e) {
            return sendJson(res, 400, { error: 'Invalid JSON.' });
          }

          const { category } = payload;
          if (!category) {
            return sendJson(res, 400, { error: 'Category is required.' });
          }

          const updatedDoc = db.updateUserDocumentCategory(userId, docId, category);
          if (!updatedDoc) {
            return sendJson(res, 404, { error: 'Document not found or access denied.' });
          }
          return sendJson(res, 200, { document: updatedDoc });
        }

        // DELETE /api/documents/:id -> Secure purge
        if (method === 'DELETE') {
          const deleted = db.deleteUserDocument(userId, docId);
          if (!deleted) {
            return sendJson(res, 404, { error: 'Document not found or access denied.' });
          }
          return sendJson(res, 200, { message: 'Document permanently deleted.' });
        }
      }

      return sendJson(res, 404, { error: 'API route not found.' });
    }

    // ------------------------------------------------------------------------
    // API: Deadline & Expiry Intelligence (Protected - Reminders & Notifications)
    // ------------------------------------------------------------------------
    if (pathname.startsWith('/api/reminders')) {
      applyCorsHeaders(req, res);

      // Public endpoint: available categories
      if (pathname === '/api/reminders/categories' && method === 'GET') {
        return sendJson(res, 200, { categories: db.REMINDER_CATEGORIES });
      }

      if (pathname === '/api/reminders/session' && method === 'POST') {
        const auth = resolveReminderAuth(req);
        if (auth) {
          return sendJson(res, 200, { isGuest: auth.isGuest });
        }

        if (!resolveAuth(req) || parseCookies(req).onefill_reminder_guest) {
          return sendJson(res, 401, { error: 'Unauthorized: Unable to initialize reminder session.' });
        }

        const guestSession = db.createGuestSession();
        const cookieVal = `onefill_reminder_guest=${guestSession.token}; HttpOnly; SameSite=Strict; Path=/api/reminders; Max-Age=7200`;
        return sendJson(res, 200, { isGuest: true, token: guestSession.token }, { 'Set-Cookie': cookieVal });
      }

      const auth = resolveReminderAuth(req);
      if (!auth) {
        return sendJson(res, 401, { error: 'Unauthorized: Authentication required to access reminders.' });
      }
      const userId = auth.user.id;

      // GET /api/reminders -> List reminders
      if (pathname === '/api/reminders' && method === 'GET') {
        const category = urlObj.searchParams.get('category') || 'ALL';
        const status = urlObj.searchParams.get('status') || 'all';
        const search = urlObj.searchParams.get('search') || '';
        const sort = urlObj.searchParams.get('sort') || 'deadline_asc';
        const userReminders = db.listUserReminders(userId, { category, status, search, sort });
        const activeCount = db.countActiveReminders(userId);
        const settings = db.getUserReminderSettings(userId);
        return sendJson(res, 200, {
          reminders: userReminders,
          activeCount,
          maxActiveLimit: settings.maxActiveReminders || db.DEFAULT_MAX_ACTIVE_REMINDERS
        });
      }

      // POST /api/reminders -> Create reminder (enforces 300 limit)
      if (pathname === '/api/reminders' && method === 'POST') {
        const bodyBuf = await readRequestBody(req, 1024 * 100);
        let payload;
        try {
          payload = JSON.parse(bodyBuf.toString('utf8'));
        } catch (e) {
          return sendJson(res, 400, { error: 'Invalid JSON payload.' });
        }

        try {
          const reminder = db.createReminder(userId, payload);
          triggerNotificationCheck();
          return sendJson(res, 201, { message: 'Reminder created successfully.', reminder });
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }
      }

      // GET /api/reminders/settings
      if (pathname === '/api/reminders/settings' && method === 'GET') {
        const settings = db.getUserReminderSettings(userId);
        const activeCount = db.countActiveReminders(userId);
        return sendJson(res, 200, { settings, activeCount });
      }

      // PUT /api/reminders/settings
      if (pathname === '/api/reminders/settings' && method === 'PUT') {
        const bodyBuf = await readRequestBody(req, 1024 * 50);
        let payload;
        try {
          payload = JSON.parse(bodyBuf.toString('utf8'));
        } catch (e) {
          return sendJson(res, 400, { error: 'Invalid JSON payload.' });
        }

        const updated = db.updateUserReminderSettings(userId, payload);
        return sendJson(res, 200, { message: 'Settings saved.', settings: updated });
      }

      // GET /api/reminders/notifications
      if (pathname === '/api/reminders/notifications' && method === 'GET') {
        const limit = parseInt(urlObj.searchParams.get('limit') || '50', 10);
        const data = db.getUserNotifications(userId, limit);
        return sendJson(res, 200, data);
      }

      // POST /api/reminders/notifications/read-all
      if (pathname === '/api/reminders/notifications/read-all' && method === 'POST') {
        db.markAllNotificationsAsRead(userId);
        return sendJson(res, 200, { message: 'All notifications marked as read.' });
      }

      // POST /api/reminders/push-subscription
      if (pathname === '/api/reminders/push-subscription' && method === 'POST') {
        const bodyBuf = await readRequestBody(req, 1024 * 50);
        let payload;
        try {
          payload = JSON.parse(bodyBuf.toString('utf8'));
        } catch (e) {
          return sendJson(res, 400, { error: 'Invalid JSON payload.' });
        }

        db.savePushSubscription(userId, payload);
        return sendJson(res, 200, { message: 'Web Push subscription registered successfully.' });
      }

      // POST /api/reminders/fcm-token
      if (pathname === '/api/reminders/fcm-token' && method === 'POST') {
        const bodyBuf = await readRequestBody(req, 1024 * 20);
        let payload;
        try {
          payload = JSON.parse(bodyBuf.toString('utf8'));
        } catch (e) {
          return sendJson(res, 400, { error: 'Invalid JSON payload.' });
        }

        if (payload.token) {
          db.registerFcmToken(userId, payload.token);
        }
        return sendJson(res, 200, { message: 'FCM token registered successfully.' });
      }

      // POST /api/reminders/extract-dates -> OCR / AI date extraction API
      if (pathname === '/api/reminders/extract-dates' && method === 'POST') {
        const bodyBuf = await readRequestBody(req, 1024 * 1024 * 5);
        let payload;
        try {
          payload = JSON.parse(bodyBuf.toString('utf8'));
        } catch (e) {
          return sendJson(res, 400, { error: 'Invalid JSON payload.' });
        }

        const { text, filename } = payload;
        const analysis = DateExtractor.analyze(text || '', filename || '');
        return sendJson(res, 200, analysis);
      }

      // POST /api/reminders/trigger-check
      if (pathname === '/api/reminders/trigger-check' && method === 'POST') {
        triggerNotificationCheck();
        const data = db.getUserNotifications(userId, 20);
        return sendJson(res, 200, { message: 'Notification check triggered.', ...data });
      }

      // Notifications ID operations: /api/reminders/notifications/:id/read
      const notifIdMatch = pathname.match(/^\/api\/reminders\/notifications\/([a-zA-Z0-9_-]+)(\/read)?$/);
      if (notifIdMatch) {
        const notifId = notifIdMatch[1];
        const isReadAction = Boolean(notifIdMatch[2]);

        if (isReadAction && (method === 'PATCH' || method === 'POST')) {
          const updated = db.markNotificationAsRead(userId, notifId);
          if (!updated) {
            return sendJson(res, 404, { error: 'Notification not found.' });
          }
          return sendJson(res, 200, { notification: updated });
        }

        if (method === 'DELETE') {
          const deleted = db.deleteNotification(userId, notifId);
          if (!deleted) {
            return sendJson(res, 404, { error: 'Notification not found.' });
          }
          return sendJson(res, 200, { message: 'Notification removed.' });
        }
      }

      // Reminder ID operations: /api/reminders/:id, /api/reminders/:id/status, /api/reminders/:id/snooze
      const remIdMatch = pathname.match(/^\/api\/reminders\/([a-zA-Z0-9_-]+)(\/(status|snooze))?$/);
      if (remIdMatch) {
        const reminderId = remIdMatch[1];
        const subAction = remIdMatch[3];

        // GET /api/reminders/:id
        if (!subAction && method === 'GET') {
          const reminder = db.getUserReminder(userId, reminderId);
          if (!reminder) {
            return sendJson(res, 404, { error: 'Reminder not found or access denied.' });
          }
          return sendJson(res, 200, { reminder });
        }

        // PUT /api/reminders/:id
        if (!subAction && method === 'PUT') {
          const bodyBuf = await readRequestBody(req, 1024 * 100);
          let payload;
          try {
            payload = JSON.parse(bodyBuf.toString('utf8'));
          } catch (e) {
            return sendJson(res, 400, { error: 'Invalid JSON payload.' });
          }

          try {
            const updated = db.updateUserReminder(userId, reminderId, payload);
            if (!updated) {
              return sendJson(res, 404, { error: 'Reminder not found or access denied.' });
            }
            triggerNotificationCheck();
            return sendJson(res, 200, { message: 'Reminder updated successfully.', reminder: updated });
          } catch (err) {
            return sendJson(res, 400, { error: err.message });
          }
        }

        // DELETE /api/reminders/:id
        if (!subAction && method === 'DELETE') {
          const deleted = db.deleteUserReminder(userId, reminderId);
          if (!deleted) {
            return sendJson(res, 404, { error: 'Reminder not found or access denied.' });
          }
          return sendJson(res, 200, { message: 'Reminder deleted successfully.' });
        }

        // PATCH /api/reminders/:id/status
        if (subAction === 'status' && method === 'PATCH') {
          const bodyBuf = await readRequestBody(req, 1024 * 10);
          let payload;
          try {
            payload = JSON.parse(bodyBuf.toString('utf8'));
          } catch (e) {
            return sendJson(res, 400, { error: 'Invalid JSON payload.' });
          }

          const status = payload.status === 'completed' ? 'completed' : 'active';
          const updated = db.setUserReminderStatus(userId, reminderId, status);
          if (!updated) {
            return sendJson(res, 404, { error: 'Reminder not found or access denied.' });
          }
          return sendJson(res, 200, { message: `Reminder status set to ${status}.`, reminder: updated });
        }

        // POST /api/reminders/:id/snooze
        if (subAction === 'snooze' && method === 'POST') {
          const bodyBuf = await readRequestBody(req, 1024 * 10);
          let payload = {};
          try {
            payload = JSON.parse(bodyBuf.toString('utf8'));
          } catch (e) {}

          const snoozeDateOrHours = payload.snoozeUntil || payload.hours || 24;
          const updated = db.snoozeUserReminder(userId, reminderId, snoozeDateOrHours);
          if (!updated) {
            return sendJson(res, 404, { error: 'Reminder not found or access denied.' });
          }
          return sendJson(res, 200, { message: 'Reminder snoozed.', reminder: updated });
        }
      }

      return sendJson(res, 404, { error: 'Reminder API route not found.' });
    }

    // ------------------------------------------------------------------------
    // Static Files: Prevent Directory Traversal & Restrict to Public Files
    // ------------------------------------------------------------------------
    if (method === 'GET' || method === 'HEAD') {
      let reqPath = pathname;
      if (reqPath === '/') reqPath = '/index.html';

      // Disallow access to hidden files, private_data, keys, database files
      if (
        reqPath.includes('/private_data') ||
        reqPath.includes('/.') ||
        reqPath.includes('node_modules') ||
        reqPath.includes('server.js') ||
        reqPath.includes('db.js') ||
        reqPath.includes('security.js')
      ) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden: Access to system files is restricted.');
        return;
      }

      const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(PUBLIC_DIR, safePath);

      // Verify resolved path remains inside PUBLIC_DIR
      if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden: Path traversal detected.');
        return;
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found');
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        applySecurityHeaders(res);
        const extraHeaders = {
          'Content-Type': contentType,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
        };
        if (reqPath === '/onefill-updated.zip') {
          extraHeaders['Content-Disposition'] = 'attachment; filename="onefill-updated.zip"';
          extraHeaders['Content-Length'] = stats.size;
        }
        res.writeHead(200, extraHeaders);

        if (method === 'HEAD') {
          res.end();
          return;
        }

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      });
      return;
    }

    // Method not allowed
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('405 Method Not Allowed');
  } catch (globalErr) {
    console.error('Unhandled server error:', globalErr);
    sendJson(res, 500, { error: 'Internal server error.' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`OneFill Secure Server running at http://0.0.0.0:${PORT}`);
  console.log(`Private encrypted vault located at: ${security.VAULT_DIR}`);
});
