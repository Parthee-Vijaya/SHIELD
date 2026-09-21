# ChatInterface Component

En fuldt branded chat interface komponent til Kalundborg Kommune med indbygget Kalundborg teglrød (#C94416) branding.

## Features

✅ **Kalundborg Branding**
- Teglrød (#C94416) accent farve gennem hele komponenten
- Gradient logo ikon i header
- Teglrød border på AI beskeder
- Teglrød send-knap med hover effekter
- Teglrød focus states på input felter
- "Powered by Kalundborg Kommune" footer

✅ **Moderne UI/UX**
- Glassmorphism effekter med teglrød undertoner
- Smooth animationer og transitions
- Responsive design (mobil-venlig)
- Typing indicator med animerede dots
- Auto-scroll til seneste besked
- Timestamp på beskeder

✅ **Interaktive Elementer**
- Besked input med teglrød focus
- Send knap (teglrød gradient)
- Voice input knap (valgfri)
- Avatar ikoner for bruger og AI
- Empty state med velkomstbesked

✅ **Tilgængelighed**
- ARIA labels på alle interactive elementer
- Keyboard navigation support
- Screen reader venlig
- Focus indicators

## Installation

Komponenten bruger følgende dependencies (allerede i projektet):
```bash
npm install react styled-components react-icons
```

## Basic Usage

```jsx
import React, { useState } from 'react';
import ChatInterface from './components/ChatInterface';

function MyComponent() {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  const handleSendMessage = (messageText) => {
    // Add user message
    setMessages(prev => [...prev, {
      text: messageText,
      isUser: true,
      timestamp: new Date()
    }]);

    // Call your AI API here
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      setMessages(prev => [...prev, {
        text: 'AI response here',
        isUser: false,
        timestamp: new Date()
      }]);
      setIsTyping(false);
    }, 2000);
  };

  return (
    <ChatInterface
      messages={messages}
      isTyping={isTyping}
      onSendMessage={handleSendMessage}
    />
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `height` | string | `'600px'` | Højde på chat container |
| `maxWidth` | string | `'100%'` | Maximum bredde på chat container |
| `onSendMessage` | function | - | Callback når bruger sender besked |
| `messages` | array | `[]` | Array af besked objekter |
| `isTyping` | boolean | `false` | Vis typing indicator |
| `showVoiceButton` | boolean | `true` | Vis voice input knap |
| `placeholder` | string | `"Skriv din besked..."` | Input placeholder tekst |
| `headerTitle` | string | `"AI Assistent"` | Header titel |
| `headerSubtitle` | string | `"Kalundborg Kommune"` | Header undertitel |
| `showPoweredBy` | boolean | `true` | Vis "Powered by" footer |

## Message Object Structure

```javascript
{
  text: string,        // Besked indhold (påkrævet)
  isUser: boolean,     // true = bruger, false = AI (påkrævet)
  timestamp: Date      // Timestamp (valgfri)
}
```

## Advanced Example

```jsx
import React, { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';
import { callAIAPI } from './services/api';

function AdvancedChatExample() {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  // Initial welcome message
  useEffect(() => {
    setMessages([{
      text: 'Velkommen! Jeg er din AI-assistent. Hvordan kan jeg hjælpe dig?',
      isUser: false,
      timestamp: new Date()
    }]);
  }, []);

  const handleSendMessage = async (messageText) => {
    // Add user message immediately
    const userMessage = {
      text: messageText,
      isUser: true,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    // Show typing indicator
    setIsTyping(true);

    try {
      // Call your AI API
      const response = await callAIAPI(messageText);

      // Add AI response
      setMessages(prev => [...prev, {
        text: response.data.message,
        isUser: false,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error('AI API Error:', error);
      setMessages(prev => [...prev, {
        text: 'Beklager, der opstod en fejl. Prøv venligst igen.',
        isUser: false,
        timestamp: new Date()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <ChatInterface
      height="700px"
      maxWidth="900px"
      messages={messages}
      isTyping={isTyping}
      onSendMessage={handleSendMessage}
      headerTitle="AI Compliance Assistent"
      headerSubtitle="Kalundborg Kommune · Project Judge Dredd"
      showVoiceButton={true}
      placeholder="Stil et spørgsmål om AI compliance..."
    />
  );
}
```

## Styling Customization

Komponenten bruger theme fra `styled-components` ThemeProvider. Den respekterer automatisk light/dark mode:

```jsx
// Light mode: Lysere baggrund med teglrød accents
// Dark mode: Mørkere baggrund med lysere teglrød accents
```

### Custom Styling

Hvis du har brug for at override styling:

```jsx
import styled from 'styled-components';
import ChatInterface from './components/ChatInterface';

const CustomChatInterface = styled(ChatInterface)`
  /* Tilføj custom styling her */
`;
```

## Kalundborg Branding Details

### Primære Farver
- **Teglrød (Primary)**: `#C94416`
- **Mørk Teglrød (Hover)**: `#A03612`
- **Lys Teglrød**: `#E85A28`

### Anvendelse i Komponenten
1. **AI Message Border**: 3px solid teglrød venstre border
2. **Send Button**: Gradient fra #C94416 til #E85A28
3. **Send Button Hover**: Gradient fra #A03612 til #C94416
4. **Input Focus**: Teglrød border med glow effekt
5. **Typing Dots**: Teglrød animerede dots
6. **Header Icon**: Teglrød gradient baggrund
7. **Scrollbar Hover**: Teglrød
8. **Voice Button Hover**: Teglrød border og text

## Responsive Design

Komponenten er fuldt responsiv:

- **Desktop**: Fuld bredde op til `maxWidth`
- **Tablet**: Auto-adjust med 75% max message width
- **Mobile**: 85% max message width, kompakt padding

## Accessibility (WCAG 2.1 AA)

- ✅ Keyboard navigation support
- ✅ ARIA labels på alle interactive elementer
- ✅ Focus indicators med teglrød
- ✅ Sufficient color contrast ratios
- ✅ Screen reader friendly structure

## Browser Support

- ✅ Chrome (sidste 2 versioner)
- ✅ Firefox (sidste 2 versioner)
- ✅ Safari (sidste 2 versioner)
- ✅ Edge (sidste 2 versioner)

## Performance

- Optimized rendering med React.memo muligheder
- Smooth scroll til bottom
- Efficient animation med CSS keyframes
- Minimal re-renders

## Future Enhancements

Potentielle udvidelser:
- [ ] File upload support
- [ ] Rich text formatting (markdown)
- [ ] Message reactions
- [ ] Voice input funktionalitet
- [ ] Chat history export
- [ ] Multi-language support
- [ ] Customizable avatar images
- [ ] Message search
- [ ] Auto-save draft messages

## Support

For spørgsmål eller problemer, kontakt development team eller åben et issue.

## License

Intern brug - Kalundborg Kommune
