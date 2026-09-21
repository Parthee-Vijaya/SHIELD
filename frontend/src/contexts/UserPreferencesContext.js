import React, { createContext, useContext, useState, useEffect } from 'react';

const UserPreferencesContext = createContext();

export const useUserPreferences = () => {
  const context = useContext(UserPreferencesContext);
  if (!context) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider');
  }
  return context;
};

const DEFAULT_PREFERENCES = {
  theme: 'light',
  language: 'da',
  notifications: {
    browser: true,
    email: false,
    desktop: true,
    newsUpdates: true,
    complianceAlerts: true,
    systemUpdates: false
  },
  dashboard: {
    defaultView: 'overview',
    refreshInterval: 300000, // 5 minutes
    chartAnimations: true,
    showTutorials: true
  },
  search: {
    defaultSort: 'date',
    defaultSortOrder: 'desc',
    resultsPerPage: 20,
    autoSearch: true,
    saveSearchHistory: true
  },
  display: {
    density: 'comfortable', // compact, comfortable, spacious
    sidebarCollapsed: false,
    showIcons: true,
    fontSize: 'medium', // small, medium, large
    highContrast: false
  },
  privacy: {
    analytics: true,
    errorReporting: true,
    dataCollection: true,
    personalizedContent: true
  },
  accessibility: {
    reducedMotion: false,
    screenReader: false,
    keyboardNavigation: false,
    focusVisible: true
  }
};

export const UserPreferencesProvider = ({ children }) => {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load preferences from localStorage on component mount
  useEffect(() => {
    const loadPreferences = () => {
      try {
        const stored = localStorage.getItem('judgedredd_user_preferences');
        if (stored) {
          const parsedPreferences = JSON.parse(stored);
          // Merge with defaults to ensure all keys exist
          setPreferences({
            ...DEFAULT_PREFERENCES,
            ...parsedPreferences,
            notifications: {
              ...DEFAULT_PREFERENCES.notifications,
              ...parsedPreferences.notifications
            },
            dashboard: {
              ...DEFAULT_PREFERENCES.dashboard,
              ...parsedPreferences.dashboard
            },
            search: {
              ...DEFAULT_PREFERENCES.search,
              ...parsedPreferences.search
            },
            display: {
              ...DEFAULT_PREFERENCES.display,
              ...parsedPreferences.display
            },
            privacy: {
              ...DEFAULT_PREFERENCES.privacy,
              ...parsedPreferences.privacy
            },
            accessibility: {
              ...DEFAULT_PREFERENCES.accessibility,
              ...parsedPreferences.accessibility
            }
          });
        }
      } catch (error) {
        console.error('Failed to load user preferences:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, []);

  // Save preferences to localStorage
  const savePreferences = async (newPreferences) => {
    setSaving(true);
    try {
      localStorage.setItem('judgedredd_user_preferences', JSON.stringify(newPreferences));
      setPreferences(newPreferences);

      // In a real app, you might also want to sync to a backend
      // await api.saveUserPreferences(newPreferences);

      return { success: true };
    } catch (error) {
      console.error('Failed to save user preferences:', error);
      return { success: false, error: error.message };
    } finally {
      setSaving(false);
    }
  };

  // Update a specific preference
  const updatePreference = async (path, value) => {
    const newPreferences = { ...preferences };
    const keys = path.split('.');
    let current = newPreferences;

    // Navigate to the parent of the target key
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }

    // Set the value
    current[keys[keys.length - 1]] = value;

    return await savePreferences(newPreferences);
  };

  // Reset preferences to defaults
  const resetPreferences = async () => {
    return await savePreferences(DEFAULT_PREFERENCES);
  };

  // Export preferences as JSON
  const exportPreferences = () => {
    const dataStr = JSON.stringify(preferences, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = `judgedredd_preferences_${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  // Import preferences from JSON
  const importPreferences = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const importedPreferences = JSON.parse(e.target.result);
          // Validate and merge with defaults
          const validatedPreferences = {
            ...DEFAULT_PREFERENCES,
            ...importedPreferences
          };
          const result = await savePreferences(validatedPreferences);
          resolve(result);
        } catch (error) {
          resolve({ success: false, error: 'Invalid preferences file' });
        }
      };
      reader.readAsText(file);
    });
  };

  // Get preference value by path
  const getPreference = (path) => {
    const keys = path.split('.');
    let current = preferences;

    for (const key of keys) {
      if (current[key] === undefined) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  };

  const value = {
    preferences,
    loading,
    saving,
    updatePreference,
    savePreferences,
    resetPreferences,
    exportPreferences,
    importPreferences,
    getPreference
  };

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
};

export default UserPreferencesContext;