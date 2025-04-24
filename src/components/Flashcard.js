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
      // Split by period+space to separate the verb from example sentence
      const parts = frontText.split(/\.\s+/);
      
      // The first part should contain the verb and aspect info
      let vocabPart = parts[0];
      
      // Extract example sentence if there is one
      let example = parts.length > 1 ? parts.slice(1).join('. ') : '';
      
      // Check if we have parentheses in the vocab part, which likely indicate aspect info
      const aspectMatch = vocabPart.match(/^([\wąćęłńóśźż]+(?: się)?)(\s+\([^)]+\))?/);
      
      let vocabWord = vocabPart;
      if (aspectMatch) {
        vocabWord = aspectMatch[0]; // This gives us the verb with aspect info
      }
      
      // Add period to example if needed
      if (example && !example.endsWith('.')) {
        example += '.';
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
  
  // Format the back side of the card with improved error handling
  const formatBackContent = (backText) => {
    if (!backText) return <div className="card-content"><div className="translation">No content</div></div>;
    
    try {
      // Step 1: Split the text by periods that are followed by space and an uppercase letter
      // This helps separate the translation from example sentence
      const segments = backText.split(/\.\s+(?=[A-Z])/);
      
      // The first segment should be the translation (and possibly some grammar hints)
      let translation = segments[0];
      
      // If there's no period separator, try to find the first full sentence
      if (segments.length === 1) {
        // Try to find the first sentence by looking for common patterns
        const sentenceMatch = backText.match(/^(to [^.]+?)(?:\s+([A-Z][^.]+\.))/);
        if (sentenceMatch) {
          translation = sentenceMatch[1];
          segments[1] = sentenceMatch[2]; // Add the example sentence
        }
      }
      
      // Step 2: Find grammar notes
      const grammarMarkers = ['Conj.', 'Notes:', 'Note:', 'Grammar:', 'Gram.'];
      let grammarStart = -1;
      
      for (const marker of grammarMarkers) {
        const index = backText.indexOf(marker);
        if (index !== -1 && (grammarStart === -1 || index < grammarStart)) {
          grammarStart = index;
        }
      }
      
      // Extract grammar notes if available
      let grammarNotes = '';
      if (grammarStart !== -1) {
        grammarNotes = backText.substring(grammarStart).trim();
        
        // Make sure grammar notes don't include parts of the translation/example
        if (translation.includes(grammarNotes.substring(0, 20))) {
          translation = translation.replace(grammarNotes, '').trim();
        }
      }
      
      // Extract example sentence (everything between translation and grammar notes)
      let example = '';
      if (segments.length > 1) {
        // Join all segments except first (translation) into the example
        example = segments.slice(1).join('. ');
        
        // If there are grammar notes, trim example to not include them
        if (grammarStart !== -1) {
          example = example.substring(0, example.indexOf(grammarNotes.substring(0, 20)));
        }
        
        // Clean up any trailing/leading spaces or periods
        example = example.replace(/^\s*\.?\s*|\s*\.?\s*$/g, '');
        
        // Add period if there isn't one
        if (!example.endsWith('.') && example.length > 0) {
          example += '.';
        }
      }
      
      // Clean up translation (remove any "Conj." text that got included)
      grammarMarkers.forEach(marker => {
        if (translation.includes(marker)) {
          translation = translation.substring(0, translation.indexOf(marker)).trim();
        }
      });
      
      // Trim any trailing periods from translation
      translation = translation.replace(/\.\s*$/, '');
      
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