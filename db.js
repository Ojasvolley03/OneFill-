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
const REMINDERS_FILE = path.join(security.DATA_DIR, 'reminders.json');
const REMINDER_SETTINGS_FILE = path.join(security.DATA_DIR, 'reminder_settings.json');
const NOTIFICATIONS_FILE = path.join(security.DATA_DIR, 'notifications.json');

// Memory caches with disk synchronization
let users = [];
let sessions = {};
let documents = [];
let reminders = [];
let reminderSettings = {};
let notifications = [];

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

  try {
    if (fs.existsSync(REMINDERS_FILE)) {
      reminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
    } else {
      reminders = [];
      saveReminders();
    }
  } catch (err) {
    console.error('Error loading reminders:', err.message);
    reminders = [];
  }

  try {
    if (fs.existsSync(REMINDER_SETTINGS_FILE)) {
      reminderSettings = JSON.parse(fs.readFileSync(REMINDER_SETTINGS_FILE, 'utf8'));
    } else {
      reminderSettings = {};
      saveReminderSettings();
    }
  } catch (err) {
    console.error('Error loading reminder settings:', err.message);
    reminderSettings = {};
  }

  try {
    if (fs.existsSync(NOTIFICATIONS_FILE)) {
      notifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8'));
    } else {
      notifications = [];
      saveNotifications();
    }
  } catch (err) {
    console.error('Error loading notifications:', err.message);
    notifications = [];
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

function saveReminders() {
  atomicWrite(REMINDERS_FILE, reminders);
}

function saveReminderSettings() {
  atomicWrite(REMINDER_SETTINGS_FILE, reminderSettings);
}

function saveNotifications() {
  atomicWrite(NOTIFICATIONS_FILE, notifications);
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

const GUEST_USER = {
  id: 'usr_guest',
  email: 'guest@onefill.local',
  username: 'Guest User',
  createdAt: '2026-01-01T00:00:00.000Z'
};

function getUserById(userId) {
  if (userId === GUEST_USER.id) return GUEST_USER;
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

// --------------------------------------------------------------------------
// Deadline & Expiry Intelligence: Reminders, Settings & Notifications
// --------------------------------------------------------------------------

const REMINDER_CATEGORIES = [
  'Government & Identity',
  'Vehicle & Transportation',
  'Electricity & Household Bills',
  'Banking & Finance',
  'Medical & Healthcare',
  'Education & Student',
  'Personal & Family',
  'Insurance',
  'Government Schemes & Tax',
  'Others'
];

const DEFAULT_REMINDER_INTERVALS = [30, 15, 7, 3, 2, 1, 0];
const DEFAULT_MAX_ACTIVE_REMINDERS = 300;

function calculateDaysRemaining(deadlineDateStr) {
  if (!deadlineDateStr) return 0;
  const [year, month, day] = deadlineDateStr.split('-').map(Number);
  const targetDate = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffTime = targetDate.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function computeNextRepeatDate(currentDateStr, repeatOption) {
  if (!currentDateStr || !repeatOption || repeatOption === 'none') return null;
  const [year, month, day] = currentDateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  switch (repeatOption.toLowerCase()) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'half-yearly':
      date.setMonth(date.getMonth() + 6);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      return null;
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// User Reminder Settings
function getUserReminderSettings(userId) {
  if (!userId) return null;
  if (!reminderSettings[userId]) {
    reminderSettings[userId] = {
      userId,
      maxActiveReminders: DEFAULT_MAX_ACTIVE_REMINDERS,
      defaultIntervals: [...DEFAULT_REMINDER_INTERVALS],
      pushEnabled: true,
      inAppEnabled: true,
      soundEnabled: true,
      pushSubscriptions: [],
      fcmTokens: [],
      updatedAt: new Date().toISOString()
    };
    saveReminderSettings();
  }
  return reminderSettings[userId];
}

function updateUserReminderSettings(userId, patch = {}) {
  const current = getUserReminderSettings(userId);
  if (typeof patch.maxActiveReminders === 'number' && patch.maxActiveReminders > 0) {
    current.maxActiveReminders = Math.min(Math.max(1, patch.maxActiveReminders), 10000);
  }
  if (Array.isArray(patch.defaultIntervals)) {
    current.defaultIntervals = Array.from(new Set(patch.defaultIntervals.map(Number).filter(n => !isNaN(n) && n >= 0))).sort((a, b) => b - a);
  }
  if (typeof patch.pushEnabled === 'boolean') current.pushEnabled = patch.pushEnabled;
  if (typeof patch.inAppEnabled === 'boolean') current.inAppEnabled = patch.inAppEnabled;
  if (typeof patch.soundEnabled === 'boolean') current.soundEnabled = patch.soundEnabled;
  current.updatedAt = new Date().toISOString();
  saveReminderSettings();
  return current;
}

function savePushSubscription(userId, subscription) {
  if (!userId || !subscription || !subscription.endpoint) return false;
  const settings = getUserReminderSettings(userId);
  if (!Array.isArray(settings.pushSubscriptions)) {
    settings.pushSubscriptions = [];
  }
  const exists = settings.pushSubscriptions.find((s) => s.endpoint === subscription.endpoint);
  if (!exists) {
    settings.pushSubscriptions.push({
      ...subscription,
      subscribedAt: new Date().toISOString()
    });
    settings.pushEnabled = true;
    saveReminderSettings();
  }
  return true;
}

function registerFcmToken(userId, token) {
  if (!userId || !token) return false;
  const settings = getUserReminderSettings(userId);
  if (!Array.isArray(settings.fcmTokens)) {
    settings.fcmTokens = [];
  }
  if (!settings.fcmTokens.includes(token)) {
    settings.fcmTokens.push(token);
    settings.pushEnabled = true;
    saveReminderSettings();
  }
  return true;
}

// Reminders Management
function countActiveReminders(userId) {
  return reminders.filter((r) => r.userId === userId && r.status === 'active').length;
}

function createReminder(userId, data) {
  if (!userId) throw new Error('User ID required.');

  // Validate active limit (default 300, configurable)
  const settings = getUserReminderSettings(userId);
  const maxLimit = settings.maxActiveReminders || DEFAULT_MAX_ACTIVE_REMINDERS;
  const activeCount = countActiveReminders(userId);
  if (activeCount >= maxLimit) {
    throw new Error(`Active reminder limit reached (${maxLimit} max). Please mark completed, snooze, or remove inactive reminders.`);
  }

  const title = String(data.title || '').trim().slice(0, 200);
  if (!title) {
    throw new Error('Reminder title is required.');
  }

  const deadlineDate = String(data.deadlineDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadlineDate)) {
    throw new Error('Valid deadline date in YYYY-MM-DD format is required.');
  }

  const category = REMINDER_CATEGORIES.includes(data.category) ? data.category : 'Others';

  // Process reminder intervals (e.g. 30, 15, 7, 3, 2, 1, 0, or custom)
  let intervals = DEFAULT_REMINDER_INTERVALS;
  if (Array.isArray(data.intervals) && data.intervals.length > 0) {
    intervals = Array.from(new Set(data.intervals.map(Number).filter(n => !isNaN(n) && n >= 0))).sort((a, b) => b - a);
  }

  // Optional document link validation
  let documentId = null;
  if (data.documentId) {
    const doc = documents.find((d) => d.id === data.documentId && d.userId === userId);
    if (doc) {
      documentId = doc.id;
    }
  }

  const reminder = {
    id: 'rem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
    userId,
    title,
    category,
    documentId,
    deadlineDate,
    deadlineTime: data.deadlineTime ? String(data.deadlineTime).trim().slice(0, 10) : '09:00',
    amount: data.amount ? String(data.amount).trim().slice(0, 50) : null,
    intervals,
    repeatOption: ['none', 'daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly'].includes(String(data.repeatOption).toLowerCase())
      ? String(data.repeatOption).toLowerCase()
      : 'none',
    notificationsEnabled: data.notificationsEnabled !== false,
    inAppEnabled: data.inAppEnabled !== false,
    pushEnabled: data.pushEnabled !== false,
    priority: ['high', 'normal', 'low'].includes(String(data.priority).toLowerCase()) ? String(data.priority).toLowerCase() : 'normal',
    notes: data.notes ? String(data.notes).trim().slice(0, 1000) : '',
    status: 'active', // 'active' | 'completed' | 'snoozed'
    snoozedUntil: null,
    lastNotifiedIntervals: [],
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  reminders.push(reminder);
  saveReminders();

  return formatReminderWithComputed(userId, reminder);
}

function formatReminderWithComputed(userId, reminder) {
  const daysRemaining = calculateDaysRemaining(reminder.deadlineDate);
  let attachedDoc = null;
  if (reminder.documentId) {
    const doc = documents.find((d) => d.id === reminder.documentId && d.userId === userId);
    if (doc) {
      attachedDoc = sanitizeDocMetadata(doc);
    }
  }

  return {
    ...reminder,
    daysRemaining,
    isOverdue: daysRemaining < 0 && reminder.status === 'active',
    isDueToday: daysRemaining === 0 && reminder.status === 'active',
    isDueSoon: daysRemaining > 0 && daysRemaining <= 7 && reminder.status === 'active',
    attachedDocument: attachedDoc
  };
}

function listUserReminders(userId, filters = {}) {
  let userReminders = reminders.filter((r) => r.userId === userId);

  // Category filter
  if (filters.category && filters.category !== 'ALL') {
    userReminders = userReminders.filter((r) => r.category === filters.category);
  }

  // Search filter
  if (filters.search && filters.search.trim()) {
    const q = filters.search.toLowerCase().trim();
    userReminders = userReminders.filter((r) => {
      return (
        r.title.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.notes && r.notes.toLowerCase().includes(q)) ||
        (r.amount && r.amount.toLowerCase().includes(q))
      );
    });
  }

  // Status filter: 'all', 'active', 'upcoming', 'due_soon', 'overdue', 'completed', 'snoozed'
  const now = new Date();
  if (filters.status && filters.status !== 'all') {
    const s = filters.status.toLowerCase();
    userReminders = userReminders.filter((r) => {
      const days = calculateDaysRemaining(r.deadlineDate);
      if (s === 'active') return r.status === 'active';
      if (s === 'completed') return r.status === 'completed';
      if (s === 'snoozed') return r.status === 'snoozed';
      if (s === 'overdue' || s === 'expired') return r.status === 'active' && days < 0;
      if (s === 'due_soon') return r.status === 'active' && days >= 0 && days <= 7;
      if (s === 'upcoming') return r.status === 'active' && days >= 0;
      return true;
    });
  }

  // Sorting
  const sort = filters.sort || 'deadline_asc';
  userReminders.sort((a, b) => {
    if (sort === 'deadline_desc') {
      return new Date(b.deadlineDate) - new Date(a.deadlineDate);
    }
    if (sort === 'created_desc') {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
    if (sort === 'title_asc') {
      return a.title.localeCompare(b.title);
    }
    // Default deadline_asc: soonest first
    return new Date(a.deadlineDate) - new Date(b.deadlineDate);
  });

  return userReminders.map((r) => formatReminderWithComputed(userId, r));
}

function getUserReminder(userId, reminderId) {
  const reminder = reminders.find((r) => r.id === reminderId && r.userId === userId);
  if (!reminder) return null;
  return formatReminderWithComputed(userId, reminder);
}

function updateUserReminder(userId, reminderId, patch) {
  const reminder = reminders.find((r) => r.id === reminderId && r.userId === userId);
  if (!reminder) return null;

  if (patch.title !== undefined) {
    const title = String(patch.title || '').trim().slice(0, 200);
    if (!title) throw new Error('Reminder title cannot be empty.');
    reminder.title = title;
  }

  if (patch.category !== undefined && REMINDER_CATEGORIES.includes(patch.category)) {
    reminder.category = patch.category;
  }

  if (patch.deadlineDate !== undefined) {
    const d = String(patch.deadlineDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      throw new Error('Valid deadline date in YYYY-MM-DD format required.');
    }
    // If deadline date changed, reset notified intervals so upcoming alerts fire
    if (reminder.deadlineDate !== d) {
      reminder.deadlineDate = d;
      reminder.lastNotifiedIntervals = [];
      if (reminder.status === 'completed') {
        reminder.status = 'active';
        reminder.completedAt = null;
      }
    }
  }

  if (patch.deadlineTime !== undefined) {
    reminder.deadlineTime = patch.deadlineTime ? String(patch.deadlineTime).trim().slice(0, 10) : '09:00';
  }

  if (patch.amount !== undefined) {
    reminder.amount = patch.amount ? String(patch.amount).trim().slice(0, 50) : null;
  }

  if (Array.isArray(patch.intervals)) {
    reminder.intervals = Array.from(new Set(patch.intervals.map(Number).filter(n => !isNaN(n) && n >= 0))).sort((a, b) => b - a);
  }

  if (patch.repeatOption !== undefined) {
    reminder.repeatOption = ['none', 'daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly'].includes(String(patch.repeatOption).toLowerCase())
      ? String(patch.repeatOption).toLowerCase()
      : 'none';
  }

  if (patch.notificationsEnabled !== undefined) reminder.notificationsEnabled = Boolean(patch.notificationsEnabled);
  if (patch.inAppEnabled !== undefined) reminder.inAppEnabled = Boolean(patch.inAppEnabled);
  if (patch.pushEnabled !== undefined) reminder.pushEnabled = Boolean(patch.pushEnabled);
  if (patch.priority !== undefined) reminder.priority = patch.priority;
  if (patch.notes !== undefined) reminder.notes = String(patch.notes || '').trim().slice(0, 1000);

  if (patch.documentId !== undefined) {
    if (patch.documentId === null || patch.documentId === '') {
      reminder.documentId = null;
    } else {
      const doc = documents.find((d) => d.id === patch.documentId && d.userId === userId);
      if (doc) reminder.documentId = doc.id;
    }
  }

  reminder.updatedAt = new Date().toISOString();
  saveReminders();

  return formatReminderWithComputed(userId, reminder);
}

function setUserReminderStatus(userId, reminderId, status) {
  const reminder = reminders.find((r) => r.id === reminderId && r.userId === userId);
  if (!reminder) return null;

  if (status === 'completed') {
    reminder.status = 'completed';
    reminder.completedAt = new Date().toISOString();

    // Check repeat option
    if (reminder.repeatOption && reminder.repeatOption !== 'none') {
      const nextDate = computeNextRepeatDate(reminder.deadlineDate, reminder.repeatOption);
      if (nextDate) {
        reminder.deadlineDate = nextDate;
        reminder.status = 'active';
        reminder.completedAt = null;
        reminder.lastNotifiedIntervals = [];

        // Generate auto-repeat confirmation notification
        createNotification(userId, {
          reminderId: reminder.id,
          reminderTitle: reminder.title,
          reminderCategory: reminder.category,
          type: 'system',
          intervalDays: calculateDaysRemaining(nextDate),
          title: `🔄 Scheduled Next Cycle: ${reminder.title}`,
          message: `Reminder completed and automatically renewed for ${nextDate} (${reminder.repeatOption}).`
        });
      }
    }
  } else if (status === 'active') {
    reminder.status = 'active';
    reminder.completedAt = null;
    reminder.snoozedUntil = null;
  }

  reminder.updatedAt = new Date().toISOString();
  saveReminders();

  return formatReminderWithComputed(userId, reminder);
}

function snoozeUserReminder(userId, reminderId, snoozeDateOrHours) {
  const reminder = reminders.find((r) => r.id === reminderId && r.userId === userId);
  if (!reminder) return null;

  let snoozeUntil;
  if (typeof snoozeDateOrHours === 'number') {
    snoozeUntil = new Date(Date.now() + snoozeDateOrHours * 60 * 60 * 1000).toISOString();
  } else if (typeof snoozeDateOrHours === 'string') {
    snoozeUntil = new Date(snoozeDateOrHours).toISOString();
  } else {
    // Default 1 day
    snoozeUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }

  reminder.status = 'snoozed';
  reminder.snoozedUntil = snoozeUntil;
  reminder.updatedAt = new Date().toISOString();
  saveReminders();

  // Create notification
  createNotification(userId, {
    reminderId: reminder.id,
    reminderTitle: reminder.title,
    reminderCategory: reminder.category,
    type: 'snoozed',
    intervalDays: 0,
    title: `💤 Snoozed: ${reminder.title}`,
    message: `Reminder snoozed until ${new Date(snoozeUntil).toLocaleString()}.`
  });

  return formatReminderWithComputed(userId, reminder);
}

function deleteUserReminder(userId, reminderId) {
  const index = reminders.findIndex((r) => r.id === reminderId && r.userId === userId);
  if (index === -1) return false;

  reminders.splice(index, 1);
  saveReminders();

  // Clean up notifications for this reminder
  notifications = notifications.filter((n) => !(n.userId === userId && n.reminderId === reminderId));
  saveNotifications();

  return true;
}

// Notifications Management
function createNotification(userId, data) {
  if (!userId) return null;

  const notif = {
    id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
    userId,
    reminderId: data.reminderId || null,
    reminderTitle: data.reminderTitle || 'Reminder',
    reminderCategory: data.reminderCategory || 'Others',
    type: data.type || 'upcoming', // 'upcoming' | 'due_today' | 'overdue' | 'snoozed' | 'system'
    intervalDays: typeof data.intervalDays === 'number' ? data.intervalDays : null,
    title: data.title || 'Deadline Alert',
    message: data.message || '',
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString()
  };

  notifications.unshift(notif);
  // Cap notifications history per user to recent 200
  const userNotifs = notifications.filter((n) => n.userId === userId);
  if (userNotifs.length > 200) {
    const toRemove = new Set(userNotifs.slice(200).map((n) => n.id));
    notifications = notifications.filter((n) => !toRemove.has(n.id));
  }

  saveNotifications();
  return notif;
}

function getUserNotifications(userId, limit = 50) {
  if (!userId) return [];
  const userNotifs = notifications.filter((n) => n.userId === userId);
  userNotifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const unreadCount = userNotifs.filter((n) => !n.isRead).length;
  return {
    notifications: userNotifs.slice(0, limit),
    unreadCount,
    totalCount: userNotifs.length
  };
}

function markNotificationAsRead(userId, notifId) {
  const notif = notifications.find((n) => n.id === notifId && n.userId === userId);
  if (!notif) return null;
  notif.isRead = true;
  notif.readAt = new Date().toISOString();
  saveNotifications();
  return notif;
}

function markAllNotificationsAsRead(userId) {
  let changed = false;
  const now = new Date().toISOString();
  notifications.forEach((n) => {
    if (n.userId === userId && !n.isRead) {
      n.isRead = true;
      n.readAt = now;
      changed = true;
    }
  });
  if (changed) saveNotifications();
  return true;
}

function deleteNotification(userId, notifId) {
  const index = notifications.findIndex((n) => n.id === notifId && n.userId === userId);
  if (index === -1) return false;
  notifications.splice(index, 1);
  saveNotifications();
  return true;
}

// --------------------------------------------------------------------------
// Automated Backend Scheduler Engine
// Evaluates active deadlines against selected intervals, generates notifications,
// prevents duplicates, un-snoozes expired snoozes, and dispatches external alerts.
// --------------------------------------------------------------------------
function checkDueRemindersAndGenerateNotifications(onPushTrigger = null) {
  let changed = false;
  const now = new Date();

  for (const reminder of reminders) {
    // 1. Check if snoozed status has expired
    if (reminder.status === 'snoozed') {
      if (reminder.snoozedUntil && new Date(reminder.snoozedUntil) <= now) {
        reminder.status = 'active';
        reminder.snoozedUntil = null;
        reminder.updatedAt = now.toISOString();
        changed = true;
      } else {
        // Still actively snoozed, skip alerts
        continue;
      }
    }

    if (reminder.status !== 'active') continue;
    if (!reminder.notificationsEnabled) continue;

    const daysRemaining = calculateDaysRemaining(reminder.deadlineDate);
    const intervals = reminder.intervals || DEFAULT_REMINDER_INTERVALS;
    if (!Array.isArray(reminder.lastNotifiedIntervals)) {
      reminder.lastNotifiedIntervals = [];
    }

    // Interval checks: e.g. 30, 15, 7, 3, 2, 1, 0 days remaining
    for (const interval of intervals) {
      if (daysRemaining <= interval && daysRemaining >= 0) {
        const intervalKey = String(interval);
        if (!reminder.lastNotifiedIntervals.includes(intervalKey)) {
          reminder.lastNotifiedIntervals.push(intervalKey);
          changed = true;

          const isToday = interval === 0 || daysRemaining === 0;
          const notifTitle = isToday
            ? `🚨 Payment/Deadline Due Today: ${reminder.title}`
            : `⏰ ${interval} Day${interval > 1 ? 's' : ''} Remaining: ${reminder.title}`;

          const notifMsg = isToday
            ? `Your deadline for "${reminder.title}" (${reminder.category}) is TODAY (${reminder.deadlineDate}).` + (reminder.amount ? ` Amount due: ${reminder.amount}` : '')
            : `"${reminder.title}" is due in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''} on ${reminder.deadlineDate}.` + (reminder.amount ? ` Amount: ${reminder.amount}` : '');

          const notif = createNotification(reminder.userId, {
            reminderId: reminder.id,
            reminderTitle: reminder.title,
            reminderCategory: reminder.category,
            type: isToday ? 'due_today' : 'upcoming',
            intervalDays: daysRemaining,
            title: notifTitle,
            message: notifMsg
          });

          if (onPushTrigger && reminder.pushEnabled) {
            try {
              onPushTrigger({
                userId: reminder.userId,
                reminder,
                notification: notif
              });
            } catch (err) {
              console.warn('Push trigger notification error:', err.message);
            }
          }
        }
      }
    }

    // Overdue check (daysRemaining < 0)
    if (daysRemaining < 0) {
      const overdueKey = 'overdue';
      if (!reminder.lastNotifiedIntervals.includes(overdueKey)) {
        reminder.lastNotifiedIntervals.push(overdueKey);
        changed = true;

        const notif = createNotification(reminder.userId, {
          reminderId: reminder.id,
          reminderTitle: reminder.title,
          reminderCategory: reminder.category,
          type: 'overdue',
          intervalDays: daysRemaining,
          title: `⚠️ Overdue / Expired: ${reminder.title}`,
          message: `The deadline for "${reminder.title}" passed on ${reminder.deadlineDate} (${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) > 1 ? 's' : ''} ago).` + (reminder.amount ? ` Amount: ${reminder.amount}` : '')
        });

        if (onPushTrigger && reminder.pushEnabled) {
          try {
            onPushTrigger({
              userId: reminder.userId,
              reminder,
              notification: notif
            });
          } catch (err) {
            console.warn('Push trigger notification error:', err.message);
          }
        }
      }
    }
  }

  if (changed) {
    saveReminders();
  }
}

module.exports = {
  GUEST_USER,
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
  deleteUserProfile,

  // Deadline & Expiry Intelligence exports
  REMINDER_CATEGORIES,
  DEFAULT_REMINDER_INTERVALS,
  DEFAULT_MAX_ACTIVE_REMINDERS,
  calculateDaysRemaining,
  getUserReminderSettings,
  updateUserReminderSettings,
  savePushSubscription,
  registerFcmToken,
  countActiveReminders,
  createReminder,
  listUserReminders,
  getUserReminder,
  updateUserReminder,
  setUserReminderStatus,
  snoozeUserReminder,
  deleteUserReminder,
  createNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  checkDueRemindersAndGenerateNotifications
};

