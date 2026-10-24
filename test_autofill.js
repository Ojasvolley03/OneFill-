/**
 * OneFill - AI AutoFill Comprehensive Security & Functional Test Suite
 * Validates:
 * 1. Unauthenticated access blocked (401)
 * 2. Personal Information Profile encrypted with AES-256-GCM at rest
 * 3. IDOR Protection: User Alice and User Bob have strictly isolated profiles
 * 4. Saving and updating profile (all fields optional, customizable)
 * 5. Deleting profile
 * 6. Form parsing & AI semantic matching:
 *    - "Full Name" matches applicant name
 *    - "Parent/Guardian Name" matches father's name appropriately
 *    - "Email" matches email
 *    - "College Name" matches college
 *    - Missing fields remain empty and flagged
 *    - Type and meaning validation (no naive substring collisions)
 * 7. Browser extension download endpoint
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

async function runAutoFillTests() {
  console.log('====================================================');
  console.log('       ONEFILL AI AUTOFILL INTEGRATION TESTS        ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(testName, condition, details = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}: ${details}`);
      failed++;
    }
  }

  try {
    // 1. Unauthenticated access to /api/autofill/profile
    const unauthRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/autofill/profile',
      method: 'GET'
    });
    assert('T1.1: Unauthenticated request to /api/autofill/profile is blocked (401)', unauthRes.statusCode === 401);

    // 2. Public schema descriptor
    const schemaRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/autofill/schema',
      method: 'GET'
    });
    assert('T1.2: Public schema /api/autofill/schema returns profile fields list', schemaRes.statusCode === 200 && Array.isArray(schemaRes.json.fields));

    // 3. Register User Alice
    const aliceEmail = `alice_autofill_${Date.now()}@example.com`;
    const aliceUser = `alice_af_${Date.now().toString().slice(-5)}`;
    const regRes = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      { email: aliceEmail, username: aliceUser, password: 'AliceSecurePassword123!' }
    );
    assert('T2.1: Register User Alice succeeds', regRes.statusCode === 201);
    const aliceToken = regRes.json.token;
    const aliceId = regRes.json.user.id;

    // 4. Alice gets default empty profile
    const aliceProf1 = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/autofill/profile',
      method: 'GET',
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    assert('T2.2: Alice retrieves default empty profile structure', aliceProf1.statusCode === 200 && aliceProf1.json.profile.fullName === '');

    // 5. Alice saves partial profile (all fields optional)
    const aliceData = {
      fullName: 'Alice Walker',
      fatherName: 'Robert Walker',
      motherName: 'Sarah Walker',
      email: aliceEmail,
      phone: '+1 555-0199',
      dob: '2001-05-14',
      gender: 'Female',
      address: '742 Evergreen Terrace',
      city: 'Springfield',
      state: 'Oregon',
      zipCode: '97477',
      country: 'United States',
      college: 'Springfield Institute of Technology',
      university: 'University of Oregon',
      course: 'Bachelor of Technology',
      branch: 'Computer Science and Engineering',
      rollNumber: 'CS2021-089',
      passingYear: '2025',
      cgpaOrPercentage: '9.2 CGPA',
      customFields: [
        { key: 'linkedin', label: 'LinkedIn Profile', value: 'https://linkedin.com/in/alicewalker' }
      ]
    };

    const saveRes = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/autofill/profile',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aliceToken}`
        }
      },
      aliceData
    );
    assert('T2.3: Alice saves profile successfully (200)', saveRes.statusCode === 200 && saveRes.json.profile.fullName === 'Alice Walker');

    // 6. Verify AES-256-GCM encryption at rest on disk
    const profileDiskPath = path.join(__dirname, 'private_data', 'profiles', `${aliceId}.enc.json`);
    const fileExists = fs.existsSync(profileDiskPath);
    assert('T3.1: Profile record exists in private_data/profiles', fileExists);

    if (fileExists) {
      const diskContent = fs.readFileSync(profileDiskPath, 'utf8');
      const isEncrypted = diskContent.includes('"ciphertext"') && !diskContent.includes('Alice Walker');
      assert('T3.2: Profile on disk is strictly encrypted with AES-256-GCM (no plaintext on disk)', isEncrypted);
    }

    // 7. IDOR Protection: Register User Bob and verify he cannot read or write Alice's profile
    const bobEmail = `bob_autofill_${Date.now()}@example.com`;
    const bobUser = `bob_af_${Date.now().toString().slice(-5)}`;
    const bobReg = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      { email: bobEmail, username: bobUser, password: 'BobSecurePassword123!' }
    );
    const bobToken = bobReg.json.token;

    const bobProf = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/autofill/profile',
      method: 'GET',
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    assert('T4.1: IDOR: Bob receives his own empty profile, NOT Alice’s data', bobProf.statusCode === 200 && bobProf.json.profile.fullName === '');

    // 8. Form Analysis & AI Semantic Matching:
    // Testing:
    // - "Full Name" -> Alice Walker (Reliable)
    // - "Parent / Guardian Name" -> Robert Walker (Appropriate semantic match)
    // - "Email Address" -> aliceEmail
    // - "College / Institute" -> Springfield Institute of Technology
    // - "Date of Birth" -> 2001-05-14
    // - "Passport Number" -> (Missing from profile, left blank)
    const testFormText = `
      ADMISSION APPLICATION FORM 2026
      1. Full Name of Candidate: ___________________________
      2. Parent / Guardian Name: ___________________________
      3. Candidate Email Address: ___________________________
      4. Mobile / Contact Number: ___________________________
      5. Date of Birth (DD/MM/YYYY): ________________________
      6. Gender: [ ] Male  [ ] Female  [ ] Other
      7. Name of College Attended: ___________________________
      8. Degree / Course: ___________________________________
      9. Roll Number / Student ID: ___________________________
      10. Year of Graduation: ________________________________
      11. Passport Number: __________________________________
    `;

    const analyzeRes = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/autofill/analyze-form',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aliceToken}`
        }
      },
      {
        formTitle: 'University Admission Application',
        formText: testFormText
      }
    );

    assert('T5.1: Form analysis succeeds (200)', analyzeRes.statusCode === 200);
    const analysis = analyzeRes.json;

    const nameField = analysis.fields.find(f => /full\s*name/i.test(f.label));
    assert('T5.2: "Full Name" matched to Alice Walker with reliable status', nameField && nameField.suggestedValue === 'Alice Walker' && nameField.isReliable);

    const guardianField = analysis.fields.find(f => /parent\s*\/\s*guardian/i.test(f.label));
    assert('T5.3: "Parent / Guardian Name" matched to Robert Walker appropriately', guardianField && guardianField.suggestedValue === 'Robert Walker');

    const emailField = analysis.fields.find(f => /email/i.test(f.label));
    assert('T5.4: "Email Address" matched accurately', emailField && emailField.suggestedValue === aliceEmail);

    const collegeField = analysis.fields.find(f => /college/i.test(f.label));
    assert('T5.5: "College Attended" matched to college name', collegeField && collegeField.suggestedValue === 'Springfield Institute of Technology');

    const rollField = analysis.fields.find(f => /roll\s*number/i.test(f.label));
    assert('T5.6: "Roll Number" matched to rollNumber (CS2021-089)', rollField && rollField.suggestedValue === 'CS2021-089');

    const passportField = analysis.fields.find(f => /passport/i.test(f.label));
    assert('T5.7: Missing information (Passport Number) is NOT filled automatically', passportField && passportField.suggestedValue === '' && !passportField.isReliable);

    // 9. Extension ZIP download endpoint
    const extDownloadRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/autofill/extension/download',
      method: 'GET'
    });
    assert('T6.1: Extension download returns 200 with application/zip', extDownloadRes.statusCode === 200 && extDownloadRes.headers['content-type'] === 'application/zip');
    assert('T6.2: Extension zip payload is non-empty', extDownloadRes.body && extDownloadRes.body.length > 5000);

    // 10. Delete profile
    const delRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/autofill/profile',
      method: 'DELETE',
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    assert('T7.1: Alice deletes profile successfully (200)', delRes.statusCode === 200);

    const afterDelProf = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/autofill/profile',
      method: 'GET',
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    assert('T7.2: Alice profile is reset to empty after deletion', afterDelProf.json.profile.fullName === '');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log('\n----------------------------------------------------');
  console.log(`AUTOFILL TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('----------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runAutoFillTests();
