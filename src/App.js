// src/App.js - Updated version with persistence improvements

import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { FlashcardProvider } from './context/FlashcardContext';
import AuthPage from './pages/AuthPage';
import FlashcardApp from './pages/FlashcardApp';
import PrivateRoute from './components/PrivateRoute';
import AuthStatus from './components/AuthStatus'; // Import the debug component
import './styles/App.css';

function App() {
  // Check if the browser supports localStorage
  useEffect(() => {
    try {
      const testKey = '__flashcard_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      console.log("LocalStorage is available for persistence");
    } catch (e) {
      console.error("LocalStorage is not available, persistence will be limited:", e);
    }
  }, []);

  return (
    <FlashcardProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route 
            path="/app/*" 
            element={
              <PrivateRoute>
                <FlashcardApp />
              </PrivateRoute>
            } 
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        
        {/* Uncomment to enable the persistence debugging panel */}
        {/* <AuthStatus /> */}
      </Router>
    </FlashcardProvider>
  );
}

export default App;