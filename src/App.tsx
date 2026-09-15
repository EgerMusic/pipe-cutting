import { useState } from 'react'
import { CostCard } from './components/CostCard'
import { CostForm } from './components/CostForm'
import { JobForm } from './components/JobForm'
import { PlanCard } from './components/PlanCard'
import { calculateCost, validateCostInput } from './lib/cost'
import { calculatePlan } from './lib/cutting'
import { loadCostRates } from './lib/costStorage'
import type { CostEstimate, CostInput } from './lib/costTypes'
import type { CuttingPlan, JobInput } from './lib/types'
import './App.css'

type AppTab = 'cutting' | 'cost'

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
    { id: crypto.randomUUID(), name: '5000', length: 5000, quantity: 15, pipeDiameter: 0, needsPlates: true },
    { id: crypto.randomUUID(), name: '6500', length: 6500, quantity: 17, pipeDiameter: 0, needsPlates: true },
    { id: crypto.randomUUID(), name: '8400', length: 8400, quantity: 58, pipeDiameter: 0, needsPlates: true },
    { id: crypto.randomUUID(), name: '3200', length: 3200, quantity: 9, pipeDiameter: 0, needsPlates: true },
  ],
}

function initialCostInput(job: JobInput): CostInput {
  return {
    pipeDiameterMm: job.pipeDiameter,
    sourceMode: 'simple',
    rates: loadCostRates(),
    simple: {
      quantity: 100,
      lengthMm: 12000,
      paintLengthMm: 12000,
    },
    positions: [
      {
        id: crypto.randomUUID(),
        name: 'Свая',
        pipeDiameterMm: 325,
        lengthMm: 8400,
        quantity: 10,
        paintLengthMm: 3000,
      },
    ],
    metalEnabled: true,
    metalTubeCount: 100,
    metalStockLengthMm: 12000,
  }
}

function App() {
  const [tab, setTab] = useState<AppTab>('cutting')
  const [job, setJob] = useState<JobInput>(initialJob)
  const [cutError, setCutError] = useState<string | null>(null)
  const [plan, setPlan] = useState<CuttingPlan | null>(null)

  const [costInput, setCostInput] = useState<CostInput>(() => initialCostInput(initialJob))
  const [costError, setCostError] = useState<string | null>(null)
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null)

  const onCalculateCutting = () => {
    try {
      setCutError(null)
      setPlan(calculatePlan(job))
    } catch (err) {
      setPlan(null)
      setCutError(err instanceof Error ? err.message : 'Ошибка расчёта')
    }
  }

  const onCalculateCost = () => {
    try {
      setCostError(null)
      validateCostInput(costInput, plan)
      setCostEstimate(calculateCost(costInput, plan))
    } catch (err) {
      setCostEstimate(null)
      setCostError(err instanceof Error ? err.message : 'Ошибка расчёта')
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
            <div>Документ: раскрой / смета</div>
            <div>Ø {job.pipeDiameter || costInput.pipeDiameterMm || '—'} мм</div>
            <div>Редакция: рабочая</div>
          </div>
        </div>
      </header>

      <nav className="app-tabs" aria-label="Разделы">
        <button
          type="button"
          className={tab === 'cutting' ? 'app-tab active' : 'app-tab'}
          onClick={() => setTab('cutting')}
        >
          Раскрой
        </button>
        <button
          type="button"
          className={tab === 'cost' ? 'app-tab active' : 'app-tab'}
          onClick={() => setTab('cost')}
        >
          Смета
        </button>
      </nav>

      {tab === 'cutting' && (
        <>
          <JobForm
            value={job}
            onChange={setJob}
            onCalculate={onCalculateCutting}
            error={cutError}
          />
          {plan && <PlanCard plan={plan} input={job} />}
        </>
      )}

      {tab === 'cost' && (
        <>
          <CostForm
            value={costInput}
            onChange={setCostInput}
            onCalculate={onCalculateCost}
            error={costError}
            job={job}
            plan={plan}
          />
          {costEstimate && <CostCard estimate={costEstimate} costInput={costInput} />}
        </>
      )}
    </div>
  )
}

export default App
