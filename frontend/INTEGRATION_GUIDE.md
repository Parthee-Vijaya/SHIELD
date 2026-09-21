# ChatInterface Integration Guide

Quick guide to integrate the ChatInterface component into your existing pages.

---

## Option 1: Add to HomePage (Recommended)

### 1. Import the Component
```javascript
// In /frontend/src/pages/HomePage.js
import ChatInterface from '../components/ChatInterface';
```

### 2. Add State Management
```javascript
const [chatMessages, setChatMessages] = useState([
  {
    text: 'Velkommen til AI Compliance Assistenten. Hvordan kan jeg hjælpe dig?',
    isUser: false,
    timestamp: new Date()
  }
]);
const [isChatTyping, setIsChatTyping] = useState(false);
```

### 3. Create Message Handler
```javascript
const handleChatMessage = async (messageText) => {
  // Add user message
  const userMessage = {
    text: messageText,
    isUser: true,
    timestamp: new Date()
  };
  setChatMessages(prev => [...prev, userMessage]);

  // Show typing indicator
  setIsChatTyping(true);

  try {
    // TODO: Replace with your actual AI API call
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: messageText })
    });
    const data = await response.json();

    // Add AI response
    setChatMessages(prev => [...prev, {
      text: data.response,
      isUser: false,
      timestamp: new Date()
    }]);
  } catch (error) {
    console.error('Chat error:', error);
    setChatMessages(prev => [...prev, {
      text: 'Beklager, der opstod en fejl. Prøv venligst igen.',
      isUser: false,
      timestamp: new Date()
    }]);
  } finally {
    setIsChatTyping(false);
  }
};
```

### 4. Add Component to JSX
```jsx
{/* Add ChatInterface to your page layout */}
<ChatInterface
  height="600px"
  maxWidth="800px"
  messages={chatMessages}
  isTyping={isChatTyping}
  onSendMessage={handleChatMessage}
  headerTitle="AI Compliance Assistent"
  headerSubtitle="Kalundborg Kommune"
  showVoiceButton={true}
  placeholder="Stil et spørgsmål om AI compliance..."
  showPoweredBy={true}
/>
```

---

## Option 2: Add to QuickCheckPage

### 1. Import and Setup
```javascript
// In /frontend/src/pages/QuickCheckPage.js
import ChatInterface from '../components/ChatInterface';
import { useState } from 'react';
```

### 2. Add State
```javascript
const [quickCheckChat, setQuickCheckChat] = useState([]);
const [isTyping, setIsTyping] = useState(false);
```

### 3. Create Handler
```javascript
const handleQuickCheckChat = async (message) => {
  setQuickCheckChat(prev => [...prev, {
    text: message,
    isUser: true,
    timestamp: new Date()
  }]);

  setIsTyping(true);

  // Call your quick check API
  try {
    const result = await performQuickCheck(message);
    setQuickCheckChat(prev => [...prev, {
      text: result,
      isUser: false,
      timestamp: new Date()
    }]);
  } catch (error) {
    // Error handling
  } finally {
    setIsTyping(false);
  }
};
```

### 4. Add to Layout
```jsx
<ChatInterface
  height="500px"
  messages={quickCheckChat}
  isTyping={isTyping}
  onSendMessage={handleQuickCheckChat}
  headerTitle="Quick Check"
  headerSubtitle="Hurtig AI-vurdering"
  placeholder="Beskriv din AI-anvendelse..."
/>
```

---

## Option 3: Create Dedicated Chat Page

### 1. Create New Page Component
```javascript
// /frontend/src/pages/ChatPage.js
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import ChatInterface from '../components/ChatInterface';

const PageContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
`;

const ChatPage = () => {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    // Load initial message
    setMessages([{
      text: 'Velkommen til AI Assistenten. Jeg kan hjælpe dig med spørgsmål om AI Act, compliance, og meget mere.',
      isUser: false,
      timestamp: new Date()
    }]);
  }, []);

  const handleSendMessage = async (messageText) => {
    setMessages(prev => [...prev, {
      text: messageText,
      isUser: true,
      timestamp: new Date()
    }]);

    setIsTyping(true);

    try {
      // Your AI API call here
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText })
      });
      const data = await response.json();

      setMessages(prev => [...prev, {
        text: data.response,
        isUser: false,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <PageContainer>
      <ChatInterface
        height="700px"
        messages={messages}
        isTyping={isTyping}
        onSendMessage={handleSendMessage}
      />
    </PageContainer>
  );
};

export default ChatPage;
```

### 2. Add Route in App.js
```javascript
// In /frontend/src/App.js
import ChatPage from './pages/ChatPage';

// In Routes section:
<Route path="/chat" element={<ChatPage />} />
```

### 3. Add to Sidebar Navigation
```javascript
// In /frontend/src/components/Sidebar.js
{
  name: 'Chat',
  path: '/chat',
  icon: FaComments, // Import from react-icons
  description: 'AI Assistent Chat'
}
```

---

## Option 4: Modal / Popup Chat

### 1. Create Modal Wrapper
```javascript
// /frontend/src/components/ChatModal.js
import React, { useState } from 'react';
import styled from 'styled-components';
import { FaTimes, FaComments } from 'react-icons/fa';
import ChatInterface from './ChatInterface';

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: ${props => props.isOpen ? 'flex' : 'none'};
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 1rem;
`;

const ModalContent = styled.div`
  width: 100%;
  max-width: 800px;
  position: relative;
`;

const CloseButton = styled.button`
  position: absolute;
  top: -40px;
  right: 0;
  background: white;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #C94416;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);

  &:hover {
    background: #C94416;
    color: white;
  }
`;

const FloatingChatButton = styled.button`
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #C94416 0%, #E85A28 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(201, 68, 22, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 16px rgba(201, 68, 22, 0.5);
  }
`;

const ChatModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  const handleSendMessage = async (messageText) => {
    setMessages(prev => [...prev, {
      text: messageText,
      isUser: true,
      timestamp: new Date()
    }]);

    setIsTyping(true);

    // Your API call here
    setTimeout(() => {
      setMessages(prev => [...prev, {
        text: 'AI response...',
        isUser: false,
        timestamp: new Date()
      }]);
      setIsTyping(false);
    }, 2000);
  };

  return (
    <>
      <FloatingChatButton onClick={() => setIsOpen(true)}>
        <FaComments size={24} />
      </FloatingChatButton>

      <ModalOverlay isOpen={isOpen} onClick={() => setIsOpen(false)}>
        <ModalContent onClick={(e) => e.stopPropagation()}>
          <CloseButton onClick={() => setIsOpen(false)}>
            <FaTimes size={16} />
          </CloseButton>
          <ChatInterface
            height="600px"
            messages={messages}
            isTyping={isTyping}
            onSendMessage={handleSendMessage}
          />
        </ModalContent>
      </ModalOverlay>
    </>
  );
};

export default ChatModal;
```

### 2. Add to App.js
```javascript
// In /frontend/src/App.js
import ChatModal from './components/ChatModal';

// Add before </AppContainer> closing tag
<ChatModal />
```

---

## Backend API Integration Example

### Create API Service
```javascript
// /frontend/src/services/aiChatService.js
export const sendChatMessage = async (message, conversationId = null) => {
  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add auth headers if needed
      },
      body: JSON.stringify({
        message,
        conversationId,
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error('Chat API error');
    }

    const data = await response.json();
    return {
      text: data.response,
      conversationId: data.conversationId
    };
  } catch (error) {
    console.error('AI Chat Error:', error);
    throw error;
  }
};
```

### Use in Component
```javascript
import { sendChatMessage } from '../services/aiChatService';

const handleSendMessage = async (messageText) => {
  setMessages(prev => [...prev, {
    text: messageText,
    isUser: true,
    timestamp: new Date()
  }]);

  setIsTyping(true);

  try {
    const result = await sendChatMessage(messageText, conversationId);

    setMessages(prev => [...prev, {
      text: result.text,
      isUser: false,
      timestamp: new Date()
    }]);

    setConversationId(result.conversationId);
  } catch (error) {
    setMessages(prev => [...prev, {
      text: 'Beklager, der opstod en fejl. Prøv venligst igen.',
      isUser: false,
      timestamp: new Date()
    }]);
  } finally {
    setIsTyping(false);
  }
};
```

---

## LocalStorage Persistence Example

### Save Messages
```javascript
import { useEffect } from 'react';

const STORAGE_KEY = 'ai_chat_messages';

const saveMessages = (messages) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
};

const loadMessages = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : [];
};

// In component
useEffect(() => {
  const loaded = loadMessages();
  if (loaded.length > 0) {
    setMessages(loaded.map(msg => ({
      ...msg,
      timestamp: new Date(msg.timestamp)
    })));
  }
}, []);

// Save on every message update
useEffect(() => {
  if (messages.length > 0) {
    saveMessages(messages);
  }
}, [messages]);
```

---

## Testing the Component

### 1. Run Development Server
```bash
cd /Users/pavi/Judge_dredd/frontend
npm start
```

### 2. Test Example Page
Create a test route:
```javascript
// In App.js
import ChatInterfaceExample from './components/ChatInterface.example';

// Add route
<Route path="/chat-example" element={<ChatInterfaceExample />} />
```

Navigate to: `http://localhost:3000/chat-example`

---

## Troubleshooting

### Issue: Component not rendering
**Solution:** Check that styled-components and react-icons are installed:
```bash
npm install styled-components react-icons
```

### Issue: Theme not applying
**Solution:** Ensure component is wrapped in ThemeProvider (already done in App.js)

### Issue: Messages not scrolling
**Solution:** Check that `messagesEndRef` is properly connected

### Issue: TypeScript errors
**Solution:** Add PropTypes or create `.d.ts` file

---

## Next Steps

1. **Choose integration option** (HomePage, QuickCheckPage, dedicated page, or modal)
2. **Add component import and state**
3. **Connect to AI backend API**
4. **Test functionality**
5. **Add persistence** (optional)
6. **Deploy and monitor**

---

## Production Checklist

- [ ] AI API endpoint configured
- [ ] Error handling implemented
- [ ] Loading states working
- [ ] Messages persisting (if needed)
- [ ] Accessibility tested
- [ ] Mobile responsive verified
- [ ] Performance optimized
- [ ] Security reviewed (XSS, injection)
- [ ] Rate limiting considered
- [ ] Analytics tracking added
- [ ] User feedback mechanism

---

## Support

For questions or issues:
1. Check ChatInterface.README.md
2. Review example implementation
3. Test with ChatInterface.example.js
4. Contact development team
