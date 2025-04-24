// src/components/Flashcard.js - Final version with fixed parsing logic

import React, { useState, useContext, useEffect } from 'react';
import { FlashcardContext } from '../context/FlashcardContext';
import '../styles/Flashcard.css';
import { FaCheck, FaTimes, FaArrowRight, FaExclamationTriangle } from 'react-icons/fa';
import Loading from './Loading';

const Flashcard = () => {
  const [isFlipped, setIsFlipped] = useState(false);
  const { 
    getCurrentCard, 
    setCardStatus, 
    getNextCard, 
    cards, 
    studyMode, 
    user,
    loading,
    syncStatus,
    refreshCards 
  } = useContext(FlashcardContext);
  
  const currentCard = getCurrentCard();
  
  // Effect to update when cards change status
  useEffect(() => {
    if (currentCard) {
      const isInWrongMode = 
        (studyMode === 'known' && !currentCard.known) || 
        (studyMode === 'unknown' && currentCard.known);
      
      if (isInWrongMode) {
        getNextCard();
      }
    }
  }, [cards, studyMode, currentCard, getNextCard]);
  
  // Format the front side of the card to handle reflexive verbs with "się" or "sobie"
  const formatFrontContent = (frontText) => {
    if (!frontText) return <div className="card-content"><div className="vocab-word">No content</div></div>;
    
    try {
      // First check if the verb phrase contains reflexive markers with a period after them
      const reflexiveMatch = frontText.match(/^([\wąćęłńóśźż]+(?: się| sobie)?(?:\s+\([^)]+\))?\.)(.*)/);
      
      let wordPart = '';
      let examplePart = '';
      
      if (reflexiveMatch) {
        // We found a pattern with a reflexive verb or a verb with suffix + period
        wordPart = reflexiveMatch[1]; // Includes the period
        examplePart = reflexiveMatch[2].trim();
      } else {
        // Try a more general split by period + space
        const parts = frontText.split(/\.\s+/);
        
        if (parts.length > 1) {
          wordPart = parts[0] + '.'; // Add the period back
          examplePart = parts.slice(1).join('. '); // Rejoin any remaining parts
        } else {
          // If no split found, just use the whole text as word
          wordPart = frontText;
        }
      }
      
      return (
        <div className="card-content">
          <div className="vocab-word">{wordPart}</div>
          {examplePart && <div className="example">{examplePart}</div>}
        </div>
      );
    } catch (error) {
      // Fallback for any errors
      console.error("Error parsing front content:", error);
      return (
        <div className="card-content">
          <div className="vocab-word">{frontText}</div>
        </div>
      );
    }
  };
  
  // Format the back side of the card with improved parsing for closing parentheses
  const formatBackContent = (backText) => {
    if (!backText) return <div className="card-content"><div className="translation">No content</div></div>;
    
    try {
      // First split by double newlines to separate translation+example from grammar notes
      const mainSections = backText.split('\n\n');
      
      // Get the translation+example section
      const translationWithExample = mainSections[0];
      
      // Any remaining sections are grammar notes
      const grammarNotes = mainSections.length > 1 ? mainSections.slice(1).join('\n\n') : '';
      
      // Special handling for "action)" pattern in your example
      // This looks for the sentence pattern: starting with a capital letter after the closing parenthesis
      // Format: "to analyse (process, ongoing action) The professor..."
      const exampleMatch = translationWithExample.match(/^(.+?\))\s+([A-Z].+)$/);
      
      let translationPart = '';
      let examplePart = '';
      
      if (exampleMatch) {
        // We have a clear match with a closing parenthesis followed by a capital letter
        translationPart = exampleMatch[1]; // Everything up to and including the closing parenthesis
        examplePart = exampleMatch[2];     // Everything starting with the capital letter
      } else {
        // Try finding any sentence starting with a capital letter
        const capitalMatch = translationWithExample.match(/^(.+?)\s+([A-Z][^.!?]+[.!?])$/);
        
        if (capitalMatch) {
          translationPart = capitalMatch[1];
          examplePart = capitalMatch[2];
        } else {
          // If no clear split found, just use the whole text as translation
          translationPart = translationWithExample;
        }
      }
      
      return (
        <div className="card-content">
          <div className="translation">{translationPart}</div>
          {examplePart && <div className="translated-example">{examplePart}</div>}
          {grammarNotes && <div className="grammar-notes">{grammarNotes}</div>}
        </div>
      );
    } catch (error) {
      // If any error occurs in parsing, use a safe fallback
      console.error("Error parsing back content:", error);
      return (
        <div className="card-content">
          <div className="translation">{backText}</div>
        </div>
      );
    }
  };
  
  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleMark = async (known) => {
    if (currentCard) {
      try {
        // Mark the card with the appropriate status
        await setCardStatus(currentCard.id, known);
        
        // Reset the flip state
        setIsFlipped(false);
        
        // Always get the next card regardless of study mode
        getNextCard();
      } catch (error) {
        console.error("Error marking card:", error);
        alert("There was an error updating your card. Please try again.");
      }
    }
  };

  const handleNext = () => {
    setIsFlipped(false);
    getNextCard();
  };

  const handleRefresh = async () => {
    try {
      await refreshCards();
      setIsFlipped(false);
    } catch (error) {
      console.error("Error refreshing cards:", error);
    }
  };

  // Show loading state while Firebase is initializing or cards are loading
  if (loading) {
    return <Loading message="Loading your flashcards" />;
  }

  // If there are no cards, show a message with better guidance
  if (!currentCard) {
    return (
      <div className="flashcard-container">
        <div className="no-cards">
          <h2>No cards available in this mode</h2>
          {studyMode !== 'all' ? (
            <p>
              You don't have any {studyMode === 'known' ? 'known' : 'unknown'} cards.
              Try changing the study mode or reset the cards.
            </p>
          ) : (
            <p>
              {user ? (
                <>
                  {cards.length > 0 ? 
                    "There was an issue displaying your cards. Try refreshing." : 
                    "You haven't created any cards yet. Import a deck to get started."}
                </>
              ) : (
                "Sign in to sync your flashcards across devices or import a deck to get started."
              )}
            </p>
          )}
          
          {syncStatus === 'error' && (
            <div className="sync-error">
              <FaExclamationTriangle /> 
              <p>There was a problem syncing your cards.</p>
              <button className="refresh-cards-btn" onClick={handleRefresh}>
                Refresh Cards
              </button>
            </div>
          )}
          
          <p className="card-count">Total cards: {Array.isArray(cards) ? cards.length : 0}</p>
        </div>
      </div>
    );
  }

  // Main render for when we have a card
  return (
    <div className="flashcard-container">
      <div className={`flashcard ${isFlipped ? 'flipped' : ''}`} onClick={handleFlip}>
        <div className="flashcard-front">
          {formatFrontContent(currentCard.front)}
          <div className="card-hint">Click to flip</div>
        </div>
        <div className="flashcard-back">
          {formatBackContent(currentCard.back)}
          <div className="card-hint">Click to flip back</div>
        </div>
      </div>
      
      <div className="flashcard-controls">
        <div className="status-buttons">
          <button 
            className="control-btn known" 
            onClick={() => handleMark(true)}
            disabled={syncStatus === 'syncing'}
          >
            <FaCheck /> Known
          </button>
          <button 
            className="control-btn unknown" 
            onClick={() => handleMark(false)}
            disabled={syncStatus === 'syncing'}
          >
            <FaTimes /> Unknown
          </button>
        </div>
        <button 
          className="control-btn skip" 
          onClick={handleNext}
          disabled={syncStatus === 'syncing'}
        >
          <FaArrowRight /> Skip
        </button>
      </div>
      
      <div className="flashcard-status">
        <div className={`status-indicator ${currentCard.known ? 'known' : 'unknown'}`}>
          {currentCard.known ? 'Known' : 'Unknown'}
        </div>
        {currentCard.lastReviewed && (
          <div className="last-reviewed">
            Last reviewed: {new Date(currentCard.lastReviewed).toLocaleDateString()}
          </div>
        )}
      </div>
      
      {syncStatus === 'syncing' && (
        <div className="syncing-indicator">
          Syncing changes...
        </div>
      )}
      
      {syncStatus === 'error' && (
        <div className="sync-error-banner">
          <FaExclamationTriangle /> Sync error. Try refreshing.
          <button className="refresh-cards-btn small" onClick={handleRefresh}>
            Refresh
          </button>
        </div>
      )}
    </div>
  );
};

export default Flashcard;