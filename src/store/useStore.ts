// Global state with Zustand — persists to localStorage automatically
import { create } from 'zustand';
import type { Task, Session, ActiveSession, AppState, MoodCheckIn, MoodCheckOut } from '../types';
import { loadState, saveState } from '../utils/storage';
import { getCurrentDay, secondsToMinutes } from '../utils/time';
import rawTasks from '../data/initialTasks.json';

const START_DATE = '2026-03-28T00:00:00.000Z';

function genId(): string {
  return crypto.randomUUID();
}

function getDefaultState(): AppState {
  return {
    tasks: rawTasks as Task[],
    activeSessions: [],
    currentDay: getCurrentDay(START_DATE),
    startDate: START_DATE,
  };
}

interface StoreActions {
  // Task CRUD
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'sessions' | 'actualMinutes'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  // Timer — moodBefore required at start, moodAfter at stop
  startTimer: (taskId: string, moodBefore: MoodCheckIn) => void;
  startParallelSession: (taskId: string, moodBefore: MoodCheckIn) => void;
  promoteSession: (taskId: string) => void;
  pauseTimer: (taskId?: string) => void;
  resumeTimer: (taskId?: string) => void;
  stopTimer: (taskId: string, moodAfter: MoodCheckOut) => void;
  tickTimer: () => void;
  updateTimerNotes: (taskId: string, notes: string) => void;

  // Persistence
  persist: () => void;
  reset: () => void;
}

// pendingTimerTaskId lives in the store but outside AppState — not persisted
interface StoreExtras {
  pendingTimerTaskId: string | null;
  setPendingTimerTaskId: (id: string | null) => void;
}

type Store = AppState & StoreActions & StoreExtras;

const saved = loadState();
const initial: AppState = saved ?? getDefaultState();

// On reload, fix tickStart for any session that was running when the page closed
if (initial.activeSessions) {
  initial.activeSessions = initial.activeSessions.map(a =>
    a.isPaused ? { ...a, tickStart: undefined } : { ...a, tickStart: Date.now() }
  );
}

export const useStore = create<Store>((set, get) => ({
  ...initial,

  // ── non-persisted UI helper ────────────────────────────────────────────────
  pendingTimerTaskId: null,
  setPendingTimerTaskId: (id) => set({ pendingTimerTaskId: id }),

  // ── Task CRUD ─────────────────────────────────────────────────────────────
  addTask: (taskData) => {
    const task: Task = {
      ...taskData,
      id: genId(),
      createdAt: new Date().toISOString(),
      actualMinutes: 0,
      sessions: [],
    };
    set(s => ({ tasks: [...s.tasks, task] }));
    get().persist();
  },

  updateTask: (id, updates) => {
    set(s => ({
      tasks: s.tasks.map(t => (t.id === id ? { ...t, ...updates } : t)),
    }));
    get().persist();
  },

  deleteTask: (id) => {
    set(s => ({
      activeSessions: s.activeSessions.filter(a => a.taskId !== id),
      tasks: s.tasks.filter(t => t.id !== id),
    }));
    get().persist();
  },

  // ── Timer ─────────────────────────────────────────────────────────────────

  // Pause all existing sessions + start new primary (replaces "force switch" behavior)
  startTimer: (taskId, moodBefore = { energy: 3, focus: 3, spiritual: 3, mood: 'neutral', context: [] }) => {
    // Demote+pause all existing sessions
    set(s => ({
      activeSessions: s.activeSessions.map(a => ({ ...a, isPaused: true, isSecondary: true })),
    }));

    const active: ActiveSession = {
      taskId,
      startTime: new Date().toISOString(),
      elapsed: 0,
      tickStart: Date.now(),
      isPaused: false,
      moodBefore,
      notes: '',
      isSecondary: false,
    };
    set(s => ({ activeSessions: [...s.activeSessions, active] }));
    get().updateTask(taskId, { status: 'in_progress' });
  },

  // Keep existing sessions running, add new one as secondary
  startParallelSession: (taskId, moodBefore = { energy: 3, focus: 3, spiritual: 3, mood: 'neutral', context: [] }) => {
    if (get().activeSessions.length >= 3) return; // max 3 simultaneous sessions

    const active: ActiveSession = {
      taskId,
      startTime: new Date().toISOString(),
      elapsed: 0,
      tickStart: Date.now(),
      isPaused: false,
      moodBefore,
      notes: '',
      isSecondary: true,
    };
    set(s => ({ activeSessions: [...s.activeSessions, active] }));
    get().updateTask(taskId, { status: 'in_progress' });
    get().persist();
  },

  // Make taskId the primary session, demote all others to secondary
  promoteSession: (taskId) => {
    set(s => ({
      activeSessions: s.activeSessions.map(a => ({
        ...a,
        isSecondary: a.taskId !== taskId,
        isPaused: a.taskId !== taskId ? a.isPaused : false,
      })),
    }));
    get().persist();
  },

  pauseTimer: (taskId) => {
    const now = Date.now();
    set(s => ({
      activeSessions: s.activeSessions.map(a => {
        if (taskId !== undefined && a.taskId !== taskId) return a;
        if (a.isPaused) return a;
        const extra = a.tickStart ? Math.floor((now - a.tickStart) / 1000) : 0;
        return { ...a, isPaused: true, elapsed: a.elapsed + extra, tickStart: undefined };
      }),
    }));
    get().persist();
  },

  resumeTimer: (taskId) => {
    set(s => ({
      activeSessions: s.activeSessions.map(a => {
        if (taskId !== undefined && a.taskId !== taskId) return a;
        if (!a.isPaused) return a;
        return { ...a, isPaused: false, tickStart: Date.now() };
      }),
    }));
    get().persist();
  },

  stopTimer: (taskId, moodAfter) => {
    const { activeSessions } = get();
    const active = activeSessions.find(a => a.taskId === taskId);
    if (!active) return;

    const currentElapsed = (!active.isPaused && active.tickStart)
      ? active.elapsed + Math.floor((Date.now() - active.tickStart) / 1000)
      : active.elapsed;
    const durationMinutes = secondsToMinutes(currentElapsed);
    const otherTaskIds = activeSessions.filter(a => a.taskId !== taskId).map(a => a.taskId);
    const isParallel = otherTaskIds.length > 0;

    if (durationMinutes > 0) {
      const session: Session = {
        id: genId(),
        taskId: active.taskId,
        startTime: active.startTime,
        endTime: new Date().toISOString(),
        durationMinutes,
        notes: moodAfter.notes || active.notes,
        moodBefore: active.moodBefore,
        moodAfter,
        isParallel,
        parallelSessionIds: isParallel ? otherTaskIds : undefined,
      };
      set(s => ({
        tasks: s.tasks.map(t => {
          if (t.id !== active.taskId) return t;
          return { ...t, actualMinutes: t.actualMinutes + durationMinutes, sessions: [...t.sessions, session] };
        }),
      }));
    }

    // Remove stopped session
    const remaining = activeSessions.filter(a => a.taskId !== taskId);

    // Auto-promote: if stopped session was primary and secondaries remain, promote first
    const stoppedWasPrimary = !active.isSecondary;
    const promoted = (stoppedWasPrimary && remaining.length > 0)
      ? remaining.map((a, i) => ({ ...a, isSecondary: i !== 0, isPaused: i === 0 ? false : a.isPaused }))
      : remaining;

    set({ activeSessions: promoted });
    get().persist();
  },

  // Tick all non-paused sessions — pattern timestamp, immune au throttling Chrome
  tickTimer: () => {
    const now = Date.now();
    set(s => {
      const anyRunning = s.activeSessions.some(a => !a.isPaused);
      if (!anyRunning) return s;
      return {
        activeSessions: s.activeSessions.map(a => {
          if (a.isPaused || !a.tickStart) return a;
          const newSeconds = Math.floor((now - a.tickStart) / 1000);
          if (newSeconds === 0) return a;
          return { ...a, elapsed: a.elapsed + newSeconds, tickStart: a.tickStart + newSeconds * 1000 };
        }),
      };
    });
    // Persist every 30s (based on primary session elapsed)
    const primary = get().activeSessions.find(a => !a.isSecondary);
    const elapsed = primary?.elapsed ?? 0;
    if (elapsed > 0 && elapsed % 30 === 0) get().persist();
  },

  updateTimerNotes: (taskId, notes) => {
    set(s => ({
      activeSessions: s.activeSessions.map(a =>
        a.taskId === taskId ? { ...a, notes } : a
      ),
    }));
  },

  // ── Persistence ───────────────────────────────────────────────────────────
  persist: () => {
    const { tasks, activeSessions, currentDay, startDate } = get();
    saveState({ tasks, activeSessions, currentDay, startDate });
  },

  reset: () => {
    set(getDefaultState());
    get().persist();
  },
}));
