import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import App from './App.jsx'

afterEach(() => vi.unstubAllGlobals())

describe('App', () => {
  it('renders the header and an instant rule-engine decision', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /shopper intent engine/i })).toBeInTheDocument()
    expect(screen.getAllByText(/Rule engine/i).length).toBeGreaterThan(0)
  })

  it('exposes accessible tabs and switches the active panel', () => {
    render(<App />)
    const rulesTab = screen.getByRole('tab', { name: 'Rules' })
    expect(rulesTab).toHaveAttribute('aria-selected', 'false')
    fireEvent.click(rulesTab)
    expect(rulesTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-rules')
  })

  it('loads a preset and updates the decision panel', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /window shopper/i }))
    const decision = screen.getByRole('heading', { name: 'Decision' }).closest('section')
    expect(within(decision).getAllByText('Browser').length).toBeGreaterThan(0)
  })

  it('surfaces an LLM failure without crashing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'down' } }),
      })),
    )
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /get llm second opinion/i }))
    expect(await screen.findByText(/LLM call failed/i, {}, { timeout: 5000 })).toBeInTheDocument()
  })
})
