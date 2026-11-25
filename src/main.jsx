import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// ★2026-11-25：数値欄にカーソルがある状態でマウスをスクロールすると値が上下してしまうので、
// スクロールしたらカーソルを外す（値は変わらず、画面だけがスクロールする）
document.addEventListener(
  'wheel',
  () => {
    const el = document.activeElement;
    if (el && el.tagName === 'INPUT' && el.type === 'number') el.blur();
  },
  { passive: true }
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
