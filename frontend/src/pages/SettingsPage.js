import React, { useState, useRef } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import {
  FaCog,
  FaPalette,
  FaBell,
  FaDownload,
  FaUpload,
  FaRedo,
  FaCheck,
  FaTimes,
  FaToggleOn,
  FaToggleOff
} from 'react-icons/fa';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { useTutorial } from '../contexts/TutorialContext';

const SettingsContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;

  h1 {
    color: ${props => props.theme.colors.gray[800]};
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  p {
    color: ${props => props.theme.colors.gray[600]};
    font-size: 1.1rem;
  }
`;

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2rem;

  @media (min-width: 1024px) {
    grid-template-columns: 300px minmax(0, 1fr);
  }
`;

const SettingsNav = styled.nav`
  background: ${props => props.theme.colors.surface};
  border-radius: ${props => props.theme.borderRadiusLarge};
  padding: 1.5rem;
  border: 1px solid ${props => props.theme.colors.line};
  box-shadow: ${props => props.theme.shadows.glass};
  height: fit-content;
  position: sticky;
  top: 2rem;
`;

const NavItem = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: none;
  background: ${props => props.active ? props.theme.colors.primary : 'transparent'};
  color: ${props => props.active ? 'white' : props.theme.colors.gray[700]};
  border-radius: ${props => props.theme.borderRadius};
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: ${props => props.theme.animations.transition};
  margin-bottom: 0.5rem;

  &:hover {
    background: ${props => props.active ? props.theme.colors.primary : props.theme.colors.gray[100]};
  }

  &:last-child {
    margin-bottom: 0;
  }
`;

const SettingsContent = styled.div`
  min-width: 0;
  background: ${props => props.theme.colors.surface};
  color: ${props => props.theme.colors.ink};
  border-radius: ${props => props.theme.borderRadiusLarge};
  padding: 2rem;
  border: 1px solid ${props => props.theme.colors.line};
  box-shadow: ${props => props.theme.shadows.glass};

  @media (max-width: 560px) { padding: 1rem; }
`;

const SectionTitle = styled.h2`
  color: ${props => props.theme.colors.gray[800]};
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const SettingGroup = styled.div`
  margin-bottom: 2rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SettingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1rem;
  background: ${props => props.theme.colors.gray[50]};
  border-radius: ${props => props.theme.borderRadius};
  margin-bottom: 1rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SettingInfo = styled.div`
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;

  h4 {
    margin: 0 0 0.25rem 0;
    color: ${props => props.theme.colors.gray[800]};
    font-weight: 600;
    font-size: 0.875rem;
  }

  p {
    margin: 0;
    color: ${props => props.theme.colors.gray[600]};
    font-size: 0.8rem;
    line-height: 1.4;
  }
`;

const Toggle = styled.button`
  display: flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  color: ${props => props.active ? props.theme.colors.success : props.theme.colors.gray[400]};
  font-size: 1.5rem;
  transition: ${props => props.theme.animations.transition};

  &:hover {
    transform: scale(1.05);
  }
`;

const Select = styled.select`
  padding: 0.5rem;
  border: 1px solid ${props => props.theme.colors.gray[300]};
  border-radius: ${props => props.theme.borderRadius};
  background: ${props => props.theme.colors.inputBackground};
  color: ${props => props.theme.colors.ink};
  font-size: 0.875rem;
  min-width: 120px;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid ${props => props.theme.colors.gray[200]};
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: ${props => props.theme.borderRadius};
  font-weight: 600;
  cursor: pointer;
  transition: ${props => props.theme.animations.transition};

  &.primary {
    background: ${props => props.theme.colors.primary};
    color: white;

    &:hover {
      background: ${props => props.theme.colors.primaryDark || '#A03612'};
    }
  }

  &.secondary {
    background: transparent;
    color: ${props => props.theme.colors.primary};
    border: 2px solid ${props => props.theme.colors.primary};

    &:hover {
      background: ${props => props.theme.colors.primary};
      color: white;
    }
  }

  &.danger {
    background: ${props => props.theme.colors.danger};
    color: white;

    &:hover {
      background: ${props => props.theme.colors.dangerDark || '#991b1b'};
    }
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const FileInput = styled.input`
  display: none;
`;

const SaveStatus = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: ${props => props.theme.borderRadius};
  font-size: 0.875rem;
  font-weight: 500;

  &.success {
    background: ${props => props.theme.colors.successSoft};
    color: ${props => props.theme.colors.success};
  }

  &.error {
    background: ${props => props.theme.colors.dangerSoft};
    color: ${props => props.theme.colors.danger};
  }
`;

const SettingsPage = () => {
  const { restart: restartTutorial, canStart: canStartTutorial, saving: savingTutorial } = useTutorial();
  const {
    preferences,
    loading,
    saving,
    updatePreference,
    resetPreferences,
    exportPreferences,
    importPreferences
  } = useUserPreferences();

  const [activeSection, setActiveSection] = useState('appearance');
  const [saveStatus, setSaveStatus] = useState(null);
  const fileInputRef = useRef(null);

  const sections = [
    { id: 'appearance', label: 'Udseende', icon: FaPalette },
    { id: 'notifications', label: 'Notifikationsønsker', icon: FaBell },
  ];

  const handleUpdatePreference = async (path, value) => {
    const result = await updatePreference(path, value);
    if (result.success) {
      setSaveStatus({ type: 'success', message: 'Indstilling gemt' });
    } else {
      setSaveStatus({ type: 'error', message: 'Fejl ved gem af indstilling' });
    }

    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleReset = async () => {
    if (window.confirm('Er du sikker på, at du vil nulstille alle indstillinger?')) {
      const result = await resetPreferences();
      if (result.success) {
        setSaveStatus({ type: 'success', message: 'Indstillinger nulstillet' });
      } else {
        setSaveStatus({ type: 'error', message: 'Fejl ved nulstilling' });
      }
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const result = await importPreferences(file);
      if (result.success) {
        setSaveStatus({ type: 'success', message: 'Indstillinger importeret' });
      } else {
        setSaveStatus({ type: 'error', message: result.error || 'Fejl ved import' });
      }
      setTimeout(() => setSaveStatus(null), 3000);
    }
    event.target.value = '';
  };

  const renderAppearanceSettings = () => (
    <SettingGroup>
      <SectionTitle id="settings-section-title"><FaPalette /> Udseende</SectionTitle>

      <SettingRow>
        <SettingInfo>
          <h4><label htmlFor="settings-theme">Tema</label></h4>
          <p>Vælg lyst eller mørkt tema for applikationen</p>
        </SettingInfo>
        <Select
          id="settings-theme"
          value={preferences.theme === 'dark' ? 'dark' : 'light'}
          disabled={saving}
          onChange={(e) => handleUpdatePreference('theme', e.target.value)}
        >
          <option value="light">Lyst</option>
          <option value="dark">Mørkt</option>
        </Select>
      </SettingRow>

      <SettingRow>
        <SettingInfo>
          <h4>Sprog</h4>
          <p>Brugergrænsefladen er på dansk. Andre sprog er ikke tilgængelige endnu.</p>
        </SettingInfo>
        <span>Dansk</span>
      </SettingRow>
    </SettingGroup>
  );

  const renderNotificationSettings = () => (
    <SettingGroup>
      <SectionTitle id="settings-section-title"><FaBell /> Notifikationsønsker</SectionTitle>
      <p>Ønskerne gemmes kun i denne browser. De aktiverer endnu ikke udsendelse af e-mail, browser- eller desktopnotifikationer.</p>

      {Object.entries(preferences.notifications).map(([key, value]) => (
        <SettingRow key={key}>
          <SettingInfo>
            <h4>{getNotificationLabel(key)}</h4>
            <p>{getNotificationDescription(key)}</p>
          </SettingInfo>
          <Toggle
            active={value}
            type="button"
            role="switch"
            aria-label={getNotificationLabel(key)}
            aria-checked={Boolean(value)}
            disabled={saving}
            onClick={() => handleUpdatePreference(`notifications.${key}`, !value)}
          >
            {value ? <FaToggleOn /> : <FaToggleOff />}
          </Toggle>
        </SettingRow>
      ))}
    </SettingGroup>
  );

  const getNotificationLabel = (key) => {
    const labels = {
      browser: 'Browsernotifikationer',
      email: 'E-mailnotifikationer',
      desktop: 'Desktopnotifikationer',
      newsUpdates: 'Nyhedsopdateringer',
      complianceAlerts: 'Beskeder om krav og vurderinger',
      systemUpdates: 'Systemopdateringer'
    };
    return labels[key] || key;
  };

  const getNotificationDescription = (key) => {
    const descriptions = {
      browser: 'Ønske om beskeder i browseren',
      email: 'Ønske om beskeder via e-mail',
      desktop: 'Ønske om beskeder på computeren',
      newsUpdates: 'Ønske om beskeder ved nyheder',
      complianceAlerts: 'Ønske om beskeder om ændrede krav og vurderinger',
      systemUpdates: 'Ønske om beskeder ved vedligeholdelse'
    };
    return descriptions[key] || '';
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'appearance':
        return renderAppearanceSettings();
      case 'notifications':
        return renderNotificationSettings();
      default:
        return renderAppearanceSettings();
    }
  };

  if (loading) {
    return (
      <SettingsContainer>
        <PageHeader>
          <h1><FaCog /> Indstillinger</h1>
          <p>Indlæser brugerindstillinger...</p>
        </PageHeader>
      </SettingsContainer>
    );
  }

  return (
    <SettingsContainer>
      <PageHeader>
        <h1><FaCog /> Indstillinger</h1>
        <p>Tilpas din oplevelse af S.H.I.E.L.D.</p>
        <p>Ændringer gemmes automatisk i denne browser. De ændrer ikke sager, godkendelser eller organisationens fælles indstillinger.</p>
        {canStartTutorial && <Button className="secondary" type="button" disabled={savingTutorial} onClick={restartTutorial}>Start introduktionsguide igen</Button>}
      </PageHeader>

      <SettingsGrid>
        <SettingsNav aria-label="Indstillingsområder">
          {sections.map(section => {
            const IconComponent = section.icon;
            return (
              <NavItem
                key={section.id}
                active={activeSection === section.id}
                type="button"
                aria-pressed={activeSection === section.id}
                onClick={() => setActiveSection(section.id)}
              >
                <IconComponent />
                {section.label}
              </NavItem>
            );
          })}
        </SettingsNav>

        <SettingsContent aria-labelledby="settings-section-title">
          {renderContent()}

          <ButtonGroup>
            <Button
              className="secondary"
              onClick={exportPreferences}
            >
              <FaDownload />
              Eksporter
            </Button>

            <Button
              className="secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <FaUpload />
              Importer
            </Button>

            <Button
              className="danger"
              onClick={handleReset}
            >
              <FaRedo />
              Nulstil
            </Button>
          </ButtonGroup>

          {saveStatus && (
            <SaveStatus
              role="status"
              className={saveStatus.type}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              {saveStatus.type === 'success' ? <FaCheck /> : <FaTimes />}
              {saveStatus.message}
            </SaveStatus>
          )}

          <FileInput
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
          />
        </SettingsContent>
      </SettingsGrid>
    </SettingsContainer>
  );
};

export default SettingsPage;
