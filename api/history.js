import * as cheerio from 'cheerio';
import { json, fetchText, norm, PARK_ID, validDate } from './_util.js';

function tables($) {
  return $('table').map((_, table) => {
    const heading = norm($(table).prevAll('h1,h2,h3,h4').first().text());
    const rows = $(table).find('tr').map((__, tr) =>
      $(tr).find('th,td').map((___, td) => norm($(td).text())).get()
    ).get().filter(r => r.length);
    return { heading, rows };
  }).get();
}

function tableMatching($, regex) {
  const direct = tables($).find(t => regex.test(t.heading));
  if (direct) return direct.rows;
  const heading = $('h1,h2,h3,h4').filter((_, el) => regex.test(norm($(el).text()))).first();
  if (!heading.length) return [];
  const t = heading.nextAll('table').first();
  if (!t.length) return [];
  return t.find('tr').map((_, tr) => $(tr).find('th,td').map((__, td) => norm($(td).text())).get()).get();
}

function n(v) {
  const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function numericRows(rows) {
  return rows.slice(1).map(c => ({
    label: c[0], average: n(c[1]), maximumAverage: n(c[2])
  })).filter(x => x.label && Number.isFinite(x.average));
}

function parseRideStats(html, rideId, year) {
  const $ = cheerio.load(html);
  const h1 = norm($('h1').first().text());
  const name = h1.replace(/\s+at Universal Studios Japan.*$/i, '').trim() || h1;
  return {
    rideId: Number(rideId),
    name,
    year: year || 'all',
    months: numericRows(tableMatching($, /Average (?:wait|queue) time by month/i)),
    weekdays: numericRows(tableMatching($, /Average (?:wait|queue) time by day\b/i)),
    hours: numericRows(tableMatching($, /Average (?:wait|queue) time by hour/i)),
    years: numericRows(tableMatching($, /Average (?:wait|queue) time by year/i))
  };
}

function parseDaily(html, date) {
  const $ = cheerio.load(html);
  const candidates = tables($);
  let rows = tableMatching($, /Average (?:wait|queue) time by ride/i);
  if (!rows.length) {
    rows = candidates.find(t => t.rows[0]?.some(c => /ride|attraction/i.test(c)) && t.rows[0]?.some(c => /average/i.test(c)))?.rows || [];
  }
  const rides = rows.slice(1).map(c => ({ name: c[0], average: n(c[1]), maximum: n(c[2]) }))
    .filter(x => x.name && Number.isFinite(x.average));
  const body = norm($('body').text());
  const hrs = body.match(/([0-2]?\d:[0-5]\d)\s*[-–〜~]\s*([0-2]?\d:[0-5]\d)/);
  return {
    date,
    heading: norm($('h1').first().text()),
    parkHours: hrs ? { open: hrs[1].padStart(5, '0'), close: hrs[2].padStart(5, '0') } : null,
    rides
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
  const { type = 'ride', id, year, date } = req.query || {};
  try {
    if (type === 'date') {
      if (!validDate(date)) return json(res, 400, { error: 'invalid_date' });
      const [y, m, d] = date.split('-');
      const url = `https://queue-times.com/en-US/parks/${PARK_ID}/calendar/${y}/${m}/${d}`;
      return json(res, 200, { source: url, ...parseDaily(await fetchText(url), date) }, 21600);
    }
    if (!/^\d+$/.test(String(id || ''))) return json(res, 400, { error: 'invalid_ride_id' });
    const y = year && /^\d{4}$/.test(String(year)) ? String(year) : 'all';
    const url = `https://queue-times.com/en-US/parks/${PARK_ID}/rides/${id}${y === 'all' ? '' : `/${y}`}`;
    return json(res, 200, { source: url, ...parseRideStats(await fetchText(url), id, y) }, 21600);
  } catch (e) {
    return json(res, 502, { error: 'history_fetch_failed', detail: String(e.message || e) });
  }
}
