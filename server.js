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
  '.txt': 'text/plain; charset=utf-8'
};

// Security Headers applied to every response
function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; worker-src 'self' blob: https://cdnjs.cloudflare.com; connect-src 'self' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com;"
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

// Authentication resolver
function resolveAuth(req) {
  const cookies = parseCookies(req);
  let token = cookies.onefill_session;

  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }

  if (!token) return null;

  const userId = db.validateSession(token);
  if (!userId) return null;

  const user = db.getUserById(userId);
  if (!user) return null;

  return { user, token };
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
      const auth = resolveAuth(req);
      if (!auth) {
        return sendJson(res, 401, { authenticated: false });
      }
      return sendJson(res, 200, { authenticated: true, user: auth.user });
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
          bodyBuf = await readRequestBody(req, security.MAX_FILE_SIZE);
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

      // POST /api/documents/clear-all -> Requires reauthentication for sensitive operation
      if (pathname === '/api/documents/clear-all' && method === 'POST') {
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
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
        });

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

server.listen(PORT, () => {
  console.log(`OneFill Secure Server running at http://localhost:${PORT}`);
  console.log(`Private encrypted vault located at: ${security.VAULT_DIR}`);
});
