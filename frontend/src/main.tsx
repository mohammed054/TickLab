import React from 'react'
import ReactDOM from 'react-dom/client'
import './global.css'
import { MainMonitor } from './app/main-monitor/MainMonitor'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MainMonitor />
  </React.StrictMode>
)
