// src/context/FlashcardContext.js

import React, { createContext, useState, useEffect } from 'react';
import flashcards from '../utils/flashcardData';

export const FlashcardContext = createContext();

export const FlashcardProvider = ({ children }) => {
  console.log("Imported flashcards:", flashcards);
  
  // Check if we have saved cards in local storage
  const savedCards = localStorage.getItem('flashcards');
  const initialCards = savedCards ? JSON.parse(savedCards) : flashcards;
  
  console.log("Initial cards:", initialCards);

  const [cards, setCards] = useState(initialCards);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [studyMode, setStudyMode] = useState('all'); // 'all', 'unknown', 'known'
  const [stats, setStats] = useState({
    total: Array.isArray(initialCards) ? initialCards.length : 0,
    known: Array.isArray(initialCards) ? initialCards.filter(card => card.known).length : 0,
    unknown: Array.isArray(initialCards) ? initialCards.filter(card => !card.known).length : 0,
    reviewed: Array.isArray(initialCards) ? initialCards.reduce((sum, card) => sum + (card.timesReviewed || 0), 0) : 0
  });

  // Save cards to local storage whenever they change
  useEffect(() => {
    if (Array.isArray(cards)) {
      localStorage.setItem('flashcards', JSON.stringify(cards));
      
      // Update stats
      setStats({
        total: cards.length,
        known: cards.filter(card => card.known).length,
        unknown: cards.filter(card => !card.known).length,
        reviewed: cards.reduce((sum, card) => sum + (card.timesReviewed || 0), 0)
      });
    }
  }, [cards]);

  // Function to set a card's known status
  const setCardStatus = (id, isKnown) => {
    setCards(cards.map(card => 
      card.id === id 
        ? { 
            ...card, 
            known: isKnown, 
            lastReviewed: new Date().toISOString(),
            timesReviewed: card.timesReviewed + 1
          } 
        : card
    ));
  };

  // Function to get the next card based on study mode
  const getNextCard = () => {
    if (!Array.isArray(cards) || cards.length === 0) {
      console.log("No cards array or empty array");
      return null;
    }
    
    let filteredCards = [];
    
    switch(studyMode) {
      case 'unknown':
        filteredCards = cards.filter(card => !card.known);
        break;
      case 'known':
        filteredCards = cards.filter(card => card.known);
        break;
      default:
        filteredCards = [...cards]; // Make a copy to avoid mutation issues
    }
    
    console.log(`Filtered cards (${studyMode} mode):`, filteredCards.length);
    
    if (filteredCards.length === 0) {
      console.log("No cards after filtering");
      return null;
    }
    
    // If we're at the end, go back to the first card
    if (currentCardIndex >= filteredCards.length - 1) {
      setCurrentCardIndex(0);
    } else {
      setCurrentCardIndex(currentCardIndex + 1);
    }
  };

  // Function to shuffle cards
  const shuffleCards = () => {
    // Fisher-Yates shuffle algorithm
    const shuffledCards = [...cards];
    for (let i = shuffledCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
    }
    setCards(shuffledCards);
    setCurrentCardIndex(0);
  };
  
  // Function to reset all cards to unknown
  const resetCards = () => {
    setCards(cards.map(card => ({ ...card, known: false, timesReviewed: 0, lastReviewed: null })));
    setCurrentCardIndex(0);
  };

  // Function to get the current card
  const getCurrentCard = () => {
    if (!Array.isArray(cards) || cards.length === 0) {
      console.log("No cards array or empty array");
      return null;
    }
    
    let filteredCards = [];
    
    switch(studyMode) {
      case 'unknown':
        filteredCards = cards.filter(card => !card.known);
        break;
      case 'known':
        filteredCards = cards.filter(card => card.known);
        break;
      default:
        filteredCards = [...cards]; // Make a copy to avoid mutation issues
    }
    
    console.log(`Filtered cards (${studyMode} mode):`, filteredCards.length);
    
    if (filteredCards.length === 0) {
      console.log("No cards after filtering");
      return null;
    }
    
    // Make sure currentCardIndex is within bounds
    const safeIndex = Math.min(currentCardIndex, filteredCards.length - 1);
    console.log(`Current card index: ${safeIndex} of ${filteredCards.length - 1}`);
    
    return filteredCards[safeIndex];
  };

  return (
    <FlashcardContext.Provider value={{
      cards,
      setCards,
      stats,
      studyMode,
      setStudyMode,
      setCardStatus,
      getNextCard,
      resetCards,
      shuffleCards,
      getCurrentCard
    }}>
      {children}
    </FlashcardContext.Provider>
  );
};