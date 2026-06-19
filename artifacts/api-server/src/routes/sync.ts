import { Router } from "express";
import { db } from "@workspace/db";
import { drawHistoryTable } from "@workspace/db";

const router = Router();

const MONTH_MAP: Record<string, number> = {
  JANUARI: 1, FEBRUARI: 2, MARET: 3, APRIL: 4,
  MEI: 5, JUNI: 6, JULI: 7, AGUSTUS: 8,
  SEPTEMBER: 9, OKTOBER: 10, NOVEMBER: 11, DESEMBER: 12,
};

const MONTH_NUM_TO_EN: Record<number, string> = {
  1: "01", 2: "02", 3: "03", 4: "04", 5: "05", 6: "06",
  7: "07", 8: "08", 9: "09", 10: "10", 11: "11", 12: "12",
};

const URLS: Record<number, string> = {
  2026: "https://masterlive.net/data-totomacau-lengkap-2026.php",
  2025: "https://masterlive.net/data-totomacau-lengkap-2025.php",
};

const SESSIONS = [
  { key: "s0001", label: "00:01" },
  { key: "s1300", label: "13:00" },
  { key: "s1600", label: "16:00" },
  { key: "s1900", label: "19:00" },
  { key: "s2200", label: "22:00" },
  { key: "s2300", label: "23:00" },
] as const;

type SessionKey = (typeof SESSIONS)[number]["key"];

interface DrawResult {
  date: string;
  day: string;
  s0001: string | null;
  s1300: string | null;
  s1600: string | null;
  s1900: string | null;
  s2200: string | null;
  s2300: string | null;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function nullOrVal(val: string): string | null {
  const v = val.trim();
  return v === "" || v === "-" || !/^\d{4}$/.test(v) ? null : v;
}

function parseDateToISO(dateStr: string, year: number): string | null {
  const parts = dateStr.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const day = parts[0].padStart(2, "0");
  const monthStr = (parts[1] ?? "").toUpperCase();
  const monthNum = MONTH_MAP[monthStr];
  if (!monthNum) return null;
  return `${year}-${MONTH_NUM_TO_EN[monthNum]}-${day}`;
}

function parseHtml(html: string, year: number): DrawResult[] {
  const results: DrawResult[] = [];

  const monthBlockRe =
    /HASIL TOTO MACAU\s+([A-Z]+)\s+(\d{4})([\s\S]*?)(?=HASIL TOTO MACAU|DATA TOTO MACAU LENGKAP|<\/div>|$)/gi;

  let match: RegExpExecArray | null;
  while ((match = monthBlockRe.exec(html)) !== null) {
    const monthName = match[1].toUpperCase();
    const blockYear = parseInt(match[2], 10);
    if (blockYear !== year) continue;
    if (!MONTH_MAP[monthName]) continue;

    const block = match[3];
    const rowRe = /<th>([\s\S]*?)<\/th>((?:<td>[\s\S]*?<\/td>)*)/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRe.exec(block)) !== null) {
      const thContent = rowMatch[1];
      const tdsRaw = rowMatch[2];
      const thText = stripTags(thContent).trim();
      if (thText.includes("HARI") || thText.includes("TANGGAL")) continue;

      const brSplit = thContent.split(/<br\s*\/?>/i);
      if (brSplit.length < 2) continue;
      const day = stripTags(brSplit[0]).trim();
      const date = stripTags(brSplit[1]).trim();
      if (!day || !date) continue;

      const tdRe = /<td>([\s\S]*?)<\/td>/g;
      const tdVals: string[] = [];
      let tdMatch: RegExpExecArray | null;
      while ((tdMatch = tdRe.exec(tdsRaw)) !== null) {
        tdVals.push(stripTags(tdMatch[1]).trim());
      }

      results.push({
        date,
        day,
        s0001: nullOrVal(tdVals[0] ?? ""),
        s1300: nullOrVal(tdVals[1] ?? ""),
        s1600: nullOrVal(tdVals[2] ?? ""),
        s1900: nullOrVal(tdVals[3] ?? ""),
        s2200: nullOrVal(tdVals[4] ?? ""),
        s2300: nullOrVal(tdVals[5] ?? ""),
      });
    }
  }

  return results;
}

async function scrapeYear(year: number): Promise<DrawResult[]> {
  const resp = await fetch(URLS[year], {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for year ${year}`);
  const html = await resp.text();
  return parseHtml(html, year);
}

export async function syncYearToDb(year: number): Promise<{ inserted: number; skipped: number }> {
  const draws = await scrapeYear(year);

  let inserted = 0;
  let skipped = 0;

  const rows: Array<{
    date: string;
    period: string;
    result: string;
    year: number;
    month: number;
    day: string;
  }> = [];

  for (const draw of draws) {
    const isoDate = parseDateToISO(draw.date, year);
    if (!isoDate) continue;
    const monthNum = parseInt(isoDate.split("-")[1] ?? "1", 10);

    for (const sess of SESSIONS) {
      const result = draw[sess.key as SessionKey];
      if (!result) continue;
      rows.push({
        date: isoDate,
        period: sess.label,
        result,
        year,
        month: monthNum,
        day: draw.day,
      });
    }
  }

  // Upsert in batches to stay within PostgreSQL parameter limit
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const result = await db
      .insert(drawHistoryTable)
      .values(batch)
      .onConflictDoNothing({ target: [drawHistoryTable.date, drawHistoryTable.period] });
    const insertedCount = result.rowCount ?? 0;
    inserted += insertedCount;
    skipped += batch.length - insertedCount;
  }

  return { inserted, skipped };
}

router.post("/lottery/macau/sync", async (req, res) => {
  try {
    const [r2025, r2026] = await Promise.all([syncYearToDb(2025), syncYearToDb(2026)]);
    const inserted = r2025.inserted + r2026.inserted;
    const skipped = r2025.skipped + r2026.skipped;
    const total = inserted + skipped;
    res.json({
      inserted,
      skipped,
      total,
      message: `Sync complete. Inserted ${inserted} new records, skipped ${skipped} duplicates.`,
    });
  } catch (err) {
    req.log.error({ err }, "Sync failed");
    res.status(500).json({ error: "Sync failed" });
  }
});

export default router;
