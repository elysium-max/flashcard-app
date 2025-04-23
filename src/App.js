// src/App.js

import React, { useEffect } from 'react';
import { FlashcardProvider } from './context/FlashcardContext';
import Flashcard from './components/Flashcard';
import Stats from './components/Stats';
import StudyMode from './components/StudyMode';
import './styles/App.css';

function App() {
  // For development, always clear localStorage on load to avoid stale data
  useEffect(() => {
    console.log("Clearing flashcards data for fresh start");
    localStorage.removeItem('flashcards');
    localStorage.removeItem('app_initialized');
  }, []);

  return (
    <FlashcardProvider>
      <div className="app-container">
        <header className="app-header">
          <h1>Language Flashcards</h1>
        </header>
        
        <main className="app-main">
          <div className="app-sidebar">
            <Stats />
            <StudyMode />
          </div>
          
          <div className="app-content">
            <Flashcard />
          </div>
        </main>
        
        <footer className="app-footer">
          <p>Language Learning Flashcard App</p>
        </footer>
      </div>
    </FlashcardProvider>
  );
}

export default App;