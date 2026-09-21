import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { FaNewspaper, FaExternalLinkAlt, FaClock } from 'react-icons/fa';
import axios from 'axios';

const NewsCardContainer = styled(motion.div)`
  background: ${props => props.theme.mode === 'dark'
    ? 'rgba(15, 23, 42, 0.6)'
    : 'rgba(255, 255, 255, 0.8)'};
  backdrop-filter: blur(10px);
  border-radius: ${props => props.theme.borderRadiusLarge};
  border: 1px solid ${props => props.theme.mode === 'dark'
    ? 'rgba(148, 163, 184, 0.2)'
    : 'rgba(148, 163, 184, 0.25)'};
  padding: 1.25rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: ${props => props.theme.colors.gradients.primary};
  }
`;

const NewsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  gap: 0.5rem;

  h3 {
    font-size: 0.9rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${props => props.theme.mode === 'dark'
      ? props.theme.colors.white
      : props.theme.colors.gray[800]};
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;

    svg {
      color: ${props => props.theme.colors.primary};
    }
  }
`;

const RotationIndicator = styled.div`
  font-size: 0.75rem;
  color: ${props => props.theme.colors.textMuted};
  display: flex;
  align-items: center;
  gap: 0.35rem;
`;

const NewsContent = styled(motion.div)`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const NewsTitle = styled.h4`
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1.3;
  margin: 0 0 0.75rem 0;
  color: ${props => props.theme.mode === 'dark'
    ? props.theme.colors.white
    : props.theme.colors.gray[900]};

  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const NewsSummary = styled.p`
  font-size: 0.875rem;
  line-height: 1.5;
  color: ${props => props.theme.mode === 'dark'
    ? 'rgba(226, 232, 240, 0.8)'
    : 'rgba(51, 65, 85, 0.85)'};
  margin: 0 0 1rem 0;

  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const NewsFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: auto;
  padding-top: 0.75rem;
  border-top: 1px solid ${props => props.theme.mode === 'dark'
    ? 'rgba(148, 163, 184, 0.15)'
    : 'rgba(148, 163, 184, 0.2)'};
`;

const TagsContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const Tag = styled.span`
  font-size: 0.7rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  font-weight: 500;
  background: ${props => props.$type === 'source'
    ? props.theme.mode === 'dark'
      ? 'rgba(59, 130, 246, 0.2)'
      : 'rgba(59, 130, 246, 0.15)'
    : props.theme.mode === 'dark'
      ? 'rgba(168, 85, 247, 0.2)'
      : 'rgba(168, 85, 247, 0.15)'};
  color: ${props => props.$type === 'source'
    ? props.theme.mode === 'dark'
      ? '#60a5fa'
      : '#2563eb'
    : props.theme.mode === 'dark'
      ? '#c084fc'
      : '#9333ea'};
  border: 1px solid ${props => props.$type === 'source'
    ? props.theme.mode === 'dark'
      ? 'rgba(59, 130, 246, 0.3)'
      : 'rgba(59, 130, 246, 0.25)'
    : props.theme.mode === 'dark'
      ? 'rgba(168, 85, 247, 0.3)'
      : 'rgba(168, 85, 247, 0.25)'};
  text-transform: uppercase;
  letter-spacing: 0.03em;
`;

const ReadMoreLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: ${props => props.theme.colors.primary};
  text-decoration: none;
  transition: ${props => props.theme.animations.transitionFast};

  &:hover {
    color: ${props => props.theme.colors.primaryDark};
    gap: 0.5rem;
  }

  svg {
    font-size: 0.7rem;
  }
`;

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: ${props => props.theme.colors.textMuted};
  font-size: 0.9rem;
`;

const LiveNewsCard = () => {
  const [news, setNews] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await axios.get('/api/news/latest?limit=10');
        if (response.data?.items && response.data.items.length > 0) {
          setNews(response.data.items);
          setLoading(false);
        }
      } catch (error) {
        console.error('Failed to fetch news:', error);
        setLoading(false);
      }
    };

    fetchNews();
    // Refresh news every 5 minutes
    const refreshInterval = setInterval(fetchNews, 5 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, []);

  useEffect(() => {
    if (news.length === 0) return;

    // Rotate news every minute
    const rotationInterval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % news.length);
    }, 60 * 1000);

    return () => clearInterval(rotationInterval);
  }, [news.length]);

  if (loading) {
    return (
      <NewsCardContainer
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <LoadingState>Henter seneste nyheder...</LoadingState>
      </NewsCardContainer>
    );
  }

  if (news.length === 0) {
    return (
      <NewsCardContainer
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <LoadingState>Ingen nyheder tilgængelige</LoadingState>
      </NewsCardContainer>
    );
  }

  const currentNews = news[currentIndex];
  const categoryMap = {
    'gdpr': 'GDPR',
    'ai_policy': 'AI Politik',
    'ai_act': 'AI Act',
    'datatilsynet': 'Datatilsynet',
    'eu_news': 'EU Nyheder',
    'danish_tech': 'Dansk Tech',
    'ai_industry': 'AI Industri',
    'tech_policy': 'Tech Politik',
    'digital_policy': 'Digital Politik'
  };

  return (
    <NewsCardContainer
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <NewsHeader>
        <h3>
          <FaNewspaper />
          Seneste Nyheder
        </h3>
        <RotationIndicator>
          <FaClock />
          {currentIndex + 1}/{news.length}
        </RotationIndicator>
      </NewsHeader>

      <AnimatePresence mode="wait">
        <NewsContent
          key={currentIndex}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5 }}
        >
          <NewsTitle>{currentNews.title}</NewsTitle>
          <NewsSummary>
            {currentNews.summary || 'Klik for at læse hele artiklen...'}
          </NewsSummary>

          <NewsFooter>
            <TagsContainer>
              <Tag $type="source">{currentNews.source}</Tag>
              {currentNews.category && (
                <Tag $type="category">
                  {categoryMap[currentNews.category] || currentNews.category}
                </Tag>
              )}
            </TagsContainer>

            <ReadMoreLink
              href={currentNews.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Læs mere
              <FaExternalLinkAlt />
            </ReadMoreLink>
          </NewsFooter>
        </NewsContent>
      </AnimatePresence>
    </NewsCardContainer>
  );
};

export default LiveNewsCard;
