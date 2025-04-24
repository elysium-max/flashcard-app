// src/components/Loading.js

import React from 'react';
import '../styles/Loading.css';

const Loading = ({ message = 'Loading your flashcards' }) => {
  return (
    <div className="loading-container">
      <div className="loading">{message}</div>
    </div>
  );
};

export default Loading;