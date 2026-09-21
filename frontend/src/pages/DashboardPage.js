import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
  FaChartBar,
  FaExclamationTriangle,
  FaCheckCircle,
  FaTimesCircle,
  FaArrowUp,
  FaDownload,
  FaFilter,
  FaCalendarAlt
} from 'react-icons/fa';
import { StatCardSkeletonLoader, ChartSkeletonLoader } from '../components/SkeletonLoader';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement
);

const DashboardContainer = styled.div`
  max-width: 1400px;
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

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const StatCard = styled(motion.div)`
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  padding: 1.5rem;
  border-radius: ${props => props.theme.borderRadiusLarge};
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: ${props => props.theme.shadows.glass};
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: ${props => props.theme.colors.gradients.card};
    opacity: 0;
    transition: ${props => props.theme.animations.transition};
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow: ${props => props.theme.shadows.xl};

    &::before {
      opacity: 1;
    }
  }

  > * {
    position: relative;
    z-index: 1;
  }

  .stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;

    .icon {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      color: white;
      background: ${props => props.theme.colors.gradients.primary};
    }

    .trend {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.875rem;
      font-weight: 600;

      &.positive {
        color: ${props => props.theme.colors.success};
      }

      &.negative {
        color: ${props => props.theme.colors.danger};
      }
    }
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: ${props => props.theme.colors.gray[800]};
    margin-bottom: 0.25rem;
  }

  .stat-label {
    color: ${props => props.theme.colors.gray[600]};
    font-size: 0.875rem;
    font-weight: 500;
  }
`;

const ChartsGrid = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 2rem;
  margin-bottom: 2rem;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const ChartCard = styled(motion.div)`
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  padding: 1.5rem;
  border-radius: ${props => props.theme.borderRadiusLarge};
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: ${props => props.theme.shadows.glass};

  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;

    h3 {
      color: ${props => props.theme.colors.gray[800]};
      font-size: 1.1rem;
      font-weight: 600;
    }

    .chart-actions {
      display: flex;
      gap: 0.5rem;
    }
  }

  .chart-container {
    height: 300px;
    position: relative;
  }
`;

const ActionButton = styled.button`
  background: ${props => props.theme.colors.gray[100]};
  border: none;
  border-radius: ${props => props.theme.borderRadius};
  padding: 0.5rem;
  color: ${props => props.theme.colors.gray[600]};
  cursor: pointer;
  transition: ${props => props.theme.animations.transition};

  &:hover {
    background: ${props => props.theme.colors.gray[200]};
    color: ${props => props.theme.colors.gray[800]};
  }
`;

const FilterSection = styled.div`
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  padding: 1rem 1.5rem;
  border-radius: ${props => props.theme.borderRadius};
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: ${props => props.theme.shadows.md};
  margin-bottom: 2rem;
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;

  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    label {
      font-size: 0.875rem;
      font-weight: 500;
      color: ${props => props.theme.colors.gray[700]};
    }

    select {
      padding: 0.5rem;
      border: 1px solid ${props => props.theme.colors.gray[300]};
      border-radius: ${props => props.theme.borderRadius};
      background: white;
      font-size: 0.875rem;
    }
  }
`;

const DashboardPage = () => {
  const [timeRange, setTimeRange] = useState('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading dashboard data
    setTimeout(() => setLoading(false), 2000);
  }, []);

  // Mock data for charts
  const assessmentTrendData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun'],
    datasets: [
      {
        label: 'Vurderinger',
        data: [12, 19, 8, 15, 25, 18],
        borderColor: '#1a365d',
        backgroundColor: 'rgba(26, 54, 93, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const riskDistributionData = {
    labels: ['Lav Risiko', 'Medium Risiko', 'Høj Risiko', 'Uacceptabel'],
    datasets: [
      {
        data: [45, 30, 20, 5],
        backgroundColor: [
          '#2f855a',
          '#d69e2e',
          '#dd6b20',
          '#c53030',
        ],
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  };

  const complianceScoreData = {
    labels: ['GDPR', 'AI Act', 'Dansk Lov', 'Sektorlov'],
    datasets: [
      {
        label: 'Compliance-score',
        data: [85, 78, 92, 73],
        backgroundColor: [
          'rgba(26, 54, 93, 0.8)',
          'rgba(44, 82, 130, 0.8)',
          'rgba(49, 130, 206, 0.8)',
          'rgba(184, 134, 11, 0.8)',
        ],
        borderColor: [
          '#1a365d',
          '#2c5282',
          '#3182ce',
          '#b8860b',
        ],
        borderWidth: 2,
      },
    ],
  };

  const statsData = [
    {
      icon: FaChartBar,
      value: '47',
      label: 'Samlede vurderinger',
      trend: '+12%',
      positive: true
    },
    {
      icon: FaCheckCircle,
      value: '32',
      label: 'Godkendt (GO)',
      trend: '+8%',
      positive: true
    },
    {
      icon: FaExclamationTriangle,
      value: '12',
      label: 'Betinget godkendt',
      trend: '-3%',
      positive: false
    },
    {
      icon: FaTimesCircle,
      value: '3',
      label: 'Afvist (NO-GO)',
      trend: '+1',
      positive: false
    }
  ];

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
      x: {
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
      },
    },
  };

  if (loading) {
    return (
      <DashboardContainer>
        <PageHeader>
          <h1><FaChartBar /> Compliance-dashboard</h1>
          <p>Indlæser analysedata...</p>
        </PageHeader>

        <StatsGrid>
          {[...Array(4)].map((_, index) => (
            <StatCardSkeletonLoader key={index} />
          ))}
        </StatsGrid>

        <ChartsGrid>
          <ChartSkeletonLoader />
          <ChartSkeletonLoader />
        </ChartsGrid>

        <ChartSkeletonLoader />
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer>
      <PageHeader>
        <h1><FaChartBar /> Compliance-dashboard</h1>
        <p>Overblik over AI-compliance vurderinger, status og tendenser</p>
      </PageHeader>

      <FilterSection>
        <div className="filter-group">
          <FaFilter />
          <label>Tidsperiode:</label>
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
            <option value="7">Sidste 7 dage</option>
            <option value="30">Sidste 30 dage</option>
            <option value="90">Sidste 3 måneder</option>
            <option value="365">Sidste år</option>
          </select>
        </div>
        <div className="filter-group">
          <FaCalendarAlt />
          <label>Eksporter data:</label>
          <ActionButton>
            <FaDownload />
          </ActionButton>
        </div>
      </FilterSection>

      <StatsGrid>
        {statsData.map((stat, index) => (
          <StatCard
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <div className="stat-header">
              <div className="icon">
                <stat.icon />
              </div>
              <div className={`trend ${stat.positive ? 'positive' : 'negative'}`}>
                <FaArrowUp />
                {stat.trend}
              </div>
            </div>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </StatCard>
        ))}
      </StatsGrid>

      <ChartsGrid>
        <ChartCard
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="chart-header">
          <h3>Udvikling i vurderinger</h3>
            <div className="chart-actions">
              <ActionButton>
                <FaDownload />
              </ActionButton>
            </div>
          </div>
          <div className="chart-container">
            <Line data={assessmentTrendData} options={chartOptions} />
          </div>
        </ChartCard>

        <ChartCard
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="chart-header">
            <h3>Risiko Distribution</h3>
            <div className="chart-actions">
              <ActionButton>
                <FaDownload />
              </ActionButton>
            </div>
          </div>
          <div className="chart-container">
            <Doughnut data={riskDistributionData} options={doughnutOptions} />
          </div>
        </ChartCard>
      </ChartsGrid>

      <ChartCard
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        <div className="chart-header">
          <h3>Compliance-score fordelt på regulering</h3>
          <div className="chart-actions">
            <ActionButton>
              <FaDownload />
            </ActionButton>
          </div>
        </div>
        <div className="chart-container">
          <Bar data={complianceScoreData} options={chartOptions} />
        </div>
      </ChartCard>
    </DashboardContainer>
  );
};

export default DashboardPage;
