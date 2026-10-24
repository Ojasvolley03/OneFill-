/**
 * OneFill - Enterprise Security & Cryptography Engine
 * Handles AES-256-GCM encryption at rest, SHA-256 file integrity,
 * secure password hashing (scrypt), file signature validation, and path traversal protection.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'private_data');
const KEYS_DIR = path.join(DATA_DIR, 'keys');
const VAULT_DIR = path.join(DATA_DIR, 'vault');
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
const KEY_FILE = path.join(KEYS_DIR, 'storage.key');

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Ensure private directories exist with restricted access
function ensureDirectories() {
  [DATA_DIR, KEYS_DIR, VAULT_DIR, PROFILES_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  });
}

// Master Storage Key Management (AES-256)
let masterKey = null;

function getMasterKey() {
  if (masterKey) return masterKey;
  ensureDirectories();

  // Check for environment variable key first
  if (process.env.ONEFILL_STORAGE_KEY) {
    masterKey = Buffer.from(process.env.ONEFILL_STORAGE_KEY, 'hex');
    if (masterKey.length !== 32) {
      throw new Error('ONEFILL_STORAGE_KEY must be a 64-character hex string (32 bytes).');
    }
    return masterKey;
  }

  // Check key file
  if (fs.existsSync(KEY_FILE)) {
    const keyHex = fs.readFileSync(KEY_FILE, 'utf8').trim();
    masterKey = Buffer.from(keyHex, 'hex');
    if (masterKey.length !== 32) {
      throw new Error('Invalid key in storage.key');
    }
    return masterKey;
  }

  // Generate a cryptographically secure random 256-bit key
  masterKey = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, masterKey.toString('hex'), { mode: 0o600 });
  return masterKey;
}

// AES-256-GCM Encryption at Rest
function encryptBuffer(plainBuffer) {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

// AES-256-GCM Decryption with Auth Tag Verification
function decryptBuffer(ciphertext, ivHex, authTagHex) {
  const key = getMasterKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext;
}

// SHA-256 File Integrity Computation
function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Timing-safe verification of SHA-256 hash
function verifyIntegrity(buffer, expectedHexHash) {
  const actualHash = computeSha256(buffer);
  const actualBuf = Buffer.from(actualHash, 'utf8');
  const expectedBuf = Buffer.from(expectedHexHash, 'utf8');

  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

// Password Hashing via Scrypt + Unique Salt
function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  const salt = crypto.randomBytes(16);
  // Scrypt N=16384, r=8, p=1
  const hash = crypto.scryptSync(password, salt, 64);

  return {
    salt: salt.toString('hex'),
    hash: hash.toString('hex')
  };
}

function verifyPassword(password, storedHashHex, storedSaltHex) {
  const salt = Buffer.from(storedSaltHex, 'hex');
  const expectedHash = Buffer.from(storedHashHex, 'hex');
  const actualHash = crypto.scryptSync(password, salt, 64);

  if (actualHash.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(actualHash, expectedHash);
}

// Secure Session Token Generation
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Path Traversal & Filename Sanitization
function sanitizeFilename(originalName) {
  if (!originalName || typeof originalName !== 'string') return 'unnamed_document';
  
  // Extract file basename to remove directory indicators
  let clean = path.basename(originalName);
  // Remove null bytes and non-printable control characters
  clean = clean.replace(/[\x00-\x1f\x7f]/g, '');
  // Disallow relative navigation
  clean = clean.replace(/\.{2,}/g, '.');
  // Allow only safe characters
  clean = clean.replace(/[^a-zA-Z0-9._-]/g, '_');

  return clean.slice(0, 150) || 'unnamed_document';
}

// Magic Byte / File Signature Validation
function validateFileSignature(filename, buffer) {
  if (!buffer || buffer.length === 0) {
    return { valid: false, reason: 'Empty file buffer' };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    return { valid: false, reason: 'File exceeds 50MB maximum size limit' };
  }

  const ext = path.extname(filename).toLowerCase();

  // Disallow executable and script extensions explicitly
  const dangerousExtensions = [
    '.exe', '.bat', '.cmd', '.sh', '.bash', '.ps1', '.vbs', '.js', '.mjs',
    '.jar', '.msi', '.com', '.scr', '.pif', '.php', '.py', '.rb', '.pl',
    '.asp', '.aspx', '.jsp', '.cgi', '.dll', '.so', '.sys'
  ];

  if (dangerousExtensions.includes(ext)) {
    return { valid: false, reason: `File extension ${ext} is blocked for security reasons.` };
  }

  // Check magic bytes per extension
  if (ext === '.pdf') {
    // PDF starts with %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
    if (buffer.length < 5 || buffer.slice(0, 5).toString('ascii') !== '%PDF-') {
      return { valid: false, reason: 'Invalid PDF signature: File header does not match %PDF- format.' };
    }
    return { valid: true, mime: 'application/pdf' };
  }

  if (ext === '.png') {
    // PNG starts with 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    const pngMagic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    if (buffer.length < 8 || !pngMagic.every((byte, idx) => buffer[idx] === byte)) {
      return { valid: false, reason: 'Invalid PNG signature: Corrupted or spoofed image.' };
    }
    return { valid: true, mime: 'image/png' };
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    // JPEG starts with 0xFF 0xD8 0xFF
    if (buffer.length < 3 || buffer[0] !== 0xFF || buffer[1] !== 0xD8 || buffer[2] !== 0xFF) {
      return { valid: false, reason: 'Invalid JPEG signature: Corrupted or spoofed image.' };
    }
    return { valid: true, mime: 'image/jpeg' };
  }

  if (ext === '.docx' || ext === '.xlsx') {
    // ZIP header for OpenXML formats: PK\x03\x04 (0x50 0x4B 0x03 0x04)
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      return { valid: false, reason: 'Invalid Office document signature: Corrupted or spoofed file.' };
    }
    return { valid: true, mime: ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }

  if (['.txt', '.csv', '.json', '.md'].includes(ext)) {
    // Text formats: check for excessive null bytes or binary control characters
    const sample = buffer.slice(0, Math.min(buffer.length, 1024));
    let binaryCount = 0;
    for (let i = 0; i < sample.length; i++) {
      const b = sample[i];
      if (b === 0) return { valid: false, reason: 'Text file contains null bytes (binary disguised as text).' };
      if (b < 32 && b !== 9 && b !== 10 && b !== 13) binaryCount++;
    }
    if (binaryCount > 10) {
      return { valid: false, reason: 'Text file contains non-printable binary characters.' };
    }
    return { valid: true, mime: ext === '.json' ? 'application/json' : ext === '.csv' ? 'text/csv' : 'text/plain' };
  }

  // Other supported extensions fallback
  return { valid: true, mime: 'application/octet-stream' };
}

module.exports = {
  DATA_DIR,
  VAULT_DIR,
  PROFILES_DIR,
  MAX_FILE_SIZE,
  ensureDirectories,
  encryptBuffer,
  decryptBuffer,
  computeSha256,
  verifyIntegrity,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  sanitizeFilename,
  validateFileSignature
};
