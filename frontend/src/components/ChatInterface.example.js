import React, { useState } from 'react';
import styled from 'styled-components';
import ChatInterface from './ChatInterface';

const ExampleContainer = styled.div`
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
`;

const Title = styled.h1`
  color: ${props => props.theme.colors.text};
  margin-bottom: 1.5rem;
  text-align: center;
`;

const Description = styled.p`
  color: ${props => props.theme.colors.textMuted};
  margin-bottom: 2rem;
  text-align: center;
  font-size: 0.95rem;
`;

const ChatInterfaceExample = () => {
  const [messages, setMessages] = useState([
    {
      text: 'Hej! Jeg er din AI-assistent fra Kalundborg Kommune. Hvordan kan jeg hjælpe dig i dag?',
      isUser: false,
      timestamp: new Date(Date.now() - 120000)
    },
    {
      text: 'Hej! Jeg har brug for hjælp til at forstå AI Act kravene.',
      isUser: true,
      timestamp: new Date(Date.now() - 60000)
    },
    {
      text: 'Selvfølgelig! AI Act har flere vigtige krav afhængigt af risikokategorien. Hvilken type AI-system arbejder du med?',
      isUser: false,
      timestamp: new Date(Date.now() - 30000)
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  const handleSendMessage = (messageText) => {
    // Add user message
    const newUserMessage = {
      text: messageText,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newUserMessage]);

    // Simulate AI typing
    setIsTyping(true);

    // Simulate AI response after 2 seconds
    setTimeout(() => {
      const aiResponse = {
        text: `Du skrev: "${messageText}". Dette er en simuleret AI-respons. I en rigtig implementering ville denne respons komme fra din backend API med relevant information baseret på brugerens forespørgsel.`,
        isUser: false,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiResponse]);
      setIsTyping(false);
    }, 2000);
  };

  return (
    <ExampleContainer>
      <Title>ChatInterface Komponent - Eksempel</Title>
      <Description>
        Dette er et eksempel på ChatInterface komponenten med Kalundborg branding.
        Prøv at skrive en besked for at se interaktionen.
      </Description>

      <ChatInterface
        height="600px"
        maxWidth="800px"
        messages={messages}
        isTyping={isTyping}
        onSendMessage={handleSendMessage}
        showVoiceButton={true}
        placeholder="Skriv din besked her..."
        headerTitle="AI Compliance Assistent"
        headerSubtitle="Kalundborg Kommune"
        showPoweredBy={true}
      />
    </ExampleContainer>
  );
};

export default ChatInterfaceExample;
