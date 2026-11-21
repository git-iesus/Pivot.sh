import { ScrumbleState } from '../../types/project';

export interface ScrumbleExternalCommand {
  id: number;
  type:
    | 'open_planning'
    | 'open_daily'
    | 'open_review'
    | 'toggle_icebox'
    | 'new_card'
    | 'toggle_pomodoro'
    | 'open_history';
  subprojectId?: string;
}

export function getTodayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getYesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getMondayOfCurrentWeekISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Dom..6=Sáb
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function computeSprintEndFridayISO(startIso: string, durationWeeks: 1 | 2): string {
  const [y, m, d] = startIso.split('-').map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  // Sprint de 1 semana = Seg..Sex (+4 dias corridos a partir de Seg); 2 semanas = +11 dias corridos
  const offsetDays = durationWeeks === 2 ? 11 : 4;
  start.setDate(start.getDate() + offsetDays);
  const ry = start.getFullYear();
  const rm = String(start.getMonth() + 1).padStart(2, '0');
  const rd = String(start.getDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

export const defaultScrumbleState: ScrumbleState = {
  activeSubprojectId: 'all',
  wipLimitInProgress: 2,
  showIceboxColumn: false,
  currentSprint: null,
  sprintHistory: [],
  dailyLogs: [],
  pomodoroConfig: {
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    cyclesBeforeLongBreak: 4,
  },
  totalPomodorosCompleted: 0,
  activePomodoroTaskId: null,
};

export function playPomodoroChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99]; // C5 -> E5 -> G5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const startTime = ctx.currentTime + idx * 0.14;
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.14, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.36);
    });
  } catch {
    // ignore audio playback restrictions
  }
}
