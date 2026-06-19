export const WIB_SESSIONS = ["00:01", "13:00", "16:00", "19:00", "22:00", "23:00"] as const;
export type WIBSession = (typeof WIB_SESSIONS)[number];

const SESSION_TIMES: [number, number][] = [
  [0, 1],
  [13, 0],
  [16, 0],
  [19, 0],
  [22, 0],
  [23, 0],
];

function getWIBNow(): { h: number; m: number; s: number } {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return { h: wib.getUTCHours(), m: wib.getUTCMinutes(), s: wib.getUTCSeconds() };
}

export function getNextSessionInfo(): { period: WIBSession; secondsUntil: number } {
  const { h, m, s } = getWIBNow();
  const nowMins = h * 60 + m;

  for (let i = 0; i < SESSION_TIMES.length; i++) {
    const [sh, sm] = SESSION_TIMES[i]!;
    const sessionMins = sh * 60 + sm;
    if (sessionMins > nowMins || (sessionMins === nowMins && s < 30)) {
      const diff = Math.max(0, (sessionMins - nowMins) * 60 - s);
      return { period: WIB_SESSIONS[i]!, secondsUntil: diff };
    }
  }

  const minsUntilMidnight = 24 * 60 - nowMins;
  const secsUntilFirst = minsUntilMidnight * 60 - s + 60;
  return { period: WIB_SESSIONS[0]!, secondsUntil: secsUntilFirst };
}

export function getCurrentOrNextSession(): WIBSession {
  return getNextSessionInfo().period;
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [
    String(h).padStart(2, "0"),
    String(m).padStart(2, "0"),
    String(s).padStart(2, "0"),
  ].join(":");
}

export function getWIBTimeString(): string {
  const { h, m } = getWIBNow();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} WIB`;
}
