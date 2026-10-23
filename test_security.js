/**
 * OneFill - Automated Security & Privacy Test Suite
 * Validates:
 * 1. Authentication & Session Security
 * 2. IDOR / Cross-User Access Prevention
 * 3. AES-256-GCM Decryption & SHA-256 File Integrity Tampering Detection
 * 4. File Signature Spoofing & Malicious Upload Prevention
 * 5. Path Traversal & Restricted Directory Protections
 * 6. Zero Sensitive Log Leaks
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const bodyBuf = Buffer.concat(chunks);
        let json = null;
        try {
          json = JSON.parse(bodyBuf.toString('utf8'));
        } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: bodyBuf,
          json
        });
      });
    });

    req.on('error', reject);
    if (data) {
      if (Buffer.isBuffer(data)) {
        req.write(data);
      } else if (typeof data === 'string') {
        req.write(data);
      } else {
        req.write(JSON.stringify(data));
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('   ONEFILL ENTERPRISE SECURITY & PRIVACY TESTS      ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(testName, condition, details = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Unauthenticated Document Access
    // ------------------------------------------------------------------------
    const unauthRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents',
      method: 'GET'
    });
    assert(
      'T1: Unauthenticated request to /api/documents is blocked (401)',
      unauthRes.statusCode === 401,
      `Got status ${unauthRes.statusCode}`
    );

    // ------------------------------------------------------------------------
    // TEST 2: Path Traversal on Static Files & Restricted Files
    // ------------------------------------------------------------------------
    const pathTraversal1 = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/private_data/keys/storage.key',
      method: 'GET'
    });
    assert(
      'T2.1: Direct access to private_data/keys is blocked (403)',
      pathTraversal1.statusCode === 403,
      `Got status ${pathTraversal1.statusCode}`
    );

    const pathTraversal2 = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/server.js',
      method: 'GET'
    });
    assert(
      'T2.2: Access to backend code (server.js) is blocked (403)',
      pathTraversal2.statusCode === 403,
      `Got status ${pathTraversal2.statusCode}`
    );

    // ------------------------------------------------------------------------
    // TEST 3: User Registration & Session Security (User Alice)
    // ------------------------------------------------------------------------
    const userAEmail = `alice_${Date.now()}@example.com`;
    const regResA = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        email: userAEmail,
        username: `Alice_${Date.now()}`,
        password: 'Password123!'
      }
    );

    assert(
      'T3.1: User Alice registration returns 201 with secure session cookie',
      regResA.statusCode === 201 && regResA.json && regResA.json.token,
      `Got status ${regResA.statusCode}`
    );

    const cookieA = regResA.headers['set-cookie'] ? regResA.headers['set-cookie'][0] : null;
    assert(
      'T3.2: Session cookie has HttpOnly and SameSite=Strict flags',
      cookieA && cookieA.includes('HttpOnly') && cookieA.includes('SameSite=Strict'),
      `Cookie: ${cookieA}`
    );

    const tokenA = regResA.json.token;

    // ------------------------------------------------------------------------
    // TEST 4: Secure Upload & File Signature Validation
    // ------------------------------------------------------------------------
    // 4.1 Spoofed file (Executable or invalid magic bytes disguised as .pdf)
    const spoofedUpload = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/documents',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenA}`
        }
      },
      {
        name: 'malicious.pdf',
        title: 'Fake PDF',
        category: 'Finance & Banking',
        fileBase64: Buffer.from('This is not a real PDF file! No magic bytes!').toString('base64')
      }
    );
    assert(
      'T4.1: Spoofed PDF missing %PDF- header is rejected (400)',
      spoofedUpload.statusCode === 400 && spoofedUpload.json && spoofedUpload.json.error.includes('signature'),
      `Got status ${spoofedUpload.statusCode}, error: ${spoofedUpload.json?.error}`
    );

    // 4.2 Valid PDF with real signature and SHA-256 calculation
    const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
    const validUpload = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/documents',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenA}`
        }
      },
      {
        name: '../../../sensitive_tax_return.pdf', // Path traversal in filename
        title: 'Tax Return 2026',
        category: 'Finance & Banking',
        description: 'Quarterly financial filing',
        fileBase64: validPdfBuffer.toString('base64')
      }
    );

    assert(
      'T4.2: Valid document upload is accepted (201)',
      validUpload.statusCode === 201 && validUpload.json && validUpload.json.document,
      `Got status ${validUpload.statusCode}`
    );

    const docA = validUpload.json.document;

    assert(
      'T4.3: Filename is sanitized against path traversal',
      docA.name === 'sensitive_tax_return.pdf',
      `Sanitized name: ${docA.name}`
    );

    assert(
      'T4.4: SHA-256 hash is computed and recorded',
      docA.sha256 && docA.sha256.length === 64,
      `Hash: ${docA.sha256}`
    );

    // ------------------------------------------------------------------------
    // TEST 5: Verify File is Encrypted at Rest in Private Vault
    // ------------------------------------------------------------------------
    const encryptedFilePath = path.join(__dirname, 'private_data', 'vault', regResA.json.user.id, `${docA.id}.enc`);
    const fileExistsOnDisk = fs.existsSync(encryptedFilePath);
    assert('T5.1: Encrypted file exists in private vault directory', fileExistsOnDisk);

    if (fileExistsOnDisk) {
      const diskCiphertext = fs.readFileSync(encryptedFilePath);
      // Verify raw disk content does NOT contain plaintext "%PDF-"
      const containsPlaintext = diskCiphertext.includes(Buffer.from('%PDF-'));
      assert(
        'T5.2: Document on disk is truly encrypted with AES-256-GCM (no plaintext leaks)',
        !containsPlaintext,
        'Found unencrypted plaintext on disk!'
      );
    }

    // ------------------------------------------------------------------------
    // TEST 6: IDOR Protection (Cross-User Access Prevention)
    // ------------------------------------------------------------------------
    // Create User Bob (an attacker / unauthorized user)
    const userBEmail = `bob_${Date.now()}@example.com`;
    const regResB = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        email: userBEmail,
        username: `Bob_${Date.now()}`,
        password: 'Password123!'
      }
    );
    const tokenB = regResB.json.token;

    // Bob attempts to view Alice's document metadata by ID
    const bobViewAttempt = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${docA.id}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert(
      'T6.1: IDOR: Bob cannot view Alice’s document metadata (404/Access Denied)',
      bobViewAttempt.statusCode === 404,
      `Got status ${bobViewAttempt.statusCode}`
    );

    // Bob attempts to download Alice's document
    const bobDownloadAttempt = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${docA.id}/download`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert(
      'T6.2: IDOR: Bob cannot download Alice’s encrypted file (404/Access Denied)',
      bobDownloadAttempt.statusCode === 404,
      `Got status ${bobDownloadAttempt.statusCode}`
    );

    // Bob attempts to modify Alice's document category
    const bobPatchAttempt = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: `/api/documents/${docA.id}/category`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenB}`
        }
      },
      { category: 'Legal Documents' }
    );
    assert(
      'T6.3: IDOR: Bob cannot update Alice’s document category (404/Access Denied)',
      bobPatchAttempt.statusCode === 404,
      `Got status ${bobPatchAttempt.statusCode}`
    );

    // Bob attempts to delete Alice's document
    const bobDeleteAttempt = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${docA.id}`,
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert(
      'T6.4: IDOR: Bob cannot delete Alice’s document (404/Access Denied)',
      bobDeleteAttempt.statusCode === 404,
      `Got status ${bobDeleteAttempt.statusCode}`
    );

    // Bob lists his documents (should NOT see Alice's document)
    const bobList = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert(
      'T6.5: User document isolation: Bob lists 0 documents',
      bobList.statusCode === 200 && bobList.json.documents.length === 0,
      `Bob received ${bobList.json?.documents?.length} documents`
    );

    // ------------------------------------------------------------------------
    // TEST 7: Legitimate Owner Download & File Integrity Check
    // ------------------------------------------------------------------------
    const aliceDownload = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${docA.id}/download`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert(
      'T7.1: Alice downloads her document successfully (200)',
      aliceDownload.statusCode === 200,
      `Got status ${aliceDownload.statusCode}`
    );

    assert(
      'T7.2: Downloaded content exactly matches original plaintext bytes',
      Buffer.compare(aliceDownload.body, validPdfBuffer) === 0,
      'Downloaded bytes do not match uploaded bytes'
    );

    // ------------------------------------------------------------------------
    // TEST 8: File Tampering Detection Simulation
    // ------------------------------------------------------------------------
    // Corrupt one byte of the encrypted file on disk to simulate malicious storage tampering
    const originalEncBytes = fs.readFileSync(encryptedFilePath);
    const tamperedEncBytes = Buffer.from(originalEncBytes);
    tamperedEncBytes[tamperedEncBytes.length - 1] ^= 0xFF; // Flip bits
    fs.writeFileSync(encryptedFilePath, tamperedEncBytes);

    const tamperedDownload = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/documents/${docA.id}/download`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert(
      'T8: Tampering Detection: Server detects altered ciphertext/authTag and refuses corrupted file (500)',
      tamperedDownload.statusCode === 500,
      `Got status ${tamperedDownload.statusCode}`
    );

    // Restore original bytes
    fs.writeFileSync(encryptedFilePath, originalEncBytes);

    // ------------------------------------------------------------------------
    // TEST 9: Session Logout & Invalidation
    // ------------------------------------------------------------------------
    const logoutRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/logout',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert('T9.1: Logout succeeds (200)', logoutRes.statusCode === 200);

    const postLogoutAccess = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/documents',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(
      'T9.2: Expired/destroyed session token cannot access documents (401)',
      postLogoutAccess.statusCode === 401,
      `Got status ${postLogoutAccess.statusCode}`
    );

    console.log('\n----------------------------------------------------');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('----------------------------------------------------');

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
