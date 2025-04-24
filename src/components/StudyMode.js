// src/components/StudyMode.js - Simplified version

import React, { useContext } from 'react';
import { FlashcardContext } from '../context/FlashcardContext';
import { FaLayerGroup, FaCheck, FaTimes, FaSync } from 'react-icons/fa';
import '../styles/App.css';

const StudyMode = () => {
  const { studyMode, setStudyMode, stats, shuffleCards } = useContext(FlashcardContext);
  
  const handleModeChange = (mode) => {
    setStudyMode(mode);
  };
  
  return (
    <div className="study-mode-container">
      <h2>Study mode</h2>
      
      <div className="mode-buttons">
        <button 
          className={`mode-btn ${studyMode === 'all' ? 'active' : ''}`}
          onClick={() => handleModeChange('all')}
        >
          <FaLayerGroup /> All Cards
          <span className="mode-count">{stats.total}</span>
        </button>
        
        <button 
          className={`mode-btn ${studyMode === 'unknown' ? 'active' : ''}`}
          onClick={() => handleModeChange('unknown')}
          disabled={stats.unknown === 0}
        >
          <FaTimes /> Unknown
          <span className="mode-count">{stats.unknown}</span>
        </button>
        
        <button 
          className={`mode-btn ${studyMode === 'known' ? 'active' : ''}`}
          onClick={() => handleModeChange('known')}
          disabled={stats.known === 0}
        >
          <FaCheck /> Known
          <span className="mode-count">{stats.known}</span>
        </button>
        
        <button 
          className="shuffle-btn"
          onClick={shuffleCards}
          title="Shuffle all cards"
        >
          <FaSync /> Shuffle Cards
        </button>
      </div>
    </div>
  );
};

export default StudyMode;