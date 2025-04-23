// src/App.js

import React, { useContext } from 'react';
import { FlashcardProvider, FlashcardContext } from './context/FlashcardContext';
import Flashcard from './components/Flashcard';
import Stats from './components/Stats';
import StudyMode from './components/StudyMode';
import Auth from './components/Auth';
import Loading from './components/Loading';
import './styles/App.css';

// Component to handle conditional rendering based on auth state
const AppContent = () => {
  const { loading } = useContext(FlashcardContext);
  
  if (loading) {
    return <Loading />;
  }
  
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Language Flashcards</h1>
      </header>
      
      <main className="app-main">
        <div className="app-sidebar">
          <Auth />
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
  );
};

function App() {
  // Remove the useEffect that clears localStorage for development
  // We now want to keep localStorage data for offline use
  
  return (
    <FlashcardProvider>
      <AppContent />
    </FlashcardProvider>
  );
}

export default App;