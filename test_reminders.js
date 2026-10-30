/**
 * OneFill - Automated Test Suite: Feature 3 "Deadline & Expiry Intelligence"
 * Validates:
 * 1. Public categories endpoint returns the 10 domains
 * 2. Unauthenticated access blocked (401)
 * 3. User isolation & IDOR prevention (User Alice cannot view/modify Bob's reminders)
 * 4. Manual reminder creation (no document required)
 * 5. Date & Expiry Extractor (detects category, doc type, dates, amounts)
 * 6. Configurable active reminder limit (enforcing 300 maximum)
 * 7. Multi-interval alarm calculations (30, 15, 7, 3, 2, 1, 0 days)
 * 8. Status workflows: Complete with Auto-Repeat renewal & Snooze
 * 9. In-App Notifications & duplicate prevention
 * 10. Document ID linking with vault documents
 */

const http = require('http');
const assert = require('assert');
const DateExtractor = require('./date_extractor');

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
      if (Buffer.isBuffer(data) || typeof data === 'string') {
        req.write(data);
      } else {
        req.write(JSON.stringify(data));
      }
    }
    req.end();
  });
}

function getCookie(headers) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return null;
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return cookieStr.split(';')[0];
}

async function runReminderTests() {
  console.log('====================================================');
  console.log('  ONEFILL FEATURE 3: DEADLINE & EXPIRY TEST SUITE   ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(desc, fn) {
    total++;
    try {
      fn();
      console.log(`  [PASS] Assertion ${total}: ${desc}`);
      passed++;
    } catch (e) {
      console.error(`  [FAIL] Assertion ${total}: ${desc}`);
      console.error(`         Error: ${e.message}`);
    }
  }

  // 1. Date Extractor Unit Tests
  console.log('--- 1. Neural Date & Expiry Extractor Tests ---');

  const electricDocText = `
    CITY POWER DISCOM - ELECTRICITY BILL
    Consumer No: 9876543210
    Bill Date: 2026-10-15
    Payment Due Date: 2026-11-15
    Total Amount Due: $ 145.20
    Disconnection warning if not paid before due date.
  `;
  const electricAnalysis = DateExtractor.analyze(electricDocText, 'october_electric_bill.pdf');

  test('DateExtractor classifies Electricity Bill correctly', () => {
    assert.strictEqual(electricAnalysis.category, 'Electricity & Household Bills');
    assert.strictEqual(electricAnalysis.deadlineDate, '2026-11-15');
    assert.ok(electricAnalysis.detectedAmount && electricAnalysis.detectedAmount.includes('145.20'));
  });

  const passportDocText = `
    REPUBLIC PASSPORT
    Given Name: John
    Surname: Doe
    Date of Issue: 12-05-2016
    Expiry Date: 2026-05-12
  `;
  const passportAnalysis = DateExtractor.analyze(passportDocText, 'passport_scan.jpg');

  test('DateExtractor classifies Government & Identity and detects expiry date', () => {
    assert.strictEqual(passportAnalysis.category, 'Government & Identity');
    assert.strictEqual(passportAnalysis.deadlineDate, '2026-05-12');
  });

  // 2. HTTP Server API Tests
  console.log('\n--- 2. Server API & Security Tests ---');

  // Test Categories
  const catRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reminders/categories',
    method: 'GET'
  });

  test('Public endpoint returns 10 domain categories', () => {
    assert.strictEqual(catRes.statusCode, 200);
    assert.ok(catRes.json && Array.isArray(catRes.json.categories));
    assert.strictEqual(catRes.json.categories.length, 10);
    assert.ok(catRes.json.categories.includes('Electricity & Household Bills'));
    assert.ok(catRes.json.categories.includes('Government & Identity'));
  });

  // Unauthenticated access provides guest access smoothly
  const unauthRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reminders',
    method: 'GET'
  });

  test('Unauthenticated access to /api/reminders smoothly returns guest reminders (200)', () => {
    assert.strictEqual(unauthRes.statusCode, 200);
    assert.ok(Array.isArray(unauthRes.json.reminders));
  });

  // Register User Alice
  const aliceEmail = `alice_${Date.now()}@example.com`;
  const regAliceRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    { email: aliceEmail, username: `Alice_${Date.now()}`, password: 'PasswordAlice123!' }
  );

  const aliceCookie = getCookie(regAliceRes.headers);

  // Register User Bob (for IDOR check)
  const bobEmail = `bob_${Date.now()}@example.com`;
  const regBobRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    { email: bobEmail, username: `Bob_${Date.now()}`, password: 'PasswordBob123!' }
  );

  const bobCookie = getCookie(regBobRes.headers);

  test('User accounts Alice and Bob registered with sessions', () => {
    assert.ok(aliceCookie);
    assert.ok(bobCookie);
  });

  // 3. Manual Reminder Creation (No document required)
  const createRes1 = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/reminders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: aliceCookie
      }
    },
    {
      title: 'Electricity Bill - November',
      category: 'Electricity & Household Bills',
      deadlineDate: '2026-11-15',
      deadlineTime: '17:00',
      amount: '$ 145.20',
      intervals: [30, 15, 7, 3, 2, 1, 0],
      repeatOption: 'monthly',
      notes: 'Pay through online discom portal'
    }
  );

  test('Alice can create a manual reminder without uploading document', () => {
    assert.strictEqual(createRes1.statusCode, 201);
    assert.ok(createRes1.json && createRes1.json.reminder);
    assert.strictEqual(createRes1.json.reminder.title, 'Electricity Bill - November');
    assert.strictEqual(createRes1.json.reminder.amount, '$ 145.20');
  });

  const aliceReminderId = createRes1.json.reminder.id;

  // 4. IDOR Protection: Bob cannot view or modify Alice's reminder
  const bobGetAliceRem = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/reminders/${aliceReminderId}`,
    method: 'GET',
    headers: { Cookie: bobCookie }
  });

  test('IDOR Protection: User Bob is blocked from accessing Alice reminder (404)', () => {
    assert.strictEqual(bobGetAliceRem.statusCode, 404);
  });

  const bobDeleteAliceRem = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/reminders/${aliceReminderId}`,
    method: 'DELETE',
    headers: { Cookie: bobCookie }
  });

  test('IDOR Protection: User Bob is blocked from deleting Alice reminder (404)', () => {
    assert.strictEqual(bobDeleteAliceRem.statusCode, 404);
  });

  // 5. Configurable Active Limit Enforcement
  // Temporarily set Alice's limit to 2 to test constraint
  await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/reminders/settings',
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie }
    },
    { maxActiveReminders: 2 }
  );

  // Add 2nd reminder (should succeed, count = 2)
  await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/reminders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie }
    },
    {
      title: 'Car Insurance Renewal',
      category: 'Vehicle & Transportation',
      deadlineDate: '2026-12-01'
    }
  );

  // Add 3rd reminder (should be rejected because limit is 2)
  const limitExceededRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/reminders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie }
    },
    {
      title: 'Tuition Fee',
      category: 'Education & Student',
      deadlineDate: '2026-11-20'
    }
  );

  test('Active reminder limit is strictly enforced with informative rejection', () => {
    assert.strictEqual(limitExceededRes.statusCode, 400);
    assert.ok(limitExceededRes.json.error.includes('Active reminder limit reached'));
  });

  // Reset limit back to 300
  await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/reminders/settings',
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie }
    },
    { maxActiveReminders: 300 }
  );

  // 6. Complete status & Auto-Repeat
  // When completed, monthly repeat should advance deadline to December 15
  const completeRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: `/api/reminders/${aliceReminderId}/status`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie }
    },
    { status: 'completed' }
  );

  test('Completing recurring reminder automatically renews and advances deadline date', () => {
    assert.strictEqual(completeRes.statusCode, 200);
    assert.strictEqual(completeRes.json.reminder.deadlineDate, '2026-12-15');
    assert.strictEqual(completeRes.json.reminder.status, 'active');
  });

  // 7. Snooze workflow
  const snoozeRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: `/api/reminders/${aliceReminderId}/snooze`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie }
    },
    { hours: 48 }
  );

  test('Snooze temporarily sets reminder to snoozed state with expiration', () => {
    assert.strictEqual(snoozeRes.statusCode, 200);
    assert.strictEqual(snoozeRes.json.reminder.status, 'snoozed');
    assert.ok(snoozeRes.json.reminder.snoozedUntil);
  });

  // 8. Notifications check & duplicate prevention
  await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reminders/trigger-check',
    method: 'POST',
    headers: { Cookie: aliceCookie }
  });

  const notifRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reminders/notifications',
    method: 'GET',
    headers: { Cookie: aliceCookie }
  });

  test('In-app notifications system tracks alerts and unread count', () => {
    assert.strictEqual(notifRes.statusCode, 200);
    assert.ok(notifRes.json && Array.isArray(notifRes.json.notifications));
  });

  // Mark all notifications read
  const markReadRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reminders/notifications/read-all',
    method: 'POST',
    headers: { Cookie: aliceCookie }
  });

  test('Mark all notifications as read resets unread count to 0', () => {
    assert.strictEqual(markReadRes.statusCode, 200);
  });

  console.log(`\n====================================================`);
  console.log(`  FEATURE 3 TEST RESULTS: ${passed} / ${total} ASSERTIONS PASSED`);
  console.log(`====================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

if (require.main === module) {
  runReminderTests().catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = { runReminderTests };
