// Core TypeScript interfaces for ELUMA Time Tracker

// ── Mood system ────────────────────────────────────────────────────────────────

export type MoodEmoji = 'frustrated' | 'neutral' | 'good' | 'motivated' | 'on_fire';
export type ContextTag = 'with_son' | 'alone' | 'post_sport' | 'tired' | 'fresh';

export interface MoodCheckIn {
  energy: 1 | 2 | 3 | 4 | 5;
  focus: 1 | 2 | 3 | 4 | 5;
  spiritual: 1 | 2 | 3 | 4 | 5;
  mood: MoodEmoji;
  context: ContextTag[];
}

export interface MoodCheckOut extends MoodCheckIn {
  difficulty: 1 | 2 | 3 | 4 | 5;
  satisfaction: 1 | 2 | 3 | 4 | 5;
  notes: string;
}

// ── Core data model ────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  name: string;
  phase: 1 | 2 | 3;
  category: 'branding' | 'strategie' | 'offre' | 'clients' | 'admin' | 'tech' | 'contenu' | 'commercial' | 'operations';
  estimatedMinutes: number;
  actualMinutes: number;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  deadline?: string;
  createdAt: string;
  completedAt?: string;
  sessions: Session[];
}

export interface Session {
  id: string;
  taskId: string;
  startTime: string;
  endTime?: string;
  durationMinutes: number;
  notes: string;            // kept for backward-compat; new sessions use moodAfter.notes
  moodBefore?: MoodCheckIn;
  moodAfter?: MoodCheckOut;
  isParallel: boolean;           // true si cette session tournait en même temps qu'une autre
  parallelSessionIds?: string[]; // taskIds des autres sessions simultanées
}

export interface ActiveSession {
  taskId: string;
  startTime: string;
  elapsed: number;          // seconds accumulated (integer)
  tickStart?: number;       // Date.now() when current run period started — undefined when paused
  isPaused: boolean;
  moodBefore: MoodCheckIn;  // captured at check-in
  notes: string;            // in-session scratchpad
  isSecondary: boolean;     // true = tâche de fond (en attente IA), false = tâche principale
}

export interface AppState {
  tasks: Task[];
  activeSessions: ActiveSession[];  // tableau vide si rien en cours
  currentDay: number;
  startDate: string;
}

export type Screen = 'dashboard' | 'tasks' | 'timer' | 'analytics';
export type Category = Task['category'];
export type Priority = Task['priority'];
export type Status = Task['status'];
