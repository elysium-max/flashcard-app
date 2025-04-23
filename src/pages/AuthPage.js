// src/pages/AuthPage.js

import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlashcardContext } from '../context/FlashcardContext';
import '../styles/AuthPage.css';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { registerUser, loginUser, user, loading } = useContext(FlashcardContext);
  const navigate = useNavigate();
  
  // Redirect to app if already authenticated
  useEffect(() => {
    if (user && !loading) {
      navigate('/app');
    }
  }, [user, loading, navigate]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    try {
      if (isLogin) {
        await loginUser(email, password);
      } else {
        await registerUser(email, password);
      }
      
      // Navigate to app will happen automatically via the useEffect
    } catch (error) {
      setError(error.message);
    }
  };

  if (loading) {
    return (
      <div className="auth-page-container">
        <div className="auth-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Language Flashcards</h1>
          <h2>{isLogin ? 'Sign In' : 'Create Account'}</h2>
          <p className="auth-subtitle">
            {isLogin 
              ? 'Sign in to access your flashcards' 
              : 'Create an account to start learning'}
          </p>
        </div>
        
        {error && <div className="auth-error">{error}</div>}
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
              minLength="6"
            />
          </div>
          
          <button type="submit" className="auth-btn">
            {isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        
        <div className="auth-switch">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button 
            className="switch-btn"
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </div>
      
      <div className="auth-footer">
        <p>Learn languages effectively with spaced repetition</p>
      </div>
    </div>
  );
};

export default AuthPage;