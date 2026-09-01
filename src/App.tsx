import { useState } from 'react'
import { JobForm } from './components/JobForm'
import { PlanCard } from './components/PlanCard'
import { calculatePlan } from './lib/cutting'
import type { CuttingPlan, JobInput } from './lib/types'
import './App.css'

const initialJob: JobInput = {
  pipeDiameter: 325,
  stockLength: 12000,
  kerf: 3,
  minRemnant: 150,
  twelveMeterCount: 0,
  coneLength: 1500,
  nestedConeLength: 2200,
  useConeNesting: true,
  plates: {
    enabled: true,
    segmentLength: 400,
    plateWidth: 80,
    gap: 20,
    platesPerPile: 4,
  },
  pieces: [
    { id: crypto.randomUUID(), name: '5000', length: 5000, quantity: 15, needsPlates: true },
    { id: crypto.randomUUID(), name: '6500', length: 6500, quantity: 17, needsPlates: true },
    { id: crypto.randomUUID(), name: '8400', length: 8400, quantity: 58, needsPlates: true },
    { id: crypto.randomUUID(), name: '3200', length: 3200, quantity: 9, needsPlates: true },
  ],
}

function App() {
  const [job, setJob] = useState<JobInput>(initialJob)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<CuttingPlan | null>(null)

  const onCalculate = () => {
    try {
      setError(null)
      setPlan(calculatePlan(job))
    } catch (err) {
      setPlan(null)
      setError(err instanceof Error ? err.message : 'Ошибка расчёта')
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-inner">
          <div>
            <p className="hero-mark">Карта раскроя</p>
            <h1>Раскрой свай</h1>
          </div>
          <div className="hero-meta">
            <div>Документ: раскрой</div>
            <div>Ø {job.pipeDiameter || '—'} мм</div>
            <div>Редакция: рабочая</div>
          </div>
        </div>
      </header>

      <JobForm
        value={job}
        onChange={setJob}
        onCalculate={onCalculate}
        error={error}
      />

      {plan && <PlanCard plan={plan} input={job} />}
    </div>
  )
}

export default App
