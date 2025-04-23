// src/components/Auth.js

import React, { useState, useContext } from 'react';
import { FlashcardContext } from '../context/FlashcardContext';
import '../styles/Auth.css';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { registerUser, loginUser, user, logoutUser } = useContext(FlashcardContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (isLogin) {
        await loginUser(email, password);
      } else {
        await registerUser(email, password);
      }
      
      // Clear form after successful auth
      setEmail('');
      setPassword('');
    } catch (error) {
      setError(error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      setError(error.message);
    }
  };

  // If user is logged in, show profile info and logout button
  if (user) {
    return (
      <div className="auth-container">
        <div className="user-profile">
          <h3>Welcome</h3>
          <p className="user-email">{user.email}</p>
          <p className="sync-status">Your cards are being synced across devices</p>
          <button className="logout-btn" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // If not logged in, show login/register form
  return (
    <div className="auth-container">
      <h2>{isLogin ? 'Sign In' : 'Create Account'}</h2>
      <p className="auth-subtitle">
        {isLogin 
          ? 'Sign in to sync your flashcards across devices' 
          : 'Create an account to save and sync your progress'}
      </p>
      
      {error && <div className="auth-error">{error}</div>}
      
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
  );
};

export default Auth;