import { Component } from 'react'

// Top-level safety net: a render error shows a recoverable message instead of
// a blank white screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // In a real deployment this would report to Sentry/OpenTelemetry.
    console.error('Unhandled UI error:', error, info?.componentStack)
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
          <div
            role="alert"
            className="w-full max-w-md rounded-xl border border-red-500/40 bg-red-500/10 p-6"
          >
            <h1 className="text-lg font-semibold text-red-200">Something went wrong</h1>
            <p className="mt-2 text-sm text-red-300/80">{this.state.error.message}</p>
            <button
              onClick={this.handleReset}
              className="mt-4 rounded-lg bg-red-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
