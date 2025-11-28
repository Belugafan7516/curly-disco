// src/main.tsx (Modified for standard Vite/React setup)
import React from 'react';
import ReactDOM from 'react-dom/client';
import RetroClickerApp from './RetroClickerApp.tsx';
import './index.css'; 

// This file initializes the React application and mounts the main component.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RetroClickerApp />
  </React.StrictMode>,
);