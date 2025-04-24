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
  
  // Additional state for sync management
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'error'
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Debug flag to help track issues
  const [debug, setDebug] = useState(false);

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
  const loadUserCards = useCallback(async () => {
    if (!user) {
      setCards([]);
      return;
    }
    
    try {
      setCardsLoading(true);
      setSyncStatus('syncing');
      
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
      
      setCards(flashcardsData);
      setLastSyncTime(new Date().toISOString());
      setSyncStatus('idle');
      
      if (flashcardsData.length === 0) {
        console.log("No cards found, user will need to import cards");
      }
    } catch (error) {
      console.error("Error loading flashcards:", error);
      setSyncStatus('error');
    } finally {
      setCardsLoading(false);
    }
  }, [user, debug]);

  useEffect(() => {
    if (user) {
      loadUserCards();
    }
  }, [user, loadUserCards]);

  // Update local stats whenever cards change
  useEffect(() => {
    if (Array.isArray(cards) && cards.length > 0) {
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
      // Reset state after logout
      setCards([]);
      setCurrentCardIndex(0);
      setSyncStatus('idle');
      setLastSyncTime(null);
    } catch (error) {
      throw new Error(`Failed to sign out: ${error.message}`);
    }
  };

  // Function to set a card's known status
  const setCardStatus = async (id, isKnown) => {
    if (!user) return;
    
    try {
      setSyncStatus('syncing');
      
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

      // Then update in Firestore
      const docRef = doc(db, 'flashcards', id);
      
      // First check if the document exists to prevent errors
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
        console.error(`Card with ID ${id} does not exist in Firestore`);
        // We should refresh all cards to ensure consistency
        await loadUserCards();
      }
      
      setSyncStatus('idle');
    } catch (error) {
      console.error('Error updating card status:', error);
      setSyncStatus('error');
      
      // Even if there's an error updating Firestore, keep the local state update
      // This ensures the UI remains responsive
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
    if (!user || !Array.isArray(cards) || cards.length === 0) return;
    
    // Fisher-Yates shuffle algorithm
    const shuffledCards = [...cards];
    for (let i = shuffledCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
    }
    
    // Update local state
    setCards(shuffledCards);
    setCurrentCardIndex(0);
    
    console.log('Cards shuffled successfully');
  }, [cards, user]);
  
  // Function to reset all cards to unknown with improved error handling
  const resetCards = async () => {
    if (!user || !Array.isArray(cards) || cards.length === 0) return;
    
    try {
      setCardsLoading(true);
      setSyncStatus('syncing');
      
      // Use Firestore batched writes for better reliability
      // Firestore has a limit of 500 operations per batch, so we might need multiple batches
      const BATCH_SIZE = 450; // Stay well under the limit
      
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

      // Calculate how many batches we need
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
        
        // Commit the batch
        await batch.commit();
        console.log(`Batch ${i + 1} committed successfully`);
      }
      
      console.log('All cards reset successfully');
      setLastSyncTime(new Date().toISOString());
      setSyncStatus('idle');
    } catch (error) {
      console.error('Error resetting cards:', error);
      setSyncStatus('error');
      
      // Even if there's an error updating Firestore, keep the local state update
      // This ensures the UI remains usable
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

  // Completely revamped clearCards function for better reliability
  const clearCards = async () => {
    if (!user) {
      console.error("No user logged in - cannot clear cards");
      return false;
    }
    
    try {
      setCardsLoading(true);
      setSyncStatus('syncing');
      console.log("Starting to clear cards...");
      
      // First, get all user's cards
      const q = query(collection(db, 'flashcards'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      
      const cardCount = snapshot.docs.length;
      console.log(`Found ${cardCount} cards to delete`);
      
      if (cardCount === 0) {
        // Nothing to delete
        setCards([]);
        setCurrentCardIndex(0);
        setSyncStatus('idle');
        return true;
      }
      
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
        
        // Commit this batch
        await batch.commit();
        console.log(`Batch ${i + 1} deleted successfully`);
      }
      
      // Clear local state
      setCards([]);
      setCurrentCardIndex(0);
      setLastSyncTime(new Date().toISOString());
      console.log("All cards have been cleared successfully");
      
      setSyncStatus('idle');
      return true;
    } catch (error) {
      console.error('Error clearing cards:', error);
      setSyncStatus('error');
      
      // Clear local state anyway to maintain consistency with intention
      setCards([]);
      setCurrentCardIndex(0);
      
      return false;
    } finally {
      setCardsLoading(false);
    }
  };

  // Completely revamped import function for more reliability
  const importCards = async (importedCards) => {
    if (!user) {
      console.error("Import failed: No user logged in");
      throw new Error("You must be logged in to import cards");
    }
    
    if (!Array.isArray(importedCards) || importedCards.length === 0) {
      throw new Error("No valid cards to import");
    }
    
    try {
      console.log(`Starting import of ${importedCards.length} cards`);
      setCardsLoading(true);
      setSyncStatus('syncing');
      
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
      
      // Now check against existing cards to avoid duplicates
      // Get all existing cards
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
      
      uniqueImportCards.forEach(card => {
        const contentKey = `${card.front.trim()}::${card.back.trim()}`;
        
        if (existingContentMap.has(contentKey)) {
          // This card already exists, we'll update it
          const existingId = existingContentMap.get(contentKey);
          cardsToUpdate.push({
            id: existingId,
            ...card,
            userId: user.uid,
            known: card.known !== undefined ? Boolean(card.known) : false,
            timesReviewed: card.timesReviewed || 0,
            lastReviewed: card.lastReviewed || null,
            lastModified: serverTimestamp()
          });
        } else {
          // This is a new card
          newCards.push({
            ...card,
            userId: user.uid,
            known: card.known !== undefined ? Boolean(card.known) : false,
            timesReviewed: card.timesReviewed || 0,
            lastReviewed: card.lastReviewed || null,
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp()
          });
        }
      });
      
      console.log(`Found ${newCards.length} new cards to add`);
      console.log(`Found ${cardsToUpdate.length} existing cards to update`);
      
      // Arrays to track successfully processed cards
      const addedCards = [];
      const updatedCards = [];
      
      // Process in batches for better reliability
      const BATCH_SIZE = 450;
      
      // Add new cards first
      if (newCards.length > 0) {
        const addBatchCount = Math.ceil(newCards.length / BATCH_SIZE);
        
        for (let i = 0; i < addBatchCount; i++) {
          const start = i * BATCH_SIZE;
          const end = Math.min(start + BATCH_SIZE, newCards.length);
          
          console.log(`Adding batch ${i + 1}/${addBatchCount} (cards ${start} to ${end - 1})`);
          
          const batchPromises = [];
          
          for (let j = start; j < end; j++) {
            // For new cards, we need individual addDoc calls to get IDs
            batchPromises.push(
              addDoc(collection(db, 'flashcards'), newCards[j])
                .then(docRef => {
                  // Return a properly formatted card for our local state
                  return {
                    id: docRef.id,
                    ...newCards[j],
                    // Convert timestamps to ISO strings for local state
                    createdAt: new Date().toISOString(),
                    lastModified: new Date().toISOString(),
                    lastReviewed: newCards[j].lastReviewed
                  };
                })
                .catch(err => {
                  console.error(`Error adding card at index ${j}:`, err);
                  return null;
                })
            );
          }
          
          const batchResults = await Promise.all(batchPromises);
          const validResults = batchResults.filter(card => card !== null);
          addedCards.push(...validResults);
          
          console.log(`Added ${validResults.length} cards in batch ${i + 1}`);
        }
      }
      
      // Then update existing cards if needed
      if (cardsToUpdate.length > 0) {
        const updateBatchCount = Math.ceil(cardsToUpdate.length / BATCH_SIZE);
        
        for (let i = 0; i < updateBatchCount; i++) {
          const batch = writeBatch(db);
          const start = i * BATCH_SIZE;
          const end = Math.min(start + BATCH_SIZE, cardsToUpdate.length);
          
          console.log(`Updating batch ${i + 1}/${updateBatchCount} (cards ${start} to ${end - 1})`);
          
          const batchUpdates = [];
          for (let j = start; j < end; j++) {
            const card = cardsToUpdate[j];
            const { id, ...cardData } = card;
            
            const cardRef = doc(db, 'flashcards', id);
            batch.update(cardRef, cardData);
            
            // Add to our updated cards with proper timestamp handling
            batchUpdates.push({
              ...card,
              lastModified: new Date().toISOString()
            });
          }
          
          try {
            await batch.commit();
            updatedCards.push(...batchUpdates);
            console.log(`Updated ${end - start} cards in batch ${i + 1}`);
          } catch (error) {
            console.error(`Error updating batch ${i + 1}:`, error);
          }
        }
      }
      
      // Now update our local state with all the processed cards
      const allProcessedCards = [...addedCards, ...updatedCards];
      console.log(`Processed ${allProcessedCards.length} cards total.`);

      // CRITICAL: Update local state with all processed cards
      // even if Firestore loading fails
      setCards(allProcessedCards);
      setCurrentCardIndex(0);
      
      setLastSyncTime(new Date().toISOString());
      setSyncStatus('idle');
      
      console.log(`Import complete. Processed ${allProcessedCards.length} cards total.`);
      return allProcessedCards.length;
    } catch (error) {
      console.error('Error importing cards:', error);
      setSyncStatus('error');
      throw new Error(`Failed to import cards: ${error.message}`);
    } finally {
      setCardsLoading(false);
    }
  };

  // Force a refresh of cards from Firestore
  const refreshCards = async () => {
    if (!user) return false;
    
    try {
      console.log("Forcing refresh of cards from Firestore");
      await loadUserCards();
      return true;
    } catch (error) {
      console.error("Error refreshing cards:", error);
      return false;
    }
  };

  // Toggle debug mode
  const toggleDebug = () => {
    setDebug(!debug);
    console.log(`Debug mode ${!debug ? 'enabled' : 'disabled'}`);
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
      lastSyncTime,
      toggleDebug,
      debug
    }}>
      {children}
    </FlashcardContext.Provider>
  );
};