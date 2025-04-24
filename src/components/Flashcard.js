// src/components/Flashcard.js

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
  
  // Format the front side of the card - Improved version for handling "się" verbs
  const formatFrontContent = (frontText) => {
    if (!frontText) return <div className="card-content"><div className="vocab-word">No content</div></div>;
    
    try {
      // First check if we're dealing with a reflexive verb (has "się" in it)
      if (frontText.includes('się')) {
        // This regex specifically handles reflexive verbs
        // Format: "starzeć się (impf.) Wszyscy się starzejemy, to naturalne."
        const reflexiveMatch = frontText.match(/^([\wąćęłńóśźż]+ się(?: \([^)]+\))?) (.+)$/i);
        
        if (reflexiveMatch) {
          const vocabWord = reflexiveMatch[1]; // Verb with "się" and any parenthetical info
          const example = reflexiveMatch[2];   // Example sentence
          
          return (
            <div className="card-content">
              <div className="vocab-word">{vocabWord}</div>
              <div className="example">{example}</div>
            </div>
          );
        }
      }
      
      // Handle standard format with or without parenthetical info
      const standardMatch = frontText.match(/^([\wąćęłńóśźż]+(?: \([^)]+\))?) (.+)$/i);
      
      if (standardMatch) {
        const vocabWord = standardMatch[1]; // Word and any parenthetical info
        const example = standardMatch[2];   // Example sentence
        
        return (
          <div className="card-content">
            <div className="vocab-word">{vocabWord}</div>
            <div className="example">{example}</div>
          </div>
        );
      }
      
      // Fallback if the parsing doesn't work - just show the whole text as the vocab word
      return (
        <div className="card-content">
          <div className="vocab-word">{frontText}</div>
        </div>
      );
    } catch (error) {
      // If any error occurs in parsing, use a safe fallback
      console.error("Error parsing front content:", error);
      return (
        <div className="card-content">
          <div className="vocab-word">{frontText}</div>
        </div>
      );
    }
  };
  
  // Format the back side of the card with improved error handling
  const formatBackContent = (backText) => {
    if (!backText) return <div className="card-content"><div className="translation">No content</div></div>;
    
    try {
      // More robust parsing for the back content
      let translation = '';
      let example = '';
      let grammarNotes = '';
      
      // First try to extract the translation (everything up to the opening parenthesis)
      const translationMatch = backText.match(/^(.*?)(?:\(|$)/);
      if (translationMatch && translationMatch[1]) {
        translation = translationMatch[1].trim();
      }
      
      // Find indices for parsing the example and grammar notes
      const openParenIndex = backText.indexOf('(');
      const closeParenIndex = backText.indexOf(')', openParenIndex);
      
      // Look for grammar section markers
      const markers = ['Conj.', 'Notes:', 'Note:', 'Grammar:', 'Gram.'];
      let grammarStartIndex = -1;
      
      for (const marker of markers) {
        const index = backText.indexOf(marker);
        if (index !== -1 && (grammarStartIndex === -1 || index < grammarStartIndex)) {
          grammarStartIndex = index;
        }
      }
      
      // Extract example text if available (between close paren and grammar notes)
      if (closeParenIndex !== -1) {
        const exampleEndIndex = grammarStartIndex !== -1 ? grammarStartIndex : backText.length;
        example = backText.substring(closeParenIndex + 1, exampleEndIndex).trim();
      }
      
      // Extract grammar notes if available
      if (grammarStartIndex !== -1) {
        grammarNotes = backText.substring(grammarStartIndex).trim();
      }
      
      // If our parsing failed to find a translation, use the whole text
      if (!translation && backText) {
        translation = backText;
      }
      
      return (
        <div className="card-content">
          <div className="translation">{translation}</div>
          {example && <div className="translated-example">{example}</div>}
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