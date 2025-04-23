// src/components/Loading.js

import React from 'react';
import '../styles/App.css'; // Make sure the loading styles are imported

const Loading = () => {
  return (
    <div className="loading-container">
      <div className="loading">Loading your flashcards</div>
    </div>
  );
};

export default Loading;