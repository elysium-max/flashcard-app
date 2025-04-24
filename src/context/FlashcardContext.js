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
  // Authentication state
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Flashcards state
  const [cards, setCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [studyMode, setStudyMode] = useState('all');
  const [stats, setStats] = useState({
    total: 0,
    known: 0,
    unknown: 0,
    reviewed: 0
  });

  // Combine loading states for the app
  const loading = authLoading || cardsLoading;

  // Check authentication state on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

// Load flashcards from Firestore if user is authenticated
useEffect(() => {
    // Clear cards when user logs out
    if (!user) {
      setCards([]);
      return;
    }
  
    const loadCards = async () => {
      try {
        setCardsLoading(true);
        
        // Get user's flashcards
        const q = query(collection(db, 'flashcards'), where('userId', '==', user.uid));
        const snapshot = await getDocs(q);
        
        // Map docs to cards
        const flashcardsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log(`Initial load: Found ${flashcardsData.length} total cards`);
        
        // Deduplicate cards by checking content
        const uniqueContentMap = new Map();
        const duplicates = [];
        
        flashcardsData.forEach(card => {
          // Create a content key that represents the card's unique content
          const contentKey = `${card.front}::${card.back}`;
          
          if (!uniqueContentMap.has(contentKey)) {
            uniqueContentMap.set(contentKey, card);
          } else {
            duplicates.push(card.id);
          }
        });
        
        const uniqueCards = Array.from(uniqueContentMap.values());
        
        console.log(`Found ${duplicates.length} duplicate cards`);
        console.log(`Keeping ${uniqueCards.length} unique cards`);
        
        if (duplicates.length > 0) {
          console.log("Duplicate IDs:", duplicates);
          
          // Optionally delete the duplicates
          for (const duplicateId of duplicates) {
            try {
              await deleteDoc(doc(db, 'flashcards', duplicateId));
              console.log(`Deleted duplicate card ${duplicateId}`);
            } catch (e) {
              console.error(`Failed to delete duplicate ${duplicateId}:`, e);
            }
          }
        }
        
        setCards(uniqueCards);
        
        if (uniqueCards.length === 0) {
          console.log("No cards found, user will need to import cards");
        }
      } catch (error) {
        console.error("Error loading flashcards:", error);
      } finally {
        setCardsLoading(false);
      }
    };
  
    loadCards();
    
    // We're not using onSnapshot for real-time updates anymore
    // as it might be contributing to the duplication problem
    return () => {}; // No cleanup needed
  }, [user]);

  // Initialize user's flashcards in Firestore
  const initializeUserFlashcards = async () => {
    // We'll disable automatic initialization of flashcards
    console.log("New user detected, but we'll let them import their own cards");
    setCards([]);
    return;
    
    // The code below is commented out to prevent auto-loading default cards
    /*
    try {
      console.log("Initializing default flashcards for new user");
      // Add userId to each card
      const userFlashcards = flashcards.map(card => ({
        ...card,
        userId: user.uid,
        known: false,
        timesReviewed: 0,
        lastReviewed: null
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
      console.log(`Initialized ${addedCards.length} default cards for new user`);
    } catch (error) {
      console.error("Error initializing flashcards:", error);
    }
    */
  };

  // Add this function to your FlashcardContext.js
  const clearCards = async () => {
    if (!user) {
      console.error("No user logged in - cannot clear cards");
      return false;
    }
    
    try {
      setCardsLoading(true);
      console.log("Starting to clear cards...");
      
      // Delete all user's cards from Firestore in batches
      const q = query(collection(db, 'flashcards'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      
      console.log(`Found ${snapshot.docs.length} cards to delete`);
      
      // Delete in smaller batches to avoid timeouts
      const batchSize = 100;
      const batches = Math.ceil(snapshot.docs.length / batchSize);
      
      for (let i = 0; i < batches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, snapshot.docs.length);
        console.log(`Deleting batch ${i+1}/${batches} (cards ${start}-${end-1})`);
        
        await Promise.all(
          snapshot.docs.slice(start, end).map(doc => deleteDoc(doc.ref))
        );
      }
      
      // Clear local state
      setCards([]);
      setCurrentCardIndex(0);
      console.log("All cards have been cleared successfully");
      
      return true;
    } catch (error) {
      console.error('Error clearing cards:', error);
      alert(`Failed to clear cards: ${error.message}`);
      return false;
    } finally {
      setCardsLoading(false);
    }
  };

  // Update stats whenever cards change
  useEffect(() => {
    if (Array.isArray(cards) && cards.length > 0) {
      // Update stats with counting unique cards only
      setStats({
        total: cards.length,
        known: cards.filter(card => card.known).length,
        unknown: cards.filter(card => !card.known).length,
        reviewed: cards.reduce((sum, card) => sum + (card.timesReviewed || 0), 0)
      });
    } else {
      // Reset stats if no cards
      setStats({
        total: 0,
        known: 0,
        unknown: 0,
        reviewed: 0
      });
    }
  }, [cards]);

  // Authentication functions with error handling
  const registerUser = async (email, password) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } catch (error) {
      // Translate Firebase error codes to user-friendly messages
      switch (error.code) {
        case 'auth/email-already-in-use':
          throw new Error('This email is already registered. Please sign in instead.');
        case 'auth/invalid-email':
          throw new Error('Please enter a valid email address.');
        case 'auth/weak-password':
          throw new Error('Password should be at least 6 characters.');
        default:
          throw new Error('Failed to create account. Please try again.');
      }
    }
  };

  const loginUser = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } catch (error) {
      // Translate Firebase error codes to user-friendly messages
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          throw new Error('Invalid email or password.');
        case 'auth/invalid-email':
          throw new Error('Please enter a valid email address.');
        case 'auth/user-disabled':
          throw new Error('This account has been disabled.');
        case 'auth/too-many-requests':
          throw new Error('Too many unsuccessful login attempts. Please try again later.');
        default:
          throw new Error('Failed to sign in. Please try again.');
      }
    }
  };

  const logoutUser = async () => {
    try {
      await signOut(auth);
      // Reset state after logout
      setCards([]);
      setCurrentCardIndex(0);
    } catch (error) {
      throw new Error('Failed to sign out. Please try again.');
    }
  };

  // Function to set a card's known status
  const setCardStatus = async (id, isKnown) => {
    if (!user) return;
    
    try {
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

      // Update in Firestore
      const updatedCard = updatedCards.find(card => card.id === id);
      await updateDoc(doc(db, 'flashcards', id), {
        known: isKnown,
        lastReviewed: new Date().toISOString(),
        timesReviewed: updatedCard.timesReviewed
      });
    } catch (error) {
      console.error('Error updating card:', error);
    }
  };

  // Function to get the next card based on study mode
  const getNextCard = () => {
    if (!Array.isArray(cards) || cards.length === 0) {
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
    
    if (filteredCards.length === 0) {
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
    if (!user || cards.length === 0) return;
    
    // Fisher-Yates shuffle algorithm
    const shuffledCards = [...cards];
    for (let i = shuffledCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
    }
    
    // Update local state
    setCards(shuffledCards);
    setCurrentCardIndex(0);
  };
  
  // Function to reset all cards to unknown
  const resetCards = async () => {
    if (!user || cards.length === 0) return;
    
    try {
      setCardsLoading(true);
      
      const resetCardsData = cards.map(card => ({ 
        ...card, 
        known: false, 
        timesReviewed: 0, 
        lastReviewed: null 
      }));
      
      setCards(resetCardsData);
      setCurrentCardIndex(0);

      // Update in Firestore
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
    } finally {
      setCardsLoading(false);
    }
  };

  // Function to get the current card
  const getCurrentCard = () => {
    if (!Array.isArray(cards) || cards.length === 0) {
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
    
    if (filteredCards.length === 0) {
      return null;
    }
    
    // Make sure currentCardIndex is within bounds
    const safeIndex = Math.min(currentCardIndex, filteredCards.length - 1);
    
    return filteredCards[safeIndex];
  };

  // Import/Export with Firebase integration
  const importCards = async (importedCards) => {
    if (!user) {
      console.error("Import failed: No user logged in");
      return;
    }
    
    try {
      console.log("Starting import of", importedCards.length, "cards");
      setCardsLoading(true);
      
      // First, we'll clear any existing cards
      await clearCards();
      console.log("Cleared existing cards before import");
      
      // Create a map to detect duplicates in the import file itself
      const uniqueImportMap = new Map();
      const uniqueImportCards = [];
      
      importedCards.forEach((card, index) => {
        const contentKey = `${card.front}::${card.back}`;
        
        if (!uniqueImportMap.has(contentKey)) {
          uniqueImportMap.set(contentKey, card);
          uniqueImportCards.push(card);
        } else {
          console.log(`Skipping duplicate in import file at index ${index}`);
        }
      });
      
      console.log(`Found ${importedCards.length - uniqueImportCards.length} duplicates in import file`);
      console.log(`Preparing to add ${uniqueImportCards.length} unique cards`);
      
      // Add user ID to each card
      const cardsWithUserId = uniqueImportCards.map(card => ({
        ...card,
        userId: user.uid,
        known: card.known || false,
        timesReviewed: card.timesReviewed || 0,
        lastReviewed: card.lastReviewed || null
      }));
      
      // Create cards in batches to avoid timeouts
      const batchSize = 100;
      const batches = Math.ceil(cardsWithUserId.length / batchSize);
      const addedCards = [];
      
      for (let i = 0; i < batches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, cardsWithUserId.length);
        console.log(`Adding batch ${i+1}/${batches} (cards ${start}-${end-1})`);
        
        const batchResults = await Promise.all(
          cardsWithUserId.slice(start, end).map(async (card) => {
            try {
              const { id, ...cardWithoutId } = card; // Remove existing ID
              const docRef = await addDoc(collection(db, 'flashcards'), cardWithoutId);
              return { id: docRef.id, ...cardWithoutId };
            } catch (e) {
              console.error("Error adding card:", e);
              return null; // Return null for failed cards
            }
          })
        );
        
        // Filter out any nulls from failed additions
        const successfulAdds = batchResults.filter(card => card !== null);
        addedCards.push(...successfulAdds);
      }
      
      console.log(`Successfully added ${addedCards.length} cards`);
      setCards(addedCards);
      setCurrentCardIndex(0);
      
      return addedCards.length;
    } catch (error) {
      console.error('Error importing cards:', error);
      throw new Error('Failed to import cards. Please try again.');
    } finally {
      setCardsLoading(false);
    }
  };

  // Load a JSON deck of flashcards
  const loadDeck = async (deckName) => {
    if (!user) return;
    
    try {
      setCardsLoading(true);
      
      // In a real implementation, you would fetch the deck from a server
      // For now, we'll simulate loading a new deck
      
      const response = await fetch(`/decks/${deckName}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load deck: ${response.statusText}`);
      }
      
      const deckData = await response.json();
      
      // Import the deck
      await importCards(deckData);
    } catch (error) {
      console.error('Error loading deck:', error);
      throw new Error('Failed to load flashcard deck. Please try again.');
    } finally {
      setCardsLoading(false);
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
      importCards,
      loadDeck,
      clearCards
    }}>
      {children}
    </FlashcardContext.Provider>
  );
};