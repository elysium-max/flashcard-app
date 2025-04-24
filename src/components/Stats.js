// src/components/Stats.js

import React, { useContext, useRef, useState, useEffect } from 'react';
import { FlashcardContext } from '../context/FlashcardContext';
import '../styles/Stats.css';
import { FaCheck, FaTimes, FaSync, FaDownload, FaUpload, FaInfoCircle, FaRedo, FaBug } from 'react-icons/fa';

const Stats = () => {
  const { 
    stats, 
    resetCards, 
    cards, 
    importCards, 
    clearCards, 
    refreshCards,
    syncStatus,
    lastSyncTime,
    toggleDebug,
    debug
  } = useContext(FlashcardContext);
  
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [showCountDown, setShowCountDown] = useState(false);
  const [countDown, setCountDown] = useState(5);
  
  // Calculate percentage of known cards
  const knownPercentage = stats.total > 0 
    ? Math.round((stats.known / stats.total) * 100) 
    : 0;
  
  // Reset import status after 5 seconds
  useEffect(() => {
    if (importStatus) {
      const timer = setTimeout(() => setImportStatus(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [importStatus]);
  
  // Handle countdown for refreshing after import
  useEffect(() => {
    if (showCountDown) {
      if (countDown > 0) {
        const timer = setTimeout(() => setCountDown(countDown - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setShowCountDown(false);
        setCountDown(5);
        window.location.reload(); // Force a complete page reload to ensure everything is fresh
      }
    }
  }, [showCountDown, countDown]);
  
  // Export flashcards data as JSON file with error handling
  const handleExport = () => {
    try {
      if (!Array.isArray(cards) || cards.length === 0) {
        setImportStatus('Error: No cards to export');
        return;
      }
      
      // Create a JSON string of the cards data
      // Only export necessary fields to keep file size smaller
      const exportCards = cards.map(card => ({
        front: card.front,
        back: card.back,
        known: card.known,
        timesReviewed: card.timesReviewed,
        lastReviewed: card.lastReviewed
      }));
      
      const jsonData = JSON.stringify(exportCards, null, 2);
      
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
      
      setImportStatus(`Successfully exported ${cards.length} cards`);
    } catch (error) {
      console.error('Error exporting cards:', error);
      setImportStatus(`Export failed: ${error.message}`);
    }
  };
  
  // Import flashcards with improved error handling and validation
  const handleImport = async (event) => {
    const file = event.target.files[0];
    
    if (!file) {
      return;
    }
    
    try {
      setIsImporting(true);
      setImportStatus('Reading file...');
      
      // Read file as text
      const fileContent = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
      
      // Parse JSON with error handling
      let importedData;
      try {
        importedData = JSON.parse(fileContent);
      } catch (e) {
        throw new Error('Invalid JSON file format. Please use a file exported from this app.');
      }
      
      // Validate the imported data
      if (!Array.isArray(importedData)) {
        throw new Error('Invalid data format. Expected an array of flashcards.');
      }
      
      if (importedData.length === 0) {
        throw new Error('The file contains no flashcards to import.');
      }
      
      // Validate structure of first card
      const firstCard = importedData[0];
      if (!firstCard || typeof firstCard !== 'object' || !firstCard.front || !firstCard.back) {
        throw new Error('Invalid flashcard format. Cards must have "front" and "back" properties.');
      }
      
      // Show progress
      setImportStatus(`Validated ${importedData.length} cards, importing...`);
      
      // Process import through the context
      const addedCount = await importCards(importedData);
      
      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Check if we have cards now
      if (addedCount > 0) {
        setImportStatus(`Successfully imported ${addedCount} flashcards!`);
      } else {
        // If something went wrong but we didn't get an error
        setImportStatus(`Import completed with ${addedCount} cards. You may need to refresh the page.`);
        
        // Offer a countdown to auto-refresh
        setShowCountDown(true);
      }
    } catch (error) {
      console.error('Import error:', error);
      setImportStatus(`Import failed: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };
  
  // Handle clearing all cards with confirmation
  const handleClearCards = async () => {
    if (!window.confirm('Are you sure you want to delete ALL cards? This cannot be undone unless you have an export backup. Consider exporting your cards first!')) {
      return;
    }
    
    setImportStatus('Clearing all cards...');
    
    try {
      const success = await clearCards();
      
      if (success) {
        setImportStatus('All cards have been cleared. You can now import a new set.');
      } else {
        setImportStatus('Failed to clear cards. Please try again.');
      }
    } catch (error) {
      console.error('Error clearing cards:', error);
      setImportStatus(`Error clearing cards: ${error.message}`);
    }
  };
  
  // Force refresh of cards from database
  const handleRefresh = async () => {
    setImportStatus('Refreshing cards from database...');
    
    try {
      const success = await refreshCards();
      
      if (success) {
        setImportStatus('Cards refreshed successfully');
      } else {
        setImportStatus('Failed to refresh cards. Please try again.');
      }
    } catch (error) {
      setImportStatus(`Error refreshing cards: ${error.message}`);
    }
  };
  
  // Handle debugging toggle
  const handleToggleDebug = () => {
    toggleDebug();
    setImportStatus(debug ? 'Debug mode disabled' : 'Debug mode enabled');
  };
  
  // Hand full page reload
  const handleHardRefresh = () => {
    window.location.reload();
  };
  
  // Format the sync time for display
  const formatSyncTime = (timestamp) => {
    if (!timestamp) return 'Never';
    
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
      return 'Unknown';
    }
  };
  
  // Trigger file selection dialog
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Display card count and details
  const cardDetails = () => {
    if (!Array.isArray(cards) || cards.length === 0) {
      return "No cards loaded";
    }
    
    return `${cards.length} cards in memory`;
  };
  
  return (
    <div className="stats-container">
      <h2>Your progress</h2>
      
      <div className="sync-status-bar">
        <div className={`sync-indicator ${syncStatus}`}>
          {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'error' ? 'Sync error' : 'Synced'}
        </div>
        <div className="last-sync">
          Last updated: {formatSyncTime(lastSyncTime)}
          <button 
            className="refresh-btn" 
            onClick={handleRefresh}
            disabled={syncStatus === 'syncing' || isImporting}
            title="Refresh cards from database"
          >
            <FaRedo />
          </button>
          {debug && <span className="debug-indicator">DEBUG ON</span>}
        </div>
      </div>
      
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
        <button 
          className="reset-btn" 
          onClick={resetCards}
          disabled={syncStatus === 'syncing' || isImporting || stats.total === 0}
        >
          <FaSync /> Reset all cards
        </button>
        
        <button 
          className="clear-btn" 
          onClick={handleClearCards}
          disabled={syncStatus === 'syncing' || isImporting || stats.total === 0}
        >
          <FaTimes /> Clear All Cards
        </button>
        
        <div className="import-export-container">
          <button 
            className="export-btn" 
            onClick={handleExport}
            disabled={syncStatus === 'syncing' || isImporting || stats.total === 0}
          >
            <FaDownload /> Export Data
          </button>
          
          <button 
            className="import-btn" 
            onClick={triggerFileInput}
            disabled={syncStatus === 'syncing' || isImporting}
          >
            <FaUpload /> Import Data
          </button>
        </div>
        
        <div className="debug-buttons">
          <button 
            className="debug-btn" 
            onClick={handleToggleDebug}
            title="Toggle debug mode"
          >
            <FaBug /> {debug ? 'Disable Debug' : 'Enable Debug'}
          </button>
          
          <button 
            className="reload-btn" 
            onClick={handleHardRefresh}
            title="Force reload entire page"
          >
            <FaSync /> Force Reload Page
          </button>
        </div>
      </div>
      
      <div className="card-status">
        {cardDetails()}
      </div>
      
      {importStatus && (
        <div className={`import-status ${importStatus.includes('Error') || importStatus.includes('failed') ? 'error' : importStatus.includes('Successfully') ? 'success' : ''}`}>
          {importStatus.includes('Reading') || importStatus.includes('Syncing') || importStatus.includes('Clearing') || importStatus.includes('Refreshing') ? (
            <div className="import-loading">{importStatus}</div>
          ) : (
            <>
              <FaInfoCircle /> {importStatus}
            </>
          )}
        </div>
      )}
      
      {showCountDown && (
        <div className="countdown">
          Reloading page in {countDown} seconds... <button onClick={() => setShowCountDown(false)}>Cancel</button>
        </div>
      )}
      
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