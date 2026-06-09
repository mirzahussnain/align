/**
 * Heuristically classifies a company name into an industry sector
 * to enrich the GOV.UK licensed sponsor register dataset.
 */
export function getIndustryFromCompany(name: string): string {
  const cleanName = name.toLowerCase();
  
  if (
    cleanName.includes('health') || 
    cleanName.includes('medical') || 
    cleanName.includes('hospital') || 
    cleanName.includes('care') || 
    cleanName.includes('nhs') || 
    cleanName.includes('clinic') || 
    cleanName.includes('dental') || 
    cleanName.includes('pharma') || 
    cleanName.includes('surgery') || 
    cleanName.includes('nursing')
  ) {
    return 'Healthcare & Life Sciences';
  }
  
  if (
    cleanName.includes('software') || 
    cleanName.includes('tech') || 
    cleanName.includes('digital') || 
    cleanName.includes('systems') || 
    cleanName.includes('comput') || 
    cleanName.includes('cyber') || 
    cleanName.includes('data') || 
    cleanName.includes('telecom') || 
    cleanName.includes('mobile') || 
    cleanName.includes('network') ||
    cleanName.includes('ai ') ||
    cleanName.includes('robotics') ||
    cleanName.includes('intelligence')
  ) {
    return 'Technology & Software';
  }
  
  if (
    cleanName.includes('university') || 
    cleanName.includes('school') || 
    cleanName.includes('college') || 
    cleanName.includes('academy') || 
    cleanName.includes('educat') || 
    cleanName.includes('learn') || 
    cleanName.includes('research') ||
    cleanName.includes('teach') ||
    cleanName.includes('science')
  ) {
    return 'Education & Research';
  }
  
  if (
    cleanName.includes('consulting') || 
    cleanName.includes('advisor') || 
    cleanName.includes('finance') || 
    cleanName.includes('bank') || 
    cleanName.includes('capital') || 
    cleanName.includes('invest') || 
    cleanName.includes('audit') || 
    cleanName.includes('tax') || 
    cleanName.includes('wealth') ||
    cleanName.includes('insurance') ||
    cleanName.includes('securities') ||
    cleanName.includes('account')
  ) {
    return 'Finance & Consulting';
  }
  
  if (
    cleanName.includes('build') || 
    cleanName.includes('construct') || 
    cleanName.includes('engineer') || 
    cleanName.includes('industr') || 
    cleanName.includes('motor') || 
    cleanName.includes('manufactur') ||
    cleanName.includes('steel') ||
    cleanName.includes('chemical') ||
    cleanName.includes('energy') ||
    cleanName.includes('power')
  ) {
    return 'Engineering & Manufacturing';
  }
  
  if (
    cleanName.includes('retail') || 
    cleanName.includes('shop') || 
    cleanName.includes('market') || 
    cleanName.includes('food') || 
    cleanName.includes('hotel') || 
    cleanName.includes('restaur') || 
    cleanName.includes('travel') || 
    cleanName.includes('leisure') ||
    cleanName.includes('supermarket') ||
    cleanName.includes('catering') ||
    cleanName.includes('pub ') ||
    cleanName.includes('bar ')
  ) {
    return 'Retail & Hospitality';
  }
  
  if (
    cleanName.includes('council') || 
    cleanName.includes('government') || 
    cleanName.includes('charity') || 
    cleanName.includes('ministry') || 
    cleanName.includes('church') || 
    cleanName.includes('trust') ||
    cleanName.includes('foundation') ||
    cleanName.includes('association')
  ) {
    return 'Public Sector & Non-Profit';
  }
  
  return 'General Business Services';
}
