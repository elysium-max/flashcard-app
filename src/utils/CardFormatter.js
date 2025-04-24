// src/utils/CardFormatter.js - Updated with improved formatting

import { db } from '../utils/firebase';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';

/**
 * Utility to reformat flashcard content for better display
 * This can be used to fix existing cards that have formatting issues
 */

// Updated reformatCardBack function for src/utils/CardFormatter.js
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
    let textWithoutGrammar = backText;
    if (grammarStart !== -1) {
      grammar = backText.substring(grammarStart);
      textWithoutGrammar = backText.substring(0, grammarStart).trim();
    }
    
    // Improved pattern matching for separating translation from example
    
    // Pattern 1: Look for sentences that start with "I" after the main translation
    const iStatementPattern = /^([^.!?;]+?(?:;[^.!?;]+?)*)\s+I\s+(.+)$/i;
    const iStatementMatch = textWithoutGrammar.match(iStatementPattern);
    
    if (iStatementMatch) {
      translation = iStatementMatch[1].trim();
      example = "I " + iStatementMatch[2].trim();
    } else {
      // Pattern 2: Look for any English sentence after a semicolon or closing parenthesis
      const semicolonPattern = /^([^.!?]+(?:\([^)]+\))?(?:;[^.!?;]+)*)\s+([A-Z][^.!?;]+.*)$/;
      const semicolonMatch = textWithoutGrammar.match(semicolonPattern);
      
      if (semicolonMatch) {
        translation = semicolonMatch[1].trim();
        example = semicolonMatch[2].trim();
      } else {
        // Pattern 3: Look for definitive closing of translation with parentheses
        const parensPattern = /^(.+\))\s+([A-Z].+)$/;
        const parensMatch = textWithoutGrammar.match(parensPattern);
        
        if (parensMatch) {
          translation = parensMatch[1].trim();
          example = parensMatch[2].trim();
        } else {
          // Pattern 4: Look for a capital letter after multiple definitions
          const capitalsAfterSemicolon = /^([^.!?;]+(?:;\s+[^.!?;]+)+)\s+([A-Z].+)$/;
          const capitalMatch = textWithoutGrammar.match(capitalsAfterSemicolon);
          
          if (capitalMatch) {
            translation = capitalMatch[1].trim();
            example = capitalMatch[2].trim();
          } else {
            // Pattern 5: NEW - Look for any capital letter in the middle of the text
            // that might indicate the start of an example sentence
            const anyCapitalPattern = /^([^.!?;]+[.!?;])\s+([A-Z].+)$/;
            const anyCapitalMatch = textWithoutGrammar.match(anyCapitalPattern);
            
            if (anyCapitalMatch) {
              translation = anyCapitalMatch[1].trim();
              example = anyCapitalMatch[2].trim();
            } else {
              // Pattern 6: NEW - Try to find a sentence break at a period
              const periodBreakPattern = /^(.+?\.)[\s\n]+(.+)$/;
              const periodBreakMatch = textWithoutGrammar.match(periodBreakPattern);
              
              if (periodBreakMatch && periodBreakMatch[2].charAt(0).match(/[A-Z]/)) {
                translation = periodBreakMatch[1].trim();
                example = periodBreakMatch[2].trim();
              } else {
                // Fallback: just use the whole text as translation
                translation = textWithoutGrammar;
              }
            }
          }
        }
      }
    }
    
    // Ensure translation ends with a period if it doesn't have punctuation
    if (translation && !/[.!?;]$/.test(translation)) {
      translation += '.';
    }
    
    // Ensure example has proper punctuation
    if (example && !/[.!?]$/.test(example)) {
      example += '.';
    }
    
    // Combine the reformatted sections with double newlines
    return `${translation}${example ? '\n\n' + example : ''}${grammar ? '\n\n' + grammar : ''}`;
  };

// Function to reformat front content to ensure example sentences appear
const reformatFrontContent = (frontText) => {
  if (!frontText) return frontText;
  
  // If it already has proper formatting with periods, don't change it
  if (/\.\s+[A-Z]/.test(frontText)) {
    return frontText;
  }
  
  // Check if there might be an example sentence without proper separation
  // Look for patterns like "wyrzucać (imp) Muszę wyrzucić te stare gazety."
  const examplePattern = /^([a-ząćęłńóśźż]+(?:\s+się)?(?:\s+\([^)]+\))?)\s+([A-Z].+)$/i;
  const match = frontText.match(examplePattern);
  
  if (match) {
    const word = match[1].trim();
    const example = match[2].trim();
    
    // Ensure the word ends with a period
    const formattedWord = /[.!?]$/.test(word) ? word : word + '.';
    
    // Ensure the example has proper punctuation
    const formattedExample = /[.!?]$/.test(example) ? example : example + '.';
    
    // Combine with a space
    return `${formattedWord} ${formattedExample}`;
  }
  
  // If no example found, just ensure the word has a period
  return /[.!?]$/.test(frontText) ? frontText : frontText + '.';
};

// Function to process and reformat a batch of cards
const reformatCards = (cards) => {
  return cards.map(card => ({
    ...card,
    back: reformatCardBack(card.back),
    front: reformatFrontContent(card.front) // Now also reformatting front content
  }));
};

// Enhanced magicFixCards function for src/utils/CardFormatter.js
const magicFixCards = async (cards, setCards, setSyncStatus, setImportStatus) => {
    if (!Array.isArray(cards) || cards.length === 0) {
      setImportStatus('No cards to format');
      return { success: false, count: 0 };
    }
    
    try {
      setSyncStatus('syncing');
      setImportStatus('Preparing to reformat cards...');
      
      // Use smaller batches to avoid quota issues
      const BATCH_SIZE = 5; // Even smaller batches for better reliability
      const totalCards = cards.length;
      const batchCount = Math.ceil(totalCards / BATCH_SIZE);
      
      // First, reformat all cards locally (this doesn't hit Firebase)
      // Make a deep copy to avoid direct state mutation
      const cardsToFormat = JSON.parse(JSON.stringify(cards));
      
      // Log a sample card before reformatting
      if (cardsToFormat.length > 0) {
        console.log("Sample card before reformatting:", {
          front: cardsToFormat[0].front,
          back: cardsToFormat[0].back
        });
      }
      
      // Apply reformatting to each card
      const reformattedCards = cardsToFormat.map(card => ({
        ...card,
        back: reformatCardBack(card.back),
        front: reformatFrontContent(card.front)
      }));
      
      // Log the same sample card after reformatting
      if (reformattedCards.length > 0) {
        console.log("Sample card after reformatting:", {
          front: reformattedCards[0].front,
          back: reformattedCards[0].back
        });
      }
      
      // Count how many cards actually need changes
      const cardsToUpdate = reformattedCards.filter((card, index) => 
        card.back !== cards[index].back || card.front !== cards[index].front
      );
      
      setImportStatus(`Found ${cardsToUpdate.length} cards that need formatting out of ${totalCards} total cards`);
      
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
            
            // Only update if either front or back changed
            if (reformattedCard.back !== originalCard.back || 
                reformattedCard.front !== originalCard.front) {
              
              console.log(`Card ${j} needs updating:`, {
                old_front: originalCard.front,
                new_front: reformattedCard.front,
                old_back: originalCard.back,
                new_back: reformattedCard.back
              });
              
              const cardRef = doc(db, 'flashcards', reformattedCard.id);
              batch.update(cardRef, { 
                back: reformattedCard.back,
                front: reformattedCard.front,
                lastModified: new Date()
              });
              batchUpdateCount++;
              
              // Update our local copy too
              updatedCards[j] = {...reformattedCard};
            }
          }
          
          // Only commit if we have changes to make
          if (batchUpdateCount > 0) {
            // Add delay between batches to avoid rate limiting
            if (i > 0) {
              setImportStatus(`Waiting before processing next batch... (${Math.round((i/batchCount) * 100)}% complete)`);
              await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 second delay
            }
            
            // Commit this batch
            await batch.commit();
            updatedCount += batchUpdateCount;
            
            // Update the local state after each successful batch
            setCards([...updatedCards]);
            setImportStatus(`Batch ${i + 1}/${batchCount} completed successfully. Total: ${updatedCount} cards updated`);
          } else {
            console.log(`No changes needed in batch ${i + 1}`);
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
      
      // Final state update to ensure all changes are applied
      setCards([...updatedCards]);
      
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


// Add this to src/utils/CardFormatter.js

// Utility function to help debug card formatting
const debugCardFormatting = (card) => {
    if (!card) {
      console.log("No card to debug");
      return;
    }
    
    console.log("Debugging card:", card.id);
    console.log("Front content:", card.front);
    console.log("Back content:", card.back);
    
    // Analyze back content
    const hasNewlines = card.back.includes('\n\n');
    console.log("Has formatted newlines:", hasNewlines);
    
    if (hasNewlines) {
      const sections = card.back.split('\n\n');
      console.log("Sections found:", sections.length);
      console.log("Section 1 (translation):", sections[0]);
      if (sections.length > 1) {
        console.log("Section 2 (example):", sections[1]);
      }
      if (sections.length > 2) {
        console.log("Section 3 (grammar):", sections[2]);
      }
    } else {
      // Check if we can extract different parts
      const reformatted = reformatCardBack(card.back);
      console.log("Reformatted back:", reformatted);
      
      const newSections = reformatted.split('\n\n');
      console.log("After reformatting, sections found:", newSections.length);
      console.log("Section 1 (translation):", newSections[0]);
      if (newSections.length > 1) {
        console.log("Section 2 (example):", newSections[1]);
      }
      if (newSections.length > 2) {
        console.log("Section 3 (grammar):", newSections[2]);
      }
    }
    
    return hasNewlines ? card.back : reformatCardBack(card.back);
  };
  
  // Function to test format detection on a specific text
  const testFormatDetection = (text) => {
    const result = {
      original: text,
      reformatted: reformatCardBack(text)
    };
    
    console.log("Testing format detection:", result);
    
    // Log more detailed pattern matching results
    const grammarMarkers = ['Conj.', 'Notes:', 'Note:', 'Grammar:', 'Gram.'];
    let grammarStart = -1;
    for (const marker of grammarMarkers) {
      const index = text.indexOf(marker);
      if (index !== -1) {
        console.log(`Found grammar marker "${marker}" at position ${index}`);
      }
    }
    
    // Test each pattern
    const iStatementPattern = /^([^.!?;]+?(?:;[^.!?;]+?)*)\s+I\s+(.+)$/i;
    const iStatementMatch = text.match(iStatementPattern);
    if (iStatementMatch) {
      console.log("Matched I-statement pattern:", {
        translation: iStatementMatch[1].trim(),
        example: "I " + iStatementMatch[2].trim()
      });
    }
    
    const semicolonPattern = /^([^.!?]+(?:\([^)]+\))?(?:;[^.!?;]+)*)\s+([A-Z][^.!?;]+.*)$/;
    const semicolonMatch = text.match(semicolonPattern);
    if (semicolonMatch) {
      console.log("Matched semicolon pattern:", {
        translation: semicolonMatch[1].trim(),
        example: semicolonMatch[2].trim()
      });
    }
    
    const parensPattern = /^(.+\))\s+([A-Z].+)$/;
    const parensMatch = text.match(parensPattern);
    if (parensMatch) {
      console.log("Matched parentheses pattern:", {
        translation: parensMatch[1].trim(),
        example: parensMatch[2].trim()
      });
    }
    
    return result;
  };
  
  export { 
    reformatCardBack, 
    reformatCards, 
    exportReformattedCards, 
    magicFixCards, 
    reformatFrontContent,
    debugCardFormatting,
    testFormatDetection 
  };