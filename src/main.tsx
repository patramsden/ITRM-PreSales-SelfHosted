import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Select-all on focus for every number input in the app
document.addEventListener('focus', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
    e.target.select();
  }
}, true);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
