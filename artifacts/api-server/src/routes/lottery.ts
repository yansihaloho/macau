import { Router } from "express";

const router = Router();

const MONTH_MAP: Record<string, number> = {
  JANUARI: 1, FEBRUARI: 2, MARET: 3, APRIL: 4,
  MEI: 5, JUNI: 6, JULI: 7, AGUSTUS: 8,
  SEPTEMBER: 9, OKTOBER: 10, NOVEMBER: 11, DESEMBER: 12,
};

const URLS: Record<number, string> = {
  2026: "https://masterlive.net/data-totomacau-lengkap-2026.php",
  2025: "https://masterlive.net/data-totomacau-lengkap-2025.php",
};

const cache: Record<number, { data: LotteryYearData; fetchedAt: number }> = {};
const CACHE_TTL_MS = 10 * 60 * 1000;

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

interface MonthData {
  month: string;
  monthNumber: number;
  year: number;
  results: DrawResult[];
}

interface LotteryYearData {
  year: number;
  months: MonthData[];
  totalDraws: number;
  lastUpdated: string;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function nullOrVal(val: string): string | null {
  const v = val.trim();
  return v === "" || v === "-" ? null : v;
}

function parseHtml(html: string, year: number): MonthData[] {
  const months: MonthData[] = [];

  // Extract each month block — find table sections between HASIL TOTO MACAU MONTH YEAR headers
  const monthBlockRe =
    /HASIL TOTO MACAU\s+([A-Z]+)\s+(\d{4})([\s\S]*?)(?=HASIL TOTO MACAU|DATA TOTO MACAU LENGKAP|<\/div>|$)/gi;

  let match: RegExpExecArray | null;
  while ((match = monthBlockRe.exec(html)) !== null) {
    const monthName = match[1].toUpperCase();
    const blockYear = parseInt(match[2], 10);
    if (blockYear !== year) continue;

    const monthNum = MONTH_MAP[monthName];
    if (!monthNum) continue;

    const block = match[3];
    const results: DrawResult[] = [];

    // Each data row looks like:
    // <th> Kamis<br>18 Juni 2026</th><td> 5304</td><td> 6944</td>...<tr>
    // OR on clean rows with <tr> at start and </tr> at end
    // We'll extract <th>...</th> followed by up to 6 <td>...</td>
    const rowRe = /<th>([\s\S]*?)<\/th>((?:<td>[\s\S]*?<\/td>)*)/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRe.exec(block)) !== null) {
      const thContent = rowMatch[1];
      const tdsRaw = rowMatch[2];

      // th content: " Kamis<br>18 Juni 2026" or "HARI & TANGGAL"
      const thText = stripTags(thContent).trim();
      if (thText.includes("HARI") || thText.includes("TANGGAL")) continue;

      // Split on <br> tag
      const brSplit = thContent.split(/<br\s*\/?>/i);
      if (brSplit.length < 2) continue;

      const day = stripTags(brSplit[0]).trim();
      const date = stripTags(brSplit[1]).trim();
      if (!day || !date) continue;

      // Extract td values
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

    if (results.length > 0) {
      months.push({ month: monthName, monthNumber: monthNum, year: blockYear, results });
    }
  }

  months.sort((a, b) => b.monthNumber - a.monthNumber);
  return months;
}

async function fetchAndParse(year: number): Promise<LotteryYearData> {
  const url = URLS[year];
  if (!url) throw new Error(`Unsupported year: ${year}`);

  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);

  const html = await resp.text();
  const months = parseHtml(html, year);
  const totalDraws = months.reduce((s, m) => s + m.results.length, 0);

  return { year, months, totalDraws, lastUpdated: new Date().toISOString() };
}

async function getYearData(year: number): Promise<LotteryYearData> {
  const cached = cache[year];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;
  const data = await fetchAndParse(year);
  cache[year] = { data, fetchedAt: Date.now() };
  return data;
}

router.get("/lottery/macau", async (req, res) => {
  const year = Number(req.query["year"]);
  if (!URLS[year]) {
    res.status(400).json({ error: "year must be 2025 or 2026" });
    return;
  }
  try {
    const data = await getYearData(year);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch lottery data");
    res.status(500).json({ error: "Failed to fetch lottery data" });
  }
});

router.get("/lottery/macau/latest", async (_req, res) => {
  try {
    const data = await getYearData(2026);
    const latestMonth = data.months[0];
    if (!latestMonth || latestMonth.results.length === 0) {
      res.status(404).json({ error: "No data available" });
      return;
    }
    const latest = latestMonth.results[0];
    res.json({
      date: latest.date,
      day: latest.day,
      results: [
        { session: "00:01 WIB", number: latest.s0001 },
        { session: "13:00 WIB", number: latest.s1300 },
        { session: "16:00 WIB", number: latest.s1600 },
        { session: "19:00 WIB", number: latest.s1900 },
        { session: "22:00 WIB", number: latest.s2200 },
        { session: "23:00 WIB", number: latest.s2300 },
      ],
      recentDays: latestMonth.results.slice(0, 7),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch latest results" });
  }
});

router.get("/lottery/macau/stats", async (req, res) => {
  const year = Number(req.query["year"]);
  if (!URLS[year]) {
    res.status(400).json({ error: "year must be 2025 or 2026" });
    return;
  }
  try {
    const data = await getYearData(year);
    const freq: Record<string, number> = {};
    const digitFreq: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 0 };
    let totalDraws = 0;

    for (const month of data.months) {
      for (const draw of month.results) {
        for (const num of [draw.s0001, draw.s1300, draw.s1600, draw.s1900, draw.s2200, draw.s2300]) {
          if (!num) continue;
          freq[num] = (freq[num] ?? 0) + 1;
          for (const ch of num) if (digitFreq[ch] !== undefined) digitFreq[ch]++;
          totalDraws++;
        }
      }
    }

    const sorted = Object.entries(freq)
      .map(([number, count]) => ({ number, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      year,
      totalDraws,
      mostFrequent: sorted.slice(0, 20),
      leastFrequent: sorted.slice(-20).reverse(),
      digitFrequency: digitFreq,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to compute stats" });
  }
});

export default router;
