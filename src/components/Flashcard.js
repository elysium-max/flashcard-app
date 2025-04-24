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
  
  // Format the front side of the card - Improved version for handling "się" verbs and example sentences
  const formatFrontContent = (frontText) => {
    if (!frontText) return <div className="card-content"><div className="vocab-word">No content</div></div>;
    
    try {
      // Split by period+space or period+newline to separate the verb from example sentence
      const parts = frontText.split(/\.\s+|\.\n+/);
      
      // The first part should contain the verb or vocabulary word
      let vocabPart = parts[0].trim();
      
      // Collect all additional parts as example sentences
      let example = '';
      if (parts.length > 1) {
        example = parts.slice(1).join('. ').trim();
        
        // Add period to example if needed
        if (example && !example.endsWith('.') && !example.endsWith('!') && !example.endsWith('?')) {
          example += '.';
        }
      }
      
      // Check if we have parentheses in the vocab part, which likely indicate aspect info
      const aspectMatch = vocabPart.match(/^([\wąćęłńóśźż]+(?: się)?)(\s+\([^)]+\))?/);
      
      let vocabWord = vocabPart;
      if (aspectMatch) {
        vocabWord = aspectMatch[0]; // This gives us the verb with aspect info
      }
      
      // Ensure vocab word has a period if not already
      if (!vocabWord.endsWith('.') && !vocabWord.endsWith('!') && !vocabWord.endsWith('?')) {
        vocabWord += '.';
      }
      
      return (
        <div className="card-content">
          <div className="vocab-word">{vocabWord}</div>
          {example && <div className="example">{example}</div>}
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
  
  // Format the back side of the card with improved error handling for separating example sentences
  const formatBackContent = (backText) => {
    if (!backText) return <div className="card-content"><div className="translation">No content</div></div>;
    
    try {
      // Check if content is already formatted with newlines
      if (backText.includes('\n\n')) {
        // Split by double newlines to separate formatted sections
        const sections = backText.split('\n\n');
        
        const translation = sections[0];
        const example = sections.length > 1 ? sections[1] : '';
        const grammar = sections.length > 2 ? sections[2] : '';
        
        return (
          <div className="card-content">
            <div className="translation">{translation}</div>
            {example && <div className="translated-example">{example}</div>}
            {grammar && <div className="grammar-notes">{grammar}</div>}
          </div>
        );
      }
      
      // For unformatted content, use regular expressions to separate sections
      
      // Step 1: Look for sentence patterns with "I" which are common in examples
      const iStatementPattern = /^([^.!?;]+?(?:;[^.!?;]+?)*)\s+I\s+(.+)$/i;
      const iStatementMatch = backText.match(iStatementPattern);
      
      if (iStatementMatch) {
        const translation = iStatementMatch[1].trim();
        const example = "I " + iStatementMatch[2].trim();
        
        // Find grammar notes
        const grammarMarkers = ['Conj.', 'Notes:', 'Note:', 'Grammar:', 'Gram.'];
        let grammarNotes = '';
        
        for (const marker of grammarMarkers) {
          if (example.includes(marker)) {
            const grammarStart = example.indexOf(marker);
            grammarNotes = example.substring(grammarStart).trim();
            example = example.substring(0, grammarStart).trim();
            break;
          }
        }
        
        return (
          <div className="card-content">
            <div className="translation">{translation}</div>
            {example && <div className="translated-example">{example}</div>}
            {grammarNotes && <div className="grammar-notes">{grammarNotes}</div>}
          </div>
        );
      }
      
      // Step 2: Look for sentences after semicolons or parentheses
      const semicolonOrParensPattern = /^([^.!?]+(?:\([^)]+\))?(?:;[^.!?;]+)*)\s+([A-Z][^.!?;]+.*)$/;
      const semicolonMatch = backText.match(semicolonOrParensPattern);
      
      if (semicolonMatch) {
        const translation = semicolonMatch[1].trim();
        let example = semicolonMatch[2].trim();
        
        // Check if example contains grammar notes
        const grammarMarkers = ['Conj.', 'Notes:', 'Note:', 'Grammar:', 'Gram.'];
        let grammarNotes = '';
        
        for (const marker of grammarMarkers) {
          if (example.includes(marker)) {
            const grammarStart = example.indexOf(marker);
            grammarNotes = example.substring(grammarStart).trim();
            example = example.substring(0, grammarStart).trim();
            break;
          }
        }
        
        return (
          <div className="card-content">
            <div className="translation">{translation}</div>
            {example && <div className="translated-example">{example}</div>}
            {grammarNotes && <div className="grammar-notes">{grammarNotes}</div>}
          </div>
        );
      }
      
      // Step 3: If no clear pattern match, fall back to grammar separation only
      const grammarMarkers = ['Conj.', 'Notes:', 'Note:', 'Grammar:', 'Gram.'];
      let grammarStart = -1;
      let grammarMarker = '';
      
      for (const marker of grammarMarkers) {
        const index = backText.indexOf(marker);
        if (index !== -1 && (grammarStart === -1 || index < grammarStart)) {
          grammarStart = index;
          grammarMarker = marker;
        }
      }
      
      // Extract grammar notes if available
      let translation = backText;
      let grammarNotes = '';
      
      if (grammarStart !== -1) {
        grammarNotes = backText.substring(grammarStart).trim();
        translation = backText.substring(0, grammarStart).trim();
      }
      
      return (
        <div className="card-content">
          <div className="translation">{translation}</div>
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