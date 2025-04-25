// src/context/FlashcardContext.js

import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
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
  
  const [stats, setStats] = useState({
    total: 0,
    known: 0,
    unknown: 0,
    reviewed: 0
  });
  
  // Additional state for sync management
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'error'
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Track if initial cards load has been completed
  const initialLoadComplete = useRef(false);

  // Combined loading state
  const loading = authLoading || cardsLoading;

  // Helper function to save cards to localStorage
  const saveCardsToLocalStorage = useCallback((cardsToSave) => {
    try {
      localStorage.setItem('flashcards', JSON.stringify(cardsToSave));
      console.log(`Saved ${cardsToSave.length} cards to localStorage`);
    } catch (error) {
      console.error("Error saving to localStorage:", error);
    }
  }, []);

  // Load cards from localStorage on mount (before authentication)
  useEffect(() => {
    try {
      const storedCards = localStorage.getItem('flashcards');
      if (storedCards && (!cards || cards.length === 0)) {
        const parsedCards = JSON.parse(storedCards);
        if (Array.isArray(parsedCards) && parsedCards.length > 0) {
          console.log(`Found ${parsedCards.length} cards in localStorage on startup`);
          setCards(parsedCards);
        }
      }
    } catch (error) {
      console.error("Error loading cards from localStorage on startup:", error);
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  // Save study mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('studyMode', studyMode);
  }, [studyMode]);

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
      
      if (currentUser) {
        console.log("User is signed in:", currentUser.uid);
      } else {
        console.log("No user is signed in");
      }
    });

    return () => unsubscribe();
  }, []);

  // Load flashcards from Firestore when user authentication changes
  const loadUserCards = useCallback(async () => {
    if (!user) {
      console.log("No user found, keeping existing cards in memory");
      return;
    }
    
    try {
      setCardsLoading(true);
      setSyncStatus('syncing');
      console.log("Loading cards for user:", user.uid);
      
      const q = query(
        collection(db, 'flashcards'), 
        where('userId', '==', user.uid)
      );
      
      const snapshot = await getDocs(q);
      console.log(`Firestore query returned ${snapshot.docs.length} documents`);
      
      // Process Firestore cards
      const firestoreCards = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Convert timestamps to ISO strings
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
      
      // Use a state updater function to get current cards without adding a dependency
      setCards(prevCards => {
        // Create content-based maps for merging
        const firestoreContentMap = new Map();
        firestoreCards.forEach(card => {
          const contentKey = `${card.front?.trim()}::${card.back?.trim()}`;
          firestoreContentMap.set(contentKey, card);
        });
        
        const localContentMap = new Map();
        prevCards.forEach(card => {
          const contentKey = `${card.front?.trim()}::${card.back?.trim()}`;
          localContentMap.set(contentKey, card);
        });
        
        // Merge cards - prefer local known status
        const mergedCards = [];
        
        // Process Firestore cards
        firestoreContentMap.forEach((firestoreCard, contentKey) => {
          const localCard = localContentMap.get(contentKey);
          
          if (localCard) {
            // This card exists in both local and Firestore - use Firestore card as base but local status
            mergedCards.push({
              ...firestoreCard,
              known: localCard.known, // Keep local known status
              timesReviewed: Math.max(firestoreCard.timesReviewed || 0, localCard.timesReviewed || 0)
            });
            
            // Remove from local map to mark as processed
            localContentMap.delete(contentKey);
          } else {
            // This is a card from Firestore not in local memory
            mergedCards.push(firestoreCard);
          }
        });
        
        // Add any remaining local cards
        localContentMap.forEach((localCard) => {
          // Ensure it has the current user ID
          mergedCards.push({
            ...localCard, 
            userId: user.uid
          });
        });
        
        // Sort the cards
        mergedCards.sort((a, b) => {
          if (a.createdAt && b.createdAt) {
            return new Date(a.createdAt) - new Date(b.createdAt);
          }
          return 0;
        });
        
        console.log(`Merged ${mergedCards.length} cards`);
        
        // Save to localStorage
        saveCardsToLocalStorage(mergedCards);
        
        return mergedCards;
      });
      
      setLastSyncTime(new Date().toISOString());
      setSyncStatus('idle');
    } catch (error) {
      console.error("Error loading flashcards:", error);
      setSyncStatus('error');
      
      // If we have local cards, keep using them
      if (cards.length > 0) {
        console.log(`Keeping ${cards.length} existing cards in memory despite sync error`);
      } else {
        // Try to load from localStorage as fallback
        try {
          const storedCards = localStorage.getItem('flashcards');
          if (storedCards) {
            const parsedCards = JSON.parse(storedCards);
            if (Array.isArray(parsedCards) && parsedCards.length > 0) {
              console.log(`Loading ${parsedCards.length} cards from localStorage as fallback`);
              setCards(parsedCards);
            }
          }
        } catch (fallbackError) {
          console.error("Error loading from localStorage fallback:", fallbackError);
        }
      }
    } finally {
      setCardsLoading(false);
    }
  }, [user, saveCardsToLocalStorage]); // Removed 'cards' from dependencies

  // Function to explicitly refresh when needed
  const refreshUserCards = useCallback(async () => {
    if (user) {
      initialLoadComplete.current = false;
      await loadUserCards();
      initialLoadComplete.current = true;
    }
  }, [user, loadUserCards]);

  // Modified useEffect to prevent repeated loads
  useEffect(() => {
    if (user && !initialLoadComplete.current) {
      loadUserCards();
      initialLoadComplete.current = true;
    }
  }, [user, loadUserCards]);

  // Update stats whenever cards change
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
    }
  }, [cards]);

  // Authentication functions
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
      // Save current cards to localStorage BEFORE signing out
      saveCardsToLocalStorage(cards);
      console.log("Saved cards to localStorage before logout");
      
      await signOut(auth);
      setLastSyncTime(null);
      
      // DO NOT clear the cards here - this is important for persistence
      // setCards([]);  <- Removing this line is key
      
      console.log("User logged out, but keeping flashcards in memory");
    } catch (error) {
      throw new Error(`Failed to sign out: ${error.message}`);
    }
  };

  // Function to set a card's known status
  const setCardStatus = async (id, isKnown) => {
    if (!id) return;
    
    try {
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
      
      // Always save to localStorage
      saveCardsToLocalStorage(updatedCards);

      // Then try to update in Firestore if user is logged in
      if (user) {
        try {
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

  // Function to shuffle cards
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
    
    // Also save to localStorage
    saveCardsToLocalStorage(shuffledCards);
    
    console.log('Cards shuffled successfully');
  }, [cards, saveCardsToLocalStorage]);
  
  // Function to reset all cards to unknown
  const resetCards = async () => {
    if (!Array.isArray(cards) || cards.length === 0) return;
    
    try {
      setCardsLoading(true);
      
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
      
      // Save to localStorage
      saveCardsToLocalStorage(resetCardsData);

      // Try Firebase update if user is logged in
      if (user) {
        try {
          setSyncStatus('syncing');
          
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
          setSyncStatus('idle');
        } catch (firestoreError) {
          console.log('Firebase reset failed, but continuing with local state:', firestoreError.message);
          setSyncStatus('error');
        }
      } else {
        console.log("User not logged in, cards reset in local storage only");
      }
      
      console.log('All cards reset successfully');
    } catch (error) {
      console.error('Error resetting cards:', error);
      setSyncStatus('error');
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

  // Function to clear all cards
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
          setSyncStatus('syncing');
          
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
          setSyncStatus('idle');
        } catch (firestoreError) {
          console.log('Firebase clear failed, but continuing with empty local state:', firestoreError.message);
          setSyncStatus('error');
        }
      } else {
        console.log("User not logged in, cards cleared from local storage only");
      }
      
      console.log("All cards have been cleared");
      
      return true;
    } catch (error) {
      console.error('Error clearing cards:', error);
      setSyncStatus('error');
      // Return true anyway since local state is cleared
      return true;
    } finally {
      setCardsLoading(false);
    }
  };

  // Function to import cards
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
      
      // Create a map of existing cards by content for deduplication
      const existingContentMap = new Map();
      cards.forEach(card => {
        const contentKey = `${card.front.trim()}::${card.back.trim()}`;
        existingContentMap.set(contentKey, card);
      });
      
      // Generate client-side IDs for new cards if they don't have one
      const cardsToAdd = uniqueImportCards.map(card => {
        // Check if this card already exists in memory
        const contentKey = `${card.front.trim()}::${card.back.trim()}`;
        const existingCard = existingContentMap.get(contentKey);
        
        // If this card already exists, preserve its known status if the import doesn't specify
        const known = existingCard && card.known === undefined 
          ? existingCard.known 
          : (card.known !== undefined ? Boolean(card.known) : false);
        
        return {
          id: card.id || Math.random().toString(36).substring(2, 15),
          front: card.front,
          back: card.back,
          known: known,
          timesReviewed: card.timesReviewed || (existingCard ? existingCard.timesReviewed : 0) || 0,
          lastReviewed: card.lastReviewed || (existingCard ? existingCard.lastReviewed : null) || null,
          userId: user ? user.uid : 'local-user', // Use 'local-user' if not logged in
          createdAt: card.createdAt || new Date().toISOString(),
          lastModified: new Date().toISOString()
        };
      });
      
      // Add cards to local state, avoiding duplicates
      setCards(prevCards => {
        // Combine existing cards with new ones, avoiding duplicates
        const existingKeys = new Set(prevCards.map(card => `${card.front.trim()}::${card.back.trim()}`));
        const uniqueNewCards = cardsToAdd.filter(card => 
          !existingKeys.has(`${card.front.trim()}::${card.back.trim()}`)
        );
        
        const combinedCards = [...prevCards, ...uniqueNewCards];
        
        // Save to localStorage
        saveCardsToLocalStorage(combinedCards);
        
        return combinedCards;
      });
      
      setCurrentCardIndex(0);
      
      // If user is logged in, try to sync with Firebase
      if (user) {
        try {
          setSyncStatus('syncing');
          console.log("User is logged in, attempting to sync imported cards with Firebase");
          
          // Get existing cards to check for duplicates
          const q = query(collection(db, 'flashcards'), where('userId', '==', user.uid));
          const snapshot = await getDocs(q);
          
          // Create a map of existing content keys
          const firestoreContentMap = new Map();
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            const contentKey = `${data.front?.trim() || ''}::${data.back?.trim() || ''}`;
            firestoreContentMap.set(contentKey, doc.id);
          });
          
          // Separate cards into new and existing
          const newCards = [];
          const cardsToUpdate = [];
          
          cardsToAdd.forEach(card => {
            const contentKey = `${card.front.trim()}::${card.back.trim()}`;
            
            if (firestoreContentMap.has(contentKey)) {
              // This card already exists in Firestore, we'll update it
              const existingId = firestoreContentMap.get(contentKey);
              cardsToUpdate.push({
                id: existingId,
                ...card,
                userId: user.uid
              });
            } else {
              // This is a new card for Firestore
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
          setSyncStatus('idle');
        } catch (firestoreError) {
          console.log('Firebase import failed, but continuing with local state:', firestoreError.message);
          setSyncStatus('error');
        }
      } else {
        console.log("User not logged in, cards imported to local storage only");
      }
      
      return cardsToAdd.length;
    } catch (error) {
      console.error('Error importing cards:', error);
      setSyncStatus('error');
      throw new Error(`Failed to import cards: ${error.message}`);
    } finally {
      setCardsLoading(false);
    }
  };

  // Force a refresh of cards from Firestore - updated to use refreshUserCards
  const refreshCards = async () => {
    if (!user) {
      console.log("No user logged in, can't refresh from Firebase");
      return false;
    }
    
    try {
      console.log("Forcing refresh of cards from Firestore");
      await refreshUserCards(); // Use the new function that properly handles the ref
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