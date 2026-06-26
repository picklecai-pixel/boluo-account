import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Portal from './Portal.jsx';
import './styles.css';

function Root() {
  const [route, setRoute] = useState(() => window.location.hash || '#/');

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/');
    }

    function handleHashChange() {
      setRoute(window.location.hash || '#/');
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (route.startsWith('#/account')) {
    return (
      <>
        <a className="portal-back-link" href="#/">{'\u5de5\u4f5c\u53f0'}</a>
        <App />
      </>
    );
  }

  return <Portal />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
