import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Login from './login.tsx'
import { getCurrentUser } from './user'

const currentUser = getCurrentUser()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {currentUser ? <App username={currentUser.username} userId={currentUser.id} /> : <Login onUnlock={() => {
      window.location.reload()
    }} />}
  </StrictMode>,
)
