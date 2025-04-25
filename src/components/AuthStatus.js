// src/components/AuthStatus.js

import React, { useContext, useEffect, useState } from 'react';
import { FlashcardContext } from '../context/FlashcardContext';

const AuthStatus = () => {
  const { user, cards } = useContext(FlashcardContext);
  const [localStorageInfo, setLocalStorageInfo] = useState({
    flashcards: 0,
    studyMode: 'none',
    stats: 'none',
  });
  
  useEffect(() => {
    // Check what's in localStorage
    try {
      const storedCards = localStorage.getItem('flashcards');
      const storedMode = localStorage.getItem('studyMode');
      const storedStats = localStorage.getItem('flashcardStats');
      
      setLocalStorageInfo({
        flashcards: storedCards ? JSON.parse(storedCards).length : 0,
        studyMode: storedMode || 'none',
        stats: storedStats ? 'present' : 'none',
      });
    } catch (error) {
      console.error("Error reading localStorage:", error);
    }
  }, [cards]);
  
  // Styles for the debug panel
  const styles = {
    container: {
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      fontSize: '12px',
      zIndex: 9999,
      maxWidth: '300px',
    },
    heading: {
      margin: '0 0 5px 0',
      fontSize: '14px',
      fontWeight: 'bold',
    },
    item: {
      margin: '5px 0',
    },
    good: {
      color: '#4caf50',
    },
    warning: {
      color: '#ff9800',
    },
    error: {
      color: '#f44336',
    }
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.heading}>Persistence Status</h3>
      
      <div style={styles.item}>
        <strong>User Auth:</strong>{' '}
        {user ? (
          <span style={styles.good}>
            Logged in as {user.email}
          </span>
        ) : (
          <span style={styles.warning}>Not logged in</span>
        )}
      </div>
      
      <div style={styles.item}>
        <strong>Memory Cards:</strong>{' '}
        <span style={cards.length > 0 ? styles.good : styles.warning}>
          {cards.length} cards in memory
        </span>
      </div>
      
      <div style={styles.item}>
        <strong>LocalStorage:</strong>{' '}
        <span style={localStorageInfo.flashcards > 0 ? styles.good : styles.warning}>
          {localStorageInfo.flashcards} cards saved
        </span>
      </div>
      
      <div style={styles.item}>
        <strong>Study Mode:</strong>{' '}
        <span style={localStorageInfo.studyMode !== 'none' ? styles.good : styles.warning}>
          {localStorageInfo.studyMode}
        </span>
      </div>
      
      <div style={styles.item}>
        <strong>Stats:</strong>{' '}
        <span style={localStorageInfo.stats !== 'none' ? styles.good : styles.warning}>
          {localStorageInfo.stats}
        </span>
      </div>
      
      <div style={{...styles.item, marginTop: '10px', fontSize: '10px'}}>
        This panel is for debugging and can be removed in production
      </div>
    </div>
  );
};

export default AuthStatus;