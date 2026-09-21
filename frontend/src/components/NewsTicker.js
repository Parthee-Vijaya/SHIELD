import React, { useEffect, useMemo, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { FaGlobeEurope } from 'react-icons/fa';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // fallback interval hvis stream ikke virker

const scroll = keyframes`
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
`;

const TickerWrapper = styled.div`
  position: relative;
  background: #ffffff;
  color: #252525;
  display: flex;
  align-items: center;
  overflow: hidden;
  padding: 1rem 1.25rem;
  border-radius: 18px;
  margin-bottom: 1.8rem;
  box-shadow: ${props => props.theme.shadows.xl};
  border: 1px solid ${props => props.theme.colors.border};
`;

const TickerLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-weight: 700;
  font-size: 0.9rem;
  margin-right: 1.5rem;
  padding: 0.35rem 0.9rem;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  background: rgba(160, 54, 18, 0.1);
  color: #A03612;
  border: 1px solid rgba(160, 54, 18, 0.2);
`;

const TickerTrack = styled.div`
  flex: 1;
  overflow: hidden;
`;

const TickerContent = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 2.5rem;
  white-space: nowrap;
  animation: ${scroll} ${props => props.duration}s linear infinite;
`;

const TickerItem = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  color: inherit;
  text-decoration: none;
  font-size: 0.92rem;
  opacity: 0.9;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 1;
  }
`;

const SourceTag = styled.span`
  font-weight: 600;
  font-size: 0.72rem;
  text-transform: uppercase;
  background: rgba(160, 54, 18, 0.12);
  color: #A03612;
  padding: 0.25rem 0.65rem;
  border-radius: 12px;
  letter-spacing: 0.08em;
  border: 1px solid rgba(160, 54, 18, 0.25);
`;

const HeadlineText = styled.span`
  font-size: 0.95rem;
  color: inherit;
  font-weight: 500;
  max-width: 480px;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const NewsTicker = () => {
  const [items, setItems] = useState([]);

  const fetchWithTimeout = async (url, { timeout = 4000 } = {}) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Fejl ved fetch (${response.status})`);
      }
      return response;
    } finally {
      window.clearTimeout(timer);
    }
  };

  const fetchStaticTicker = async () => {
    try {
      const response = await fetchWithTimeout('/fallback/ticker.json', { timeout: 1500 });
      const data = await response.json();
      if (Array.isArray(data.items)) {
        setItems(data.items);
      }
    } catch (error) {
      console.error('Statisk ticker fallback mislykkedes', error);
    }
  };

  useEffect(() => {
    let source;
    let reconnectTimeout;
    let fallbackInterval;

    const streamUrl = API_BASE_URL
      ? `${API_BASE_URL.replace(/\/$/, '')}/api/news/ticker/stream`
      : '/api/news/ticker/stream';

    const fallbackUrl = API_BASE_URL
      ? `${API_BASE_URL.replace(/\/$/, '')}/api/news/ticker`
      : '/api/news/ticker';

    const fetchFallback = async () => {
      try {
        const res = await fetchWithTimeout(fallbackUrl);
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length) {
          setItems(data.items);
          return;
        }
        throw new Error('Ingen data fra API fallback');
      } catch (err) {
        console.warn('Fallback ticker fetch fejlede', err);
        try {
          await fetchStaticTicker();
        } catch (staticErr) {
          console.error('Statisk ticker fallback utilgængelig', staticErr);
        }
      }
    };

    const startPolling = () => {
      fetchFallback();
      if (typeof window !== 'undefined') {
        fallbackInterval = window.setInterval(fetchFallback, POLL_INTERVAL_MS);
      }
    };

    const cleanup = () => {
      if (source) {
        source.close();
      }
      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
      }
      if (fallbackInterval) {
        window.clearInterval(fallbackInterval);
      }
    };

    const supportsEventSource = typeof window !== 'undefined' && 'EventSource' in window;

    if (!supportsEventSource) {
      console.warn('EventSource er ikke supporteret – anvender polling fallback');
      fetchStaticTicker();
      startPolling();
      return cleanup;
    }

    const connect = () => {
      if (source) {
        source.close();
      }

      source = new window.EventSource(streamUrl);

      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (Array.isArray(payload)) {
            setItems(payload);
          }
        } catch (err) {
          console.warn('Kunne ikke parse ticker data', err);
        }
      };

      source.onerror = (error) => {
        console.warn('Ticker stream fejlede – forsøger genforbindelse om 5 sek.', error);
        source.close();
        reconnectTimeout = window.setTimeout(connect, 5000);
      };
    };

    if (!items.length) {
      fetchStaticTicker();
    }

    connect();
    startPolling();

    return cleanup;
    // Intentionally empty - only run on mount. fetchStaticTicker is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tickerItems = useMemo(() => {
    if (!items.length) {
      return [
        {
          title: 'Live AI-nyheder indlæses…',
          url: '#',
          source: 'System',
        },
      ];
    }
    return items;
  }, [items]);

  const duration = useMemo(() => {
    const charCount = tickerItems.reduce((acc, item) => {
      const titleLength = item?.title ? item.title.length : 0;
      const sourceLength = item?.source ? item.source.length : 0;
      return acc + titleLength + sourceLength;
    }, 0);

    const baseSeconds = 55;
    const computed = baseSeconds + charCount * 0.05;
    return Math.max(55, Math.min(computed, 140));
  }, [tickerItems]);

  const displayItems = useMemo(() => {
    if (tickerItems.length <= 1) {
      return [...tickerItems, ...tickerItems];
    }
    return [...tickerItems, ...tickerItems];
  }, [tickerItems]);

  return (
    <TickerWrapper>
      <TickerLabel>
        <FaGlobeEurope />
        <span>Seneste AI- og juranyheder</span>
      </TickerLabel>
      <TickerTrack>
        <TickerContent duration={duration}>
          {displayItems.map((item, index) => (
            <TickerItem key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noopener noreferrer">
              <SourceTag>{item.source}</SourceTag>
              <HeadlineText>{item.title}</HeadlineText>
            </TickerItem>
          ))}
        </TickerContent>
      </TickerTrack>
    </TickerWrapper>
  );
};

export default NewsTicker;
