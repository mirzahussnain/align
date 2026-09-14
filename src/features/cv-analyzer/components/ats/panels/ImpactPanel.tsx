import { CVAnalysisResult } from '@/shared/types/cv';
import GlassCard from '@/shared/components/ui/GlassCard';
import { Target, Lightbulb, ChevronRight } from 'lucide-react';

export default function ImpactPanel({ result }: { result: CVAnalysisResult }) {
  const summaryCat = result.categories.find(c => c.id === 'professionalSummary');
  const impactCat = result.categories.find(c => c.id === 'impactStatements');
  
  const aiRewrites = result.recommendations.filter(
    r => r.kind === 'rewrite' || (!r.kind && r.title.startsWith('Rewrite bullet:'))
  );
  const aiFeedback = result.recommendations.find(
    r => r.kind === 'alignment' || (!r.kind && r.title === 'UK Tech Market Alignment Feedback')
  );

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-text-primary">Impact & AI Feedback</h2>
        <p className="text-text-secondary text-sm mt-1">Deep semantic review powered by Gemini</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard className="p-5" hover={false}>
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-text-primary">Professional Summary</h3>
            <span className={`text-sm font-bold ${summaryCat?.status === 'excellent' ? 'text-success' : 'text-warning'}`}>
              {summaryCat?.score}/{summaryCat?.maxScore}
            </span>
          </div>
          <p className="text-sm text-text-secondary">{summaryCat?.details || 'No feedback available.'}</p>
        </GlassCard>
        
        <GlassCard className="p-5" hover={false}>
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-text-primary">Impact Statements</h3>
            <span className={`text-sm font-bold ${impactCat?.status === 'excellent' ? 'text-success' : 'text-warning'}`}>
              {impactCat?.score}/{impactCat?.maxScore}
            </span>
          </div>
          <p className="text-sm text-text-secondary">{impactCat?.details || 'No feedback available.'}</p>
        </GlassCard>
      </div>

      {aiFeedback && (
        <GlassCard className="p-5 border-accent-cyan/20 bg-accent-cyan/5" hover={false}>
          <h3 className="font-semibold text-accent-cyan flex items-center gap-2 mb-2">
            <Target size={16} /> Role Alignment
          </h3>
          <p className="text-sm text-text-secondary">{aiFeedback.description}</p>
        </GlassCard>
      )}

      {aiRewrites.length > 0 && (
        <div className="space-y-4 mt-8">
          <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <Lightbulb size={18} className="text-accent-cyan" />
            Suggested Bullet Rewrites
          </h3>
          <div className="space-y-4">
            {aiRewrites.map((rewrite, i) => (
              <GlassCard key={i} className="p-5" hover={false}>
                <h4 className="text-sm font-semibold text-text-primary mb-3">Original Bullet</h4>
                <div className="p-3 bg-error/5 text-error text-sm rounded-lg border border-error/10 mb-4">
                  {rewrite.title.replace('Rewrite bullet: ', '')}
                </div>
                <h4 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                  <ChevronRight size={14} className="text-success" /> Suggested Improvement
                </h4>
                <div className="p-3 bg-success/5 text-success text-sm rounded-lg border border-success/10 mb-4">
                  {rewrite.description.split('\n\nRationale:')[0].replace('Suggested rewrite: ', '').replace(/"/g, '')}
                </div>
                <p className="text-xs text-text-tertiary">
                  <span className="font-semibold">Rationale:</span> {rewrite.description.split('\n\nRationale:')[1] || ''}
                </p>
              </GlassCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
