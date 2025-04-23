// src/App.js

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { FlashcardProvider } from './context/FlashcardContext';
import AuthPage from './pages/AuthPage';
import FlashcardApp from './pages/FlashcardApp';
import PrivateRoute from './components/PrivateRoute';
import './styles/App.css';

function App() {
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
      </Router>
    </FlashcardProvider>
  );
}

export default App;