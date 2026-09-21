import type { Metadata } from 'next';
import LegalDocument, { type LegalSection } from '@/features/legal/components/LegalDocument';

export const metadata: Metadata = {
  title: 'Terms of Service | Align',
  description: 'The terms that apply when using Align for career profiles, CV analysis, job matching, document generation, and subscription services.',
};

const sections: readonly LegalSection[] = [
  {
    id: 'agreement',
    title: 'Your agreement with Align',
    content: <><p>These Terms of Service govern your use of Align. By creating an account, buying a plan, or using the service, you agree to these terms and our Privacy Policy. If you do not agree, do not use Align.</p><p>You must have legal capacity to enter into this agreement. If the law where you live requires permission from a parent or guardian, you must have that permission before using Align.</p></>,
  },
  {
    id: 'service',
    title: 'What Align provides',
    content: <><p>Align provides career-profile tools, CV and ATS analysis, job-match guidance, evidence organisation, document generation, job discovery, employer and sponsor context, and related account services. Features and limits depend on your plan and may change as the service develops.</p><p>Align supports your decisions. It does not submit applications for you, represent you to an employer, or provide legal, immigration, financial, recruitment, or regulated professional advice.</p></>,
  },
  {
    id: 'accounts',
    title: 'Accounts and access',
    content: <ul><li>Provide accurate account information and keep it current.</li><li>Protect your credentials and promptly report suspected unauthorised access.</li><li>Use your own account. You are responsible for activity carried out through it unless the activity resulted from our failure to use reasonable care.</li><li>Complete email verification where required for protected features.</li><li>Do not attempt to bypass usage limits, access another user’s information, or interfere with service security.</li></ul>,
  },
  {
    id: 'your-content',
    title: 'Your content and responsibilities',
    content: <><p>You keep ownership of CVs, profile information, job descriptions, feedback, and other content you provide. You give Align a limited permission to host, copy, parse, transform, and process that content only as needed to provide, secure, maintain, and improve the service.</p><p>You are responsible for making sure that:</p><ul><li>you have the right to upload and use the content;</li><li>the information you approve or submit is truthful and does not misrepresent your experience or qualifications;</li><li>your content does not infringe another person’s rights or break the law; and</li><li>you review generated documents before using them in an application.</li></ul></>,
  },
  {
    id: 'guidance-limitations',
    title: 'AI and career guidance limitations',
    content: <><p>ATS scores, matches, rewrites, salary information, sponsor evidence, and AI-generated suggestions are estimates and decision-support tools. Employers use different systems and criteria, public records can change, and AI output can be incomplete or wrong.</p><p>Align does not guarantee employment, an interview, a particular salary, application success, sponsorship, immigration eligibility, or acceptance by an ATS. Sponsor-register evidence shows company-level information and does not promise that a specific role or candidate will be sponsored.</p><p>Do not rely on Align as the sole basis for a legal, immigration, financial, or career decision. Check important information with the relevant employer, official authority, or qualified adviser.</p></>,
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    content: <><p>You must not use Align to:</p><ul><li>upload malicious code, unlawful material, or personal information you are not entitled to use;</li><li>create false qualifications, fabricated experience, deceptive applications, or content intended to impersonate another person;</li><li>scrape, probe, reverse engineer, overload, or disrupt the service except where a legal right cannot be excluded;</li><li>resell access, share paid entitlements, automate requests outside documented interfaces, or evade rate and plan limits; or</li><li>use outputs to make unlawful discriminatory decisions about other people.</li></ul><p>We may investigate suspected misuse and restrict access where reasonably necessary to protect users, the service, or third parties.</p></>,
  },
  {
    id: 'plans-and-payment',
    title: 'Plans, payment, and cancellation',
    content: <><p>Align offers Free and Pro access. Current prices, included usage, and retention limits are shown before purchase. Paid subscriptions are processed by Stripe and renew at the stated interval until cancelled.</p><ul><li>You authorise the stated recurring charge and applicable taxes when you confirm checkout.</li><li>You can manage payment details, invoices, and cancellation through the billing portal in Settings.</li><li>Cancellation is scheduled for the end of the current paid period. Pro access continues until that period ends.</li><li>Usage limits reset or apply as described in the product. Unused allowances do not carry forward unless the product expressly says they do.</li><li>Any refund or cooling-off right available under applicable consumer law remains unaffected.</li></ul><p>We may change future prices or plan features with reasonable notice where required. A price change will not alter a period you have already paid for.</p></>,
  },
  {
    id: 'third-parties',
    title: 'Third-party services and data',
    content: <p>Align relies on third-party providers for hosting, authentication, AI processing, email, billing, job listings, and public sponsor information. Their services and external links may be subject to separate terms. We work to present provider information accurately, but we do not control third-party availability, listings, decisions, or website content.</p>,
  },
  {
    id: 'intellectual-property',
    title: 'Align intellectual property',
    content: <><p>Align and its licensors own the service, software, visual design, branding, templates, and supporting materials, excluding your content and third-party material. We grant you a personal, limited, revocable, non-transferable right to use the service in accordance with these terms.</p><p>You may use and edit documents generated for you for your own career and application purposes. This does not transfer ownership of the underlying Align software, design system, or general templates.</p></>,
  },
  {
    id: 'availability',
    title: 'Availability and changes',
    content: <><p>We aim to provide a reliable service, but Align may occasionally be unavailable for maintenance, security work, provider failures, or events outside our reasonable control. We may update, replace, or discontinue features where reasonably necessary.</p><p>If a change materially reduces a paid service during a current billing period, we will provide any notice or remedy required by applicable law.</p></>,
  },
  {
    id: 'suspension-and-ending',
    title: 'Suspension and ending your account',
    content: <><p>You may stop using Align at any time. You can cancel a subscription in billing settings and delete your account after paid access has ended. Account deletion is permanent and removes account-owned stored files and connected account data, subject to records we must retain by law.</p><p>We may suspend or end access if you materially breach these terms, create a security risk, fail to pay an amount due, or use the service unlawfully. Where appropriate, we will give notice and a reasonable opportunity to resolve the issue.</p></>,
  },
  {
    id: 'responsibility',
    title: 'Our responsibility to you',
    content: <><p>We will provide Align with reasonable care and skill. Nothing in these terms excludes rights or remedies that cannot lawfully be excluded, including applicable consumer rights. Nothing limits liability for fraud, fraudulent misrepresentation, or death or personal injury caused by negligence.</p><p>To the extent permitted by law, we are not responsible for losses that were not a foreseeable result of our breach, for business losses arising from consumer use, or for decisions made by employers, public authorities, payment providers, or other third parties.</p></>,
  },
  {
    id: 'law-and-disputes',
    title: 'Governing law and disputes',
    content: <><p>These terms are governed by the laws of England and Wales. If you are a consumer, you also keep any mandatory protections provided by the law of the country where you live, and you may be entitled to bring proceedings in your local courts.</p><p>Please contact us first so we can try to resolve a concern informally. Nothing in this section prevents either party from seeking an urgent legal remedy where necessary.</p></>,
  },
  {
    id: 'changes-and-contact',
    title: 'Changes and contact',
    content: <><p>We may update these terms to reflect product, provider, security, or legal changes. We will update the date above and give reasonable notice of material changes. Continuing to use Align after the effective date means the updated terms apply, except where the law requires a different form of agreement.</p><p>Questions about these terms can be sent to <a href="mailto:privacy@align.vyndra.tech">privacy@align.vyndra.tech</a>.</p></>,
  },
];

export default function TermsOfServicePage() {
  return <LegalDocument title="Terms of Service" summary="The standards that keep Align useful, fair, and trustworthy for every job seeker." lastUpdated="21 September 2026" sections={sections} />;
}
