import * as cheerio from 'cheerio';
import { json, fetchText, norm, timeJaTo24, validDate, todayJst } from './_util.js';

const SOURCE = 'https://usjreal.asumirai.info/guide/usj-monthly-open.html';

function parseRowCells($, tr) {
  return $(tr).find('th,td').map((_, td) => norm($(td).text())).get();
}

function normalizeMd(s = '') {
  const m = String(s).match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : null;
}

function parseOpening(html, date) {
  const $ = cheerio.load(html);
  const [year, month, day] = date.split('-').map(Number);
  const md = `${month}/${day}`;
  let result = null;
  let currentYear = null;

  $('h2,h3,h4,table').each((_, el) => {
    if (result) return;
    const tag = el.tagName?.toLowerCase();
    if (tag && /^h[234]$/.test(tag)) {
      const ym = norm($(el).text()).match(/(20\d{2})年\s*(\d{1,2})月/);
      if (ym) currentYear = Number(ym[1]);
      return;
    }
    if (tag !== 'table') return;
    const nearest = norm($(el).prevAll('h2,h3,h4').first().text());
    const ym = nearest.match(/(20\d{2})年\s*(\d{1,2})月/);
    const tableYear = ym ? Number(ym[1]) : currentYear;
    $(el).find('tr').each((__, tr) => {
      if (result) return;
      const c = parseRowCells($, tr);
      if (c.length < 3 || normalizeMd(c[0]) !== md) return;
      if (tableYear && tableYear !== year) return;
      const hours = String(c[1] || '').match(/([0-2]?\d:[0-5]\d)\s*[〜~\-–]\s*([0-2]?\d:[0-5]\d)/);
      const predicted = timeJaTo24(c[2] || '');
      const actual = timeJaTo24(c[3] || '');
      result = {
        date,
        scheduledFromFanSite: hours ? { open: hours[1].padStart(5, '0'), close: hours[2].padStart(5, '0') } : null,
        predicted,
        actual,
        status: actual ? 'reported' : (predicted ? 'forecast-only' : 'not-found')
      };
    });
  });

  // Fallback for markup without actual <table> elements.
  if (!result) {
    const text = $('body').text().replace(/\r/g, '');
    const escaped = md.replace('/', '\\/');
    const re = new RegExp(`${escaped}[^\\n]*[\\n\\s|]+([0-2]?\\d:[0-5]\\d)\\s*[〜~\\-–]\\s*([0-2]?\\d:[0-5]\\d)[^\\n]*[\\n\\s|]+(\\d{1,2}時(?:\\d{1,2}分)?)(?:[^\\n]*[\\n\\s|]+(\\d{1,2}時(?:\\d{1,2}分)?))?`);
    const m = text.match(re);
    if (m) result = { date, scheduledFromFanSite: { open: m[1].padStart(5,'0'), close: m[2].padStart(5,'0') }, predicted: timeJaTo24(m[3]), actual: timeJaTo24(m[4] || ''), status: m[4] ? 'reported' : 'forecast-only' };
  }
  return result || { date, scheduledFromFanSite: null, predicted: null, actual: null, status: 'not-found' };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
  const date = validDate(req.query?.date) ? req.query.date : todayJst();
  try {
    const html = await fetchText(SOURCE);
    return json(res, 200, {
      ...parseOpening(html, date),
      source: SOURCE,
      sourceType: 'third-party',
      disclaimer: 'USJ公式が公表する実開園時刻ではありません。第三者サイトの記録または予想です。'
    }, 900);
  } catch (e) {
    return json(res, 502, { error: 'opening_fetch_failed', detail: String(e.message || e), date, source: SOURCE });
  }
}
