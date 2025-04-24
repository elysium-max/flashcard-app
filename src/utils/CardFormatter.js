// src/utils/CardFormatter.js

/**
 * Utility to reformat flashcard content for better display
 * This can be used to fix existing cards that have formatting issues
 */

// Function to reformat a single card's back content
const reformatCardBack = (backText) => {
    if (!backText) return backText;
    
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
  
  // Function to export reformatted cards as a JSON file
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
  
  export { reformatCardBack, reformatCards, exportReformattedCards };