import React from 'react';
import { createRoot } from 'react-dom/client';
import { NominaModule } from './NominaModule';
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NominaModule />
  </React.StrictMode>,
);
