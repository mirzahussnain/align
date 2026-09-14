// UK ATS keyword dictionaries, one per industry.
//
// Terms are matched verbatim against raw CV text (see scoring/keywords.ts), so a
// `canonical` must be a string a candidate would actually type — no parenthetical
// glosses, no slash-joined lists, no version suffixes. Alternate spellings and
// expansions go in `aliases`; a term counts as present if the canonical OR any
// alias matches.
//
// Single-word canonicals are avoided where the word carries an unrelated everyday
// meaning: `Epic` and `Rio` are qualified to `Epic EPR` / `Rio EPR`, and acronyms
// that collide with common CV vocabulary (PPT→PowerPoint, PII→personal data,
// ATV→all-terrain vehicle, OSA/ALS→medical conditions) are spelled out instead.

import { UK_TECH_KEYWORDS, KEYWORD_CATEGORY_LABELS } from './ats-keywords';

// A sector describes the employment environment a CV's vocabulary comes from —
// never the candidate's occupation. An NHS data analyst and a registered nurse
// share the `healthcare_nhs` sector but are evaluated as different occupations
// (see src/shared/occupations/).
export type Sector =
  | 'tech'
  | 'healthcare_nhs'
  | 'warehouse_logistics'
  | 'retail'
  | 'admin_office'
  | 'law'
  | 'engineering'
  | 'general';

/** Career tier, for industries where terms don't apply to every seniority. */
export type CareerTrack = 'fee_earner' | 'support' | 'chartered' | 'technician';

export interface KeywordTerm {
  /** Display form and primary match target. */
  canonical: string;
  /** Other literal strings a CV might use for the same thing. */
  aliases?: string[];
  /** `medium` where the source research supported the term without a citation. */
  confidence: 'high' | 'medium';
  /** Set only when the term is specific to one career tier. */
  track?: CareerTrack;
}

export interface KeywordCategoryDef {
  label: string;
  terms: KeywordTerm[];
}

export interface IndustryDictionary {
  industry: Sector;
  label: string;
  categories: Record<string, KeywordCategoryDef>;
}

const HEALTHCARE_NHS: IndustryDictionary = {
  industry: 'healthcare_nhs',
  label: 'Healthcare / NHS',
  categories: {
    clinicalInterventions: {
      label: 'Clinical Interventions',
      terms: [
        { canonical: 'NEWS2', aliases: ['National Early Warning Score'], confidence: 'high' },
        { canonical: 'Vital Signs', aliases: ['Physiological Measurements'], confidence: 'high' },
        { canonical: 'Phlebotomy', confidence: 'high' },
        { canonical: 'Cannulation', aliases: ['Peripheral Venous Cannulation'], confidence: 'high' },
        { canonical: 'Catheterisation', confidence: 'high' },
        { canonical: 'Wound Management', confidence: 'high' },
        { canonical: 'Medication Administration', confidence: 'high' },
        { canonical: 'Pressure Ulcer Prevention', aliases: ['Waterlow Score'], confidence: 'high' },
        { canonical: 'Venepuncture', confidence: 'high' },
        { canonical: 'Point of Care Testing', aliases: ['POCT'], confidence: 'high' },
        { canonical: 'Fluid Balance', aliases: ['Fluid Balance Monitoring'], confidence: 'high' },
        { canonical: 'Aseptic Non-Touch Technique', aliases: ['ANTT'], confidence: 'high' },
      ],
    },
    clinicalSystems: {
      label: 'Clinical Systems & EPR',
      terms: [
        { canonical: 'SystmOne', aliases: ['TPP SystmOne'], confidence: 'high' },
        { canonical: 'EMIS Web', confidence: 'high' },
        { canonical: 'Cerner Millennium', confidence: 'high' },
        { canonical: 'Nervecentre', confidence: 'high' },
        { canonical: 'CareFlow', aliases: ['CareFlow EPR'], confidence: 'high' },
        { canonical: 'Docman', confidence: 'high' },
        { canonical: 'Adastra', confidence: 'high' },
        { canonical: 'Lorenzo', confidence: 'high' },
        // Bare "Epic" / "Rio" match everyday prose; keep the qualified form only.
        { canonical: 'Epic EPR', confidence: 'high' },
        { canonical: 'Rio EPR', confidence: 'high' },
        { canonical: 'Medway PAS', confidence: 'high' },
        { canonical: 'Silverlink PCS', confidence: 'high' },
      ],
    },
    statutoryCompliance: {
      label: 'Statutory Compliance & Regulation',
      terms: [
        { canonical: 'CQC Fundamental Standards', aliases: ['CQC Standards'], confidence: 'high' },
        {
          canonical: 'Safeguarding',
          aliases: ['Safeguarding Level 3', 'Safeguarding Adults', 'Safeguarding Children'],
          confidence: 'high',
        },
        // "IG" dropped as an alias — too short to disambiguate from ordinary use.
        { canonical: 'Information Governance', aliases: ['Caldicott Principles'], confidence: 'high' },
        { canonical: 'RIDDOR', confidence: 'high' },
        { canonical: 'Duty of Candour', confidence: 'high' },
        { canonical: 'Clinical Governance', confidence: 'high' },
        { canonical: 'Infection Prevention and Control', aliases: ['IPC'], confidence: 'high' },
        { canonical: 'Mental Capacity Act', aliases: ['MCA'], confidence: 'high' },
        { canonical: 'Deprivation of Liberty Safeguards', aliases: ['DoLS'], confidence: 'high' },
        { canonical: 'GDPR', aliases: ['Data Protection', 'General Data Protection Regulation'], confidence: 'high' },
        { canonical: 'COSHH', confidence: 'high' },
        { canonical: 'Manual Handling', confidence: 'high' },
        // "FAW" dropped as an alias — collides with Football Association of Wales.
        { canonical: 'First Aid at Work', confidence: 'high' },
      ],
    },
    qualifications: {
      label: 'Qualifications & Professional Status',
      terms: [
        { canonical: 'NMC PIN', aliases: ['NMC Registration'], confidence: 'high' },
        { canonical: 'HCPC Registration', aliases: ['HCPC Registered'], confidence: 'high' },
        { canonical: 'Care Certificate', confidence: 'high' },
        { canonical: 'AMSPAR', aliases: ['AMSPAR Level 3'], confidence: 'high' },
        { canonical: 'Agenda for Change', aliases: ['AfC'], confidence: 'high' },
        { canonical: 'GMC Registration', aliases: ['GMC Registered'], confidence: 'high' },
        {
          canonical: 'Enhanced DBS',
          aliases: ['Enhanced Disclosure and Barring Service', 'DBS Check'],
          confidence: 'high',
        },
        { canonical: 'Basic Life Support', aliases: ['BLS'], confidence: 'high' },
        // "ALS" dropped as an alias — reads as the disease on a clinical CV.
        { canonical: 'Advanced Life Support', confidence: 'high' },
      ],
    },
  },
};

const WAREHOUSE_LOGISTICS: IndustryDictionary = {
  industry: 'warehouse_logistics',
  label: 'Warehouse & Logistics',
  categories: {
    operationalFlow: {
      label: 'Operational Flow & Picking',
      terms: [
        { canonical: 'Voice Picking', confidence: 'high' },
        { canonical: 'RF Scanning', confidence: 'high' },
        { canonical: 'Pick-to-Light', confidence: 'high' },
        { canonical: 'Goods Inbound', confidence: 'high' },
        { canonical: 'Order Picking', confidence: 'high' },
        { canonical: 'Order Packing', confidence: 'high' },
        { canonical: 'Cross-Docking', confidence: 'high' },
        { canonical: 'Palletising', confidence: 'high' },
        { canonical: 'Break-Bulk', confidence: 'high' },
        {
          canonical: 'E-commerce Fulfilment',
          aliases: ['Ecommerce Fulfilment', 'eCommerce Fulfilment'],
          confidence: 'high',
        },
      ],
    },
    wmsAndSoftware: {
      label: 'WMS & Software',
      terms: [
        { canonical: 'Manhattan Active WMS', aliases: ['Manhattan WMS'], confidence: 'high' },
        { canonical: 'SAP EWM', aliases: ['Extended Warehouse Management'], confidence: 'high' },
        { canonical: 'Blue Yonder', aliases: ['JDA', 'Blue Yonder WMS'], confidence: 'high' },
        { canonical: 'Oracle WMS', confidence: 'high' },
        { canonical: 'Infor WMS', confidence: 'high' },
        { canonical: 'Microsoft Dynamics 365 SCM', confidence: 'high' },
        { canonical: 'Mintsoft', confidence: 'high' },
        { canonical: 'Körber', aliases: ['HighJump'], confidence: 'high' },
        { canonical: 'RedPrairie', confidence: 'high' },
        { canonical: 'AS/RS', aliases: ['Automated Storage and Retrieval Systems'], confidence: 'high' },
      ],
    },
    mheAndDriving: {
      label: 'MHE & UK Driving Categories',
      terms: [
        { canonical: 'FLT Counterbalance', aliases: ['Counterbalance Forklift'], confidence: 'high' },
        { canonical: 'Reach Truck Licence', confidence: 'high' },
        { canonical: 'VNA', aliases: ['Very Narrow Aisle'], confidence: 'high' },
        // "PPT" dropped entirely — overwhelmingly reads as PowerPoint on a CV.
        { canonical: 'Powered Pallet Truck', confidence: 'high' },
        { canonical: 'Bendi Truck', confidence: 'medium' },
        { canonical: 'Flexi Truck', confidence: 'medium' },
        { canonical: 'Category C', aliases: ['Class 2', 'Category C Licence', 'Class 2 Licence'], confidence: 'high' },
        { canonical: 'Category CE', aliases: ['Class 1', 'Category CE Licence', 'Class 1 Licence'], confidence: 'high' },
        {
          canonical: 'Category C1',
          aliases: ['7.5 Tonne', 'Category C1 Licence', '7.5 Tonne Licence'],
          confidence: 'high',
        },
        { canonical: 'Driver CPC', aliases: ['Certificate of Professional Competence'], confidence: 'high' },
        { canonical: 'Digital Tachograph', aliases: ['Digi Tacho'], confidence: 'high' },
      ],
    },
    complianceAndInventory: {
      label: 'Compliance & Inventory',
      terms: [
        { canonical: 'RIDDOR', confidence: 'high' },
        { canonical: 'Manual Handling', confidence: 'high' },
        { canonical: 'COSHH', confidence: 'high' },
        { canonical: 'FIFO', aliases: ['First In First Out'], confidence: 'high' },
        { canonical: 'LIFO', aliases: ['Last In First Out'], confidence: 'high' },
        { canonical: 'Cycle Counting', confidence: 'high' },
        { canonical: 'Shrinkage Control', confidence: 'high' },
        { canonical: 'Stock Replenishment', confidence: 'high' },
        { canonical: 'Stock Rotation', confidence: 'high' },
        { canonical: 'Bill of Materials', aliases: ['BOM'], confidence: 'high' },
        { canonical: 'PPE', aliases: ['Personal Protective Equipment'], confidence: 'high' },
        { canonical: 'First Aid at Work', confidence: 'high' },
        { canonical: 'Enhanced DBS', aliases: ['DBS Check'], confidence: 'high' },
      ],
    },
  },
};

const RETAIL: IndustryDictionary = {
  industry: 'retail',
  label: 'Retail',
  categories: {
    posAndCheckout: {
      label: 'POS & Checkout Systems',
      terms: [
        { canonical: 'Oracle Retail Xstore', confidence: 'high' },
        { canonical: 'Microsoft Dynamics 365 Commerce', confidence: 'high' },
        { canonical: 'NCR Voyix', confidence: 'high' },
        { canonical: 'Shopify POS', confidence: 'high' },
        { canonical: 'Till Reconciliation', aliases: ['Cashing Up'], confidence: 'high' },
        { canonical: 'EPOS', aliases: ['Electronic Point of Sale'], confidence: 'high' },
        { canonical: 'Contactless Payments', confidence: 'high' },
        { canonical: 'Upselling', confidence: 'high' },
        { canonical: 'Cross-selling', confidence: 'high' },
        { canonical: 'Loyalty Programme Enrolment', confidence: 'high' },
      ],
    },
    merchandisingAndStock: {
      label: 'Merchandising & Stock',
      terms: [
        { canonical: 'Planogram', aliases: ['Planogram Compliance'], confidence: 'high' },
        { canonical: 'Visual Merchandising', confidence: 'high' },
        // "OSA" dropped as an alias — reads as obstructive sleep apnoea.
        { canonical: 'On-Shelf Availability', confidence: 'high' },
        { canonical: 'Stock Replenishment', confidence: 'high' },
        { canonical: 'Facing Up', confidence: 'high' },
        { canonical: 'Store Recovery', confidence: 'high' },
        { canonical: 'Seasonal Resets', confidence: 'high' },
        { canonical: 'Gondola End Displays', confidence: 'high' },
        { canonical: 'Markdown Management', confidence: 'high' },
        { canonical: 'Price Labelling', confidence: 'high' },
        { canonical: 'Backroom Organisation', confidence: 'high' },
        { canonical: 'Stock Rotation', confidence: 'high' },
        { canonical: 'FIFO', aliases: ['First In First Out'], confidence: 'high' },
      ],
    },
    operationsAndManagement: {
      label: 'Operations & Management',
      terms: [
        { canonical: 'KPIs', aliases: ['Key Performance Indicators'], confidence: 'high' },
        { canonical: 'Conversion Rate', confidence: 'high' },
        // "ATV" dropped as an alias — reads as all-terrain vehicle.
        { canonical: 'Average Transaction Value', confidence: 'high' },
        {
          canonical: 'Click & Collect',
          aliases: ['Click and Collect', 'Click & Collect Fulfilment'],
          confidence: 'high',
        },
        { canonical: 'Loss Prevention', confidence: 'high' },
        { canonical: 'Rota Management', confidence: 'high' },
        { canonical: 'Opening and Closing Procedures', confidence: 'high' },
        { canonical: 'Mystery Shopper', confidence: 'high' },
        { canonical: 'Vendor Relations', confidence: 'high' },
        { canonical: 'Consumer Rights Act 2015', confidence: 'high' },
        { canonical: 'Health and Safety', aliases: ['Health and Safety at Work'], confidence: 'high' },
        { canonical: 'Manual Handling', confidence: 'high' },
        { canonical: 'First Aid at Work', confidence: 'high' },
        { canonical: 'Enhanced DBS', aliases: ['DBS Check'], confidence: 'high' },
      ],
    },
  },
};

const ADMIN_OFFICE: IndustryDictionary = {
  industry: 'admin_office',
  label: 'Admin & Office',
  categories: {
    softwareAndProductivity: {
      label: 'Software & Productivity',
      terms: [
        { canonical: 'Microsoft Excel', aliases: ['MS Excel', 'Advanced Excel'], confidence: 'high' },
        { canonical: 'Microsoft Outlook', aliases: ['MS Outlook'], confidence: 'high' },
        { canonical: 'Microsoft Teams', aliases: ['MS Teams'], confidence: 'high' },
        { canonical: 'Microsoft SharePoint', aliases: ['SharePoint'], confidence: 'high' },
        { canonical: 'Google Workspace', aliases: ['G Suite'], confidence: 'high' },
        { canonical: 'Salesforce', confidence: 'high' },
        { canonical: 'Microsoft Word', aliases: ['MS Word'], confidence: 'high' },
        { canonical: 'Mail Merge', confidence: 'high' },
        { canonical: 'Trello', confidence: 'high' },
        { canonical: 'Asana', confidence: 'high' },
        { canonical: 'Monday.com', confidence: 'high' },
        { canonical: 'Adobe Acrobat', confidence: 'high' },
      ],
    },
    executiveAndClerical: {
      label: 'Executive & Clerical Skills',
      terms: [
        { canonical: 'Diary Management', confidence: 'high' },
        { canonical: 'Minute Taking', confidence: 'high' },
        { canonical: 'Travel Coordination', aliases: ['Travel Arrangements'], confidence: 'high' },
        { canonical: 'Expense Management', confidence: 'high' },
        { canonical: 'SAP Concur', confidence: 'high' },
        { canonical: 'Audio Typing', confidence: 'high' },
        { canonical: 'Invoicing', confidence: 'high' },
        { canonical: 'Billing', confidence: 'high' },
        // Uncited in the source research — kept, but not treated as verified.
        { canonical: 'Data Entry', confidence: 'medium' },
        { canonical: 'Switchboard', aliases: ['Switchboard Operation'], confidence: 'high' },
        { canonical: 'Office Procurement', confidence: 'high' },
        { canonical: 'Electronic Filing', confidence: 'high' },
      ],
    },
    qualificationsAndCompliance: {
      label: 'Qualifications & Compliance',
      terms: [
        { canonical: 'Microsoft Office Specialist', aliases: ['MOS'], confidence: 'high' },
        { canonical: 'Pitman Training Diploma', confidence: 'high' },
        { canonical: 'AMSPAR', aliases: ['AMSPAR Level 3'], confidence: 'high' },
        { canonical: 'GDPR', aliases: ['Data Protection', 'General Data Protection Regulation'], confidence: 'high' },
        { canonical: 'DSE Assessment', aliases: ['Display Screen Equipment'], confidence: 'high' },
        { canonical: 'First Aid at Work', confidence: 'high' },
        { canonical: 'ILM Level 3', confidence: 'high' },
        { canonical: 'Fire Marshal', confidence: 'high' },
        { canonical: 'Fire Warden', confidence: 'high' },
        { canonical: 'Manual Handling', confidence: 'high' },
        { canonical: 'Enhanced DBS', aliases: ['DBS Check'], confidence: 'high' },
      ],
    },
  },
};

const LAW: IndustryDictionary = {
  industry: 'law',
  label: 'Law',
  categories: {
    feeEarnerTrack: {
      label: 'Fee-Earner (Qualified Track)',
      terms: [
        { canonical: 'SRA Practising Certificate', confidence: 'high', track: 'fee_earner' },
        { canonical: 'SQE', aliases: ['Solicitors Qualifying Examination'], confidence: 'high', track: 'fee_earner' },
        { canonical: 'LPC', aliases: ['Legal Practice Course'], confidence: 'high', track: 'fee_earner' },
        { canonical: 'GDL', aliases: ['Graduate Diploma in Law'], confidence: 'high', track: 'fee_earner' },
        { canonical: 'BPTC', aliases: ['Bar Professional Training Course'], confidence: 'high', track: 'fee_earner' },
        { canonical: 'CILEX', aliases: ['Chartered Legal Executive'], confidence: 'high', track: 'fee_earner' },
        { canonical: 'PQE', aliases: ['Post-Qualification Experience'], confidence: 'high', track: 'fee_earner' },
        { canonical: 'Legal Drafting', confidence: 'high', track: 'fee_earner' },
        { canonical: 'Court Advocacy', confidence: 'high', track: 'fee_earner' },
        { canonical: 'Conveyancing', confidence: 'high' },
        { canonical: 'Continuing Competence', confidence: 'high', track: 'fee_earner' },
      ],
    },
    legalSupport: {
      label: 'Legal Support & Clerical',
      terms: [
        { canonical: 'Digital Dictation', confidence: 'high', track: 'support' },
        { canonical: 'BigHand', confidence: 'high' },
        { canonical: 'Court Bundles', aliases: ['Court Bundling'], confidence: 'high', track: 'support' },
        { canonical: 'Audio Typing', confidence: 'high', track: 'support' },
        { canonical: 'E-Filing', confidence: 'high', track: 'support' },
        { canonical: 'CE-File', confidence: 'high', track: 'support' },
        { canonical: 'Chambers Management', confidence: 'high', track: 'support' },
        // Trailing "+" can't anchor a \b; the plain aliases are what actually match.
        { canonical: 'Lexis+', aliases: ['LexisNexis', 'Lexis Plus'], confidence: 'high' },
        { canonical: 'Westlaw', confidence: 'high' },
        { canonical: 'Practical Law', confidence: 'high' },
        { canonical: 'iManage', confidence: 'high' },
        { canonical: 'NetDocuments', confidence: 'high' },
        { canonical: 'Proclaim', confidence: 'high' },
        // Bare "Eclipse" / "Clio" match an IDE and a car respectively.
        { canonical: 'Eclipse Legal Systems', confidence: 'high' },
        { canonical: 'Clio Legal', confidence: 'high' },
        { canonical: 'Attendance Notes', confidence: 'high', track: 'support' },
        { canonical: 'Land Registry Portal', confidence: 'high' },
      ],
    },
    regulatoryAndAml: {
      label: 'Regulatory & AML Compliance',
      terms: [
        { canonical: 'SRA Standards and Regulations', aliases: ['SRA Code of Conduct'], confidence: 'high' },
        { canonical: 'AML', aliases: ['Anti-Money Laundering'], confidence: 'high' },
        { canonical: 'KYC', aliases: ['Know Your Customer'], confidence: 'high' },
        { canonical: 'CDD', aliases: ['Customer Due Diligence'], confidence: 'high' },
        // "SAR" omitted — in UK legal/GDPR contexts it reads as Subject Access Request.
        { canonical: 'Suspicious Activity Report', confidence: 'high' },
        { canonical: 'Conflict Checks', aliases: ['Conflict Checking'], confidence: 'high' },
        // "PII" dropped as an alias — reads as personally identifiable information.
        { canonical: 'Professional Indemnity Insurance', confidence: 'high' },
        { canonical: 'GDPR', aliases: ['Data Protection', 'General Data Protection Regulation'], confidence: 'high' },
        { canonical: 'CQS', aliases: ['Conveyancing Quality Scheme'], confidence: 'high' },
        { canonical: 'Lexcel', confidence: 'high' },
        { canonical: 'MLRO', aliases: ['Money Laundering Reporting Officer'], confidence: 'high' },
        { canonical: 'MLCO', confidence: 'high' },
        { canonical: 'Sanctions Screening', confidence: 'high' },
      ],
    },
  },
};

const ENGINEERING: IndustryDictionary = {
  industry: 'engineering',
  label: 'Engineering',
  categories: {
    civilAndStructural: {
      label: 'Civil & Structural Engineering',
      terms: [
        { canonical: 'AutoCAD', confidence: 'high' },
        { canonical: 'Revit', aliases: ['Autodesk Revit'], confidence: 'high' },
        { canonical: 'Civil 3D', aliases: ['AutoCAD Civil 3D'], confidence: 'high' },
        { canonical: 'BIM', aliases: ['Building Information Modelling'], confidence: 'high' },
        { canonical: 'MicroDrainage', confidence: 'high' },
        { canonical: 'Structural Analysis', confidence: 'high' },
        { canonical: 'ETABS', confidence: 'high' },
        { canonical: 'Temporary Works', confidence: 'high' },
        { canonical: 'SuDS', aliases: ['Sustainable Drainage Systems'], confidence: 'high' },
      ],
    },
    mechanicalAndManufacturing: {
      label: 'Mechanical & Manufacturing',
      terms: [
        { canonical: 'SolidWorks', confidence: 'high' },
        { canonical: 'CATIA', confidence: 'high' },
        // "Inventor" dropped as an alias — matches "named inventor on two patents".
        { canonical: 'Autodesk Inventor', confidence: 'high' },
        { canonical: 'ANSYS', confidence: 'high' },
        { canonical: 'FEA', aliases: ['Finite Element Analysis'], confidence: 'high' },
        { canonical: 'GD&T', aliases: ['Geometric Dimensioning and Tolerancing'], confidence: 'high' },
        {
          canonical: 'DFM',
          aliases: ['Design for Manufacture', 'Design for Manufacturability'],
          confidence: 'high',
        },
        { canonical: 'CNC Machining', aliases: ['Computer Numerical Control'], confidence: 'high' },
        { canonical: 'Lean Manufacturing', confidence: 'high' },
        { canonical: 'Six Sigma', confidence: 'high' },
      ],
    },
    electricalAndControl: {
      label: 'Electrical & Control Systems',
      terms: [
        { canonical: 'SCADA', aliases: ['Supervisory Control and Data Acquisition'], confidence: 'high' },
        // "PLC" dropped entirely — UK CVs are full of employers named "<Company> plc".
        { canonical: 'Programmable Logic Controller', confidence: 'high' },
        { canonical: 'MATLAB', confidence: 'high' },
        { canonical: 'Switchgear', confidence: 'high' },
        { canonical: 'Embedded C', confidence: 'high' },
        { canonical: 'Ladder Logic', confidence: 'high' },
        { canonical: 'AutoCAD Electrical', confidence: 'high' },
      ],
    },
    standardsAndContracts: {
      label: 'Standards & Contracts',
      terms: [
        { canonical: 'Eurocodes', confidence: 'high' },
        { canonical: 'British Standards', aliases: ['BS Standards'], confidence: 'high' },
        { canonical: '18th Edition', aliases: ['BS 7671'], confidence: 'high' },
        { canonical: 'NEC4', aliases: ['NEC3'], confidence: 'high' },
        { canonical: 'JCT Contracts', aliases: ['JCT'], confidence: 'high' },
        {
          canonical: 'CDM Regulations',
          aliases: ['CDM 2015', 'Construction Design and Management'],
          confidence: 'high',
        },
        { canonical: 'DMRB', aliases: ['Design Manual for Roads and Bridges'], confidence: 'high' },
      ],
    },
    professionalStatus: {
      label: 'Professional Status & Qualifications',
      terms: [
        { canonical: 'CEng', aliases: ['Chartered Engineer'], confidence: 'high', track: 'chartered' },
        { canonical: 'IEng', aliases: ['Incorporated Engineer'], confidence: 'high', track: 'chartered' },
        { canonical: 'EngTech', aliases: ['Engineering Technician'], confidence: 'high', track: 'technician' },
        { canonical: 'IMechE', aliases: ['Institution of Mechanical Engineers'], confidence: 'high' },
        // Bare "ICE" matches "ice", "de-icing".
        { canonical: 'ICE Member', aliases: ['Institution of Civil Engineers'], confidence: 'high' },
        { canonical: 'IET', aliases: ['Institution of Engineering and Technology'], confidence: 'high' },
        { canonical: 'BEng', confidence: 'high' },
        { canonical: 'MEng', confidence: 'high' },
        { canonical: 'UK-SPEC', confidence: 'high' },
        { canonical: 'CSCS Card', confidence: 'high' },
      ],
    },
    complianceAndSafety: {
      label: 'Compliance & Safety',
      terms: [
        { canonical: 'RIDDOR', confidence: 'high' },
        { canonical: 'COSHH', confidence: 'high' },
        { canonical: 'Manual Handling', confidence: 'high' },
        { canonical: 'First Aid at Work', confidence: 'high' },
      ],
    },
  },
};

const GENERAL: IndustryDictionary = {
  industry: 'general',
  label: 'General / Transferable',
  categories: {
    baselineDigitalAndSafety: {
      label: 'Baseline Digital & Safety',
      terms: [
        { canonical: 'Microsoft 365', aliases: ['MS 365'], confidence: 'high' },
        { canonical: 'Manual Handling', confidence: 'high' },
        { canonical: 'Fire Safety', confidence: 'high' },
        { canonical: 'Emergency First Aid', aliases: ['EFAW'], confidence: 'high' },
        { canonical: 'First Aid at Work', confidence: 'high' },
        { canonical: 'GDPR', aliases: ['Data Protection', 'General Data Protection Regulation'], confidence: 'high' },
        { canonical: 'Level 2 Numeracy', confidence: 'high' },
        { canonical: 'Level 2 Literacy', confidence: 'high' },
        { canonical: 'COSHH', confidence: 'high' },
        { canonical: 'RIDDOR', confidence: 'high' },
        { canonical: 'Enhanced DBS', aliases: ['DBS Check'], confidence: 'high' },
      ],
    },
    drivingEntitlements: {
      label: 'UK Driving Entitlements',
      terms: [
        { canonical: 'Full UK Driving Licence', confidence: 'high' },
        { canonical: 'Clean Driving Licence', confidence: 'high' },
        {
          canonical: 'Category C1',
          aliases: ['7.5 Tonne', 'Category C1 Licence', '7.5 Tonne Licence'],
          confidence: 'high',
        },
        { canonical: 'Category D1', aliases: ['Category D1 Licence', 'Minibus Licence'], confidence: 'high' },
        { canonical: 'Category BE', aliases: ['Category BE Licence'], confidence: 'high' },
        { canonical: 'Digital Tachograph', aliases: ['Digi Tacho'], confidence: 'high' },
      ],
    },
  },
};

/**
 * Adapts the original flat tech dictionary (plain string arrays) to the shared
 * shape, so the tech path keeps working unchanged while every industry is read
 * through one interface.
 */
function fromFlatDictionary(
  industry: Sector,
  label: string,
  groups: Record<string, readonly string[]>,
  labels: Record<string, string>
): IndustryDictionary {
  const categories: Record<string, KeywordCategoryDef> = {};

  for (const [key, keywords] of Object.entries(groups)) {
    categories[key] = {
      label: labels[key] ?? key,
      terms: keywords.map((canonical) => ({ canonical, confidence: 'high' as const })),
    };
  }

  return { industry, label, categories };
}

const TECH = fromFlatDictionary('tech', 'Technology', UK_TECH_KEYWORDS, KEYWORD_CATEGORY_LABELS);

/**
 * Every `Sector` has a dictionary. The lookup still returns `null` for an
 * unrecognised key so callers handle the miss explicitly rather than silently
 * scoring a CV against the wrong industry's keywords.
 */
export const INDUSTRY_KEYWORDS: Partial<Record<Sector, IndustryDictionary>> = {
  tech: TECH,
  healthcare_nhs: HEALTHCARE_NHS,
  warehouse_logistics: WAREHOUSE_LOGISTICS,
  retail: RETAIL,
  admin_office: ADMIN_OFFICE,
  law: LAW,
  engineering: ENGINEERING,
  general: GENERAL,
};

export function getIndustryDictionary(industry: Sector): IndustryDictionary | null {
  return INDUSTRY_KEYWORDS[industry] ?? null;
}

export function hasIndustryDictionary(industry: Sector): boolean {
  return industry in INDUSTRY_KEYWORDS;
}

/** Every industry the AI is allowed to return, for prompt construction. */
export const INDUSTRY_IDS = Object.keys(INDUSTRY_KEYWORDS) as Sector[];

/**
 * Narrows an untrusted string — an LLM's `detectedIndustry` — to a known
 * `Sector`. An unrecognised value must fall back to the caller's default
 * rather than being scored against a dictionary that doesn't exist.
 */
export function isKnownIndustry(value: unknown): value is Sector {
  return typeof value === 'string' && value in INDUSTRY_KEYWORDS;
}
