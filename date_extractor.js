/**
 * OneFill - Intelligent Date, Category & Deadline Extractor
 * Uses contextual natural language patterns, heuristic OCR scanning,
 * and multi-format date parsers to detect expiry dates, renewal dates,
 * payment deadlines, amounts, and document categories.
 * 
 * Works in both Node.js (CommonJS) and Browser environments.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DateExtractor = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

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

  const MONTHS_MAP = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  const CATEGORY_RULES = [
    {
      category: 'Electricity & Household Bills',
      docTypes: ['Electricity Bill', 'Water Bill', 'Gas / LPG Bill', 'Broadband / Internet Bill', 'Utility Invoice'],
      keywords: ['electricity', 'power bill', 'electric', 'kwh', 'meter reading', 'water supply', 'gas bill', 'cylinder', 'broadband', 'telecom', 'utility bill', 'consumer number', 'tariff', 'billing unit', 'discom', 'board']
    },
    {
      category: 'Vehicle & Transportation',
      docTypes: ['Vehicle Registration (RC)', 'Pollution Under Control (PUC)', 'Vehicle Insurance', 'Driving License', 'Toll / FASTag'],
      keywords: ['registration certificate', 'chassis number', 'engine number', 'rto', 'driving licence', 'driver license', 'pollution under control', 'puc certificate', 'emission test', 'fastag', 'motor vehicle', 'vehicle insurance', 'transport department']
    },
    {
      category: 'Government & Identity',
      docTypes: ['Passport', 'National ID / Aadhaar', 'PAN Card', 'Voter ID', 'Visa / Residence Permit'],
      keywords: ['passport', 'republic', 'ministry of external affairs', 'department of state', 'aadhaar', 'uidai', 'permanent account number', 'income tax department pan', 'voter identity', 'election commission', 'residence permit', 'citizenship certificate', 'visa valid']
    },
    {
      category: 'Banking & Finance',
      docTypes: ['Credit Card Statement', 'Loan EMI Schedule', 'Fixed Deposit Receipt', 'Bank Statement', 'Mutual Fund / SIP'],
      keywords: ['credit card statement', 'minimum amount due', 'total amount due', 'credit limit', 'bank statement', 'emi due', 'fixed deposit', 'term deposit maturity', 'loan account', 'routing number', 'ifsc', 'swift', 'mutual fund', 'sip installment', 'annual maintenance fee']
    },
    {
      category: 'Insurance',
      docTypes: ['Health Insurance Policy', 'Life Insurance Policy', 'Term Insurance', 'Auto Insurance Policy'],
      keywords: ['insurance policy', 'premium due', 'sum insured', 'policy period', 'policyholder', 'life insurance', 'health insurance', 'mediclaim', 'coverage expires', 'premium renewal', 'tpa', 'cashless card']
    },
    {
      category: 'Government Schemes & Tax',
      docTypes: ['Income Tax Return (ITR)', 'Advance Tax Challan', 'Property / Municipal Tax', 'GST Return Filing'],
      keywords: ['income tax return', 'itr', 'assessment year', 'financial year', 'advance tax', 'property tax bill', 'municipal corporation', 'gstin', 'gstr', 'tax due', 'challan payment', 'tax deduction']
    },
    {
      category: 'Medical & Healthcare',
      docTypes: ['Prescription Refill', 'Medical Test / Follow-up', 'Vaccination Certificate', 'Health Checkup Due'],
      keywords: ['prescription', 'refill before', 'rx', 'dosage', 'valid until', 'follow up on', 'next consultation', 'vaccine due', 'booster dose', 'diagnostic test', 'clinical summary']
    },
    {
      category: 'Education & Student',
      docTypes: ['College / School Tuition Fee', 'Exam Registration Deadline', 'Scholarship Application', 'Admission Form'],
      keywords: ['tuition fee', 'semester fee', 'examination fee', 'last date to apply', 'registration deadline', 'college fee', 'school fees', 'student id validity', 'scholarship deadline', 'admit card']
    },
    {
      category: 'Personal & Family',
      docTypes: ['Digital Subscription (Netflix/Amazon)', 'Gym / Club Membership', 'Annual Maintenance Contract', 'Lease / Rent Due'],
      keywords: ['subscription renewal', 'membership valid', 'gym membership', 'netflix', 'spotify', 'amazon prime', 'annual maintenance', 'amc renewal', 'rent agreement', 'monthly rent due', 'lease expiry']
    }
  ];

  class DateExtractor {
    /**
     * Main analysis method.
     * Takes document text and optional filename, returns structured deadline insights.
     */
    static analyze(text = '', filename = '') {
      const cleanText = String(text || '').trim();
      const cleanFilename = String(filename || '').trim();
      const combined = `${cleanFilename} \n ${cleanText}`;

      // 1. Identify category and document type
      const catInfo = this.identifyCategoryAndDocType(combined);

      // 2. Extract candidate dates with contextual tags
      const dateMatches = this.extractDatesWithContext(combined);

      // 3. Classify best target deadline date
      const deadline = this.selectPrimaryDeadline(dateMatches);

      // 4. Extract amount if present
      const amount = this.extractAmount(combined);

      // 5. Extract suggested reminder title
      const title = this.suggestTitle(catInfo, combined, cleanFilename);

      return {
        category: catInfo.category,
        documentType: catInfo.docType,
        confidence: catInfo.confidence,
        suggestedTitle: title,
        deadlineDate: deadline ? deadline.isoDate : '',
        deadlineType: deadline ? deadline.type : 'General Deadline',
        detectedAmount: amount,
        allDetectedDates: dateMatches,
        matchedKeywords: catInfo.matchedKeywords
      };
    }

    /**
     * Identify category and doc type based on keywords
     */
    static identifyCategoryAndDocType(content) {
      const lower = content.toLowerCase();
      let bestCategory = 'Others';
      let bestDocType = 'General Document / Reminder';
      let maxScore = 0;
      let matchedKeywords = [];

      for (const rule of CATEGORY_RULES) {
        let score = 0;
        const matched = [];

        for (const kw of rule.keywords) {
          if (lower.includes(kw)) {
            score += 2;
            matched.push(kw);
          }
        }

        for (const docType of rule.docTypes) {
          if (lower.includes(docType.toLowerCase())) {
            score += 4;
            matched.push(docType);
          }
        }

        if (score > maxScore) {
          maxScore = score;
          bestCategory = rule.category;
          bestDocType = rule.docTypes[0];
          matchedKeywords = matched;

          // Try to refine bestDocType by specific match
          for (const docType of rule.docTypes) {
            if (lower.includes(docType.toLowerCase())) {
              bestDocType = docType;
              break;
            }
          }
        }
      }

      const confidence = Math.min(98, Math.max(35, Math.round((maxScore / 10) * 100)));

      return {
        category: bestCategory,
        docType: bestDocType,
        confidence,
        matchedKeywords: matchedKeywords.slice(0, 8)
      };
    }

    /**
     * Extract dates and associated context labels (expiry, renewal, due date, issue)
     */
    static extractDatesWithContext(text) {
      const results = [];
      const lines = text.split(/\r?\n/);

      // Regex patterns for various date representations
      const patterns = [
        // ISO YYYY-MM-DD or YYYY/MM/DD
        { regex: /\b(20\d{2})[-/.](1[0-2]|0?[1-9])[-/.]([12]\d|3[01]|0?[1-9])\b/g, format: 'YYYY-MM-DD' },
        // DD-MM-YYYY or MM-DD-YYYY
        { regex: /\b([12]\d|3[01]|0?[1-9])[-/.]([12]\d|3[01]|0?[1-9])[-/.](20\d{2})\b/g, format: 'DMY_OR_MDY' },
        // DD Month YYYY (e.g. 15 Nov 2026, 15 November 2026)
        { regex: /\b(0?[1-9]|[12]\d|3[01])\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[,\s]+(20\d{2})\b/gi, format: 'DD Month YYYY' },
        // Month DD, YYYY (e.g. Nov 15, 2026, November 15, 2026)
        { regex: /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(0?[1-9]|[12]\d|3[01])[,\s]+(20\d{2})\b/gi, format: 'Month DD YYYY' }
      ];

      const contextMarkers = {
        expiry: ['expir', 'valid until', 'valid thru', 'valid to', 'valid upto', 'valid up to', 'expires', 'end date', 'expiration'],
        due: ['due date', 'pay by', 'payment due', 'last date', 'due on', 'pay before', 'deadline', 'bill date due'],
        renewal: ['renewal date', 'renew by', 'next renewal', 'policy renewal', 'renew on', 'renewal due'],
        issue: ['issue date', 'date of issue', 'issued on', 'start date', 'booking date', 'bill date']
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        // Context slice: current line plus previous line
        const contextStr = ((lines[i - 1] || '') + ' ' + line).toLowerCase();

        // Determine context type
        let contextType = 'general';
        let weight = 1;

        if (contextMarkers.expiry.some((m) => contextStr.includes(m))) {
          contextType = 'expiry';
          weight = 5;
        } else if (contextMarkers.due.some((m) => contextStr.includes(m))) {
          contextType = 'due';
          weight = 5;
        } else if (contextMarkers.renewal.some((m) => contextStr.includes(m))) {
          contextType = 'renewal';
          weight = 4;
        } else if (contextMarkers.issue.some((m) => contextStr.includes(m))) {
          contextType = 'issue';
          weight = 2;
        }

        for (const p of patterns) {
          p.regex.lastIndex = 0;
          let match;
          while ((match = p.regex.exec(line)) !== null) {
            const parsed = this.parseDateMatch(match, p.format);
            if (parsed) {
              // Avoid duplicates on same date string
              if (!results.some((r) => r.isoDate === parsed.isoDate && r.contextType === contextType)) {
                results.push({
                  rawText: match[0],
                  isoDate: parsed.isoDate,
                  contextType,
                  weight,
                  contextSnippet: line.trim().slice(0, 100)
                });
              }
            }
          }
        }
      }

      return results;
    }

    /**
     * Parse matched regex tokens into canonical YYYY-MM-DD
     */
    static parseDateMatch(match, format) {
      try {
        let year, month, day;

        if (format === 'YYYY-MM-DD') {
          year = parseInt(match[1], 10);
          month = parseInt(match[2], 10);
          day = parseInt(match[3], 10);
        } else if (format === 'DMY_OR_MDY') {
          const first = parseInt(match[1], 10);
          const second = parseInt(match[2], 10);
          year = parseInt(match[3], 10);
          if (second > 12 && first <= 12) {
            month = first;
            day = second;
          } else {
            day = first;
            month = second;
          }
        } else if (format === 'DD Month YYYY') {
          day = parseInt(match[1], 10);
          month = MONTHS_MAP[match[2].toLowerCase().slice(0, 3)];
          year = parseInt(match[3], 10);
        } else if (format === 'Month DD YYYY') {
          month = MONTHS_MAP[match[1].toLowerCase().slice(0, 3)];
          day = parseInt(match[2], 10);
          year = parseInt(match[3], 10);
        }

        if (!year || !month || !day) return null;
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        if (year < 2000 || year > 2060) return null;

        // Validate real calendar date (prevents e.g. Feb 30)
        const check = new Date(year, month - 1, day);
        if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) {
          return null;
        }

        const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return { isoDate, year, month, day };
      } catch (e) {
        return null;
      }
    }

    /**
     * Choose the most probable deadline date from candidates
     */
    static selectPrimaryDeadline(dates) {
      if (!dates || dates.length === 0) return null;

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Score each date: favor expiry, due, and renewal, especially those >= today or slightly past
      const scored = dates.map((d) => {
        let score = d.weight * 10;

        // Favour future or current dates for deadlines
        if (d.isoDate >= todayStr) {
          score += 15;
        }

        // Demote issue dates unless no other date found
        if (d.contextType === 'issue') {
          score -= 10;
        }

        return { ...d, totalScore: score };
      });

      scored.sort((a, b) => b.totalScore - a.totalScore);
      const top = scored[0];

      let readableType = 'Expiry Date';
      if (top.contextType === 'due') readableType = 'Payment Due Date';
      else if (top.contextType === 'renewal') readableType = 'Renewal Deadline';
      else if (top.contextType === 'expiry') readableType = 'Expiry Date';
      else if (top.contextType === 'issue') readableType = 'Date of Issue';

      return {
        isoDate: top.isoDate,
        rawText: top.rawText,
        type: readableType,
        snippet: top.contextSnippet
      };
    }

    /**
     * Extract monetary amounts like $145.50, Rs. 2,400, Total Due: 500
     */
    static extractAmount(text) {
      const patterns = [
        /(?:total\s+amount\s+due|amount\s+due|net\s+payable|total\s+due|bill\s+amount|premium\s+amount)[\s:]*([₹$€£]|rs\.?|usd)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/i,
        /([₹$€£]|rs\.?|usd)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/i
      ];

      for (const p of patterns) {
        const m = text.match(p);
        if (m) {
          const sym = m[1] || '$';
          const val = m[2];
          return `${sym.toUpperCase().trim()} ${val.trim()}`;
        }
      }

      return null;
    }

    /**
     * Generate an appropriate reminder title
     */
    static suggestTitle(catInfo, content, filename) {
      const lower = content.toLowerCase();

      // Check common utility providers / names
      const knownServices = [
        'Electricity Bill', 'Water Bill', 'Broadband Bill', 'Gas Bill',
        'Passport Renewal', 'Vehicle Insurance', 'Driving License',
        'Credit Card Bill', 'Health Insurance', 'Life Insurance',
        'Property Tax', 'Income Tax Return (ITR)', 'Gym Membership'
      ];

      for (const s of knownServices) {
        if (lower.includes(s.toLowerCase())) {
          return s;
        }
      }

      if (catInfo.docType && catInfo.docType !== 'General Document / Reminder') {
        return catInfo.docType;
      }

      if (filename) {
        const cleanName = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        return cleanName.slice(0, 50);
      }

      return `${catInfo.category} Reminder`;
    }
  }

  return DateExtractor;
});
