import { useState, useCallback, useRef } from 'react';

export const useLoading = (initialState = false) => {
  const [isLoading, setIsLoading] = useState(initialState);
  const [error, setError] = useState(null);
  const loadingRef = useRef(new Set());

  const startLoading = useCallback((key = 'default') => {
    loadingRef.current.add(key);
    setIsLoading(true);
    setError(null);
  }, []);

  const stopLoading = useCallback((key = 'default') => {
    loadingRef.current.delete(key);
    if (loadingRef.current.size === 0) {
      setIsLoading(false);
    }
  }, []);

  const setLoadingError = useCallback((errorMessage, key = 'default') => {
    loadingRef.current.delete(key);
    if (loadingRef.current.size === 0) {
      setIsLoading(false);
    }
    setError(errorMessage);
  }, []);

  const resetLoading = useCallback(() => {
    loadingRef.current.clear();
    setIsLoading(false);
    setError(null);
  }, []);

  const withLoading = useCallback(async (asyncFn, key = 'default') => {
    try {
      startLoading(key);
      const result = await asyncFn();
      stopLoading(key);
      return result;
    } catch (err) {
      setLoadingError(err.message || 'An error occurred', key);
      throw err;
    }
  }, [startLoading, stopLoading, setLoadingError]);

  return {
    isLoading,
    error,
    startLoading,
    stopLoading,
    setLoadingError,
    resetLoading,
    withLoading,
    hasActiveLoading: loadingRef.current.size > 0
  };
};