import { useState, useEffect } from 'react'
import './App.css'

interface HealthStatus {
  status: string
  service: string
  timestamp: string
  uptime: number
}

function App() {
  const [apiHealth, setApiHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/../health')
        if (!response.ok) throw new Error('API unreachable')
        const data = await response.json()
        setApiHealth(data)
        setError(null)
      } catch {
        setError('API Gateway is offline')
        setApiHealth(null)
      } finally {
        setLoading(false)
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <h1>RCE Engine</h1>
        </div>
        <div className="status-badge">
          {loading ? (
            <span className="badge loading">Connecting...</span>
          ) : error ? (
            <span className="badge error">● Offline</span>
          ) : (
            <span className="badge success">● Online</span>
          )}
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <h2>Remote Code Execution Engine</h2>
          <p className="subtitle">
            Execute code safely in isolated Docker containers
          </p>
        </section>

        <section className="status-panel">
          <h3>System Status</h3>
          <div className="status-grid">
            <div className="status-card">
              <div className="status-icon">🌐</div>
              <div className="status-info">
                <h4>API Gateway</h4>
                {apiHealth ? (
                  <>
                    <p className="status-value success">Healthy</p>
                    <p className="status-detail">
                      Uptime: {Math.floor(apiHealth.uptime)}s
                    </p>
                  </>
                ) : (
                  <p className="status-value error">{error || 'Unknown'}</p>
                )}
              </div>
            </div>

            <div className="status-card">
              <div className="status-icon">⚙️</div>
              <div className="status-info">
                <h4>Execution Worker</h4>
                <p className="status-value pending">Stage 2</p>
                <p className="status-detail">Not yet implemented</p>
              </div>
            </div>

            <div className="status-card">
              <div className="status-icon">📦</div>
              <div className="status-info">
                <h4>Redis Queue</h4>
                <p className="status-value pending">Stage 2</p>
                <p className="status-detail">Ready for jobs</p>
              </div>
            </div>

            <div className="status-card">
              <div className="status-icon">🗄️</div>
              <div className="status-info">
                <h4>MongoDB</h4>
                <p className="status-value pending">Stage 2</p>
                <p className="status-detail">Persistence ready</p>
              </div>
            </div>
          </div>
        </section>

        <section className="placeholder">
          <div className="code-editor-placeholder">
            <div className="placeholder-header">
              <span className="dot red"></span>
              <span className="dot yellow"></span>
              <span className="dot green"></span>
              <span className="file-name">main.py</span>
            </div>
            <div className="placeholder-content">
              <code>
                <span className="comment"># Code editor coming in Stage 2</span>
                <br />
                <span className="keyword">def</span>{' '}
                <span className="function">solve</span>(nums):
                <br />
                <span className="indent">
                  <span className="keyword">return</span> sum(nums)
                </span>
              </code>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>
          Stage 1 Complete: Infrastructure & Docker Orchestration ✓
        </p>
      </footer>
    </div>
  )
}

export default App

