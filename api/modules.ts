import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSession } from './_lib/auth.js';
import { describeError, getSql } from './_lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });

  try {
    const sql = getSql();
    const userRows = await sql`SELECT id, role, active FROM arms_users WHERE id = ${session.sub} LIMIT 1`;
    const user = userRows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'الحساب غير نشط أو لم يعد موجوداً.' });

    await sql`CREATE TABLE IF NOT EXISTS arms_module_records (
      module_key TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    if (req.method === 'GET') {
      const rows = await sql`SELECT module_key, data::text AS data_text FROM arms_module_records WHERE module_key IN ('palletReports', 'minutesRecords', 'palletArchive', 'minutesArchive')`;
      const emptyStore = () => ({ boxes: [], dossiers: [], projects: [], uploadHistory: [], notifications: [] });
      const result: Record<string, any> = {
        palletReports: [],
        minutesRecords: [],
        palletArchive: emptyStore(),
        minutesArchive: emptyStore(),
      };
      for (const r of rows) {
        try {
          result[r.module_key] = JSON.parse(r.data_text || (r.module_key.endsWith('Archive') ? '{}' : '[]'));
        } catch {
          result[r.module_key] = r.module_key.endsWith('Archive') ? emptyStore() : [];
        }
      }
      return res.status(200).json(result);
    }

    if (req.method === 'PUT') {
      if (!['System Admin', 'Archive Manager', 'Data Entry'].includes(user.role)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية تعديل سجلات الباليت أو المحاضر.' });
      }
      const body = req.body || {};
      if (body.palletReports !== undefined) {
        if (!Array.isArray(body.palletReports)) return res.status(400).json({ error: 'Invalid palletReports payload.' });
        const payload = JSON.stringify(body.palletReports);
        await sql`INSERT INTO arms_module_records (module_key, data, updated_at)
          VALUES ('palletReports', ${payload}::text::jsonb, NOW())
          ON CONFLICT (module_key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
      }
      if (body.minutesRecords !== undefined) {
        if (!Array.isArray(body.minutesRecords)) return res.status(400).json({ error: 'Invalid minutesRecords payload.' });
        const payload = JSON.stringify(body.minutesRecords);
        await sql`INSERT INTO arms_module_records (module_key, data, updated_at)
          VALUES ('minutesRecords', ${payload}::text::jsonb, NOW())
          ON CONFLICT (module_key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
      }
      for (const key of ['palletArchive', 'minutesArchive'] as const) {
        if (body[key] !== undefined) {
          const store = body[key];
          if (!store || typeof store !== 'object' || !Array.isArray(store.boxes) || !Array.isArray(store.dossiers) || !Array.isArray(store.projects)) {
            return res.status(400).json({ error: `Invalid ${key} payload.` });
          }
          const payload = JSON.stringify(store);
          await sql`INSERT INTO arms_module_records (module_key, data, updated_at)
            VALUES (${key}, ${payload}::text::jsonb, NOW())
            ON CONFLICT (module_key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
        }
      }
      return res.status(200).json({ ok: true, updatedAt: new Date().toISOString() });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    const info = describeError(error, 'Module archive operation failed.');
    return res.status(info.status).json(info);
  }
}
