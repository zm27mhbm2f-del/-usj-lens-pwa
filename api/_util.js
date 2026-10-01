import * as cheerio from 'cheerio';

export const PARK_ID = 284;
export const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1 USJ-Lens-PWA/2.0';

export function json(res, status, body, maxAge = 0) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', maxAge ? `s-maxage=${maxAge}, stale-while-revalidate=${Math.max(60, maxAge * 2)}` : 'no-store');
  res.end(JSON.stringify(body));
}

export async function fetchText(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeout || 12000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'user-agent': UA,
        'accept-language': 'ja,en-US;q=0.8,en;q=0.7',
        accept: 'text/html,application/xhtml+xml',
        ...(options.headers || {})
      }
    });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeout || 12000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: 'application/json', ...(options.headers || {}) }
    });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

export function norm(s = '') {
  return String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function htmlText(html) {
  const $ = cheerio.load(html);
  $('script,style,noscript,template').remove();
  return norm($.root().text());
}

export function todayJst() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

export function validDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

export function to24(h, m, ampm = '') {
  let n = Number(h);
  if (/PM/i.test(ampm) && n < 12) n += 12;
  if (/AM/i.test(ampm) && n === 12) n = 0;
  return `${String(n).padStart(2, '0')}:${m}`;
}

export function extractTimes(text = '') {
  const out = [];
  const re = /(?:(AM|PM)\s*)?([0-2]?\d)[:：]([0-5]\d)(?:\s*(AM|PM))?/gi;
  let m;
  while ((m = re.exec(String(text)))) {
    const hh = Number(m[2]);
    if (hh > 23) continue;
    out.push(to24(m[2], m[3], m[1] || m[4] || ''));
  }
  return [...new Set(out)];
}

export function timeJaTo24(s = '') {
  const m = String(s).match(/(\d{1,2})\s*時\s*(\d{1,2})?\s*分?/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] || 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
