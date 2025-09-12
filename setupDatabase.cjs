import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ allowedRoles, children }) => {
  // Use our custom hook for a single source of truth
  const { isAuthenticated, role } = useAuth();

  // 1. Check if the user is authenticated at all
  if (!isAuthenticated) {
    // Redirect to login if there's no token
    return <Navigate to="/login" replace />;
  }

  // 2. Check if the user has the required role
  // This check only runs if the user is authenticated
  const hasRequiredRole = role && allowedRoles.map(r => r.toLowerCase()).includes(role.toLowerCase());

  if (!hasRequiredRole) {
    // Redirect to an unauthorized page if their role is wrong
    return <Navigate to="/unauthorized" replace />;
  }

  // If both checks pass, render the child component
  return children;
};

export default ProtectedRoute;