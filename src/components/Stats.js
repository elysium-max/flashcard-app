// src/components/Stats.js

import React, { useContext, useRef } from 'react';
import { FlashcardContext } from '../context/FlashcardContext';
import '../styles/Stats.css';
import { FaCheck, FaTimes, FaSync, FaDownload, FaUpload } from 'react-icons/fa';

const Stats = () => {
  const { stats, resetCards, cards, importCards } = useContext(FlashcardContext);
  const fileInputRef = useRef(null);
  
  // Calculate percentage of known cards
  const knownPercentage = stats.total > 0 
    ? Math.round((stats.known / stats.total) * 100) 
    : 0;
  
  // Export flashcards data as JSON file
  const handleExport = () => {
    // Create a JSON string of the cards data
    const jsonData = JSON.stringify(cards, null, 2);
    
    // Create a blob with the data
    const blob = new Blob([jsonData], { type: 'application/json' });
    
    // Create a URL for the blob
    const url = URL.createObjectURL(blob);
    
    // Create a temporary anchor element to trigger the download
    const a = document.createElement('a');
    a.href = url;
    
    // Get current date for filename
    const date = new Date().toISOString().split('T')[0];
    a.download = `flashcards-backup-${date}.json`;
    
    // Trigger the download
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // Import flashcards data from JSON file
  const handleImport = (event) => {
    const file = event.target.files[0];
    
    if (file) {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const importedData = JSON.parse(e.target.result);
          
          // Validate the imported data has the expected structure
          if (Array.isArray(importedData) && importedData.length > 0) {
            // Check if first item has expected properties
            const firstCard = importedData[0];
            if (firstCard.front !== undefined && 
                firstCard.back !== undefined) {
              
              // Use the importCards function which handles Firebase
              await importCards(importedData);
              
              // Clear the file input
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
              
              alert(`Successfully imported ${importedData.length} flashcards!`);
            } else {
              alert('The imported file doesn\'t have the expected flashcard structure.');
            }
          } else {
            alert('The imported file doesn\'t contain a valid flashcards array.');
          }
        } catch (error) {
          alert(`Error importing file: ${error.message}`);
        }
      };
      
      reader.readAsText(file);
    }
  };
  
  // Trigger file selection dialog
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  return (
    <div className="stats-container">
      <h2>Your progress</h2>
      
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${knownPercentage}%` }}
        ></div>
        <div className="progress-text">{knownPercentage}% known</div>
      </div>
      
      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total cards</div>
        </div>
        
        <div className="stat-item known">
          <div className="stat-value">{stats.known}</div>
          <div className="stat-label">
            <FaCheck /> Known
          </div>
        </div>
        
        <div className="stat-item unknown">
          <div className="stat-value">{stats.unknown}</div>
          <div className="stat-label">
            <FaTimes /> Unknown
          </div>
        </div>
        
        <div className="stat-item">
          <div className="stat-value">{stats.reviewed}</div>
          <div className="stat-label">Total reviews</div>
        </div>
      </div>
      
      <div className="button-container">
        <button className="reset-btn" onClick={resetCards}>
          <FaSync /> Reset all cards
        </button>
        
        <div className="import-export-container">
          <button className="export-btn" onClick={handleExport}>
            <FaDownload /> Export Data
          </button>
          
          <button className="import-btn" onClick={triggerFileInput}>
            <FaUpload /> Import Data
          </button>
        </div>
      </div>
      
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleImport}
        accept=".json"
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default Stats;