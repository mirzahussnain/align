import { URL } from 'node:url';
const value = process.env.DATABASE_URL;
if (!value) throw new Error('DATABASE_URL is required. Refusing local database reset.');
let url: URL;
try { url = new URL(value); } catch { throw new Error('DATABASE_URL is invalid. Refusing local database reset.'); }
const localHosts = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);
if (!localHosts.has(url.hostname.toLowerCase())) throw new Error(`Database host ${url.hostname || 'unknown'} is not confidently local. Refusing reset.`);
if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') throw new Error('Production environment detected. Refusing local database reset.');
console.log(`Local database guard passed: host=${url.hostname}; port=${url.port || '5432'}; database=${url.pathname.replace(/^\//, '')}; environment=${process.env.NODE_ENV || 'development'}.`);