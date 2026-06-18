<div align="center">
  <img src="public/assets/svgs/logo.svg" alt="Align Logo" width="100" height="100" />
  
  # Align — UK Tech Career Intelligence
  
  **The ultimate AI-powered ATS calibration and career intelligence platform for the UK Tech Market.**

  [![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
  [![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
</div>

<br />

## 🌟 Overview

**Align** is an enterprise-grade CV analyzer and career intelligence application specifically tailored for software engineers and technology professionals targeting the UK market. By combining precise rule-based ATS parsing with deep semantic AI models, Align provides actionable insights to bypass applicant tracking systems, align with UK tech standards, and significantly improve interview callback rates.

---

## 🚀 Key Features

*   **ATS Alignment Engine**: Upload your PDF CV to instantly receive a comprehensive scoring audit. Analyzes formatting, readability, repetition, and UK compliance rules.
*   **Semantic AI Feedback**: Powered by advanced LLMs (Gemini / Groq), Align performs a STAR-method review on your impact statements, suggesting highly optimized bullet rewrites.
*   **Job Matcher AI**: Paste a target Job Description alongside your CV to receive a precise match percentage, skill gap analysis, and tailored recommendations.
*   **UK Tech Intelligence**: Discover tech jobs, track visa sponsorship trends, and benchmark your salary based on Adzuna, Reed, and GOV.UK data.
*   **Enterprise UI/UX**: Built with Framer Motion and modern Tailwind CSS design principles for a dynamic, glassmorphic, and highly engaging user experience.

---

## 🎯 Core Functionalities & Capabilities

Align is designed to bridge the gap between candidate resumes and the strict, automated filtering systems used by modern UK tech recruiters.

### 1. Granular ATS Parsing & Validation
* **Invisible Character Detection:** Detects and warns about zero-width characters (like `\u200b`) that silently break ATS parsers.
* **Format Compliance:** Evaluates page length, column layouts, margin sizing, and standard heading naming conventions.
* **Repetition & Cliché Checking:** Highlights overused buzzwords (e.g., "Hardworking", "Team player") and calculates keyword density to ensure an organic profile.
* **UK Discrimination Filters:** Automatically flags sensitive data (Age, Marital Status, Headshots) that violate the UK Equality Act 2010 and cause instant rejections.

### 2. Semantic STAR-Method Auditing
* **Impact Statement Scoring:** Uses AI to identify if bullet points follow the "Situation, Task, Action, Result" framework.
* **One-Click Rewrites:** Provides instantly rewritten bullet points that inject quantifiable metrics and active verbs into weak descriptions.
* **Tech Stack Verification:** Cross-references the skills listed in your summary against the actual technologies mentioned in your experience.

### 3. Precision Job Matching
* **JD vs. CV Mapping:** Paste a job description to receive a targeted gap analysis indicating exactly which hard skills and soft skills are missing from your CV.
* **Skill Weighting:** Evaluates missing keywords based on priority (e.g., distinguishing between a "nice-to-have" tool and a "core requirement" like React or TypeScript).

### 4. Career Market Intelligence
* **UK Visa Sponsorship Index:** Tracks companies currently on the GOV.UK sponsor register to help international candidates filter jobs effectively.
* **Real-time Salary Estimator:** Dynamically calculates potential salary ranges (London vs. Regional) based on years of experience, current ATS score, and Adzuna API market data.

---

## 🛠️ Technology Stack

*   **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
*   **Library**: [React 19](https://react.dev/)
*   **Language**: [TypeScript](https://www.typescriptlang.org/)
*   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & [Framer Motion](https://www.framer.com/motion/)
*   **AI Integration**: [Google GenAI (Gemini)](https://ai.google.dev/) & [Groq SDK](https://groq.com/)
*   **Rate Limiting**: [@upstash/ratelimit](https://upstash.com/) with Redis
*   **File Parsing**: `pdf-parse` & `docx`

---

## 🚦 Getting Started

### Prerequisites
Ensure you have `Node.js` (v20+) installed.

### 1. Clone the repository
```bash
git clone https://github.com/your-username/cv-analyzer.git
cd cv-analyzer
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env.local` file in the root of the project and add the necessary API keys:
```env
# AI Models
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key

# Job Market APIs
REED_API_KEY=your_reed_api_key
ADZUNA_APP_ID=your_adzuna_app_id
ADZUNA_APP_KEY=your_adzuna_app_key

# Upstash Rate Limiting (Optional for dev)
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

### 4. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🏗️ Architecture & Structure

The codebase strictly adheres to enterprise scalability principles, enforcing modularity and the DRY principle:

*   **`src/app/`**: Next.js App Router definitions, API routes, and global layouts.
*   **`src/features/`**: Domain-specific feature modules (e.g., `cv-analyzer`, `landing-page`).
*   **`src/shared/`**: Global shared resources, highly decoupled from specific business logic:
    *   `/components`: Reusable UI elements, heavily utilizing `Tailwind` and `framer-motion`.
    *   `/hooks`: Decoupled React state management and side effects.
    *   `/lib`: Third-party SDK integrations (Upstash, AI clients).
    *   `/services`: Asynchronous fetchers and database queries.
    *   `/utils`: Pure, stateless formatting and helper functions.

---

## 📄 License
This project is licensed under the MIT License.
