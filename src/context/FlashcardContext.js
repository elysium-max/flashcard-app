// src/context/FlashcardContext.js

import React, { createContext, useState, useEffect } from 'react';
import flashcards from '../utils/flashcardData';
import { auth, db } from '../utils/firebase';
import { 
  collection, 
  query, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  setDoc, 
  onSnapshot,
  where,
  deleteDoc
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

export const FlashcardContext = createContext();

export const FlashcardProvider = ({ children }) => {
  // Add authentication state
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [studyMode, setStudyMode] = useState('all');
  const [stats, setStats] = useState({
    total: 0,
    known: 0,
    unknown: 0,
    reviewed: 0
  });

  // Check authentication state on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Load flashcards from Firestore if user is authenticated
  useEffect(() => {
    if (!user) {
      // If not signed in, use localStorage as fallback
      const savedCards = localStorage.getItem('flashcards');
      const initialCards = savedCards ? JSON.parse(savedCards) : flashcards;
      setCards(initialCards);
      return;
    }

    // Set up real-time listener for user's flashcards
    const q = query(collection(db, 'flashcards'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const flashcardsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      if (flashcardsData.length > 0) {
        setCards(flashcardsData);
      } else {
        // If no cards exist for this user yet, initialize with default cards
        // and add them to Firestore
        initializeUserFlashcards();
      }
    }, (error) => {
      console.error("Error fetching flashcards:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Initialize user's flashcards in Firestore
  const initializeUserFlashcards = async () => {
    try {
      // First check if there were any cards in localStorage
      const savedCards = localStorage.getItem('flashcards');
      const cardsToUse = savedCards ? JSON.parse(savedCards) : flashcards;
      
      // Add userId to each card
      const userFlashcards = cardsToUse.map(card => ({
        ...card,
        userId: user.uid,
        // Generate new IDs for each card will be handled by Firestore
      }));
      
      // Batch add cards to Firestore
      const addedCards = await Promise.all(
        userFlashcards.map(async (card) => {
          const { id, ...cardWithoutId } = card; // Remove local ID
          const docRef = await addDoc(collection(db, 'flashcards'), cardWithoutId);
          return { id: docRef.id, ...cardWithoutId };
        })
      );
      
      setCards(addedCards);
    } catch (error) {
      console.error("Error initializing flashcards:", error);
    }
  };

  // Update stats whenever cards change
  useEffect(() => {
    if (Array.isArray(cards)) {
      // Update stats
      setStats({
        total: cards.length,
        known: cards.filter(card => card.known).length,
        unknown: cards.filter(card => !card.known).length,
        reviewed: cards.reduce((sum, card) => sum + (card.timesReviewed || 0), 0)
      });

      // If not signed in, save to localStorage as fallback
      if (!user) {
        localStorage.setItem('flashcards', JSON.stringify(cards));
      }
    }
  }, [cards, user]);

  // Function to set a card's known status
  const setCardStatus = async (id, isKnown) => {
    const updatedCards = cards.map(card => 
      card.id === id 
        ? { 
            ...card, 
            known: isKnown, 
            lastReviewed: new Date().toISOString(),
            timesReviewed: (card.timesReviewed || 0) + 1
          } 
        : card
    );

    setCards(updatedCards);

    // Update in Firestore if user is signed in
    if (user) {
      try {
        const updatedCard = updatedCards.find(card => card.id === id);
        await updateDoc(doc(db, 'flashcards', id), {
          known: isKnown,
          lastReviewed: new Date().toISOString(),
          timesReviewed: updatedCard.timesReviewed
        });
      } catch (error) {
        console.error('Error updating card:', error);
      }
    }
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
  const shuffleCards = async () => {
    // Fisher-Yates shuffle algorithm
    const shuffledCards = [...cards];
    for (let i = shuffledCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
    }
    
    // Update local state
    setCards(shuffledCards);
    setCurrentCardIndex(0);
    
    // No need to update in Firebase as the order is maintained locally
  };
  
  // Function to reset all cards to unknown
  const resetCards = async () => {
    const resetCardsData = cards.map(card => ({ 
      ...card, 
      known: false, 
      timesReviewed: 0, 
      lastReviewed: null 
    }));
    
    setCards(resetCardsData);
    setCurrentCardIndex(0);

    // Update in Firestore if user is signed in
    if (user) {
      try {
        await Promise.all(
          resetCardsData.map(async (card) => {
            await updateDoc(doc(db, 'flashcards', card.id), {
              known: false,
              timesReviewed: 0,
              lastReviewed: null
            });
          })
        );
      } catch (error) {
        console.error('Error resetting cards:', error);
      }
    }
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

  // User authentication functions
  const registerUser = async (email, password) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } catch (error) {
      throw error;
    }
  };

  const loginUser = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } catch (error) {
      throw error;
    }
  };

  const logoutUser = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      throw error;
    }
  };

  // Import/Export with Firebase integration
  const importCards = async (importedCards) => {
    try {
      if (user) {
        // Delete existing cards first
        const q = query(collection(db, 'flashcards'), where('userId', '==', user.uid));
        const snapshot = await getDocs(q);
        await Promise.all(snapshot.docs.map(doc => deleteDoc(doc.ref)));
        
        // Add imported cards with user ID
        const cardsWithUserId = importedCards.map(card => ({
          ...card,
          userId: user.uid
        }));
        
        const addedCards = await Promise.all(
          cardsWithUserId.map(async (card) => {
            const { id, ...cardWithoutId } = card; // Remove existing ID
            const docRef = await addDoc(collection(db, 'flashcards'), cardWithoutId);
            return { id: docRef.id, ...cardWithoutId };
          })
        );
        
        setCards(addedCards);
      } else {
        // If not signed in, just update local state
        setCards(importedCards);
      }
    } catch (error) {
      throw error;
    }
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
      getCurrentCard,
      user,
      loading,
      registerUser,
      loginUser,
      logoutUser,
      importCards
    }}>
      {children}
    </FlashcardContext.Provider>
  );
};