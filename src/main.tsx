import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import './theme/tokens.css';
import './styles/app.css';
import App from './App.tsx';
import { ads, progress } from './app/services';
import { validateLevels } from './game';

const curveErrors = validateLevels();
if (curveErrors.length) console.error('[fill-line] difficulty config invalid:\n' + curveErrors.join('\n'));

void progress.load().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  void ads.init();
});
