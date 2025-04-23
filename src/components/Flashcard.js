// src/components/Flashcard.js

import React, { useState, useContext, useEffect } from 'react';
import { FlashcardContext } from '../context/FlashcardContext';
import '../styles/Flashcard.css';
import { FaCheck, FaTimes, FaArrowRight } from 'react-icons/fa';

const Flashcard = () => {
  const [isFlipped, setIsFlipped] = useState(false);
  const { getCurrentCard, setCardStatus, getNextCard, cards, studyMode } = useContext(FlashcardContext);
  
  const currentCard = getCurrentCard();
  
  // Log data for debugging purposes
  useEffect(() => {
    console.log("Cards in Flashcard component:", cards);
    console.log("Current card:", currentCard);
    console.log("Is card flipped:", isFlipped);
  }, [cards, currentCard, isFlipped]);
  
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
  
  // Format the front side of the card
  const formatFrontContent = (frontText) => {
    // Handle different formats of front text
    // Look for patterns like "word (impf.)" or just "word"
    const match = frontText.match(/^([\wąćęłńóśźż]+(?: \([^)]+\))?) (.+)$/i);
    
    if (match) {
      const vocabWord = match[1]; // This captures the word and any parenthetical info
      const example = match[2];   // This captures the example sentence
      
      return (
        <div className="card-content">
          <div className="vocab-word">{vocabWord}</div>
          <div className="example">{example}</div>
        </div>
      );
    }
    
    // Fallback if the parsing doesn't work
    return (
      <div className="card-content">
        <div className="vocab-word">{frontText}</div>
      </div>
    );
  };
  
  // Format the back side of the card
  const formatBackContent = (backText) => {
    // More robust parsing for the back content
    // Extract translation (everything up to the first parenthesis)
    const translationMatch = backText.match(/^(.*?)\(process/);
    const translation = translationMatch ? translationMatch[1].trim() : '';
    
    // Extract example (between the closing parenthesis and "Conj.")
    const exampleStartIndex = backText.indexOf(')');
    const exampleEndIndex = backText.indexOf('Conj.');
    let example = '';
    
    if (exampleStartIndex > -1 && exampleEndIndex > -1) {
      example = backText.substring(exampleStartIndex + 1, exampleEndIndex).trim();
    }
    
    // Extract grammar notes (everything after "Conj.")
    const grammarNotes = exampleEndIndex > -1 
      ? backText.substring(exampleEndIndex).trim() 
      : backText.substring(exampleStartIndex > -1 ? exampleStartIndex + 1 : 0).trim();
    
    return (
      <div className="card-content">
        <div className="translation">{translation}</div>
        <div className="translated-example">{example}</div>
        <div className="grammar-notes">{grammarNotes}</div>
      </div>
    );
  };
  
  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    console.log("Flipping card to:", !isFlipped);
  };

  const handleMark = (known) => {
    if (currentCard) {
      // Mark the card with the appropriate status
      setCardStatus(currentCard.id, known);
      
      // Reset the flip state
      setIsFlipped(false);
      
      // Always get the next card regardless of study mode
      getNextCard();
    }
  };

  const handleNext = () => {
    setIsFlipped(false);
    getNextCard();
  };

  // If there are no cards, show a message
  if (!currentCard) {
    return (
      <div className="flashcard-container">
        <div className="no-cards">
          <h2>No cards available in this mode.</h2>
          <p>Try changing the study mode or reset all cards.</p>
          <p>Debug info: Total cards: {Array.isArray(cards) ? cards.length : 0}</p>
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
          <button className="control-btn known" onClick={() => handleMark(true)}>
            <FaCheck /> Known
          </button>
          <button className="control-btn unknown" onClick={() => handleMark(false)}>
            <FaTimes /> Unknown
          </button>
        </div>
        <button className="control-btn skip" onClick={handleNext}>
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
    </div>
  );
};

export default Flashcard;