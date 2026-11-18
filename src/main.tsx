import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { initServiceWorker } from './lib/sw-update'
import { aplicarTema, leerTema } from './lib/tema'

// Tema noche/día antes del primer render: sin parpadeo y con la
// elección guardada (noche por defecto). Ver src/lib/tema.ts.
aplicarTema(leerTema())

// Registro del service worker + aviso de actualización (ver sw-update.ts).
initServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
