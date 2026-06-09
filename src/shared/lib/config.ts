export const AI_CONFIG = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: 'gemini-3.5-flash',
    fallbackModel: 'gemini-3.5-flash',
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: 'llama-3.3-70b-versatile',
  }
};

export const API_CONFIG = {
  adzuna: {
    appId: process.env.ADZUNA_APP_ID || '',
    appKey: process.env.ADZUNA_APP_KEY || '',
    baseUrl: 'https://api.adzuna.com/v1/api/jobs/gb/search',
    histogramUrl: 'https://api.adzuna.com/v1/api/jobs/gb/histogram',
  },
  reed: {
    apiKey: process.env.REED_API_KEY || '',
    baseUrl: 'https://www.reed.co.uk/api/1.0/search',
  },
  jooble: {
    apiKey: process.env.JOOBLE_API_KEY || '',
    baseUrl: 'https://jooble.org/api',
  },
  gov: {
    sponsorRegistryPage: 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers',
    fallbackCsvUrl: 'https://assets.publishing.service.gov.uk/media/6a1965a6916cd732dcdaacf0/2026-05-29_-_Worker_and_Temporary_Worker.csv',
  }
};
