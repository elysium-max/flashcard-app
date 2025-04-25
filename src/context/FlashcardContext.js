// src/context/FlashcardContext.js

import React, { createContext, useState, useEffect, useCallback } from 'react';
import { auth, db } from '../utils/firebase';
import { 
  collection, 
  query, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc,
  where,
  writeBatch,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
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
  
  // Use localStorage to persist study mode
  const savedStudyMode = localStorage.getItem('studyMode') || 'all';
  const [studyMode, setStudyMode] = useState(savedStudyMode);
  
  // Save study mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('studyMode', studyMode);
  }, [studyMode]);
  
  const [stats, setStats] = useState({
    total: 0,
    known: 0,
    unknown: 0,
    reviewed: 0
  });
  
  // Additional state for sync management - keeping these for compatibility but not using them for UI
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'error'
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Combine loading states for the app
  const loading = authLoading || cardsLoading;

  // Set browser persistence for Firebase authentication
  useEffect(() => {
    const setupPersistence = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        console.log("Firebase auth persistence set to browserLocalPersistence");
      } catch (error) {
        console.error("Error setting auth persistence:", error);
      }
    };
    
    setupPersistence();
  }, []);

  // Check authentication state on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      
      // Log authentication status for debugging
      if (currentUser) {
        console.log("User is signed in:", currentUser.uid);
      } else {
        console.log("No user is signed in");
      }
    });

    return () => unsubscribe();
  }, []);

  // Load flashcards from Firestore if user is authenticated
  const loadUserCards = useCallback(async () => {
    if (!user) {
      // Don't clear cards here to maintain offline state
      // Even if the user is not authenticated, we'll keep the cards in memory
      // This helps with page refreshes and temporary connectivity issues
      console.log("No user found, keeping existing cards in memory");
      return;
    }
    
    try {
      setCardsLoading(true);
      console.log("Loading cards for user:", user.uid);
      
      // This simple query doesn't require any index
      const q = query(
        collection(db, 'flashcards'), 
        where('userId', '==', user.uid)
      );
      
      const snapshot = await getDocs(q);
      
      // Log for debugging
      console.log(`Firestore query returned ${snapshot.docs.length} documents`);
      
      // Process the results directly without trying to order them in Firestore
      const flashcardsData = snapshot.docs.map(doc => {
        const data = doc.data();
        
        return {
          id: doc.id,
          ...data,
          // Ensure timestamp fields are properly serialized
          lastReviewed: data.lastReviewed ? 
            (typeof data.lastReviewed.toDate === 'function' ? 
              data.lastReviewed.toDate().toISOString() : data.lastReviewed) : 
            null,
          createdAt: data.createdAt ? 
            (typeof data.createdAt.toDate === 'function' ? 
              data.createdAt.toDate().toISOString() : data.createdAt) : 
            new Date().toISOString(),
          lastModified: data.lastModified ?
            (typeof data.lastModified.toDate === 'function' ?
              data.lastModified.toDate().toISOString() : data.lastModified) :
            null
        };
      });
      
      // Sort the cards client-side instead of using Firestore's orderBy
      flashcardsData.sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          const dateA = new Date(a.createdAt);
          const dateB = new Date(b.createdAt);
          return dateA - dateB;
        }
        return 0;
      });
      
      console.log(`Loaded ${flashcardsData.length} cards from Firestore`);
      
      // Save cards to localStorage as a backup
      try {
        // We'll only store essential data to keep localStorage size manageable
        const essentialCardData = flashcardsData.map(card => ({
          id: card.id,
          front: card.front,
          back: card.back,
          known: card.known,
          timesReviewed: card.timesReviewed || 0,
          lastReviewed: card.lastReviewed
        }));
        
        localStorage.setItem('flashcards', JSON.stringify(essentialCardData));
        console.log("Cards saved to localStorage");
      } catch (storageError) {
        console.error("Error saving to localStorage:", storageError);
        // This is non-critical, so we'll continue even if it fails
      }
      
      setCards(flashcardsData);
      setLastSyncTime(new Date().toISOString());
      
      if (flashcardsData.length === 0) {
        console.log("No cards found, trying to load from localStorage");
        
        // Try to get cards from localStorage if no cards were found online
        const storedCards = localStorage.getItem('flashcards');
        if (storedCards) {
          try {
            const parsedCards = JSON.parse(storedCards);
            if (Array.isArray(parsedCards) && parsedCards.length > 0) {
              console.log(`Found ${parsedCards.length} cards in localStorage, using these until sync works`);
              setCards(parsedCards);
            }
          } catch (parseError) {
            console.error("Error parsing localStorage cards:", parseError);
          }
        }
      }
    } catch (error) {
      console.error("Error loading flashcards:", error);
      // Try to load from localStorage as fallback
      try {
        const storedCards = localStorage.getItem('flashcards');
        if (storedCards) {
          const parsedCards = JSON.parse(storedCards);
          if (Array.isArray(parsedCards) && parsedCards.length > 0) {
            console.log(`Network error, falling back to ${parsedCards.length} cards from localStorage`);
            setCards(parsedCards);
          }
        }
      } catch (fallbackError) {
        console.error("Error loading from localStorage fallback:", fallbackError);
      }
    } finally {
      setCardsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadUserCards();
    }
  }, [user, loadUserCards]);

  // Update local stats whenever cards change
  useEffect(() => {
    if (Array.isArray(cards) && cards.length > 0) {
      const newStats = {
        total: cards.length,
        known: cards.filter(card => card.known).length,
        unknown: cards.filter(card => !card.known).length,
        reviewed: cards.reduce((sum, card) => sum + (card.timesReviewed || 0), 0)
      };
      
      setStats(newStats);
      
      // Save stats to localStorage too
      try {
        localStorage.setItem('flashcardStats', JSON.stringify(newStats));
      } catch (error) {
        console.error("Error saving stats to localStorage:", error);
      }
    } else {
      // Reset stats if no cards
      setStats({
        total: 0,
        known: 0,
        unknown: 0,
        reviewed: 0
      });
      
      // Clear stats in localStorage
      localStorage.removeItem('flashcardStats');
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
          throw new Error(`Failed to create account: ${error.message}`);
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
          throw new Error(`Failed to sign in: ${error.message}`);
      }
    }
  };

  const logoutUser = async () => {
    try {
      await signOut(auth);
      // We no longer clear cards on logout - this is the key change for persistence
      // Instead, we just update the UI to reflect that the user is logged out
      setLastSyncTime(null);
      console.log("User logged out, but keeping flashcards in memory for offline use");
      
      // We could optionally mark the cards as being in "offline mode"
      setSyncStatus('offline');
    } catch (error) {
      throw new Error(`Failed to sign out: ${error.message}`);
    }
  };

  // Function to set a card's known status - MODIFIED TO SUPPORT OFFLINE MODE
  const setCardStatus = async (id, isKnown) => {
    if (!id) return;
    
    try {
      // Don't set syncing status to avoid UI indicator
      
      // First update local state for immediate UI feedback
      const updatedCards = cards.map(card => 
        card.id === id 
          ? { 
              ...card, 
              known: isKnown, 
              lastReviewed: new Date().toISOString(),
              timesReviewed: (card.timesReviewed || 0) + 1,
              lastModified: new Date().toISOString()
            } 
          : card
      );

      setCards(updatedCards);
      
      // Update localStorage to reflect the change
      try {
        localStorage.setItem('flashcards', JSON.stringify(updatedCards));
      } catch (storageError) {
        console.error("Error updating localStorage:", storageError);
      }

      // Then try to update in Firestore, but don't fail if it doesn't work
      if (user) {
        try {
          // Try Firestore update
          const docRef = doc(db, 'flashcards', id);
          const docSnapshot = await getDoc(docRef);
          
          if (docSnapshot.exists()) {
            await updateDoc(docRef, {
              known: isKnown,
              lastReviewed: serverTimestamp(),
              timesReviewed: updatedCards.find(card => card.id === id).timesReviewed,
              lastModified: serverTimestamp()
            });
            
            console.log(`Updated card ${id} status to ${isKnown ? 'known' : 'unknown'}`);
            setLastSyncTime(new Date().toISOString());
          } else {
            console.log(`Card with ID ${id} doesn't exist in Firestore, but continuing with local state`);
          }
        } catch (firestoreError) {
          // Log Firestore error but continue with local state
          console.log('Firebase sync failed, but continuing with local state:', firestoreError.message);
        }
      } else {
        console.log("User not logged in, changes saved locally only");
      }
    } catch (error) {
      console.error('Error updating card status:', error);
      // Continue silently with no UI indication
    }
  };

  // Function to get the next card based on study mode
  const getNextCard = useCallback(() => {
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
    const newIndex = currentCardIndex >= filteredCards.length - 1 ? 0 : currentCardIndex + 1;
    setCurrentCardIndex(newIndex);
    
    return filteredCards[newIndex];
  }, [cards, currentCardIndex, studyMode]);

  // Function to shuffle cards with improved implementation
  const shuffleCards = useCallback(() => {
    if (!Array.isArray(cards) || cards.length === 0) return;
    
    // Fisher-Yates shuffle algorithm
    const shuffledCards = [...cards];
    for (let i = shuffledCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
    }
    
    // Update local state
    setCards(shuffledCards);
    setCurrentCardIndex(0);
    
    // Also update localStorage
    try {
      localStorage.setItem('flashcards', JSON.stringify(shuffledCards));
    } catch (error) {
      console.error("Error saving shuffled cards to localStorage:", error);
    }
    
    console.log('Cards shuffled successfully');
  }, [cards]);
  
  // Function to reset all cards to unknown - MODIFIED TO SUPPORT OFFLINE MODE
  const resetCards = async () => {
    if (!Array.isArray(cards) || cards.length === 0) return;
    
    try {
      setCardsLoading(true);
      // Don't set syncing status to avoid UI indicator
      
      // Prepare all cards for reset
      const resetCardsData = cards.map(card => ({ 
        ...card, 
        known: false, 
        timesReviewed: 0, 
        lastReviewed: null,
        lastModified: new Date().toISOString()
      }));
      
      // Update local state first for UI responsiveness
      setCards(resetCardsData);
      setCurrentCardIndex(0);
      
      // Update localStorage
      try {
        localStorage.setItem('flashcards', JSON.stringify(resetCardsData));
      } catch (storageError) {
        console.error("Error saving reset cards to localStorage:", storageError);
      }

      // Try Firebase update if user is logged in
      if (user) {
        try {
          // Calculate how many batches we need
          const BATCH_SIZE = 450; // Stay well under the limit
          const batchCount = Math.ceil(resetCardsData.length / BATCH_SIZE);
          
          for (let i = 0; i < batchCount; i++) {
            const batch = writeBatch(db);
            const start = i * BATCH_SIZE;
            const end = Math.min(start + BATCH_SIZE, resetCardsData.length);
            
            console.log(`Processing batch ${i + 1}/${batchCount} (cards ${start} to ${end - 1})`);
            
            // Add each card update to the batch
            for (let j = start; j < end; j++) {
              const card = resetCardsData[j];
              const cardRef = doc(db, 'flashcards', card.id);
              
              batch.update(cardRef, {
                known: false,
                timesReviewed: 0,
                lastReviewed: null,
                lastModified: serverTimestamp()
              });
            }
            
            // Try to commit the batch
            try {
              await batch.commit();
              console.log(`Batch ${i + 1} committed successfully`);
            } catch (batchError) {
              console.log(`Batch ${i + 1} failed, but continuing:`, batchError.message);
            }
          }
          
          setLastSyncTime(new Date().toISOString());
        } catch (firestoreError) {
          console.log('Firebase reset failed, but continuing with local state:', firestoreError.message);
        }
      } else {
        console.log("User not logged in, cards reset in local storage only");
      }
      
      console.log('All cards reset successfully');
    } catch (error) {
      console.error('Error resetting cards:', error);
      // Don't set error status, just log it
    } finally {
      setCardsLoading(false);
    }
  };

  // Function to get the current card
  const getCurrentCard = useCallback(() => {
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
  }, [cards, currentCardIndex, studyMode]);

  // Function to clear all cards - MODIFIED TO SUPPORT OFFLINE MODE
  const clearCards = async () => {
    try {
      setCardsLoading(true);
      console.log("Starting to clear cards...");
      
      // Clear local state and localStorage
      setCards([]);
      setCurrentCardIndex(0);
      localStorage.removeItem('flashcards');
      localStorage.removeItem('flashcardStats');
      
      // If the user is logged in, try to clear cards from Firebase too
      if (user) {
        try {
          // First, get all user's cards
          const q = query(collection(db, 'flashcards'), where('userId', '==', user.uid));
          const snapshot = await getDocs(q);
          
          const cardCount = snapshot.docs.length;
          console.log(`Found ${cardCount} cards to delete in Firestore`);
          
          if (cardCount > 0) {
            // Delete in batches for better reliability
            const BATCH_SIZE = 450; // Firestore batch limit is 500
            const batchCount = Math.ceil(cardCount / BATCH_SIZE);
            
            for (let i = 0; i < batchCount; i++) {
              const batch = writeBatch(db);
              const start = i * BATCH_SIZE;
              const end = Math.min(start + BATCH_SIZE, cardCount);
              
              console.log(`Processing delete batch ${i + 1}/${batchCount} (cards ${start} to ${end - 1})`);
              
              snapshot.docs.slice(start, end).forEach(docSnapshot => {
                batch.delete(docSnapshot.ref);
              });
              
              // Try to commit this batch
              try {
                await batch.commit();
                console.log(`Batch ${i + 1} deleted successfully`);
              } catch (batchError) {
                console.log(`Batch ${i + 1} delete failed, but continuing:`, batchError.message);
              }
            }
          }
          
          setLastSyncTime(new Date().toISOString());
        } catch (firestoreError) {
          console.log('Firebase clear failed, but continuing with empty local state:', firestoreError.message);
        }
      } else {
        console.log("User not logged in, cards cleared from local storage only");
      }
      
      console.log("All cards have been cleared");
      
      return true;
    } catch (error) {
      console.error('Error clearing cards:', error);
      // Return true anyway since local state is cleared
      return true;
    } finally {
      setCardsLoading(false);
    }
  };

  // Function to import cards - MODIFIED TO SUPPORT OFFLINE MODE
  const importCards = async (importedCards) => {
    if (!Array.isArray(importedCards) || importedCards.length === 0) {
      throw new Error("No valid cards to import");
    }
    
    try {
      console.log(`Starting import of ${importedCards.length} cards`);
      setCardsLoading(true);
      
      // First, deduplicate cards within the import set
      const uniqueImportMap = new Map();
      let dupeCount = 0;
      
      importedCards.forEach(card => {
        // Validate card has required fields
        if (!card.front || !card.back) {
          console.warn("Skipping invalid card:", card);
          return;
        }
        
        const contentKey = `${card.front.trim()}::${card.back.trim()}`;
        
        if (!uniqueImportMap.has(contentKey)) {
          uniqueImportMap.set(contentKey, card);
        } else {
          dupeCount++;
        }
      });
      
      const uniqueImportCards = Array.from(uniqueImportMap.values());
      console.log(`Found ${dupeCount} duplicates in import file`);
      console.log(`Preparing to add ${uniqueImportCards.length} unique cards`);
      
      if (uniqueImportCards.length === 0) {
        throw new Error("No valid cards found in import file");
      }
      
      // Generate client-side IDs for new cards if they don't have one
      const cardsToAdd = uniqueImportCards.map(card => ({
        id: card.id || Math.random().toString(36).substring(2, 15),
        front: card.front,
        back: card.back,
        known: card.known !== undefined ? Boolean(card.known) : false,
        timesReviewed: card.timesReviewed || 0,
        lastReviewed: card.lastReviewed || null,
        userId: user ? user.uid : 'local-user', // Use 'local-user' if not logged in
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString()
      }));
      
      // Add cards to local state, avoiding duplicates
      setCards(prevCards => {
        // Combine existing cards with new ones, avoiding duplicates
        const existingKeys = new Set(prevCards.map(card => `${card.front.trim()}::${card.back.trim()}`));
        const uniqueNewCards = cardsToAdd.filter(card => 
          !existingKeys.has(`${card.front.trim()}::${card.back.trim()}`)
        );
        
        const combinedCards = [...prevCards, ...uniqueNewCards];
        
        // Save to localStorage
        try {
          localStorage.setItem('flashcards', JSON.stringify(combinedCards));
        } catch (storageError) {
          console.error("Error saving imported cards to localStorage:", storageError);
        }
        
        return combinedCards;
      });
      
      setCurrentCardIndex(0);
      
      // If user is logged in, try to sync with Firebase
      if (user) {
        try {
          console.log("User is logged in, attempting to sync imported cards with Firebase");
          
          // Get existing cards to check for duplicates
          const q = query(collection(db, 'flashcards'), where('userId', '==', user.uid));
          const snapshot = await getDocs(q);
          
          // Create a map of existing content keys
          const existingContentMap = new Map();
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            const contentKey = `${data.front?.trim() || ''}::${data.back?.trim() || ''}`;
            existingContentMap.set(contentKey, doc.id);
          });
          
          // Separate cards into new and existing
          const newCards = [];
          const cardsToUpdate = [];
          
          cardsToAdd.forEach(card => {
            const contentKey = `${card.front.trim()}::${card.back.trim()}`;
            
            if (existingContentMap.has(contentKey)) {
              // This card already exists, we'll update it
              const existingId = existingContentMap.get(contentKey);
              cardsToUpdate.push({
                id: existingId,
                ...card,
                userId: user.uid
              });
            } else {
              // This is a new card
              newCards.push({
                ...card,
                userId: user.uid
              });
            }
          });
          
          console.log(`Found ${newCards.length} new cards to add to Firebase`);
          console.log(`Found ${cardsToUpdate.length} existing cards to update in Firebase`);
          
          // Process in batches with delays to avoid quota issues
          const BATCH_SIZE = 100;
          
          // Add new cards first
          if (newCards.length > 0) {
            const addBatchCount = Math.ceil(newCards.length / BATCH_SIZE);
            
            for (let i = 0; i < addBatchCount; i++) {
              const start = i * BATCH_SIZE;
              const end = Math.min(start + BATCH_SIZE, newCards.length);
              const currentBatch = newCards.slice(start, end);
              
              console.log(`Adding batch ${i + 1}/${addBatchCount} (cards ${start} to ${end - 1})`);
              
              // Wait before processing this batch to avoid rate limits
              if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
              
              // Process this batch of cards
              for (const card of currentBatch) {
                try {
                  // Remove the client-side ID before adding to Firestore
                  const { id, ...cardData } = card;
                  
                  await addDoc(collection(db, 'flashcards'), {
                    ...cardData,
                    createdAt: serverTimestamp(),
                    lastModified: serverTimestamp()
                  });
                } catch (addError) {
                  console.log(`Error adding card: ${addError.message}, continuing with next card`);
                }
              }
            }
          }
          
          // Then update existing cards if needed
          if (cardsToUpdate.length > 0) {
            const updateBatchCount = Math.ceil(cardsToUpdate.length / BATCH_SIZE);
            
            for (let i = 0; i < updateBatchCount; i++) {
              const start = i * BATCH_SIZE;
              const end = Math.min(start + BATCH_SIZE, cardsToUpdate.length);
              const currentBatch = cardsToUpdate.slice(start, end);
              
              console.log(`Updating batch ${i + 1}/${updateBatchCount} (cards ${start} to ${end - 1})`);
              
              // Wait before processing this batch to avoid rate limits
              if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
              
              // Process this batch of cards
              for (const card of currentBatch) {
                try {
                  const { id, ...cardData } = card;
                  const cardRef = doc(db, 'flashcards', id);
                  
                  await updateDoc(cardRef, {
                    ...cardData,
                    lastModified: serverTimestamp()
                  });
                } catch (updateError) {
                  console.log(`Error updating card: ${updateError.message}, continuing with next card`);
                }
              }
            }
          }
          
          setLastSyncTime(new Date().toISOString());
        } catch (firestoreError) {
          console.log('Firebase import failed, but continuing with local state:', firestoreError.message);
        }
      } else {
        console.log("User not logged in, cards imported to local storage only");
      }
      
      return cardsToAdd.length;
    } catch (error) {
      console.error('Error importing cards:', error);
      throw new Error(`Failed to import cards: ${error.message}`);
    } finally {
      setCardsLoading(false);
    }
  };

  // Force a refresh of cards from Firestore
  const refreshCards = async () => {
    if (!user) {
      console.log("No user logged in, can't refresh from Firebase");
      return false;
    }
    
    try {
      console.log("Forcing refresh of cards from Firestore");
      await loadUserCards();
      return true;
    } catch (error) {
      console.error("Error refreshing cards:", error);
      return false;
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
      clearCards,
      refreshCards,
      syncStatus,
      setSyncStatus,
      lastSyncTime
    }}>
      {children}
    </FlashcardContext.Provider>
  );
};