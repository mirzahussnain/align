'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, PoundSterling, Code2, Map, LineChart, Loader2 } from 'lucide-react';
import Navbar from '@/shared/components/layout/Navbar';
import GlassCard from '@/shared/components/ui/GlassCard';
import Toast from '@/shared/components/ui/Toast';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  LineChart as RechartsLineChart, Line, CartesianGrid, Cell
} from 'recharts';

interface TrendsData {
  stackDominance: { name: string; value: number }[];
  salaryTrends: { role: string; london: number; regional: number }[];
  keywordTrends: { name: string; ai: number; cloud: number; testing: number }[];
  regionalDemand: { city: string; jobs: number; type: string }[];
  isFallback?: boolean;
  message?: string;
}

interface TooltipEntry {
  name: string;
  value: number;
  color?: string;
}

// Defined at module scope: recreating a component type inside the page's
// render remounts every tooltip on each state change.
const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-bg-elevated border border-border-subtle p-3 rounded-lg shadow-xl">
        <p className="text-text-primary font-bold mb-2">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm flex items-center justify-between gap-4">
            <span style={{ color: entry.color }}>{entry.name}:</span>
            <span className="font-mono text-text-primary">
              {entry.name.includes('London') || entry.name.includes('Regional') || entry.name.toLowerCase().includes('salary')
                ? `£${(entry.value / 1000).toFixed(0)}k`
                : entry.value}
            </span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function TrendsPage() {
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    const fetchTrends = async () => {
      try {
        const response = await fetch('/api/trends');
        if (!response.ok) {
          throw new Error('Failed to load trends data');
        }
        const data = await response.json();
        setTrends(data);
        
        if (data.isFallback) {
          setToastMessage(data.message || 'Displaying cached fallback market intelligence.');
          setShowToast(true);
        }
      } catch (err) {
        console.error('Error fetching trends:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrends();
  }, []);

  return (
    <main className="min-h-screen bg-hero-gradient">
      <Navbar />

      <section className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-text-primary mb-2 flex items-center gap-2">
            <TrendingUp className="text-accent-cyan" />
            UK Tech Trends 2026
          </h1>
          <p className="text-text-secondary">
            Market intelligence derived from live job data to help guide your career strategy.
          </p>
        </motion.div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-40 gap-4">
            <Loader2 size={36} className="animate-spin text-accent-cyan" />
            <p className="text-text-tertiary text-sm">Aggregating live tech trends...</p>
          </div>
        ) : !trends ? (
          <GlassCard hover={false} className="text-center py-12">
            <TrendingUp size={40} className="text-text-tertiary mx-auto mb-4" />
            <p className="text-text-secondary">Failed to retrieve tech market trends. Please check connection.</p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tech Stack Dominance */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <GlassCard hover={false} className="h-[400px] flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <Code2 className="text-accent-purple" size={20} />
                  <h2 className="text-lg font-bold text-text-primary">Tech Stack Demand</h2>
                </div>
                <div className="flex-1 w-full min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trends.stackDominance} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                      <XAxis type="number" hide />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'var(--color-text-tertiary)', fontSize: 12 }} 
                        width={140}
                      />
                      <Tooltip cursor={{ fill: 'var(--color-border-subtle)' }} content={<CustomTooltip />} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                        {trends.stackDominance.map((entry, index) => {
                          const opacities = [1, 0.8, 0.6, 0.4, 0.2];
                          return <Cell key={`cell-${index}`} fill={`hsla(250, 90%, 65%, ${opacities[index % opacities.length]})`} />
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            </motion.div>

            {/* Salary Trends */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <GlassCard hover={false} className="h-[400px] flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <PoundSterling className="text-accent-purple" size={20} />
                  <h2 className="text-lg font-bold text-text-primary">Salary Bands (Software Eng)</h2>
                </div>
                <div className="flex-1 w-full min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trends.salaryTrends} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                      <XAxis 
                        dataKey="role" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'var(--color-text-tertiary)', fontSize: 12 }} 
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'var(--color-text-tertiary)', fontSize: 12 }} 
                        tickFormatter={(value) => `£${value/1000}k`}
                      />
                      <Tooltip cursor={{ fill: 'var(--color-border-subtle)' }} content={<CustomTooltip />} />
                      <Bar dataKey="london" name="London" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="regional" name="Regional \(UK\)" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            </motion.div>

            {/* Skill Growth Velocity */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <GlassCard hover={false} className="h-[400px] flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <LineChart className="text-accent-purple" size={20} />
                  <h2 className="text-lg font-bold text-text-primary">Skill Mention Frequency</h2>
                </div>
                <div className="flex-1 w-full min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart data={trends.keywordTrends} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-tertiary)' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-tertiary)' }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="ai" name="AI / LLM / RAG" stroke="var(--color-chart-1)" strokeWidth={3} dot={{ r: 4, fill: 'var(--color-chart-1)' }} />
                      <Line type="monotone" dataKey="cloud" name="Cloud / AWS / Azure" stroke="var(--color-chart-2)" strokeWidth={3} dot={{ r: 4, fill: 'var(--color-chart-2)' }} />
                      <Line type="monotone" dataKey="testing" name="Testing / CI-CD" stroke="var(--color-chart-3)" strokeWidth={3} dot={{ r: 4, fill: 'var(--color-chart-3)' }} />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            </motion.div>

            {/* Regional Hubs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <GlassCard hover={false} className="h-[400px] flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <Map className="text-accent-purple" size={20} />
                  <h2 className="text-lg font-bold text-text-primary">Tech Hub Distribution</h2>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                  {trends.regionalDemand.map((region, i) => (
                    <div key={region.city} className="flex flex-col gap-1.5 p-3 rounded-xl bg-bg-tertiary/50 border border-border-subtle hover:border-accent-cyan/30 transition-colors">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-text-primary">{region.city}</span>
                        <span className="text-sm font-mono text-accent-purple">{region.jobs}% of roles</span>
                      </div>
                      <div className="w-full bg-bg-elevated h-1.5 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-accent-purple rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${region.jobs}%` }}
                          transition={{ duration: 1, delay: 0.5 + (i * 0.1) }}
                        />
                      </div>
                      <span className="text-xs text-text-tertiary mt-1">Key sectors: {region.type}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}
      </section>

      {/* Floating Animated Toast Banner */}
      <Toast 
        message={toastMessage} 
        isVisible={showToast} 
        onClose={() => setShowToast(false)} 
      />
    </main>
  );
}
