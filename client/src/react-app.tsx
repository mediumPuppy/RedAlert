import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import GameMode from './components/GameMode';
import './styles.css';

// Only mount React if on the home or game-mode route
if (window.location.pathname === '/' || window.location.pathname === '' || window.location.pathname === '/game-mode') {
  // Create a root element for React if it doesn't exist
  let rootElement = document.getElementById('react-root');
  if (!rootElement) {
    rootElement = document.createElement('div');
    rootElement.id = 'react-root';
    document.body.appendChild(rootElement);
  }

  // Hide game container, show React app
  const gameContainer = document.getElementById('game-container');
  if (gameContainer) {
    gameContainer.style.display = 'none';
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game-mode" element={<GameMode />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
  );
} else {
  // Not on home route, make sure game container is visible
  const gameContainer = document.getElementById('game-container');
  if (gameContainer) {
    gameContainer.style.display = 'block';
  }
  
  // Remove React root if it exists
  const reactRoot = document.getElementById('react-root');
  if (reactRoot) {
    reactRoot.remove();
  }
} 