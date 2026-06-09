'use client';

import { FormEvent, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MapPin, Briefcase, Loader2, Globe, Building2, AlertCircle, Filter, X } from 'lucide-react';
import Navbar from '@/shared/components/layout/Navbar';
import GlassCard from '@/shared/components/ui/GlassCard';
import { Input } from '@/shared/components/ui/Input';
import Button from '@/shared/components/ui/Button';
import MobileModal from '@/shared/components/ui/MobileModal';
import JobCard from '@/features/jobs/components/JobCard';
import { useJobs } from '@/features/jobs/hooks/useJobs';
import { SOURCES, SALARY_OPTIONS, TECH_FILTER_OPTIONS } from '@/shared/constants/jobs-config';
import { EXTERNAL_LINKS } from '@/shared/constants/navigation';

export default function JobBoardsPage() {
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const {
    query,
    setQuery,
    location,
    setLocation,
    source,
    setSource,
    contractType,
    setContractType,
    techFilter,
    setTechFilter,
    salaryMin,
    setSalaryMin,
    sponsorshipFilter,
    setSponsorshipFilter,
    experienceLevel,
    setExperienceLevel,
    sortBy,
    setSortBy,
    jobs,
    total,
    isLoading,
    hasSearched,
    sources,
    error,
    page,
    searchJobs,
  } = useJobs();

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    searchJobs(1);
  };

  const crossPlatformQuery = encodeURIComponent(query || 'software developer');

  return (
    <main className="min-h-screen bg-hero-gradient">
      <Navbar />

      <section className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-text-primary mb-2">UK Job Boards</h1>
          <p className="text-text-secondary">
            Search across Reed, Adzuna & Jooble with real-time visa sponsorship detection
          </p>
        </motion.div>

        {/* Search Form */}
        <motion.form
          onSubmit={handleSearch}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4 sm:p-6 mb-6"
        >
          <div className="space-y-4">
            {/* First Row: 60/40 Input Fields */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="md:col-span-3">
                <Input
                  icon={<Search size={16} />}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Job title, keywords, or company..."
                />
              </div>
              <div className="md:col-span-2">
                <Input
                  icon={<MapPin size={16} />}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City or region..."
                />
              </div>
            </div>

            {/* Mobile Advanced Filters Toggle */}
            <div className="md:hidden pt-1">
              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                onClick={() => setShowMobileFilters(true)}
              >
                <Filter size={16} /> Advanced Search Filters
              </Button>
            </div>

            {/* Advanced Filters Container using MobileModal */}
            <MobileModal
              isOpen={showMobileFilters}
              onClose={() => setShowMobileFilters(false)}
              title="Advanced Filters"
              footer={
                <Button 
                  type="button" 
                  className="w-full py-3.5 bg-text-primary hover:bg-text-primary/90 text-white rounded-xl font-bold tracking-wide"
                  onClick={() => setShowMobileFilters(false)}
                >
                  Apply Filters
                </Button>
              }
            >
              <div className="space-y-6 md:space-y-4">
                {/* Second Row: Sources Tabs & Dropdowns */}
            <div className="flex flex-col xl:flex-row gap-3 items-start xl:items-center justify-between">
              {/* Source Tabs */}
              <div className="flex gap-1 bg-bg-tertiary/50 rounded-lg p-1 border border-border-subtle h-[42px] items-center w-full xl:w-auto overflow-x-auto whitespace-nowrap">
                {SOURCES.map((s) => (
                  <Button
                    key={s.id}
                    type="button"
                    variant={source === s.id ? 'primary' : 'ghost'}
                    size="sm"
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      source === s.id
                        ? 'bg-accent-purple/20 text-accent-purple border-transparent hover:bg-accent-purple/30 shadow-none hover:shadow-none hover:-translate-y-0'
                        : 'text-text-tertiary hover:text-text-secondary hover:bg-transparent border-transparent'
                    }`}
                    onClick={() => setSource(s.id)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>

              {/* Dropdowns */}
              <div className="flex flex-wrap gap-2 w-full xl:w-auto xl:justify-end">
                <select
                  value={sponsorshipFilter}
                  onChange={(e) => setSponsorshipFilter(e.target.value)}
                  className="flex-1 min-w-[140px] px-3 h-[42px] bg-bg-tertiary border border-border-subtle rounded-xl text-xs font-medium focus:outline-none focus:border-accent-purple/50"
                >
                  <option value="all">Any Sponsorship</option>
                  <option value="yes">Verified Sponsor Only</option>
                  <option value="no">No Sponsorship</option>
                </select>

                <select
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  className="flex-1 min-w-[130px] px-3 h-[42px] bg-bg-tertiary border border-border-subtle rounded-xl text-xs font-medium focus:outline-none focus:border-accent-purple/50"
                >
                  <option value="all">Any Experience</option>
                  <option value="junior">Junior / Grad</option>
                  <option value="mid">Mid-Level</option>
                  <option value="senior">Senior / Lead</option>
                </select>

                <select
                  value={contractType}
                  onChange={(e) => setContractType(e.target.value)}
                  className="flex-1 min-w-[120px] px-3 h-[42px] bg-bg-tertiary border border-border-subtle rounded-xl text-xs font-medium focus:outline-none focus:border-accent-purple/50"
                >
                  <option value="all">All Types</option>
                  <option value="permanent">Permanent</option>
                  <option value="contract">Contract</option>
                  <option value="temporary">Temporary</option>
                </select>

                <select
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  className="flex-1 min-w-[120px] px-3 h-[42px] bg-bg-tertiary border border-border-subtle rounded-xl text-xs font-medium focus:outline-none focus:border-accent-purple/50"
                >
                  {SALARY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="flex-1 min-w-[140px] px-3 h-[42px] bg-bg-tertiary border border-border-subtle rounded-xl text-xs font-medium focus:outline-none focus:border-accent-purple/50"
                >
                  <option value="relevance">Sort: Relevance</option>
                  <option value="date">Sort: Newest</option>
                  <option value="salary">Sort: Highest Salary</option>
                </select>
              </div>
            </div>

            {/* Third Row: Tech Stack filter tags */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-subtle/50">
              <span className="text-xs font-semibold text-text-tertiary mr-2">Tech Focus:</span>
              {TECH_FILTER_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={techFilter === opt.value ? 'primary' : 'outline'}
                  size="sm"
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    techFilter === opt.value
                      ? 'bg-accent-purple/10 text-accent-purple border-accent-purple/30 shadow-sm hover:shadow-md hover:-translate-y-0'
                      : 'bg-white text-slate-500 border-slate-200'
                  }`}
                  onClick={() => setTechFilter(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>

              </div>
            </MobileModal>

            {/* Fourth Row: Big Search Button */}
            <Button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="w-full h-12 mt-2 rounded-xl bg-gradient-purple text-white text-base font-bold tracking-wide hover:glow-purple shadow-sm border-transparent"
            >
              {isLoading ? <Loader2 size={20} className="animate-spin mr-2" /> : <Search size={20} className="mr-2" />}
              {isLoading ? 'Searching...' : 'Search Jobs'}
            </Button>
          </div>
        </motion.form>

        {/* Cross-Platform Links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap gap-2 mb-6"
        >
          <span className="text-xs text-text-tertiary self-center mr-1">Also search on:</span>
          <a
            href={`${EXTERNAL_LINKS.linkedin}${crossPlatformQuery}&location=United%20Kingdom`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A66C2]/10 text-[#0A66C2] text-xs font-medium hover:bg-[#0A66C2]/20 transition-colors border border-[#0A66C2]/20"
          >
            <Globe size={12} /> LinkedIn
          </a>
          <a
            href={`${EXTERNAL_LINKS.indeed}${crossPlatformQuery}&l=United+Kingdom`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2557a7]/10 text-[#2557a7] text-xs font-medium hover:bg-[#2557a7]/20 transition-colors border border-[#2557a7]/20"
          >
            <Briefcase size={12} /> Indeed
          </a>
          <a
            href={`${EXTERNAL_LINKS.govFindJob}${crossPlatformQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00703C]/10 text-[#00703C] text-xs font-medium hover:bg-[#00703C]/20 transition-colors border border-[#00703C]/20"
          >
            <Globe size={12} /> GOV.UK Find a Job
          </a>
          <a
            href={EXTERNAL_LINKS.ktpJobs}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-purple/10 text-accent-purple text-xs font-medium hover:bg-accent-purple/20 transition-colors border border-accent-purple/20"
          >
            <Building2 size={12} /> KTP Jobs
          </a>
          <a
            href={`${EXTERNAL_LINKS.jobsAcUk}KTP+Associate`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-cyan/10 text-accent-cyan text-xs font-medium hover:bg-accent-cyan/20 transition-colors border border-accent-cyan/20"
          >
            <Building2 size={12} /> Jobs.ac.uk
          </a>
        </motion.div>

        {/* Source Stats */}
        {sources.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {sources.map((s) => (
              <span
                key={s.name}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                  s.error
                    ? 'bg-error/10 text-error border border-error/20'
                    : 'bg-bg-tertiary text-text-secondary border border-border-subtle'
                }`}
              >
                {s.error ? <AlertCircle size={10} /> : null}
                {s.name}: {s.error ? 'Error' : `${s.count} jobs`}
              </span>
            ))}
            <span className="text-xs text-text-tertiary self-center ml-2">
              Total: {jobs.length} results
            </span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm mb-6 flex items-start gap-2 max-w-2xl">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {/* First Page Loading State */}
        {isLoading && jobs.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-accent-purple" />
          </div>
        )}

        {!isLoading && hasSearched && jobs.length === 0 && (
          <GlassCard hover={false} className="text-center py-12">
            <Search size={40} className="text-text-tertiary mx-auto mb-4" />
            <p className="text-text-secondary">No jobs found. Try different keywords or location.</p>
          </GlassCard>
        )}

        {!isLoading && !hasSearched && (
          <GlassCard hover={false} className="text-center py-12">
            <Briefcase size={40} className="text-text-tertiary mx-auto mb-4" />
            <p className="text-text-secondary mb-2">Search for UK tech jobs across multiple boards</p>
            <p className="text-xs text-text-tertiary">Try filtering by minimum salary or tech stacks for better matches</p>
          </GlassCard>
        )}

        <AnimatePresence>
          {jobs.length > 0 && (
            <div className="space-y-3">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* Pagination Load More */}
        {hasSearched && jobs.length > 0 && jobs.length < total && (
          <div className="mt-8 flex justify-center">
            <Button
              variant="outline"
              onClick={() => searchJobs(page + 1)}
              disabled={isLoading}
              className="rounded-xl px-8"
            >
              {isLoading ? <><Loader2 size={16} className="animate-spin mr-2" /> Loading...</> : 'Load More Jobs'}
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
