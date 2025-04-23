// src/components/PrivateRoute.js

import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { FlashcardContext } from '../context/FlashcardContext';
import Loading from './Loading';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useContext(FlashcardContext);
  
  // Show loading spinner while checking authentication
  if (loading) {
    return <Loading />;
  }
  
  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  // Render children if authenticated
  return children;
};

export default PrivateRoute;