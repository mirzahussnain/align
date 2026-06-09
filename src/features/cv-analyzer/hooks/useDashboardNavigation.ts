import { useState, useRef, useEffect } from 'react';

export function useDashboardNavigation() {
  const [activeItem, setActiveItem] = useState<string>('overview');
  const [activeRewriteIndex, setActiveRewriteIndex] = useState<number>(0);
  const [cvViewMode, setCvViewMode] = useState<'annotated' | 'original'>('annotated');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    overview: true,
    content: true,
    keywords: true,
    sections: true,
    compliance: true,
    'ai-tools': true
  });

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const scrollToSection = (sectionId: string) => {
    setActiveItem(sectionId);
    const element = document.getElementById(`section-${sectionId}`);
    if (element) {
      const isMobile = window.innerWidth < 1024;
      const yOffset = isMobile ? -140 : -90; 
      const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const elements = document.querySelectorAll('[id^="section-"]');
    if (elements.length === 0) return;

    observer.current = new IntersectionObserver((entries) => {
      const intersecting = entries.find(entry => entry.isIntersecting);
      if (intersecting) {
        const id = intersecting.target.id.replace('section-', '');
        setActiveItem(id);
      }
    }, {
      root: null,
      rootMargin: '-20% 0px -70% 0px',
      threshold: 0
    });

    elements.forEach((el) => observer.current?.observe(el));

    return () => {
      observer.current?.disconnect();
    };
  }, []);

  return {
    activeItem,
    setActiveItem,
    activeRewriteIndex,
    setActiveRewriteIndex,
    cvViewMode,
    setCvViewMode,
    expandedGroups,
    setExpandedGroups,
    toggleGroup,
    scrollToSection,
  };
}
