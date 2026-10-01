import { json, fetchJson, PARK_ID } from './_util.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
  try {
    const data = await fetchJson(`https://queue-times.com/parks/${PARK_ID}/queue_times.json`);
    const rides = [];
    const pushRide = (ride, land = 'その他') => rides.push({
      id: Number(ride.id),
      name: String(ride.name || ''),
      land,
      isOpen: Boolean(ride.is_open),
      wait: Number(ride.wait_time || 0),
      updatedAt: ride.last_updated || null
    });
    for (const land of (Array.isArray(data.lands) ? data.lands : [])) {
      for (const ride of (land.rides || [])) pushRide(ride, land.name || 'その他');
    }
    for (const ride of (Array.isArray(data.rides) ? data.rides : [])) pushRide(ride);

    const unique = [...new Map(rides.map(r => [r.id, r])).values()];
    const updatedAt = unique.map(r => r.updatedAt).filter(Boolean).sort().at(-1) || new Date().toISOString();
    const open = unique.filter(r => r.isOpen);
    const waits = open.map(r => r.wait).filter(Number.isFinite);
    const average = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;
    return json(res, 200, {
      parkId: PARK_ID,
      fetchedAt: new Date().toISOString(),
      updatedAt,
      summary: { total: unique.length, open: open.length, average },
      rides: unique
    }, 60);
  } catch (e) {
    return json(res, 502, { error: 'live_fetch_failed', detail: String(e.message || e) });
  }
}
