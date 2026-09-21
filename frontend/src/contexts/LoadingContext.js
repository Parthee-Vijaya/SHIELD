import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FullPageLoader } from '../components/LoadingSpinner';

const LoadingContext = createContext();

const LOADING_ACTIONS = {
  START_LOADING: 'START_LOADING',
  STOP_LOADING: 'STOP_LOADING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  RESET: 'RESET'
};

const initialState = {
  activeLoaders: new Set(),
  globalLoading: false,
  errors: new Map(),
  metadata: new Map()
};

const loadingReducer = (state, action) => {
  switch (action.type) {
    case LOADING_ACTIONS.START_LOADING: {
      const newActiveLoaders = new Set(state.activeLoaders);
      newActiveLoaders.add(action.payload.key);

      const newMetadata = new Map(state.metadata);
      if (action.payload.metadata) {
        newMetadata.set(action.payload.key, action.payload.metadata);
      }

      return {
        ...state,
        activeLoaders: newActiveLoaders,
        globalLoading: action.payload.global || newActiveLoaders.size > 0,
        metadata: newMetadata
      };
    }

    case LOADING_ACTIONS.STOP_LOADING: {
      const newActiveLoaders = new Set(state.activeLoaders);
      newActiveLoaders.delete(action.payload.key);

      const newMetadata = new Map(state.metadata);
      newMetadata.delete(action.payload.key);

      return {
        ...state,
        activeLoaders: newActiveLoaders,
        globalLoading: newActiveLoaders.size > 0,
        metadata: newMetadata
      };
    }

    case LOADING_ACTIONS.SET_ERROR: {
      const newActiveLoaders = new Set(state.activeLoaders);
      newActiveLoaders.delete(action.payload.key);

      const newErrors = new Map(state.errors);
      newErrors.set(action.payload.key, action.payload.error);

      const newMetadata = new Map(state.metadata);
      newMetadata.delete(action.payload.key);

      return {
        ...state,
        activeLoaders: newActiveLoaders,
        globalLoading: newActiveLoaders.size > 0,
        errors: newErrors,
        metadata: newMetadata
      };
    }

    case LOADING_ACTIONS.CLEAR_ERROR: {
      const newErrors = new Map(state.errors);
      newErrors.delete(action.payload.key);

      return {
        ...state,
        errors: newErrors
      };
    }

    case LOADING_ACTIONS.RESET: {
      return {
        ...initialState,
        activeLoaders: new Set(),
        errors: new Map(),
        metadata: new Map()
      };
    }

    default:
      return state;
  }
};

export const LoadingProvider = ({ children, showGlobalLoader = true }) => {
  const [state, dispatch] = useReducer(loadingReducer, {
    ...initialState,
    activeLoaders: new Set(),
    errors: new Map(),
    metadata: new Map()
  });

  const startLoading = useCallback((key = 'default', options = {}) => {
    dispatch({
      type: LOADING_ACTIONS.START_LOADING,
      payload: {
        key,
        global: options.global || false,
        metadata: options.metadata
      }
    });
  }, []);

  const stopLoading = useCallback((key = 'default') => {
    dispatch({
      type: LOADING_ACTIONS.STOP_LOADING,
      payload: { key }
    });
  }, []);

  const setError = useCallback((key = 'default', error) => {
    dispatch({
      type: LOADING_ACTIONS.SET_ERROR,
      payload: { key, error }
    });
  }, []);

  const clearError = useCallback((key = 'default') => {
    dispatch({
      type: LOADING_ACTIONS.CLEAR_ERROR,
      payload: { key }
    });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: LOADING_ACTIONS.RESET });
  }, []);

  const withLoading = useCallback(async (asyncFn, key = 'default', options = {}) => {
    try {
      startLoading(key, options);
      const result = await asyncFn();
      stopLoading(key);
      return result;
    } catch (error) {
      setError(key, error.message || 'An error occurred');
      throw error;
    }
  }, [startLoading, stopLoading, setError]);

  const isLoading = useCallback((key = null) => {
    if (key) {
      return state.activeLoaders.has(key);
    }
    return state.activeLoaders.size > 0;
  }, [state.activeLoaders]);

  const getError = useCallback((key = 'default') => {
    return state.errors.get(key);
  }, [state.errors]);

  const getMetadata = useCallback((key = 'default') => {
    return state.metadata.get(key);
  }, [state.metadata]);

  const contextValue = {
    // State
    globalLoading: state.globalLoading,
    activeLoaders: state.activeLoaders,
    errors: state.errors,

    // Actions
    startLoading,
    stopLoading,
    setError,
    clearError,
    reset,
    withLoading,

    // Helpers
    isLoading,
    getError,
    getMetadata,
    hasActiveLoaders: state.activeLoaders.size > 0
  };

  return (
    <LoadingContext.Provider value={contextValue}>
      {children}

      {showGlobalLoader && (
        <AnimatePresence>
          {state.globalLoading && (
            <FullPageLoader
              key="global-loader"
              text="Indlæser..."
              subText="Vent venligst mens systemet forbereder data"
            />
          )}
        </AnimatePresence>
      )}
    </LoadingContext.Provider>
  );
};

export const useLoading = (key = 'default') => {
  const context = useContext(LoadingContext);

  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }

  const {
    startLoading: globalStartLoading,
    stopLoading: globalStopLoading,
    setError: globalSetError,
    clearError: globalClearError,
    withLoading: globalWithLoading,
    isLoading: globalIsLoading,
    getError: globalGetError,
    getMetadata: globalGetMetadata
  } = context;

  return {
    // Key-specific helpers
    isLoading: globalIsLoading(key),
    error: globalGetError(key),
    metadata: globalGetMetadata(key),

    // Key-specific actions
    startLoading: (options) => globalStartLoading(key, options),
    stopLoading: () => globalStopLoading(key),
    setError: (error) => globalSetError(key, error),
    clearError: () => globalClearError(key),
    withLoading: (asyncFn, options) => globalWithLoading(asyncFn, key, options),

    // Global context
    ...context
  };
};

// Higher-order component for automatic loading states
export const withLoadingState = (WrappedComponent, loadingKey) => {
  return function LoadingWrappedComponent(props) {
    const loading = useLoading(loadingKey || 'default');

    return (
      <WrappedComponent
        {...props}
        loading={loading}
      />
    );
  };
};

export default LoadingContext;