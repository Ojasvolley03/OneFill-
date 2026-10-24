/**
 * OneFill - AI AutoFill Semantic Matcher & Form Field Classifier
 * Intelligently maps form fields to user profile attributes based on semantic meaning,
 * field types, and strict context checking (avoiding naive substring collisions).
 */

const PROFILE_FIELDS = [
  { key: 'fullName', label: 'Full Name', category: 'Identity' },
  { key: 'fatherName', label: "Father's Name", category: 'Family' },
  { key: 'motherName', label: "Mother's Name", category: 'Family' },
  { key: 'email', label: 'Email Address', category: 'Contact' },
  { key: 'phone', label: 'Phone Number', category: 'Contact' },
  { key: 'dob', label: 'Date of Birth', category: 'Identity' },
  { key: 'gender', label: 'Gender', category: 'Identity' },
  { key: 'address', label: 'Address', category: 'Address' },
  { key: 'city', label: 'City', category: 'Address' },
  { key: 'state', label: 'State / Province', category: 'Address' },
  { key: 'zipCode', label: 'Zip / Postal Code', category: 'Address' },
  { key: 'country', label: 'Country', category: 'Address' },
  { key: 'college', label: 'College / Institute', category: 'Education' },
  { key: 'university', label: 'University', category: 'Education' },
  { key: 'course', label: 'Course / Degree', category: 'Education' },
  { key: 'branch', label: 'Branch / Specialization', category: 'Education' },
  { key: 'rollNumber', label: 'Roll Number / Student ID', category: 'Education' },
  { key: 'passingYear', label: 'Passing Year', category: 'Education' },
  { key: 'cgpaOrPercentage', label: 'CGPA / Percentage', category: 'Education' },
  { key: 'educationDetails', label: 'Education Details', category: 'Education' },
  { key: 'otherInfo', label: 'Other Personal Information', category: 'Additional' }
];

// Semantic dictionary for each field
const SEMANTIC_DICTIONARY = {
  fullName: {
    primary: [
      /\b(?:full\s*name|name\s*of\s*(?:the\s*)?(?:candidate|applicant|student|person|user|individual)|applicant\s*name|candidate\s*name|student\s*name|your\s*name)\b/i,
      /^\s*name\s*$/i,
      /\b(?:first\s*and\s*last\s*name|legal\s*name|complete\s*name)\b/i
    ],
    secondary: [/\bname\b/i],
    negative: [/\b(?:father|mother|parent|guardian|college|school|company|bank|user\s*name|username|doctor|spouse)\b/i]
  },
  fatherName: {
    primary: [
      /\b(?:father'?s?\s*name|name\s*of\s*(?:the\s*)?father|father\s*full\s*name|paternal\s*name)\b/i,
      /\b(?:parent(?:\s*(?:\/|or)\s*guardian)?\s*name|guardian'?s?\s*name|father\s*(?:\/|or)\s*mother)\b/i
    ],
    secondary: [],
    negative: [/\bmother\b/i]
  },
  motherName: {
    primary: [
      /\b(?:mother'?s?\s*name|name\s*of\s*(?:the\s*)?mother|mother\s*full\s*name|maternal\s*name|maiden\s*name)\b/i
    ],
    secondary: [],
    negative: [/\bfather\b/i]
  },
  email: {
    primary: [
      /\b(?:e-?mail(?:\s*(?:address|id))?|electronic\s*mail|email\s*account)\b/i
    ],
    secondary: [/\bemail\b/i],
    negative: []
  },
  phone: {
    primary: [
      /\b(?:phone(?:\s*number)?|mobile(?:\s*(?:number|no\.?))?|contact(?:\s*(?:number|no\.?))?|cell(?:\s*(?:phone|number))?|telephone|whatsapp(?:\s*number)?)\b/i
    ],
    secondary: [/\btel\b/i],
    negative: [/\b(?:roll|registration|account|aadhaar|pan|license|card|serial|pin)\s*number\b/i]
  },
  dob: {
    primary: [
      /\b(?:date\s*of\s*birth|birth\s*date|d\.?o\.?b\.?|born\s*on|birthdate)\b/i
    ],
    secondary: [],
    negative: [/\b(?:date\s*of\s*(?:issue|expiry|admission|passing|joining|event|registration))\b/i]
  },
  gender: {
    primary: [
      /\b(?:gender|sex)\b/i
    ],
    secondary: [],
    negative: []
  },
  address: {
    primary: [
      /\b(?:residential\s*address|permanent\s*address|mailing\s*address|communication\s*address|current\s*address|street\s*address|home\s*address|postal\s*address|address\s*line\s*[12]?)\b/i,
      /^\s*address\s*$/i
    ],
    secondary: [/\baddress\b/i],
    negative: [/\b(?:email|ip|mac|web|url)\s*address\b/i]
  },
  city: {
    primary: [
      /\b(?:city|town|district|municipality)\b/i
    ],
    secondary: [],
    negative: []
  },
  state: {
    primary: [
      /\b(?:state(?:\s*\/\s*province)?|province|region|territory)\b/i
    ],
    secondary: [],
    negative: [/\b(?:statement)\b/i]
  },
  zipCode: {
    primary: [
      /\b(?:zip\s*(?:code)?|postal\s*code|pin\s*code|pincode|post\s*code)\b/i
    ],
    secondary: [],
    negative: []
  },
  country: {
    primary: [
      /\b(?:country(?:\s*of\s*(?:residence|citizenship|origin))?|nationality|nation)\b/i
    ],
    secondary: [],
    negative: []
  },
  college: {
    primary: [
      /\b(?:college(?:\s*name)?|name\s*of\s*(?:the\s*)?college|institute(?:\s*name)?|institution(?:\s*name)?|school\s*name)\b/i
    ],
    secondary: [/\b(?:college|institute|institution)\b/i],
    negative: [/\buniversity\b/i]
  },
  university: {
    primary: [
      /\b(?:university(?:\s*name)?|name\s*of\s*(?:the\s*)?university|affiliated\s*university|board\s*\/\s*university|degree\s*awarding\s*university)\b/i
    ],
    secondary: [/\buniversity\b/i],
    negative: []
  },
  course: {
    primary: [
      /\b(?:course(?:\s*name)?|degree(?:\s*name)?|program(?:me)?(?:\s*name)?|qualification|pursuing\s*course|academic\s*program)\b/i
    ],
    secondary: [/\b(?:course|degree|program)\b/i],
    negative: []
  },
  branch: {
    primary: [
      /\b(?:branch(?:\s*of\s*study)?|specialization|discipline|stream|department|major(?:\s*subject)?)\b/i
    ],
    secondary: [/\b(?:branch|stream)\b/i],
    negative: [/\b(?:bank\s*branch)\b/i]
  },
  rollNumber: {
    primary: [
      /\b(?:roll\s*(?:number|no\.?)|registration\s*(?:number|no\.?)|reg\s*no\.?|student\s*(?:id|number|no\.?)|enrollment\s*(?:number|no\.?)|hall\s*ticket\s*(?:number|no\.?)|admission\s*number)\b/i
    ],
    secondary: [/\b(?:roll\s*#|reg\s*#)\b/i],
    negative: [/\b(?:phone|mobile|aadhaar|pan)\b/i]
  },
  passingYear: {
    primary: [
      /\b(?:year\s*of\s*passing|passing\s*year|graduation\s*year|year\s*of\s*graduation|completion\s*year|batch\s*(?:of)?)\b/i
    ],
    secondary: [],
    negative: [/\b(?:birth|dob)\b/i]
  },
  cgpaOrPercentage: {
    primary: [
      /\b(?:cgpa|gpa|percentage(?:\s*of\s*marks)?|marks\s*(?:percentage|obtained)|grade\s*point|aggregate\s*(?:marks|percentage)?)\b/i
    ],
    secondary: [/\bpercentage\b/i],
    negative: []
  },
  educationDetails: {
    primary: [
      /\b(?:education(?:\s*details)?|educational\s*qualifications?|highest\s*qualification|academic\s*(?:record|details))\b/i
    ],
    secondary: [],
    negative: []
  },
  otherInfo: {
    primary: [
      /\b(?:other\s*(?:personal\s*)?information|additional\s*(?:information|details)|remarks|personal\s*notes)\b/i
    ],
    secondary: [],
    negative: []
  }
};

class AutoFillMatcher {
  /**
   * Clean label text by stripping leading numbers, punctuation, trailing colons.
   */
  static cleanLabel(rawLabel = '') {
    if (!rawLabel || typeof rawLabel !== 'string') return '';
    return rawLabel
      .replace(/^[\s\d.)\-*•]+/, '') // strip leading list markers e.g. "1. ", "Q2: "
      .replace(/[*:]+\s*$/, '')       // strip trailing colons and required asterisks
      .replace(/\s+/g, ' ')           // normalize whitespace
      .trim();
  }

  /**
   * Determine matching profile key for a given form label and context.
   * @param {string} label - Form field label or question
   * @param {object} profile - User's saved personal profile
   * @param {object} options - Extra hints (field type, placeholder, options list)
   * @returns {object} Match result { matchedKey, confidence, isReliable, reason, suggestedValue }
   */
  static matchField(label = '', profile = {}, options = {}) {
    const cleaned = this.cleanLabel(label);
    const lower = cleaned.toLowerCase();
    const fieldType = (options.type || 'text').toLowerCase();
    const placeholder = (options.placeholder || '').toLowerCase();
    const combinedContext = `${cleaned} ${placeholder}`;

    if (!cleaned) {
      return {
        matchedKey: null,
        confidence: 0,
        isReliable: false,
        reason: 'Empty field label',
        suggestedValue: ''
      };
    }

    let bestMatch = null;
    let highestScore = 0;
    let matchReason = '';

    // 1. Check standard fields in dictionary
    for (const [key, rules] of Object.entries(SEMANTIC_DICTIONARY)) {
      // Check negative exclusions
      const hasNegative = rules.negative.some(neg => neg.test(combinedContext));
      if (hasNegative) {
        continue;
      }

      // Check primary patterns
      for (const pattern of rules.primary) {
        if (pattern.test(combinedContext)) {
          let score = 95;

          // Special case: "Parent/Guardian Name" matching fatherName
          if (key === 'fatherName' && /parent|guardian/i.test(combinedContext)) {
            score = 85;
            matchReason = "Matched Father's Name as Parent/Guardian Name (user review recommended)";
          } else {
            matchReason = `Direct semantic match for ${key}`;
          }

          // Field type verification
          if (key === 'email' && fieldType === 'email') score = Math.min(100, score + 5);
          if (key === 'phone' && (fieldType === 'tel' || fieldType === 'phone')) score = Math.min(100, score + 5);
          if (key === 'dob' && fieldType === 'date') score = Math.min(100, score + 5);

          if (score > highestScore) {
            highestScore = score;
            bestMatch = key;
          }
          break;
        }
      }

      // If primary not matched, check secondary patterns
      if (highestScore < 80) {
        for (const pattern of rules.secondary) {
          if (pattern.test(combinedContext)) {
            const score = 75; // Secondary is uncertain (below 80% reliable threshold)
            if (score > highestScore) {
              highestScore = score;
              bestMatch = key;
              matchReason = `Secondary keyword match for ${key} (uncertain)`;
            }
            break;
          }
        }
      }
    }

    // 2. Check Custom Fields in User Profile (e.g. Aadhaar, PAN, LinkedIn, etc.)
    if (Array.isArray(profile.customFields)) {
      for (const custom of profile.customFields) {
        if (!custom || !custom.label) continue;
        const customLower = custom.label.toLowerCase();
        if (lower === customLower || lower.includes(customLower) || customLower.includes(lower)) {
          const score = lower === customLower ? 95 : 85;
          if (score > highestScore) {
            highestScore = score;
            bestMatch = `custom_${custom.key || custom.label}`;
            matchReason = `Matched custom profile field: ${custom.label}`;
          }
        }
      }
    }

    // 3. Resolve user value
    let suggestedValue = '';
    if (bestMatch) {
      if (bestMatch.startsWith('custom_')) {
        const customKey = bestMatch.replace('custom_', '');
        const found = (profile.customFields || []).find(
          c => (c.key && c.key === customKey) || (c.label && c.label.toLowerCase() === customKey.toLowerCase())
        );
        suggestedValue = found ? (found.value || '') : '';
      } else {
        suggestedValue = profile[bestMatch] || '';
      }
    }

    // 4. If gender choice with options, match option specifically
    if (bestMatch === 'gender' && Array.isArray(options.choices) && options.choices.length > 0 && suggestedValue) {
      const userGenderLower = suggestedValue.toLowerCase();
      const matchedChoice = options.choices.find(c => c.toLowerCase() === userGenderLower || c.toLowerCase().startsWith(userGenderLower[0]));
      if (matchedChoice) {
        suggestedValue = matchedChoice;
      }
    }

    // 5. Determine reliability
    // Reliable threshold is >= 80% AND value must be available in profile
    const hasValue = Boolean(suggestedValue && String(suggestedValue).trim().length > 0);
    const isReliable = highestScore >= 80 && hasValue;

    if (!hasValue && bestMatch) {
      matchReason += ' (Value missing in profile - manual input required)';
    }

    return {
      matchedKey: bestMatch,
      confidence: highestScore,
      isReliable,
      hasValue,
      reason: matchReason || 'No semantic match found',
      suggestedValue: isReliable ? suggestedValue : ''
    };
  }

  /**
   * Parse form text / questions from OCR or PDF text into structured field descriptors.
   * Identifies questions, labels, types, and options.
   * @param {string} rawText - Extracted text content of form
   * @returns {Array<object>} Detected fields
   */
  static parseFormText(rawText = '') {
    if (!rawText || typeof rawText !== 'string') return [];

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const detectedFields = [];
    let fieldCounter = 1;

    // Common form label indicators: "Label: ___", "1. Question?", "[ ] Option"
    const labelLineRegex = /^(?:[0-9]{1,2}[.)\s]+)?([A-Za-z\s/'\-_()&]+?)(?::|\s*[_\.]{3,}|\s*\[\s*\]|\s*\(\s*\)|\s*\?|$)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip headers/title lines or short noise
      if (line.length < 3 || /^(page\s*\d+|confidential|government\s*of|application\s*form\s*for)/i.test(line)) {
        continue;
      }

      // Check if line looks like a question or form field label
      const hasColon = line.includes(':');
      const hasFillBlank = /[_\.]{3,}/.test(line) || /\[\s*\]|\(\s*\)/.test(line);
      const isQuestion = line.endsWith('?') || /^[0-9]{1,2}[.)\s]/.test(line);

      if (hasColon || hasFillBlank || isQuestion) {
        let label = '';
        let detectedType = 'text';
        let choices = [];

        if (hasColon) {
          const parts = line.split(':');
          label = this.cleanLabel(parts[0]);
          const rest = parts.slice(1).join(':').trim();
          // Check if rest contains choices like "Male / Female" or "( ) Yes ( ) No"
          if (/male|female|other/i.test(rest)) {
            detectedType = 'radio';
            choices = ['Male', 'Female', 'Other'];
          } else if (/yes\s*\/\s*no/i.test(rest)) {
            detectedType = 'radio';
            choices = ['Yes', 'No'];
          }
        } else {
          const match = line.match(labelLineRegex);
          label = match ? this.cleanLabel(match[1]) : this.cleanLabel(line);
        }

        // Infer field type from label
        const lowerLabel = label.toLowerCase();
        if (lowerLabel.includes('email')) detectedType = 'email';
        else if (lowerLabel.includes('phone') || lowerLabel.includes('mobile') || lowerLabel.includes('contact')) detectedType = 'tel';
        else if (lowerLabel.includes('date') || lowerLabel.includes('dob') || lowerLabel.includes('birth')) detectedType = 'date';
        else if (lowerLabel.includes('address') || lowerLabel.includes('remarks') || lowerLabel.includes('description')) detectedType = 'textarea';
        else if (lowerLabel.includes('gender') || lowerLabel.includes('sex')) {
          detectedType = 'radio';
          if (choices.length === 0) choices = ['Male', 'Female', 'Other'];
        }

        // Check if next line contains choices
        if (i + 1 < lines.length && choices.length === 0) {
          const nextLine = lines[i + 1];
          if (/(\(\s*\)|\[\s*\])\s*[A-Za-z]+/i.test(nextLine)) {
            const matches = nextLine.match(/(?:[([][\s]*[)\]])\s*([A-Za-z0-9\s]+)/g);
            if (matches && matches.length > 1) {
              choices = matches.map(m => m.replace(/^[([][\s]*[)\]]\s*/, '').trim());
              detectedType = 'radio';
              i++; // consume option line
            }
          }
        }

        // Add valid field if label is meaningful
        if (label.length >= 2 && label.length <= 100 && !/^(the|and|or|of|for|in|to|is)$/i.test(label)) {
          detectedFields.push({
            id: `field_${fieldCounter++}`,
            label: label,
            originalLine: line,
            type: detectedType,
            choices: choices
          });
        }
      }
    }

    return detectedFields;
  }

  /**
   * Process an uploaded form against user's profile.
   * Returns complete analysis with field breakdown, reliability status, and match confidence.
   * @param {string} formText - Extracted text or form content
   * @param {object} profile - User profile data
   * @param {Array<object>} explicitFields - Optional pre-extracted fields (e.g. from AcroForm PDF)
   * @returns {object} Analysis result
   */
  static analyzeForm(formText = '', profile = {}, explicitFields = null) {
    const fieldsToAnalyze = Array.isArray(explicitFields) && explicitFields.length > 0
      ? explicitFields
      : this.parseFormText(formText);

    let confidentMatchesCount = 0;
    let uncertainCount = 0;
    let missingCount = 0;

    const analyzedFields = fieldsToAnalyze.map((field) => {
      const match = this.matchField(field.label, profile, {
        type: field.type,
        placeholder: field.placeholder || '',
        choices: field.choices || []
      });

      if (match.isReliable) {
        confidentMatchesCount++;
      } else if (match.matchedKey && !match.hasValue) {
        missingCount++;
      } else {
        uncertainCount++;
      }

      return {
        id: field.id || `field_${Math.random().toString(36).substring(2, 7)}`,
        label: field.label,
        type: field.type || 'text',
        choices: field.choices || [],
        matchedKey: match.matchedKey,
        suggestedValue: match.suggestedValue,
        confidence: match.confidence,
        isReliable: match.isReliable,
        hasValue: match.hasValue,
        reason: match.reason
      };
    });

    return {
      totalFields: analyzedFields.length,
      confidentCount: confidentMatchesCount,
      uncertainCount,
      missingCount,
      fields: analyzedFields
    };
  }
}

if (typeof window !== 'undefined') {
  window.AutoFillMatcher = AutoFillMatcher;
  window.PROFILE_FIELDS = PROFILE_FIELDS;
  window.SEMANTIC_DICTIONARY = SEMANTIC_DICTIONARY;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PROFILE_FIELDS,
    SEMANTIC_DICTIONARY,
    AutoFillMatcher
  };
}
