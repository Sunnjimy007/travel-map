import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SharedStoryView } from './views/SharedStoryView.tsx'

// A read-only share link (/s/:token) needs no auth and no app chrome, so it's
// routed here rather than pulling in a router dependency for one static path.
const shareMatch = window.location.pathname.match(/^\/s\/([^/]+)\/?$/)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {shareMatch ? <SharedStoryView token={shareMatch[1]} /> : <App />}
  </StrictMode>,
)
