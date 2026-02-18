import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { TonConnectUIProvider } from '@tonconnect/ui-react'

// آدرس مانیفستی که روی گیت‌هاب آپلود کردی رو اینجا بذار
const manifestUrl = 'https://tatizm.github.io/my-hokm-game/tonconnect-manifest.json';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <App />
    </TonConnectUIProvider>
  </React.StrictMode>,
)