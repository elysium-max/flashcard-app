// src/components/StudyMode.js - Enhanced version

import React, { useContext } from 'react';
import { FlashcardContext } from '../context/FlashcardContext';
import { FaLayerGroup, FaCheck, FaTimes, FaRandom } from 'react-icons/fa';
import '../styles/StudyMode.css'; // We'll create a separate CSS file for better organization

const StudyMode = () => {
  const { studyMode, setStudyMode, stats, shuffleCards } = useContext(FlashcardContext);
  
  const handleModeChange = (mode) => {
    setStudyMode(mode);
  };
  
  return (
    <div className="study-mode-container">
      <h2>Choose your study mode</h2>
      
      <div className="mode-cards">
        <div 
          className={`mode-card ${studyMode === 'all' ? 'active' : ''}`}
          onClick={() => handleModeChange('all')}
        >
          <div className="mode-icon">
            <FaLayerGroup />
          </div>
          <div className="mode-details">
            <h3>All Cards</h3>
            <p>Review your entire collection</p>
            <div className="mode-count">{stats.total} cards</div>
          </div>
        </div>
        
        <div 
          className={`mode-card ${studyMode === 'unknown' ? 'active' : ''} ${stats.unknown === 0 ? 'disabled' : ''}`}
          onClick={() => stats.unknown > 0 && handleModeChange('unknown')}
        >
          <div className="mode-icon unknown-icon">
            <FaTimes />
          </div>
          <div className="mode-details">
            <h3>Unknown</h3>
            <p>Focus on cards you need to learn</p>
            <div className="mode-count">{stats.unknown} cards</div>
          </div>
          {stats.unknown === 0 && <div className="disabled-overlay">No unknown cards</div>}
        </div>
        
        <div 
          className={`mode-card ${studyMode === 'known' ? 'active' : ''} ${stats.known === 0 ? 'disabled' : ''}`}
          onClick={() => stats.known > 0 && handleModeChange('known')}
        >
          <div className="mode-icon known-icon">
            <FaCheck />
          </div>
          <div className="mode-details">
            <h3>Known</h3>
            <p>Reinforce what you've learned</p>
            <div className="mode-count">{stats.known} cards</div>
          </div>
          {stats.known === 0 && <div className="disabled-overlay">No known cards</div>}
        </div>
      </div>
      
      <button 
        className="shuffle-btn"
        onClick={shuffleCards}
        title="Shuffle all cards"
      >
        <FaRandom /> Shuffle Cards
      </button>
    </div>
  );
};

export default StudyMode;