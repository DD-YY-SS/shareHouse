import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import DualDemo from './components/DualDemo.jsx';

const isDualDemo = new URLSearchParams(window.location.search).get('demo') === 'dual';
createRoot(document.getElementById('root')).render(isDualDemo ? <DualDemo /> : <App />);
