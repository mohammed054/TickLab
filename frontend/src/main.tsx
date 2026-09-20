import React from 'react'
import ReactDOM from 'react-dom/client'
import { SingleDisplayShell } from './app/single-display/SingleDisplayShell'
import { initSyncBus } from './shared/sync-bus'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SingleDisplayShell />
  </React.StrictMode>
)

initSyncBus()