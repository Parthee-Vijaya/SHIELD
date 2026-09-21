import React, { useState, useRef, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { FaPaperPlane, FaMicrophone, FaRobot, FaUser } from 'react-icons/fa';

// Typing animation for AI responses
const typingDots = keyframes`
  0%, 20% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-4px);
  }
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
`;

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: ${props => props.height || '600px'};
  max-width: ${props => props.maxWidth || '100%'};
  background: ${props => props.theme.glass.background};
  backdrop-filter: ${props => props.theme.glass.backdropFilter};
  border: ${props => props.theme.glass.border};
  border-radius: ${props => props.theme.glass.borderRadius};
  box-shadow: ${props => props.theme.shadows.lg};
  overflow: hidden;
  transition: ${props => props.theme.animations.transition};
`;

const ChatHeader = styled.div`
  padding: 1.25rem 1.5rem;
  background: linear-gradient(135deg, rgba(201, 68, 22, 0.08) 0%, rgba(201, 68, 22, 0.02) 100%);
  border-bottom: 1px solid ${props => props.theme.colors.border};
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: ${props => props.theme.colors.text};
`;

const HeaderIcon = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #C94416 0%, #E85A28 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 2px 8px rgba(201, 68, 22, 0.25);
`;

const HeaderText = styled.div`
  flex: 1;

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: ${props => props.theme.colors.text};
  }

  p {
    margin: 0;
    font-size: 0.8rem;
    color: ${props => props.theme.colors.textMuted};
  }
`;

const MessagesContainer = styled.div`
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: ${props => props.theme.mode === 'dark'
    ? 'rgba(17, 24, 39, 0.3)'
    : 'rgba(247, 250, 252, 0.5)'};

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: ${props => props.theme.colors.gray[400]};
    border-radius: 999px;

    &:hover {
      background-color: #C94416;
    }
  }

  &::-webkit-scrollbar-track {
    background-color: transparent;
  }
`;

const MessageBubble = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  animation: ${fadeIn} 0.3s ease-out;
  align-self: ${props => props.isUser ? 'flex-end' : 'flex-start'};
  max-width: 75%;

  @media (max-width: 768px) {
    max-width: 85%;
  }
`;

const Avatar = styled.div`
  width: 32px;
  height: 32px;
  min-width: 32px;
  border-radius: 50%;
  background: ${props => props.isUser
    ? props.theme.colors.gray[300]
    : 'linear-gradient(135deg, #C94416 0%, #E85A28 100%)'};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.isUser ? props.theme.colors.text : 'white'};
  font-size: 0.85rem;
  box-shadow: ${props => props.theme.shadows.sm};
  order: ${props => props.isUser ? 1 : 0};
`;

const MessageContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const MessageBubbleContent = styled.div`
  padding: 0.85rem 1.1rem;
  border-radius: ${props => props.isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};
  background: ${props => props.isUser
    ? props.theme.colors.surfaceAlt
    : props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-left: ${props => props.isUser
    ? `1px solid ${props.theme.colors.border}`
    : '3px solid #C94416'};
  color: ${props => props.theme.colors.text};
  line-height: 1.5;
  font-size: 0.92rem;
  box-shadow: ${props => props.theme.shadows.sm};
  word-wrap: break-word;
  overflow-wrap: break-word;

  p {
    margin: 0 0 0.5rem 0;

    &:last-child {
      margin-bottom: 0;
    }
  }

  code {
    background: ${props => props.theme.mode === 'dark'
      ? 'rgba(201, 68, 22, 0.15)'
      : 'rgba(201, 68, 22, 0.08)'};
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-size: 0.85em;
    font-family: 'Monaco', 'Menlo', monospace;
    color: #C94416;
  }
`;

const MessageTimestamp = styled.span`
  font-size: 0.7rem;
  color: ${props => props.theme.colors.textMuted};
  padding: 0 0.25rem;
  align-self: ${props => props.isUser ? 'flex-end' : 'flex-start'};
`;

const TypingIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.85rem 1.1rem;
  border-radius: 16px 16px 16px 4px;
  background: ${props => props.theme.colors.surface};
  border: 1px solid ${props => props.theme.colors.border};
  border-left: 3px solid #C94416;
  width: fit-content;
  animation: ${fadeIn} 0.3s ease-out;
`;

const TypingDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #C94416;
  animation: ${typingDots} 1.4s infinite;
  animation-delay: ${props => props.delay || '0s'};
`;

const InputContainer = styled.form`
  padding: 1.25rem 1.5rem;
  background: ${props => props.theme.colors.surface};
  border-top: 1px solid ${props => props.theme.colors.border};
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const InputField = styled.input`
  flex: 1;
  padding: 0.85rem 1.1rem;
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 12px;
  background: ${props => props.theme.colors.inputBackground};
  color: ${props => props.theme.colors.text};
  font-size: 0.92rem;
  transition: ${props => props.theme.animations.transitionFast};

  &:focus {
    outline: none;
    border-color: #C94416;
    box-shadow: 0 0 0 3px rgba(201, 68, 22, 0.12);
  }

  &::placeholder {
    color: ${props => props.theme.colors.textMuted};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const SendButton = styled.button`
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: linear-gradient(135deg, #C94416 0%, #E85A28 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: ${props => props.theme.animations.transitionFast};
  box-shadow: 0 2px 8px rgba(201, 68, 22, 0.25);

  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #A03612 0%, #C94416 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(201, 68, 22, 0.35);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  &:focus-visible {
    outline: 2px solid #C94416;
    outline-offset: 2px;
    box-shadow: 0 0 0 3px rgba(201, 68, 22, 0.18);
  }
`;

const VoiceButton = styled.button`
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: ${props => props.theme.colors.surfaceAlt};
  border: 1px solid ${props => props.theme.colors.border};
  color: ${props => props.theme.colors.text};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: ${props => props.theme.animations.transitionFast};

  &:hover:not(:disabled) {
    background: rgba(201, 68, 22, 0.08);
    border-color: #C94416;
    color: #C94416;
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid #C94416;
    outline-offset: 2px;
    box-shadow: 0 0 0 3px rgba(201, 68, 22, 0.18);
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${props => props.theme.colors.textMuted};
  text-align: center;
  padding: 2rem;

  svg {
    font-size: 3rem;
    margin-bottom: 1rem;
    color: #C94416;
    opacity: 0.5;
  }

  h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    color: ${props => props.theme.colors.text};
  }

  p {
    margin: 0;
    font-size: 0.9rem;
    max-width: 300px;
  }
`;

const PoweredBy = styled.div`
  font-size: 0.7rem;
  color: ${props => props.theme.colors.textMuted};
  text-align: center;
  padding: 0.5rem 0;
  border-top: 1px solid ${props => props.theme.colors.border};

  span {
    color: #C94416;
    font-weight: 600;
  }
`;

const ChatInterface = ({
  height = '600px',
  maxWidth = '100%',
  onSendMessage,
  messages = [],
  isTyping = false,
  showVoiceButton = true,
  placeholder = "Skriv din besked...",
  headerTitle = "AI Assistent",
  headerSubtitle = "Kalundborg Kommune",
  showPoweredBy = true
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim() && onSendMessage) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleVoiceInput = () => {
    setIsListening(!isListening);
    // Voice input logic would go here
    console.log('Voice input:', isListening ? 'stopped' : 'started');
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <ChatContainer height={height} maxWidth={maxWidth}>
      <ChatHeader>
        <HeaderIcon>
          <FaRobot size={18} />
        </HeaderIcon>
        <HeaderText>
          <h3>{headerTitle}</h3>
          <p>{headerSubtitle}</p>
        </HeaderText>
      </ChatHeader>

      <MessagesContainer>
        {messages.length === 0 ? (
          <EmptyState>
            <FaRobot />
            <h4>Velkommen til AI Assistenten</h4>
            <p>Stil et spørgsmål eller start en samtale for at komme i gang</p>
          </EmptyState>
        ) : (
          <>
            {messages.map((message, index) => (
              <MessageBubble key={index} isUser={message.isUser}>
                <Avatar isUser={message.isUser}>
                  {message.isUser ? <FaUser size={14} /> : <FaRobot size={14} />}
                </Avatar>
                <MessageContent>
                  <MessageBubbleContent isUser={message.isUser}>
                    {message.text}
                  </MessageBubbleContent>
                  {message.timestamp && (
                    <MessageTimestamp isUser={message.isUser}>
                      {formatTime(message.timestamp)}
                    </MessageTimestamp>
                  )}
                </MessageContent>
              </MessageBubble>
            ))}
            {isTyping && (
              <MessageBubble isUser={false}>
                <Avatar isUser={false}>
                  <FaRobot size={14} />
                </Avatar>
                <MessageContent>
                  <TypingIndicator>
                    <TypingDot delay="0s" />
                    <TypingDot delay="0.2s" />
                    <TypingDot delay="0.4s" />
                  </TypingIndicator>
                </MessageContent>
              </MessageBubble>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </MessagesContainer>

      <InputContainer onSubmit={handleSubmit}>
        {showVoiceButton && (
          <VoiceButton
            type="button"
            onClick={handleVoiceInput}
            aria-label="Stemme input"
            disabled={isTyping}
          >
            <FaMicrophone size={16} />
          </VoiceButton>
        )}
        <InputField
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          disabled={isTyping}
          aria-label="Besked input"
        />
        <SendButton
          type="submit"
          disabled={!inputValue.trim() || isTyping}
          aria-label="Send besked"
        >
          <FaPaperPlane size={16} />
        </SendButton>
      </InputContainer>

      {showPoweredBy && (
        <PoweredBy>
          Drevet af <span>Kalundborg Kommune</span>
        </PoweredBy>
      )}
    </ChatContainer>
  );
};

export default ChatInterface;
