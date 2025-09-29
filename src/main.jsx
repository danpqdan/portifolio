import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { HashRouter } from 'react-router-dom'
import { AnalyticsProvider } from './lib/AnalyticsProvider.jsx'
import AnalyticsManager from './lib/AnalyticsManager.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <AnalyticsProvider>
        <AnalyticsManager>
          <App />
        </AnalyticsManager>
      </AnalyticsProvider>
    </HashRouter>
  </StrictMode>,
)
