import SettingsPanel from './SettingsPanel';

interface PrivacyStorage {
  sourceRetentionDays: number | null;
  maxGeneratedCvs: number | null;
  maxStoredAnalyses: number | null;
}

export default function PrivacySettings({ storage }: { storage: PrivacyStorage }) {
  return (
    <SettingsPanel title="Data & Privacy" description="How Align stores the files and results you create.">
      <ul className="space-y-4 text-sm leading-6 text-slate-600">
        <li>Your uploaded CVs and generated documents are stored in private file storage.</li>
        <li>
          {storage.sourceRetentionDays === null
            ? 'Original source CV files are kept without an automatic expiry on your current plan.'
            : `Original source CV files are kept for ${storage.sourceRetentionDays} days on your current plan.`}
        </li>
        <li>
          {storage.maxGeneratedCvs === null
            ? 'Your current plan does not impose a generated-CV storage count.'
            : `Align keeps up to ${storage.maxGeneratedCvs} generated CVs; older generated CVs are removed first when the limit is exceeded.`}
        </li>
        <li>
          Analysis history remains available after an original source file expires. Temporary uploads and abandoned requests expire earlier.
        </li>
        <li>Deleting your account removes your account records and the stored files owned by it.</li>
      </ul>
    </SettingsPanel>
  );
}
