/**
 * OneFill - Intelligent Document Classifier
 * Classifies extracted document text into exactly 10 domain categories.
 */

const ONEFILL_CATEGORIES = [
  'Personal Documents',
  'Education',
  'Legal Documents',
  'Career & Jobs',
  'Finance & Banking',
  'Business Documents',
  'Health & Medical',
  'Bills & Utilities',
  'Government Documents',
  'Other Documents'
];

// Weighted keyword dictionary for accurate classification
const CATEGORY_DICTIONARY = {
  'Personal Documents': {
    primary: ['passport', 'driver license', 'driving licence', 'birth certificate', 'marriage certificate', 'identity card', 'national id', 'voter id', 'citizenship', 'family book', 'emergency contact', 'biodata', 'profile picture', 'residence permit'],
    secondary: ['personal', 'dob', 'father', 'mother', 'spouse', 'gender', 'blood group', 'nationality', 'holder', 'individual', 'issued on', 'place of birth']
  },
  'Education': {
    primary: ['diploma', 'degree', 'transcript', 'university', 'college', 'semester', 'syllabus', 'marksheet', 'grade sheet', 'gpa', 'academic', 'curriculum', 'dissertation', 'thesis', 'certificate of completion', 'student id', 'graduation', 'alumni'],
    secondary: ['school', 'course', 'exam', 'examination', 'faculty', 'professor', 'lecturer', 'subject', 'credit', 'institute', 'institution', 'education', 'learning', 'grade', 'class']
  },
  'Legal Documents': {
    primary: ['contract', 'agreement', 'affidavit', 'power of attorney', 'non-disclosure', 'nda', 'terms of service', 'privacy policy', 'indemnity', 'litigation', 'lawsuit', 'arbitration', 'settlement', 'memorandum of understanding', 'mou', 'lease deed', 'sublease', 'notary public'],
    secondary: ['clause', 'hereto', 'whereas', 'jurisdiction', 'party', 'parties', 'governing law', 'binding', 'breach', 'testimony', 'witness', 'covenant', 'injunction', 'legal', 'statute', 'court']
  },
  'Career & Jobs': {
    primary: ['resume', 'curriculum vitae', 'cover letter', 'job offer', 'offer letter', 'employment contract', 'payslip', 'pay stub', 'salary slip', 'salary breakdown', 'performance appraisal', 'relieving letter', 'experience letter', 'resignation letter', 'recommendation letter', 'job description'],
    secondary: ['career', 'employer', 'employee', 'skills', 'work experience', 'hiring', 'interview', 'human resources', 'recruitment', 'ctc', 'designation', 'job title', 'probation', 'portfolio']
  },
  'Finance & Banking': {
    primary: ['bank statement', 'account statement', 'balance sheet', 'profit and loss', 'income statement', 'audit report', 'tax invoice', 'ledger', 'credit card statement', 'debit note', 'credit note', 'loan agreement', 'mortgage', 'deposit receipt', 'wire transfer', 'remittance', 'financial statements'],
    secondary: ['banking', 'account number', 'routing number', 'ifsc', 'swift', 'interest rate', 'asset', 'liability', 'equity', 'revenue', 'expense', 'debit', 'credit', 'overdraft', 'tax', 'dividend', 'investment', 'portfolio', 'fund', 'accounting']
  },
  'Business Documents': {
    primary: ['business plan', 'executive summary', 'company proposal', 'pitch deck', 'rfp', 'request for proposal', 'meeting minutes', 'board resolution', 'partnership deed', 'articles of incorporation', 'memorandum of association', 'company registration', 'shareholder agreement', 'vendor contract'],
    secondary: ['business', 'strategy', 'market analysis', 'roadmap', 'stakeholder', 'corporate', 'director', 'enterprise', 'commercial', 'quarterly review', 'management', 'kpi', 'milestone', 'procurement']
  },
  'Health & Medical': {
    primary: ['prescription', 'medical report', 'laboratory report', 'blood test', 'pathology', 'radiology', 'x-ray', 'mri scan', 'doctor note', 'clinical summary', 'discharge summary', 'hospital bill', 'diagnosis', 'health insurance claim', 'vaccination certificate', 'immunization'],
    secondary: ['physician', 'doctor', 'patient', 'clinic', 'hospital', 'dosage', 'tablet', 'capsule', 'symptoms', 'treatment', 'medical', 'medicine', 'healthcare', 'rx', 'vital signs']
  },
  'Bills & Utilities': {
    primary: ['electricity bill', 'water bill', 'gas bill', 'utility bill', 'power bill', 'broadband bill', 'internet bill', 'wifi bill', 'mobile recharge', 'telephone bill', 'property tax bill', 'energy statement', 'telecom invoice', 'billing invoice'],
    secondary: ['meter number', 'units consumed', 'due date', 'billing cycle', 'bill amount', 'tariff', 'consumer number', 'payment due', 'kwh', 'connection id', 'utility', 'bill']
  },
  'Government Documents': {
    primary: ['tax return', 'w-2', '1099', 'irs form', 'pan card', 'aadhaar card', 'social security card', 'ssn', 'permanent resident card', 'green card', 'visa application', 'police clearance', 'public notary', 'official gazette', 'municipal certificate', 'vehicle registration'],
    secondary: ['government', 'ministry', 'department of', 'federal', 'state government', 'official record', 'regulatory', 'authority', 'republic', 'license plate', 'embassy', 'consulate', 'civic']
  }
};

class DocumentClassifier {
  /**
   * Classify text into one of the 10 categories.
   * @param {string} text - Extracted document text.
   * @param {string} filename - Original document file name.
   * @returns {{ category: string, confidence: number, matchedKeywords: string[] }}
   */
  static classify(text = '', filename = '') {
    const combinedContent = `${filename} ${filename} ${text}`.toLowerCase();
    
    // Scores accumulator
    const scores = {};
    const matched = {};
    
    ONEFILL_CATEGORIES.forEach(cat => {
      scores[cat] = 0;
      matched[cat] = [];
    });

    // Evaluate each category dictionary
    for (const [category, dict] of Object.entries(CATEGORY_DICTIONARY)) {
      // Primary matches (weight: 4 points)
      dict.primary.forEach(kw => {
        const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const matches = combinedContent.match(regex);
        if (matches) {
          scores[category] += matches.length * 4;
          if (!matched[category].includes(kw)) matched[category].push(kw);
        }
      });

      // Secondary matches (weight: 1 point)
      dict.secondary.forEach(kw => {
        const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const matches = combinedContent.match(regex);
        if (matches) {
          scores[category] += matches.length * 1;
          if (!matched[category].includes(kw) && matched[category].length < 5) matched[category].push(kw);
        }
      });
    }

    // Determine highest scoring category
    let bestCategory = 'Other Documents';
    let highestScore = 0;

    for (const [category, score] of Object.entries(scores)) {
      if (score > highestScore) {
        highestScore = score;
        bestCategory = category;
      }
    }

    // Fallback if score is too low or zero
    if (highestScore === 0) {
      bestCategory = 'Other Documents';
    }

    // Calculate approximate confidence percentage
    const confidence = highestScore > 0 ? Math.min(98, Math.max(65, Math.round(50 + highestScore * 4))) : 50;

    return {
      category: bestCategory,
      confidence,
      matchedKeywords: matched[bestCategory] || [],
      scores
    };
  }
}

window.DocumentClassifier = DocumentClassifier;
window.ONEFILL_CATEGORIES = ONEFILL_CATEGORIES;
