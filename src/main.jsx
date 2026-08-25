import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import DualDemo from './components/DualDemo.jsx';
import LiveDemo from './components/LiveDemo.jsx';

const demo = new URLSearchParams(window.location.search).get('demo');
if (demo === 'live') sessionStorage.removeItem('cm-auth');
createRoot(document.getElementById('root')).render(demo === 'dual' ? <DualDemo /> : demo === 'live2' ? <LiveDemo /> : <App skipVariantSelection={demo === 'live'} />);
