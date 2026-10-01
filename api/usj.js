import * as cheerio from 'cheerio';
import { json, fetchText, norm } from './_util.js';

const JP_SCHEDULE = 'https://www.usj.co.jp/web/ja/jp/attractions/show-and-attraction-schedule';
const JP_HOURS = 'https://www.usj.co.jp/web/ja/jp/park-guide/schedule/park-hour';
const ACTUAL_OPEN_SOURCE = 'https://usjreal.asumirai.info/guide/usj-monthly-open.html';

function to24(h, m, ampm) {
  let n = Number(h);
  if (ampm && /PM/i.test(ampm) && n < 12) n += 12;
  if (ampm && /AM/i.test(ampm) && n === 12) n = 0;
  return `${String(n).padStart(2,'0')}:${m}`;
}

function extractTimeTokens(text) {
  const out = [];
  const re = /(?:(AM|PM)\s*)?([0-2]?\d)[:：]([0-5]\d)(?:\s*(AM|PM))?/gi;
  let m;
  while ((m = re.exec(text || ''))) out.push(to24(m[2], m[3], m[1] || m[4]));
  return [...new Set(out)];
}

function parseJapaneseClock(text) {
  const m = norm(text).match(/([0-2]?\d)\s*時\s*([0-5]?\d)\s*分?/);
  if (m) return `${String(Number(m[1])).padStart(2,'0')}:${String(Number(m[2])).padStart(2,'0')}`;
  return extractTimeTokens(text)[0] || null;
}

function classify(name) {
  if (/パレード|PARADE/i.test(name)) return 'パレード';
  if (/ストリート|BASH|BLUES|ROCK|TIME/i.test(name)) return 'ストリート';
  if (/ライブ|LIVE|WICKED|SING|SHOW|ショー/i.test(name)) return 'ステージ';
  return 'ショー';
}

function dedupeShows(items) {
  const map = new Map();
  for (const item of items) {
    if (!item?.name || !item?.times?.length) continue;
    const key = item.name.replace(/\s+/g,' ').trim();
    const prior = map.get(key);
    if (!prior) map.set(key, { ...item, times:[...new Set(item.times)].sort() });
    else prior.times = [...new Set([...prior.times, ...item.times])].sort();
  }
  return [...map.values()];
}

function parseShows(html) {
  const $ = cheerio.load(html);
  const shows = [];
  $('h2,h3,h4').each((_, el) => {
    const name = norm($(el).text());
    if (!name || /時刻表|スケジュール|本日|運行時間|休止情報|Time Table/i.test(name)) return;
    let cur = $(el).next();
    let collected = '';
    let guard = 0;
    while (cur.length && guard++ < 7 && !/^h[234]$/i.test(cur[0]?.tagName || '')) {
      collected += ' ' + norm(cur.text());
      cur = cur.next();
    }
    const times = extractTimeTokens(collected);
    if (times.length) shows.push({ name, category: classify(name), times });
  });
  if (shows.length) return dedupeShows(shows);

  const text = $('body').text().replace(/\r/g,'');
  const lines = text.split('\n').map(norm).filter(Boolean);
  for (let i=0;i<lines.length-1;i++) {
    const times = extractTimeTokens(lines[i+1] || '');
    if (times.length && lines[i].length > 3 && !/^\d/.test(lines[i])) {
      shows.push({ name: lines[i], category: classify(lines[i]), times });
    }
  }
  return dedupeShows(shows);
}

function parseHoursFromText(text, requestedDate, allowGeneric = false) {
  const compact = String(text || '').replace(/\s+/g,' ');
  const dateObj = new Date(`${requestedDate}T00:00:00+09:00`);
  const markers = [
    `${dateObj.getFullYear()}年${dateObj.getMonth()+1}月${dateObj.getDate()}日`,
    `${dateObj.getMonth()+1}月${dateObj.getDate()}日`,
    requestedDate
  ];
  for (const marker of markers) {
    const idx = compact.indexOf(marker);
    if (idx >= 0) {
      const slice = compact.slice(idx, idx + 320);
      const t = extractTimeTokens(slice);
      if (t.length >= 2) return { open: t[0], close: t[1] };
    }
  }
  const operation = allowGeneric ? compact.match(/(?:本日の営業時間|営業時間|Operation Hours(?: for Today)?)\D{0,80}((?:AM|PM)?\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[-–〜~]\s*((?:AM|PM)?\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)/i) : null;
  if (operation) {
    const t = extractTimeTokens(`${operation[1]} ${operation[2]}`);
    if (t.length >= 2) return { open: t[0], close: t[1] };
  }
  return null;
}

function parseScheduleDate(html) {
  const $ = cheerio.load(html);
  const text = norm($('h1,h2,h3').map((_, el) => $(el).text()).get().join(' '));
  const m = text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  return m ? `${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}` : null;
}

function parseActualOpenReport(html, requestedDate) {
  const $ = cheerio.load(html);
  const dt = new Date(`${requestedDate}T00:00:00+09:00`);
  const month = dt.getMonth() + 1;
  const day = dt.getDate();
  const target = new RegExp(`^${month}\\/${day}(?:\\D|$)`);
  const bodyText = norm($('body').text());
  const headlinePattern = new RegExp(`実際の開園時間[^。]{0,180}?${month}\\/${day}(?:[^は。]{0,12})?は\\s*([0-2]?\\d)時([0-5]?\\d)分`);
  const headline = bodyText.match(headlinePattern);
  const headlineActual = headline ? `${String(Number(headline[1])).padStart(2,'0')}:${String(Number(headline[2])).padStart(2,'0')}` : null;
  let found = null;

  $('tr').each((_, tr) => {
    if (found) return;
    const cells = $(tr).find('th,td').map((__, td) => norm($(td).text())).get();
    if (cells.length < 2 || !target.test(cells[0] || '')) return;
    const listedHours = extractTimeTokens(cells[1] || '');
    const predicted = parseJapaneseClock(cells[2] || '');
    const actual = parseJapaneseClock(cells[3] || '');
    found = {
      actual: actual || headlineActual || null,
      predicted: predicted || null,
      listedHours: listedHours.length >= 2 ? { open: listedHours[0], close: listedHours[1] } : null,
      source: ACTUAL_OPEN_SOURCE,
      sourceName: 'ユニバリアル',
      kind: (actual || headlineActual) ? 'reported' : predicted ? 'forecast' : 'unavailable'
    };
  });
  if (!found && headlineActual) found = { actual: headlineActual, predicted: null, listedHours: null, source: ACTUAL_OPEN_SOURCE, sourceName: 'ユニバリアル', kind: 'reported' };
  return found;
}


function pageContainsDate(html, requestedDate) {
  if (!html) return false;
  const dt = new Date(`${requestedDate}T00:00:00+09:00`);
  const jp = `${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日`;
  return norm(cheerio.load(html)('body').text()).includes(jp);
}

function officialDateCandidates(base, date) {
  const [y,m,d] = date.split('-');
  return [
    `${base}?date=${encodeURIComponent(date)}`,
    `${base}?date=${encodeURIComponent(`${m}/${d}/${y}`)}`,
    `${base}?date=${encodeURIComponent(`${y}/${m}/${d}`)}`
  ];
}

async function fetchOfficialPageForDate(base, date, allowBaseFallback=false) {
  for (const url of officialDateCandidates(base, date)) {
    const html = await fetchText(url).catch(() => '');
    if (html && pageContainsDate(html, date)) return { html, url, matched:true };
  }
  if (allowBaseFallback) {
    const html = await fetchText(base).catch(() => '');
    if (html) return { html, url:base, matched:pageContainsDate(html, date) };
  }
  return { html:'', url:officialDateCandidates(base, date)[0], matched:false };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query?.date || '')
    ? req.query.date
    : new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
    const [showPage, hoursPage, actualHtml] = await Promise.all([
      fetchOfficialPageForDate(JP_SCHEDULE, date, date === today),
      fetchOfficialPageForDate(JP_HOURS, date, date === today),
      fetchText(ACTUAL_OPEN_SOURCE).catch(() => '')
    ]);

    const schedulePageDate = showPage.html ? parseScheduleDate(showPage.html) : null;
    const canUseShows = showPage.html && (showPage.matched || (date === today && (!schedulePageDate || schedulePageDate === date)));
    const shows = canUseShows ? parseShows(showPage.html) : [];
    let officialHours = null;
    if (hoursPage.html) {
      const bodyText = cheerio.load(hoursPage.html)('body').text();
      officialHours = parseHoursFromText(bodyText, date, date === today);
      if (!hoursPage.matched && date !== today) officialHours = null;
    }
    const openingReport = actualHtml ? parseActualOpenReport(actualHtml, date) : null;

    return json(res, 200, {
      date,
      officialHours,
      openingReport,
      shows,
      source: {
        hours: hoursPage.url,
        shows: showPage.url,
        openingReport: ACTUAL_OPEN_SOURCE
      },
      sourceStatus: {
        hoursDateMatched: hoursPage.matched,
        showsDateMatched: showPage.matched
      },
      note: officialHours ? null : '指定日のUSJ公式営業時間を自動確認できませんでした。誤った別日データは表示しません。'
    }, 900);
  } catch (e) {
    return json(res, 502, { error: 'usj_fetch_failed', detail: String(e.message || e) });
  }
}
