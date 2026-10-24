/**
 * OneFill - Secure Database & Storage Manager
 * Enforces strict user isolation, atomic storage operations,
 * and encrypted-at-rest document file custody.
 */

const fs = require('fs');
const path = require('path');
const security = require('./security');

const USERS_FILE = path.join(security.DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(security.DATA_DIR, 'sessions.json');
const DOCUMENTS_FILE = path.join(security.DATA_DIR, 'documents.json');

// Memory caches with disk synchronization
let users = [];
let sessions = {};
let documents = [];

function loadData() {
  security.ensureDirectories();

  try {
    if (fs.existsSync(USERS_FILE)) {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } else {
      users = [];
      saveUsers();
    }
  } catch (err) {
    console.error('Error loading users:', err.message);
    users = [];
  }

  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    } else {
      sessions = {};
      saveSessions();
    }
  } catch (err) {
    console.error('Error loading sessions:', err.message);
    sessions = {};
  }

  try {
    if (fs.existsSync(DOCUMENTS_FILE)) {
      documents = JSON.parse(fs.readFileSync(DOCUMENTS_FILE, 'utf8'));
    } else {
      documents = [];
      saveDocuments();
    }
  } catch (err) {
    console.error('Error loading documents:', err.message);
    documents = [];
  }
}

// Atomic file writer to avoid corruption
function atomicWrite(filePath, data) {
  const tempPath = `${filePath}.tmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function saveUsers() {
  atomicWrite(USERS_FILE, users);
}

function saveSessions() {
  atomicWrite(SESSIONS_FILE, sessions);
}

function saveDocuments() {
  atomicWrite(DOCUMENTS_FILE, documents);
}

// Initialize on startup
loadData();

// --------------------------------------------------------------------------
// User Management
// --------------------------------------------------------------------------

function createUser(email, username, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim();

  // Validate format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Invalid email address format.');
  }

  if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
    throw new Error('Username must be between 3 and 30 characters.');
  }

  // Check unique constraints
  const existing = users.find(
    (u) => u.email === normalizedEmail || u.username.toLowerCase() === normalizedUsername.toLowerCase()
  );
  if (existing) {
    throw new Error('An account with this email or username already exists.');
  }

  const { hash, salt } = security.hashPassword(password);
  const user = {
    id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
    email: normalizedEmail,
    username: normalizedUsername,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  saveUsers();

  return { id: user.id, email: user.email, username: user.username, createdAt: user.createdAt };
}

function authenticateUser(identifier, password) {
  const normalized = identifier.trim().toLowerCase();
  const user = users.find((u) => u.email === normalized || u.username.toLowerCase() === normalized);

  if (!user) return null;

  const valid = security.verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!valid) return null;

  return { id: user.id, email: user.email, username: user.username, createdAt: user.createdAt };
}

function getUserById(userId) {
  const user = users.find((u) => u.id === userId);
  if (!user) return null;
  return { id: user.id, email: user.email, username: user.username, createdAt: user.createdAt };
}

// --------------------------------------------------------------------------
// Session Management (2-hour sliding expiry)
// --------------------------------------------------------------------------

const SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

function createSession(userId) {
  // Clean expired sessions periodically
  cleanExpiredSessions();

  const token = security.generateSessionToken();
  const expiresAt = Date.now() + SESSION_DURATION_MS;

  sessions[token] = {
    userId,
    createdAt: Date.now(),
    expiresAt
  };

  saveSessions();
  return { token, expiresAt };
}

function validateSession(token) {
  if (!token || typeof token !== 'string') return null;

  const session = sessions[token];
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    delete sessions[token];
    saveSessions();
    return null;
  }

  // Sliding window: extend expiration
  session.expiresAt = Date.now() + SESSION_DURATION_MS;
  saveSessions();

  return session.userId;
}

function destroySession(token) {
  if (token && sessions[token]) {
    delete sessions[token];
    saveSessions();
  }
}

function cleanExpiredSessions() {
  const now = Date.now();
  let changed = false;
  for (const token in sessions) {
    if (sessions[token].expiresAt < now) {
      delete sessions[token];
      changed = true;
    }
  }
  if (changed) saveSessions();
}

// --------------------------------------------------------------------------
// Document Vault (Enforcing Strict User Isolation & AES-256-GCM at rest)
// --------------------------------------------------------------------------

function saveDocumentRecord(userId, metadata, fileBuffer) {
  // 1. Sanitize filename
  const cleanFilename = security.sanitizeFilename(metadata.name);

  // 2. Validate signature
  const validation = security.validateFileSignature(cleanFilename, fileBuffer);
  if (!validation.valid) {
    throw new Error(`Upload rejected: ${validation.reason}`);
  }

  // 3. Compute SHA-256 integrity hash
  const sha256 = security.computeSha256(fileBuffer);

  // 4. Encrypt file with AES-256-GCM
  const { ciphertext, iv, authTag } = security.encryptBuffer(fileBuffer);

  // 5. Write encrypted file to user's private vault directory
  const userVaultDir = path.join(security.VAULT_DIR, userId);
  if (!fs.existsSync(userVaultDir)) {
    fs.mkdirSync(userVaultDir, { recursive: true, mode: 0o700 });
  }

  const docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const encryptedFilePath = path.join(userVaultDir, `${docId}.enc`);
  fs.writeFileSync(encryptedFilePath, ciphertext, { mode: 0o600 });

  // 6. Record metadata with ownership binding
  const docRecord = {
    id: docId,
    userId: userId, // CRUCIAL: Binds ownership strictly to authenticated user
    name: cleanFilename,
    title: (metadata.title || cleanFilename).slice(0, 150),
    category: metadata.category || 'Other Documents',
    description: (metadata.description || '').slice(0, 500),
    size: fileBuffer.length,
    mimeType: validation.mime || metadata.mimeType || 'application/octet-stream',
    sha256: sha256,
    encryption: {
      algorithm: 'aes-256-gcm',
      iv: iv,
      authTag: authTag
    },
    extractedText: (metadata.extractedText || '').slice(0, 5000),
    thumbnail: metadata.thumbnail || null,
    status: 'Encrypted & Stored',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  documents.push(docRecord);
  saveDocuments();

  // Return public safe view of metadata (without IV/authTag details)
  return sanitizeDocMetadata(docRecord);
}

// List only documents owned by this user
function listUserDocuments(userId, filters = {}) {
  let userDocs = documents.filter((d) => d.userId === userId);

  if (filters.category && filters.category !== 'ALL') {
    userDocs = userDocs.filter((d) => d.category === filters.category);
  }

  if (filters.search && filters.search.trim()) {
    const q = filters.search.toLowerCase().trim();
    userDocs = userDocs.filter((d) => {
      return (
        d.title.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        (d.description && d.description.toLowerCase().includes(q)) ||
        (d.extractedText && d.extractedText.toLowerCase().includes(q))
      );
    });
  }

  // Sort newest first
  userDocs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return userDocs.map(sanitizeDocMetadata);
}

// Get single document metadata with strict authorization check
function getUserDocumentMetadata(userId, docId) {
  const doc = documents.find((d) => d.id === docId);
  // Authorization & IDOR protection: only return if userId matches
  if (!doc || doc.userId !== userId) {
    return null;
  }
  return sanitizeDocMetadata(doc);
}

// Decrypt and retrieve raw file buffer with SHA-256 integrity verification
function getUserDocumentFile(userId, docId) {
  const doc = documents.find((d) => d.id === docId);
  // Strict ownership check
  if (!doc || doc.userId !== userId) {
    return null;
  }

  const encryptedFilePath = path.join(security.VAULT_DIR, userId, `${docId}.enc`);
  if (!fs.existsSync(encryptedFilePath)) {
    throw new Error('Encrypted file storage record missing.');
  }

  const ciphertext = fs.readFileSync(encryptedFilePath);

  // 1. Decrypt using AES-256-GCM
  const plaintextBuffer = security.decryptBuffer(ciphertext, doc.encryption.iv, doc.encryption.authTag);

  // 2. Verify SHA-256 File Integrity
  const isIntact = security.verifyIntegrity(plaintextBuffer, doc.sha256);
  if (!isIntact) {
    console.error(`[SECURITY ALERT] Integrity mismatch for document ${docId}! File tampering detected.`);
    throw new Error('FILE_INTEGRITY_TAMPERED: Document contents failed cryptographic checksum validation.');
  }

  return {
    buffer: plaintextBuffer,
    name: doc.name,
    mimeType: doc.mimeType,
    sha256: doc.sha256,
    size: doc.size
  };
}

// Update category with ownership check
function updateUserDocumentCategory(userId, docId, newCategory) {
  const doc = documents.find((d) => d.id === docId);
  if (!doc || doc.userId !== userId) {
    return null;
  }

  doc.category = newCategory;
  doc.updatedAt = new Date().toISOString();
  saveDocuments();

  return sanitizeDocMetadata(doc);
}

// Delete document with ownership check
function deleteUserDocument(userId, docId) {
  const index = documents.findIndex((d) => d.id === docId);
  if (index === -1) return false;

  const doc = documents[index];
  if (doc.userId !== userId) {
    return false; // IDOR blocked
  }

  // Delete encrypted file from disk
  const encryptedFilePath = path.join(security.VAULT_DIR, userId, `${docId}.enc`);
  if (fs.existsSync(encryptedFilePath)) {
    try {
      fs.unlinkSync(encryptedFilePath);
    } catch (e) {
      console.warn('Failed removing encrypted file:', e.message);
    }
  }

  documents.splice(index, 1);
  saveDocuments();
  return true;
}

// Clear all documents owned by user
function clearAllUserDocuments(userId) {
  const userVaultDir = path.join(security.VAULT_DIR, userId);
  if (fs.existsSync(userVaultDir)) {
    try {
      fs.rmSync(userVaultDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed clearing user vault folder:', e.message);
    }
  }

  documents = documents.filter((d) => d.userId !== userId);
  saveDocuments();
  return true;
}

// Remove sensitive internal cryptographic details before returning to client
function sanitizeDocMetadata(doc) {
  return {
    id: doc.id,
    name: doc.name,
    title: doc.title,
    category: doc.category,
    description: doc.description,
    size: doc.size,
    mimeType: doc.mimeType,
    sha256: doc.sha256,
    extractedText: doc.extractedText,
    thumbnail: doc.thumbnail,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

// --------------------------------------------------------------------------
// AI AutoFill: Personal Information Profile (Encrypted with AES-256-GCM)
// --------------------------------------------------------------------------

function getDefaultProfile() {
  return {
    fullName: '',
    fatherName: '',
    motherName: '',
    email: '',
    phone: '',
    dob: '',
    gender: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
    college: '',
    university: '',
    course: '',
    branch: '',
    rollNumber: '',
    educationDetails: '',
    passingYear: '',
    cgpaOrPercentage: '',
    otherInfo: '',
    customFields: [],
    updatedAt: null
  };
}

function getUserProfile(userId) {
  if (!userId) return null;
  security.ensureDirectories();

  const profilePath = path.join(security.PROFILES_DIR, `${userId}.enc.json`);
  if (!fs.existsSync(profilePath)) {
    return getDefaultProfile();
  }

  try {
    const raw = fs.readFileSync(profilePath, 'utf8');
    const encRecord = JSON.parse(raw);
    const cipherBuf = Buffer.from(encRecord.ciphertext, 'base64');
    const plainBuf = security.decryptBuffer(cipherBuf, encRecord.iv, encRecord.authTag);
    const profile = JSON.parse(plainBuf.toString('utf8'));
    return { ...getDefaultProfile(), ...profile, updatedAt: encRecord.updatedAt || null };
  } catch (err) {
    console.error(`Failed to decrypt profile for user ${userId}:`, err.message);
    return getDefaultProfile();
  }
}

function saveUserProfile(userId, data = {}) {
  if (!userId) throw new Error('User ID required.');
  security.ensureDirectories();

  const current = getUserProfile(userId) || getDefaultProfile();

  // Sanitize incoming fields (keep optional)
  const allowedKeys = [
    'fullName', 'fatherName', 'motherName', 'email', 'phone', 'dob',
    'gender', 'address', 'city', 'state', 'zipCode', 'country',
    'college', 'university', 'course', 'branch', 'rollNumber',
    'educationDetails', 'passingYear', 'cgpaOrPercentage', 'otherInfo'
  ];

  const updated = { ...current };

  for (const key of allowedKeys) {
    if (key in data) {
      updated[key] = typeof data[key] === 'string' ? data[key].trim().slice(0, 300) : '';
    }
  }

  // Handle custom fields
  if (Array.isArray(data.customFields)) {
    updated.customFields = data.customFields
      .filter((f) => f && (f.label || f.key))
      .slice(0, 20)
      .map((f, idx) => ({
        key: (f.key || `custom_${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50),
        label: String(f.label || '').trim().slice(0, 80),
        value: String(f.value || '').trim().slice(0, 300)
      }));
  }

  const updatedAt = new Date().toISOString();
  updated.updatedAt = updatedAt;

  // Encrypt at rest with AES-256-GCM
  const plainBuf = Buffer.from(JSON.stringify(updated), 'utf8');
  const { ciphertext, iv, authTag } = security.encryptBuffer(plainBuf);

  const encRecord = {
    userId,
    iv,
    authTag,
    ciphertext: ciphertext.toString('base64'),
    updatedAt
  };

  const profilePath = path.join(security.PROFILES_DIR, `${userId}.enc.json`);
  atomicWrite(profilePath, encRecord);

  return updated;
}

function deleteUserProfile(userId) {
  if (!userId) return false;
  const profilePath = path.join(security.PROFILES_DIR, `${userId}.enc.json`);
  if (fs.existsSync(profilePath)) {
    try {
      fs.unlinkSync(profilePath);
      return true;
    } catch (e) {
      console.warn('Failed to delete profile file:', e.message);
      return false;
    }
  }
  return true;
}

module.exports = {
  createUser,
  authenticateUser,
  getUserById,
  createSession,
  validateSession,
  destroySession,
  saveDocumentRecord,
  listUserDocuments,
  getUserDocumentMetadata,
  getUserDocumentFile,
  updateUserDocumentCategory,
  deleteUserDocument,
  clearAllUserDocuments,
  getUserProfile,
  saveUserProfile,
  deleteUserProfile
};
