/**
 * OneFill Browser Extension - AutoFill Matching Engine
 * Reusable semantic matching and DOM form inspector for Google Forms and generic web applications.
 */

const EXT_SEMANTIC_MAP = {
  fullName: [
    /^(?:full\s*name|name\s*of\s*(?:the\s*)?(?:candidate|applicant|student|user)|applicant\s*name|candidate\s*name|student\s*name|your\s*name|name)$/i,
    /\b(?:first\s*and\s*last\s*name|legal\s*name)\b/i
  ],
  fatherName: [
    /\b(?:father'?s?\s*name|name\s*of\s*(?:the\s*)?father|father\s*full\s*name|paternal\s*name)\b/i,
    /\b(?:parent(?:\s*(?:\/|or)\s*guardian)?\s*name|guardian'?s?\s*name|father\s*(?:\/|or)\s*mother)\b/i
  ],
  motherName: [
    /\b(?:mother'?s?\s*name|name\s*of\s*(?:the\s*)?mother|mother\s*full\s*name|maternal\s*name)\b/i
  ],
  email: [
    /\b(?:e-?mail(?:\s*(?:address|id))?|electronic\s*mail)\b/i,
    /^email$/i
  ],
  phone: [
    /\b(?:phone(?:\s*number)?|mobile(?:\s*(?:number|no\.?))?|contact(?:\s*(?:number|no\.?))?|telephone|whatsapp)\b/i
  ],
  dob: [
    /\b(?:date\s*of\s*birth|birth\s*date|d\.?o\.?b\.?|born\s*on)\b/i
  ],
  gender: [
    /\b(?:gender|sex)\b/i
  ],
  address: [
    /\b(?:residential\s*address|permanent\s*address|mailing\s*address|communication\s*address|current\s*address|street\s*address|home\s*address|address\s*line\s*[12]?|address)\b/i
  ],
  city: [/\b(?:city|town|district)\b/i],
  state: [/\b(?:state(?:\s*\/\s*province)?|province|region)\b/i],
  zipCode: [/\b(?:zip\s*(?:code)?|postal\s*code|pin\s*code|pincode)\b/i],
  country: [/\b(?:country|nationality)\b/i],
  college: [
    /\b(?:college(?:\s*name)?|name\s*of\s*(?:the\s*)?college|institute(?:\s*name)?|institution(?:\s*name)?|school\s*name)\b/i
  ],
  university: [
    /\b(?:university(?:\s*name)?|name\s*of\s*(?:the\s*)?university|affiliated\s*university|board\s*\/\s*university)\b/i
  ],
  course: [
    /\b(?:course(?:\s*name)?|degree(?:\s*name)?|program(?:me)?(?:\s*name)?|qualification|pursuing\s*course)\b/i
  ],
  branch: [
    /\b(?:branch(?:\s*of\s*study)?|specialization|discipline|stream|department)\b/i
  ],
  rollNumber: [
    /\b(?:roll\s*(?:number|no\.?)|registration\s*(?:number|no\.?)|reg\s*no\.?|student\s*(?:id|number|no\.?)|enrollment\s*(?:number|no\.?)|hall\s*ticket\s*(?:number|no\.?))\b/i
  ],
  passingYear: [
    /\b(?:year\s*of\s*passing|passing\s*year|graduation\s*year|batch\s*(?:of)?)\b/i
  ],
  cgpaOrPercentage: [
    /\b(?:cgpa|gpa|percentage(?:\s*of\s*marks)?|marks\s*(?:percentage|obtained)|grade\s*point)\b/i
  ],
  educationDetails: [
    /\b(?:education(?:\s*details)?|educational\s*qualifications?|highest\s*qualification)\b/i
  ],
  otherInfo: [
    /\b(?:other\s*information|additional\s*details|remarks|personal\s*notes)\b/i
  ]
};

const NEGATIVE_EXCLUSIONS = {
  fullName: [/\b(?:father|mother|parent|guardian|college|school|company|bank|user\s*name|username|doctor)\b/i],
  fatherName: [/\bmother\b/i],
  motherName: [/\bfather\b/i],
  phone: [/\b(?:roll|registration|account|aadhaar|pan|card|serial)\b/i],
  rollNumber: [/\b(?:phone|mobile)\b/i],
  college: [/\buniversity\b/i]
};

function matchFieldSemantics(label, profile) {
  if (!label || !profile) return null;
  const clean = label.replace(/^[\s\d.)\-*•]+/, '').replace(/[*:]+\s*$/, '').trim();
  const lower = clean.toLowerCase();

  for (const [key, patterns] of Object.entries(EXT_SEMANTIC_MAP)) {
    // Check exclusions
    if (NEGATIVE_EXCLUSIONS[key]) {
      const excluded = NEGATIVE_EXCLUSIONS[key].some(rx => rx.test(clean));
      if (excluded) continue;
    }

    for (const rx of patterns) {
      if (rx.test(clean)) {
        const val = profile[key];
        if (val && String(val).trim().length > 0) {
          return {
            key,
            cleanLabel: clean,
            value: val,
            confidence: rx.test(lower) ? 95 : 85
          };
        }
      }
    }
  }

  // Check custom fields
  if (Array.isArray(profile.customFields)) {
    for (const c of profile.customFields) {
      if (!c || !c.label || !c.value) continue;
      const cLabel = c.label.toLowerCase();
      if (lower === cLabel || lower.includes(cLabel) || cLabel.includes(lower)) {
        return {
          key: `custom_${c.key || c.label}`,
          cleanLabel: clean,
          value: c.value,
          confidence: 90
        };
      }
    }
  }

  return null;
}

if (typeof window !== 'undefined') {
  window.OneFillEngine = {
    matchFieldSemantics
  };
}
