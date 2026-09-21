import { create } from 'zustand'

export interface ExperimentRef {
  id: string
  strategyRefVersion: string
  strategyRefId: string
  exchange: string
  symbol: string
  dateRange: { start: string; end: string }
  parameters: Record<string, number | string | boolean>
  status: 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'CANCELLED'
  createdAt: string
  notes: NoteRef[]
}

export interface NoteRef {
  id: string
  targetType: 'strategy' | 'experiment' | 'timestamp' | 'trade' | 'fill' | 'chart_view'
  content: string
  authoredBy: 'human' | 'ai-assistant'
  createdAt: string
}

export interface ExperimentTreeState {
  experiments: ExperimentRef[]
  selectedExperimentId: string | null
  setExperiments: (experiments: ExperimentRef[]) => void
  setSelectedExperimentId: (id: string | null) => void
  addExperiment: (experiment: ExperimentRef) => void
  addNote: (note: NoteRef) => void
  removeExperiment: (id: string) => void
}

const initialState: ExperimentTreeState = {
  experiments: [],
  selectedExperimentId: null,
  setExperiments: (experiments) => {},
  setSelectedExperimentId: (id) => {},
  addExperiment: (experiment) => {},
  addNote: (note) => {},
  removeExperiment: (id) => {},
}

export const useExperimentStore = create<ExperimentTreeState>((set) => ({
  ...initialState,
  setExperiments: (experiments) => set({ experiments }),
  setSelectedExperimentId: (id) => set({ selectedExperimentId: id }),
  addExperiment: (experiment) =>
    set((state) => ({
      experiments: [...state.experiments, experiment],
    })),
  addNote: (note) =>
    set((state) => {
      const experiment = state.experiments.find((exp) => exp.id === note.targetType)
      if (experiment) {
        return {
          experiments: state.experiments.map((exp =>
            exp.id === note.targetType
              ? { ...exp, notes: [...(exp.notes || []), note] }
              : exp
          )),
        }
      }
      return state
    }),
  removeExperiment: (id) =>
    set((state) => ({
      experiments: state.experiments.filter((exp) => exp.id !== id),
      selectedExperimentId: state.selectedExperimentId === id ? null : state.selectedExperimentId,
    })),
})
)