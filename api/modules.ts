import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSession } from './_lib/auth.js';
import { describeError, getSql } from './_lib/db.js';

const emptyStore = () => ({ boxes: [], dossiers: [], projects: [], uploadHistory: [], notifications: [] });
const CHUNKABLE_MODULES = new Set(['palletReports', 'minutesRecords']);

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
      const part = String(req.query.part || '');

      if (part === 'meta') {
        const rows = await sql`SELECT
          module_key,
          CASE WHEN module_key = 'palletReports' AND jsonb_typeof(data) = 'array'
            THEN jsonb_array_length(data)::text
            ELSE data::text
          END AS payload
          FROM arms_module_records
          WHERE module_key IN ('palletReports', 'minutesRecords', 'palletArchive', 'minutesArchive')`;
        const result: Record<string, any> = {
          counts: { palletReports: 0 },
          minutesRecords: [],
          palletArchive: emptyStore(),
          minutesArchive: emptyStore(),
        };
        for (const r of rows) {
          if (r.module_key === 'palletReports') {
            result.counts.palletReports = Math.max(0, Number(r.payload) || 0);
            continue;
          }
          try {
            result[r.module_key] = JSON.parse(r.payload || (r.module_key.endsWith('Archive') ? '{}' : '[]'));
          } catch {
            result[r.module_key] = r.module_key.endsWith('Archive') ? emptyStore() : [];
          }
        }
        return res.status(200).json(result);
      }

      if (part === 'palletReports') {
        const limit = Math.max(1, Math.min(5000, Number(req.query.limit || 2500)));
        const offset = Math.max(0, Number(req.query.offset || 0));
        const rows = await sql`SELECT COALESCE(
          (SELECT jsonb_agg(sub.elem ORDER BY sub.ord)
           FROM (
             SELECT elem, ord
             FROM arms_module_records, jsonb_array_elements(data) WITH ORDINALITY AS t(elem, ord)
             WHERE module_key = 'palletReports' AND jsonb_typeof(data) = 'array'
             ORDER BY ord
             OFFSET ${offset} LIMIT ${limit}
           ) sub),
          '[]'::jsonb
        )::text AS items_text`;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(200).send(`{"items":${rows[0]?.items_text || '[]'}}`);
      }

      const rows = await sql`SELECT module_key, data::text AS data_text FROM arms_module_records WHERE module_key IN ('palletReports', 'minutesRecords', 'palletArchive', 'minutesArchive')`;
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

      if (body.chunked === true) {
        const moduleKey = String(body.moduleKey || '');
        const batchId = String(body.batchId || '');
        const chunkIndex = Number(body.chunkIndex);
        const totalChunks = Number(body.totalChunks);
        const items = body.items;

        if (
          !CHUNKABLE_MODULES.has(moduleKey) ||
          !/^[a-zA-Z0-9_-]{4,64}$/.test(batchId) ||
          !Number.isInteger(chunkIndex) ||
          !Number.isInteger(totalChunks) ||
          totalChunks < 1 ||
          chunkIndex < 0 ||
          chunkIndex >= totalChunks ||
          !Array.isArray(items)
        ) {
          return res.status(400).json({ error: 'Invalid chunked module upload payload.' });
        }

        const chunkJson = JSON.stringify(items);
        if (totalChunks === 1) {
          await sql`INSERT INTO arms_module_records (module_key, data, updated_at)
            VALUES (${moduleKey}, ${chunkJson}::text::jsonb, NOW())
            ON CONFLICT (module_key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
          return res.status(200).json({ ok: true, completed: true, updatedAt: new Date().toISOString() });
        }

        const stageKey = `__stage_${moduleKey}_${batchId}`;
        if (chunkIndex === 0) {
          await sql`DELETE FROM arms_module_records
            WHERE module_key LIKE ${`__stage_${moduleKey}_%`}
              AND updated_at < NOW() - INTERVAL '2 hours'`;
          await sql`INSERT INTO arms_module_records (module_key, data, updated_at)
            VALUES (${stageKey}, ${chunkJson}::text::jsonb, NOW())
            ON CONFLICT (module_key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
          return res.status(200).json({ ok: true, completed: false, chunkIndex });
        }

        if (chunkIndex < totalChunks - 1) {
          const updated = await sql`UPDATE arms_module_records
            SET data = data || ${chunkJson}::text::jsonb, updated_at = NOW()
            WHERE module_key = ${stageKey}
            RETURNING module_key`;
          if (!updated.length) {
            return res.status(409).json({ error: 'انتهت الجلسة المؤقتة للحفظ، يرجى إعادة المحاولة.' });
          }
          return res.status(200).json({ ok: true, completed: false, chunkIndex });
        }

        const staged = await sql`SELECT 1 FROM arms_module_records WHERE module_key = ${stageKey} LIMIT 1`;
        if (!staged.length) {
          return res.status(409).json({ error: 'انتهت الجلسة المؤقتة للحفظ، يرجى إعادة المحاولة.' });
        }
        await sql`INSERT INTO arms_module_records (module_key, data, updated_at)
          VALUES (
            ${moduleKey},
            (SELECT data FROM arms_module_records WHERE module_key = ${stageKey}) || ${chunkJson}::text::jsonb,
            NOW()
          )
          ON CONFLICT (module_key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
        await sql`DELETE FROM arms_module_records WHERE module_key = ${stageKey}`;
        return res.status(200).json({ ok: true, completed: true, updatedAt: new Date().toISOString() });
      }

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
          if (user.role !== 'System Admin') {
            const existingRows = await sql`SELECT data::text AS data_text FROM arms_module_records WHERE module_key = ${key} LIMIT 1`;
            if (existingRows[0]?.data_text) {
              try {
                const existing = JSON.parse(existingRows[0].data_text);
                const prevProjects = Array.isArray(existing?.projects) ? existing.projects.length : 0;
                const prevUploads = Array.isArray(existing?.uploadHistory) ? existing.uploadHistory.length : 0;
                const nextUploads = Array.isArray(store.uploadHistory) ? store.uploadHistory.length : 0;
                if (store.projects.length < prevProjects || nextUploads < prevUploads) {
                  return res.status(403).json({ error: 'مسح الرفعات أو بيانات القسم متاح لمدير النظام (System Admin) فقط.' });
                }
              } catch {
                /* ignore malformed legacy row */
              }
            }
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
