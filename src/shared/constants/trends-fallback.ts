// Fallback constants for UK tech market trends

export const FALLBACK_TRENDS = {
  stackDominance: [
    { name: 'TypeScript / React / Next.js', value: 85, color: 'hsl(250, 90%, 65%)' },
    { name: 'Python / FastAPI / Django', value: 72, color: 'hsl(170, 80%, 50%)' },
    { name: 'Java / Spring Boot', value: 65, color: 'hsl(200, 70%, 55%)' },
    { name: 'C# / .NET', value: 60, color: 'hsl(280, 85%, 55%)' },
    { name: 'Go (Golang)', value: 45, color: 'hsl(155, 70%, 50%)' },
  ],
  salaryTrends: [
    { role: 'Junior (0-2y)', london: 35000, regional: 28000 },
    { role: 'Mid (2-4y)', london: 55000, regional: 45000 },
    { role: 'Senior (4-7y)', london: 85000, regional: 65000 },
    { role: 'Lead / Staff', london: 110000, regional: 85000 },
  ],
  regionalDemand: [
    { city: 'London', jobs: 45, type: 'Enterprise & FinTech' },
    { city: 'Manchester', jobs: 20, type: 'SaaS & E-commerce' },
    { city: 'Birmingham', jobs: 15, type: 'Manufacturing Tech' },
    { city: 'Edinburgh', jobs: 12, type: 'Data & Security' },
    { city: 'Bristol', jobs: 8, type: 'DeepTech & Aerospace' },
  ],
  keywordTrends: [
    { name: 'Q1', ai: 20, cloud: 45, testing: 30 },
    { name: 'Q2', ai: 35, cloud: 48, testing: 32 },
    { name: 'Q3', ai: 55, cloud: 50, testing: 35 },
    { name: 'Q4', ai: 75, cloud: 52, testing: 36 },
  ]
};
