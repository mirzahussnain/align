import type { Metadata } from 'next';
import LegalDocument, { type LegalSection } from '@/features/legal/components/LegalDocument';

export const metadata: Metadata = {
  title: 'Privacy Policy | Align',
  description: 'How Align collects, uses, stores, and protects personal information across career profiles, CV analysis, job matching, and billing.',
};

const sections: readonly LegalSection[] = [
  {
    id: 'scope',
    title: 'Who this policy covers',
    content: <><p>This policy applies when you visit Align, create an account, upload a CV, build a Career Profile, analyse an application, explore jobs, generate documents, or manage a paid plan. In this policy, “Align”, “we”, “us”, and “our” refer to the Align service.</p><p>Align is designed for career planning and job applications. It is not an employer, recruiter, immigration adviser, or government service.</p></>,
  },
  {
    id: 'information-we-collect',
    title: 'Information we collect',
    content: <><p>We collect information that you provide, information created when you use Align, and limited information from service providers and public sources.</p><ul><li><strong className="text-slate-800">Account information:</strong> name, email address, authentication method, verification status, profile image, and account preferences.</li><li><strong className="text-slate-800">Career information:</strong> CV content, work history, education, skills, qualifications, licences, projects, career goals, location, salary preferences, and practical employability details you choose to add.</li><li><strong className="text-slate-800">Application information:</strong> job descriptions, saved jobs, company records, requirement comparisons, analysis history, evidence approvals, generated CVs, and your feedback or edits.</li><li><strong className="text-slate-800">Billing information:</strong> plan, subscription status, billing customer references, invoice and renewal status, and payment events. Stripe processes full payment-card details. Align does not store full card numbers.</li><li><strong className="text-slate-800">Technical information:</strong> IP address, browser and device information, session records, security events, request metadata, and limited diagnostic logs.</li><li><strong className="text-slate-800">Anonymous ATS preview:</strong> the uploaded file, extracted CV text, result, a protected browser token, and a hashed network identifier used to prevent abuse.</li></ul><p>A CV can contain information about other people or sensitive matters. Only upload information that you are entitled to use and that is relevant to your career search.</p></>,
  },
  {
    id: 'sources',
    title: 'Where information comes from',
    content: <><p>Most information comes directly from you. We may also receive:</p><ul><li>basic account information from Google when you choose Google sign-in;</li><li>subscription and payment status from Stripe;</li><li>job and employer information from providers such as Adzuna, Reed, and Jooble;</li><li>sponsor information from the UK Government register of licensed sponsors; and</li><li>technical and security information from your browser, device, and our infrastructure providers.</li></ul></>,
  },
  {
    id: 'how-we-use-information',
    title: 'How we use information',
    content: <><p>We use personal information to:</p><ul><li>create and secure your account, authenticate you, and provide account support;</li><li>extract and organise CV evidence, maintain Career Profiles, and remember your choices;</li><li>provide ATS analysis, job matching, sponsor context, rewrite guidance, and document generation;</li><li>enforce plan limits, operate subscriptions, process billing events, and maintain transaction records;</li><li>detect abuse, investigate errors, protect users, and keep the service reliable;</li><li>send verification, password, billing, security, and account-lifecycle messages; and</li><li>understand and improve service performance using limited operational information.</li></ul><p>Our principal legal bases are performance of our contract with you, our legitimate interests in operating and securing Align, compliance with legal obligations, and consent where we specifically ask for it. The basis that applies depends on the purpose and the information involved.</p></>,
  },
  {
    id: 'ai-processing',
    title: 'AI-assisted processing',
    content: <><p>Some Align features send relevant CV text, profile evidence, job descriptions, and task instructions to AI service providers such as Google Gemini or Groq. We use structured outputs, validation, and product rules to reduce unsupported results, but AI output can still be incomplete or wrong.</p><p>Align does not use AI output to make a solely automated decision that determines whether you receive a job, visa, benefit, or other legal right. You remain responsible for reviewing documents and deciding what to submit.</p></>,
  },
  {
    id: 'sharing',
    title: 'When we share information',
    content: <><p>We do not sell personal information. We share only what is needed with service providers that help us operate Align, including:</p><ul><li>hosting, database, private object-storage, caching, and security providers;</li><li>Google for optional sign-in and Gemini AI services;</li><li>Groq for AI processing when used as an available provider;</li><li>Stripe for checkout, subscriptions, invoices, and the billing portal;</li><li>Resend for account and lifecycle email delivery; and</li><li>professional advisers, regulators, law enforcement, or a successor organisation where disclosure is legally required or reasonably necessary to protect rights and safety.</li></ul><p>Some providers may process information outside the United Kingdom. Where data-protection law requires it, transfers must rely on an adequacy regulation or appropriate contractual and organisational safeguards.</p></>,
  },
  {
    id: 'retention',
    title: 'How long we keep information',
    content: <><p>We keep information only for as long as it is needed for the service, security, legal compliance, dispute handling, and the purposes described in this policy.</p><ul><li>Unclaimed anonymous ATS previews expire after 24 hours.</li><li>Original source CV files are currently eligible for automatic removal after 180 days on Free and 365 days on Pro. The retention date is set when the file is uploaded.</li><li>Extracted information, confirmed Career Profile records, analysis history, generated-document records, and provenance may remain while your account is active so the product can provide history and evidence-backed results.</li><li>Short-lived upload intents and incomplete operations expire under operational cleanup rules.</li><li>Billing, fraud-prevention, security, and legal records may be kept for longer where reasonably necessary or required by law.</li></ul><p>Deleting an account removes account-owned stored files and the account data connected to it. An active paid subscription must first be cancelled and reach the end of its paid period so that account deletion does not silently remove paid access.</p></>,
  },
  {
    id: 'cookies',
    title: 'Cookies and similar storage',
    content: <><p>Align uses essential cookies and browser storage for sign-in, security, session continuity, and the anonymous ATS preview. These are needed for requested features and abuse prevention. Align does not currently use third-party behavioural advertising cookies.</p><p>Browser settings can remove or block cookies, but essential account and preview features may stop working. If we introduce non-essential cookies, we will provide the controls and information required by applicable law before using them.</p></>,
  },
  {
    id: 'security',
    title: 'How we protect information',
    content: <><p>Align uses access controls, private storage for uploaded and generated documents, short-lived signed upload and download links, file-type and ownership validation, server-side secrets, rate limits, and verified billing webhooks. Public profile images are stored separately from private CV files.</p><p>No online service can guarantee absolute security. Keep your sign-in details confidential and contact us if you believe your account has been compromised.</p></>,
  },
  {
    id: 'rights',
    title: 'Your privacy rights',
    content: <><p>Depending on your location and the circumstances, you may have rights to access, correct, erase, restrict, object to, or receive a portable copy of personal information. You may also withdraw consent where processing relies on consent. Some rights are subject to legal limits and exemptions.</p><p>You can update core account information and delete your account from Settings. For other requests, email <a href="mailto:privacy@align.vyndra.tech">privacy@align.vyndra.tech</a>. We may need to verify your identity before completing a request.</p><p>If you are in the UK, you may complain to the <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer">Information Commissioner’s Office</a>. We would appreciate the opportunity to address your concern first.</p></>,
  },
  {
    id: 'changes-and-contact',
    title: 'Changes and contact',
    content: <><p>We may update this policy when Align, our providers, or the law changes. We will update the date above and provide additional notice when a change materially affects how we use personal information.</p><p>Questions about this policy or Align’s handling of personal information can be sent to <a href="mailto:privacy@align.vyndra.tech">privacy@align.vyndra.tech</a>.</p></>,
  },
];

export default function PrivacyPolicyPage() {
  return <LegalDocument title="Privacy Policy" summary="How Align handles the information behind your career profile, analysis, applications, and account." lastUpdated="21 September 2026" sections={sections} />;
}
