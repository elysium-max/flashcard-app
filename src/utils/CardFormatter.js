// src/utils/CardFormatter.js

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

// Function to directly update cards in Firestore and state
const magicFixCards = async (cards, setCards, setSyncStatus, setImportStatus) => {
  if (!Array.isArray(cards) || cards.length === 0) {
    setImportStatus('No cards to format');
    return { success: false, count: 0 };
  }
  
  try {
    setSyncStatus('syncing');
    setImportStatus('Reformatting cards...');
    
    // First, reformat all cards
    const reformattedCards = reformatCards(cards);
    
    // Update Firestore in batches
    const BATCH_SIZE = 450; // Firestore batch limit is 500
    const totalCards = reformattedCards.length;
    const batchCount = Math.ceil(totalCards / BATCH_SIZE);
    
    let updatedCount = 0;
    
    for (let i = 0; i < batchCount; i++) {
      const batch = writeBatch(db);
      const start = i * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, totalCards);
      
      setImportStatus(`Updating batch ${i + 1}/${batchCount} (cards ${start} to ${end - 1})...`);
      
      for (let j = start; j < end; j++) {
        const card = reformattedCards[j];
        // Only update if the card actually changed
        if (card.back !== cards[j].back) {
          const cardRef = doc(db, 'flashcards', card.id);
          batch.update(cardRef, { back: card.back });
          updatedCount++;
        }
      }
      
      // Commit the batch
      await batch.commit();
      setImportStatus(`Batch ${i + 1}/${batchCount} updated successfully`);
    }
    
    // Update the local state with the reformatted cards
    setCards(reformattedCards);
    setSyncStatus('idle');
    
    return { success: true, count: updatedCount };
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