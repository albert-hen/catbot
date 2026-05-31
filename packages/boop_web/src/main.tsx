import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AlphaZeroProvider } from './contexts/AlphaZeroContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AlphaZeroProvider modelUrl={`${import.meta.env.BASE_URL}model.onnx`}>
      <App />
    </AlphaZeroProvider>
  </StrictMode>,
)
