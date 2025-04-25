// src/pages/FlashcardApp.js - Enhanced version

import React, { useContext } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { FlashcardContext } from '../context/FlashcardContext';
import Flashcard from '../components/Flashcard';
import Stats from '../components/Stats';
import StudyMode from '../components/StudyMode';
import { FaSignOutAlt, FaUser, FaLanguage } from 'react-icons/fa';
import '../styles/FlashcardApp.css';

const FlashcardApp = () => {
  const { user, logoutUser } = useContext(FlashcardContext);
  const navigate = useNavigate();
  
  const handleLogout = async () => {
    try {
      await logoutUser();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };
  
  // Get current year for copyright
  const currentYear = new Date().getFullYear();
  
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1><FaLanguage /> Language Flashcards</h1>
          <div className="user-controls">
            <div className="user-info">
              <FaUser className="user-icon" />
              <span className="user-email">{user?.email}</span>
            </div>
            <button className="logout-btn" onClick={handleLogout}>
              <FaSignOutAlt /> Sign Out
            </button>
          </div>
        </div>
      </header>
      
      <main className="app-main">
        <div className="app-sidebar">
          <Stats />
          <StudyMode />
        </div>
        
        <div className="app-content">
          <Routes>
            <Route path="/" element={<Flashcard />} />
          </Routes>
        </div>
      </main>
      
      <footer className="app-footer">
        <div className="footer-content">
          <p>Language Learning Flashcard App</p>
          <p className="copyright">© {currentYear} Brendan McClintock-Ryan</p>
        </div>
      </footer>
    </div>
  );
};

export default FlashcardApp;