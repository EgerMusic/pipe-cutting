import { useState } from 'react'
import { JobForm } from './components/JobForm'
import { PlanCard } from './components/PlanCard'
import { calculatePlan } from './lib/cutting'
import type { CuttingPlan, JobInput } from './lib/types'
import './App.css'

const initialJob: JobInput = {
  stockLength: 12000,
  kerf: 3,
  minRemnant: 150,
  coneLength: 1500,
  nestedConeLength: 2200,
  useConeNesting: true,
  pieces: [
    { id: crypto.randomUUID(), name: '5000', length: 5000, quantity: 15 },
    { id: crypto.randomUUID(), name: '6500', length: 6500, quantity: 17 },
    { id: crypto.randomUUID(), name: '8400', length: 8400, quantity: 58 },
    { id: crypto.randomUUID(), name: '3200', length: 3200, quantity: 9 },
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
        <div>
          <p className="eyebrow">Заводской раскрой</p>
          <h1>Раскрой конусных свай</h1>
          <p className="lead">
            Экономичный раскрой с учётом пропила, минимального остатка и «конус в
            конусе».
          </p>
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
