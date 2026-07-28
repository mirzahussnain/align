import { prisma } from '../src/shared/lib/prisma.ts';
import { refreshGreenhouseEmployerSources } from '../src/shared/services/greenhouse-refresh.ts';

const source = process.argv.find((value) => value.startsWith('--source='))?.slice('--source='.length);
const company = process.argv.find((value) => value.startsWith('--company='))?.slice('--company='.length);
const concurrency = Number(process.argv.find((value) => value.startsWith('--concurrency='))?.slice('--concurrency='.length) ?? 3);
if (!source && !company && !process.argv.includes('--all')) throw new Error('Select --source=<id>, --company=<id>, or --all. This command never refreshes boards implicitly.');
try { console.log(JSON.stringify(await refreshGreenhouseEmployerSources({ ...(source ? { sourceIds: [source] } : {}), ...(company ? { companyRecordId: company } : {}), all: process.argv.includes('--all'), concurrency }), null, 2)); } finally { await prisma.$disconnect(); }