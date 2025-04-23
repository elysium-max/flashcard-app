// src/utils/firebase.js

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyB0PusoVqz4JKzQgSNC7Na1951FkS2fhYg",
    authDomain: "flashcard-app-95233.firebaseapp.com",
    projectId: "flashcard-app-95233",
    storageBucket: "flashcard-app-95233.firebasestorage.app",
    messagingSenderId: "119442695875",
    appId: "1:119442695875:web:091ba4f9c1c30b026ae476",
    measurementId: "G-QMREMQTBK8"
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };