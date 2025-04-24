// src/utils/CardFormatter.js - Updated with batch processing

import { db } from '../utils/firebase';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';

/**
 * Utility to reformat flashcard content for better display
 * This can be used to fix existing cards that have formatting issues
 */

// Function to reformat a single card's back content
const reformatCardBack = (backText) => {
  if (!backText) return backText;
  
  // Skip if it's already in the right format with double newlines
  if (backText.includes('\n\n')) {
    return backText;
  }
  
  // Step 1: Try to identify translation, example, and grammar sections
  let translation = '';
  let example = '';
  let grammar = '';
  
  // Common grammar markers
  const grammarMarkers = ['Conj.', 'Notes:', 'Note:', 'Grammar:', 'Gram.'];
  
  // Find the start of grammar section
  let grammarStart = -1;
  for (const marker of grammarMarkers) {
    const index = backText.indexOf(marker);
    if (index !== -1 && (grammarStart === -1 || index < grammarStart)) {
      grammarStart = index;
    }
  }
  
  // Extract the grammar section
  if (grammarStart !== -1) {
    grammar = backText.substring(grammarStart);
    backText = backText.substring(0, grammarStart).trim();
  }
  
  // Try to separate translation from example
  // Pattern 1: Look for a sentence starting with capital letter after the main translation
  const sentencePattern = /^([^.!?]+)[.!?]\s+([A-Z].+)$/;
  const sentenceMatch = backText.match(sentencePattern);
  
  if (sentenceMatch) {
    translation = sentenceMatch[1].trim();
    example = sentenceMatch[2].trim();
  } else {
    // Pattern 2: Find the translation prefix "to " followed by the rest as example
    const translationPattern = /^(to [^.!?]+)(.+)?$/;
    const translationMatch = backText.match(translationPattern);
    
    if (translationMatch) {
      translation = translationMatch[1].trim();
      if (translationMatch[2]) {
        example = translationMatch[2].trim();
      }
    } else {
      // Fallback: just use the whole text as translation
      translation = backText;
    }
  }
  
  // Combine the reformatted sections with double newlines
  return `${translation}${example ? '\n\n' + example : ''}${grammar ? '\n\n' + grammar : ''}`;
};

// Function to process and reformat a batch of cards
const reformatCards = (cards) => {
  return cards.map(card => ({
    ...card,
    back: reformatCardBack(card.back)
  }));
};

/**
 * Enhanced Magic Fix function that processes cards in small batches
 * to avoid Firebase quota issues
 */
const magicFixCards = async (cards, setCards, setSyncStatus, setImportStatus) => {
  if (!Array.isArray(cards) || cards.length === 0) {
    setImportStatus('No cards to format');
    return { success: false, count: 0 };
  }
  
  try {
    setSyncStatus('syncing');
    setImportStatus('Preparing to reformat cards...');
    
    // IMPROVED: Use much smaller batches to avoid quota issues
    const BATCH_SIZE = 10; // Process just 10 cards at a time to stay well under limits
    const totalCards = cards.length;
    const batchCount = Math.ceil(totalCards / BATCH_SIZE);
    
    // First, reformat all cards locally (this doesn't hit Firebase)
    const reformattedCards = reformatCards(cards);
    
    // Count how many cards actually need changes
    const cardsToUpdate = reformattedCards.filter((card, index) => 
      card.back !== cards[index].back
    );
    
    setImportStatus(`Found ${cardsToUpdate.length} cards that need formatting`);
    
    // If no cards need updating, finish early
    if (cardsToUpdate.length === 0) {
      setSyncStatus('idle');
      return { success: true, count: 0 };
    }
    
    // For storing results
    let updatedCount = 0;
    let errorCount = 0;
    let isCancelled = false;
    
    // Create a local copy of cards to update as we go
    let updatedCards = [...cards];
    
    // Process batches sequentially with proper error handling and backoff
    for (let i = 0; i < batchCount && !isCancelled; i++) {
      const start = i * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, totalCards);
      
      // Update status to show progress
      setImportStatus(`Processing batch ${i + 1}/${batchCount} (${Math.round((i/batchCount) * 100)}% complete)`);
      
      try {
        // Create a new batch for this group of cards
        const batch = writeBatch(db);
        let batchUpdateCount = 0;
        
        // Add each card to the batch if it needs updating
        for (let j = start; j < end; j++) {
          const reformattedCard = reformattedCards[j];
          const originalCard = cards[j];
          
          // Only update if the card actually changed
          if (reformattedCard.back !== originalCard.back) {
            const cardRef = doc(db, 'flashcards', reformattedCard.id);
            batch.update(cardRef, { 
              back: reformattedCard.back,
              lastModified: new Date() // Add timestamp to track the change
            });
            batchUpdateCount++;
            
            // Update our local copy too
            updatedCards[j] = reformattedCard;
          }
        }
        
        // Only commit if we have changes to make
        if (batchUpdateCount > 0) {
          // IMPROVED: Add delay between batches to avoid rate limiting
          if (i > 0) {
            setImportStatus(`Waiting before processing next batch... (${Math.round((i/batchCount) * 100)}% complete)`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
          }
          
          // Commit this batch
          await batch.commit();
          updatedCount += batchUpdateCount;
          
          // Update the local state after each successful batch
          setCards(updatedCards);
          setImportStatus(`Batch ${i + 1}/${batchCount} completed successfully. Total: ${updatedCount} cards updated`);
        }
      } catch (error) {
        console.error(`Error processing batch ${i + 1}:`, error);
        errorCount++;
        
        // Show helpful error message based on the type of error
        if (error.code === 'resource-exhausted') {
          setImportStatus(`Quota exceeded on batch ${i + 1}/${batchCount}. Waiting 5 seconds before retry...`);
          
          // Wait 5 seconds before retrying this batch
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Retry this batch (decrement i to process this batch again)
          i--;
          
          // But only retry up to 3 times per batch
          if (errorCount > 3) {
            setImportStatus(`Too many errors, stopping after ${updatedCount} cards. Try again later.`);
            break;
          }
        } else {
          // For other errors, just pause and continue with next batch
          setImportStatus(`Error on batch ${i + 1}: ${error.message}. Continuing with next batch...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    // Finalize and return results
    setSyncStatus('idle');
    return { 
      success: true, 
      count: updatedCount,
      errors: errorCount,
      cancelled: isCancelled
    };
  } catch (error) {
    console.error('Error formatting cards:', error);
    setSyncStatus('error');
    return { success: false, error };
  }
};

// Function to export reformatted cards as a JSON file (keeping for backup)
const exportReformattedCards = (cards) => {
  const reformattedCards = reformatCards(cards);
  const jsonData = JSON.stringify(reformattedCards, null, 2);
  
  // Create a blob with the data
  const blob = new Blob([jsonData], { type: 'application/json' });
  
  // Create a URL for the blob
  const url = URL.createObjectURL(blob);
  
  // Create a temporary anchor element to trigger the download
  const a = document.createElement('a');
  a.href = url;
  
  // Get current date for filename
  const date = new Date().toISOString().split('T')[0];
  a.download = `flashcards-reformatted-${date}.json`;
  
  // Trigger the download
  document.body.appendChild(a);
  a.click();
  
  // Clean up
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  return reformattedCards;
};

export { reformatCardBack, reformatCards, exportReformattedCards, magicFixCards };