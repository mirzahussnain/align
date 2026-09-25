'use client';

import { useState, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Search, ShieldCheck, Building2, ExternalLink, Loader2, Info } from 'lucide-react';
import Navbar from '@/shared/components/layout/Navbar';
import PublicPageBackdrop from '@/shared/components/layout/PublicPageBackdrop';
import { Input } from '@/shared/components/ui/Input';
import GlassCard from '@/shared/components/ui/GlassCard';
import { cn } from '@/shared/utils/cn';
import VisaRouteDetails from '@/features/immigration/components/VisaRouteDetails';
import Tabs from '@/shared/components/ui/Tabs';
import { useSponsors } from '@/features/immigration/hooks/useSponsors';
import { VISAS, INDUSTRY_SECTORS } from '@/shared/constants/immigration-config';
import { EXTERNAL_LINKS } from '@/shared/constants/navigation';

function ImmigrationHubContent() {
  const [activeVisaTab, setActiveVisaTab] = useState<string>(VISAS[0].title);
  
  const {
    query,
    setQuery,
    route,
    setRoute,
    industry,
    setIndustry,
    sponsors,
    total,
    isLoading,
    page,
    error,
    register,
    handlePageChange,
  } = useSponsors();

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-hero-gradient">
      <Navbar />
      <PublicPageBackdrop variant="immigration" />

      <section className="relative z-10 pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-text-primary mb-2 flex items-center gap-2">
            <ShieldCheck className="text-accent-cyan" />
            Sponsorship & Visas
          </h1>
          <p className="text-text-secondary">
            Search the official sponsor register and review neutral, qualified information about common work routes.
          </p>
        </motion.div>

        <div className="flex flex-col gap-12">
          
          {/* Top Section: Sponsor Search */}
          <div className="w-full space-y-6">
            <GlassCard hover={false} padding="md">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-text-primary mb-1">Register of Licensed Sponsors</h2>
                  <p className="text-xs text-text-tertiary">
                    {!register
                      ? 'Loading register details…'
                      : register.source === 'BUNDLED_RELEASE'
                        ? `GOV.UK register · Version ${register.releaseVersion} · ${register.rowCount.toLocaleString()} entries${register.publishedAt ? ` · ${new Date(`${register.publishedAt}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}` : ''}`
                        : 'Data sourced directly from the live GOV.UK CSV'}
                  </p>
                  <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">An organisation’s presence on the register does not confirm that it will sponsor a particular vacancy or that a candidate is eligible.</p>
                </div>
                <a href={EXTERNAL_LINKS.govSponsorList} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1 text-text-tertiary hover:text-text-primary transition-colors">
                  Official Source <ExternalLink size={12} />
                </a>
              </div>

              <div className="flex flex-col md:flex-row gap-3 mb-6">
                {/* Search Term input */}
                <div className="flex-1">
                  <Input
                    icon={<Search size={16} />}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search company or city..."
                  />
                </div>

                {/* Industry category select */}
                <div className="sm:w-52">
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full px-3 py-2.5 bg-bg-tertiary border border-border-subtle rounded-xl text-sm font-medium"
                  >
                    {INDUSTRY_SECTORS.map((sec) => (
                      <option key={sec.value} value={sec.value}>
                        {sec.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Visa Route select */}
                <div className="sm:w-48">
                  <select
                    value={route}
                    onChange={(e) => setRoute(e.target.value)}
                    className="w-full px-3 py-2.5 bg-bg-tertiary border border-border-subtle rounded-xl text-sm"
                  >
                    <option value="all">All Routes</option>
                    <option value="skilled worker">Skilled Worker</option>
                    <option value="global business mobility">Global Business Mobility</option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm mb-6 flex items-start gap-2">
                  <Info size={18} className="flex-shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-bg-elevated text-text-secondary text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate-600 w-[25%]">Organisation Name</th>
                        <th className="px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell w-[15%]">Town/City</th>
                        <th className="px-4 py-3 font-semibold text-slate-600 hidden md:table-cell w-[20%]">Sector</th>
                        <th className="px-4 py-3 font-semibold text-slate-600 hidden md:table-cell w-[15%]">Rating</th>
                        <th className="px-4 py-3 font-semibold text-slate-600 w-[15%]">Route</th>
                        <th className="px-4 py-3 font-semibold text-slate-600 text-right w-[10%] min-w-[100px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {isLoading && sponsors.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center">
                            <Loader2 size={24} className="animate-spin text-accent-cyan mx-auto mb-2" />
                            <span className="text-text-tertiary text-xs">Loading sponsors...</span>
                          </td>
                        </tr>
                      ) : sponsors.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-text-tertiary">
                            No sponsors found matching your criteria.
                          </td>
                        </tr>
                      ) : (
                        sponsors.map((sponsor, i) => (
                          <tr key={`${sponsor.organisationName}-${i}`} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-4 py-3 font-medium text-slate-800">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                  <Building2 size={14} className="text-slate-500" />
                                </div>
                                <span className="truncate max-w-[150px] sm:max-w-[220px]">{sponsor.organisationName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-500 hidden sm:table-cell truncate max-w-[120px]">
                              {sponsor.townCity}
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <span className="inline-flex px-2 py-1.5 rounded-md text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider leading-tight w-full text-center items-center justify-center">
                                {sponsor.industry}
                              </span>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 uppercase tracking-wider whitespace-nowrap" title={sponsor.rating}>
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                                {sponsor.rating.includes('rating') 
                                  ? sponsor.rating.replace('Worker (', '').replace(')', '') 
                                  : sponsor.rating || 'A RATING'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-[11px]">
                              <div className="flex flex-col gap-1">
                                {sponsor.route.split(',').map((r, idx) => (
                                  <span key={idx} className="leading-tight" title={r.trim()}>{r.trim()}</span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <a
                                href={`/jobs?query=${encodeURIComponent(sponsor.organisationName)}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-900 text-white hover:bg-purple-700 hover:shadow-md transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 whitespace-nowrap"
                              >
                                View Jobs
                              </a>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                
                {/* Pagination Info */}
                {!isLoading && sponsors.length > 0 && (
                  <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">
                      Showing {((page - 1) * 10) + 1} - {Math.min(page * 10, total)} of {total.toLocaleString()}
                    </span>
                    <div className="flex gap-2">
                      <button 
                        disabled={page === 1}
                        onClick={() => handlePageChange(page - 1)}
                        className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-50 disabled:bg-slate-50 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                      >
                        Previous
                      </button>
                      <button 
                        disabled={page * 10 >= total}
                        onClick={() => handlePageChange(page + 1)}
                        className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-50 disabled:bg-slate-50 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </GlassCard>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">One career route</p>
            <h2 className="mt-2 text-xl font-bold text-text-primary">Knowledge Transfer Partnerships (KTPs)</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">KTP Associate roles connect a business with a university or other knowledge base for a defined project. They span technical, operational and management disciplines. Visa arrangements vary by role and employing partner; a partner’s sponsor status does not confirm sponsorship for a specific KTP vacancy.</p>
            <div className="mt-4 flex flex-wrap gap-4"><a href={EXTERNAL_LINKS.ktpJobs} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-accent-cyan">View official KTP jobs <ExternalLink size={16} /></a><a href={`${EXTERNAL_LINKS.jobsAcUk}KTP+Associate`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-accent-cyan">Search jobs.ac.uk <ExternalLink size={16} /></a></div>
          </section>

          {/* Bottom Section: Rules Info */}
          <div className="w-full space-y-6">
            <h2 className="text-2xl font-bold text-text-primary px-1">Visa routes and planning</h2>
            
            <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
              <Tabs
                tabs={VISAS.map(v => ({ label: v.title, value: v.title }))}
                activeTab={activeVisaTab}
                onChange={setActiveVisaTab}
                variant="underline"
              />

              <div className="p-6">
                <motion.div
                    key={activeVisaTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full text-left"
                  >
                    {VISAS.map((visa) => visa.title === activeVisaTab && (
                      <div key={visa.title} className="relative overflow-hidden w-full">
                        <VisaRouteDetails visa={visa} />
                      </div>
                    ))}
                  </motion.div>
              </div>
            </div>
          </div>

        </div>
      </section>
    </main>
  );
}

export default function ImmigrationHubPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-hero-gradient flex items-center justify-center text-text-secondary">Loading Immigration Hub...</div>}>
      <ImmigrationHubContent />
    </Suspense>
  );
}
