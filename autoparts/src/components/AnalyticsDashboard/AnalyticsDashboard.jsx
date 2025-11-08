import React, { useState, useEffect } from 'react';
import './AnalyticsDashboard.css';

const AnalyticsDashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:3001/analytics/report');
        const data = await response.json();
        
        if (data.success) {
          setAnalytics(data);
        } else {
          setError('Failed to load analytics');
        }
      } catch (err) {
        console.error('Analytics fetch error:', err);
        setError('Could not connect to analytics service');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="analytics-dashboard">
        <div className="loading-container">
          <h2>Loading Analytics...</h2>
          <div className="spinner">⏳</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-dashboard">
        <div className="error-container">
          <h2>❌ Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="analytics-dashboard">
        <h2>No analytics data available</h2>
      </div>
    );
  }

  const { summary, agentStats, ticketStats, aiRecommendationStats, openTickets } = analytics;

  // Helper function to get severity level from ai_confidence
  const getSeverityLevel = (confidence) => {
    if (confidence == null) return 'unknown';
    if (confidence >= 80) return 'high';
    if (confidence >= 50) return 'medium';
    return 'low';
  };

  // Helper function to get severity label
  const getSeverityLabel = (confidence) => {
    const level = getSeverityLevel(confidence);
    if (level === 'high') return 'High';
    if (level === 'medium') return 'Medium';
    if (level === 'low') return 'Low';
    return 'Unknown';
  };

  return (
    <div className="analytics-dashboard">
      <div className="container">
        <h1>📊 Analytics Dashboard</h1>
        
        {/* Summary Cards */}
        <div className="summary-cards">
          <div className="card">
            <h3>Total Interactions</h3>
            <p className="stat">{summary?.totalInteractions || 0}</p>
          </div>
          
          <div className="card">
            <h3>Purchase Rate</h3>
            <p className="stat">{summary?.purchaseRate || '0%'}</p>
          </div>
          
          <div className="card">
            <h3>Support Tickets</h3>
            <p className="stat">{summary?.totalTickets || 0}</p>
          </div>
          
          <div className="card">
            <h3>Open Tickets</h3>
            <p className="stat">{summary?.openTickets || 0}</p>
          </div>
          
          <div className="card">
            <h3>Avg Resolution Time</h3>
            <p className="stat">{summary?.avgResolutionTime || 'N/A'}</p>
          </div>
        </div>

        {/* AI Agent Stats */}
        {agentStats && agentStats.length > 0 && (
          <div className="section">
            <h2>🤖 AI Agent Performance</h2>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Agent Type</th>
                    <th>Total Interactions</th>
                    <th>Avg Response Time</th>
                    <th>Purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {agentStats.map((agent, index) => {
                    const avgResp = agent.avg_response_time_ms != null ? Number(agent.avg_response_time_ms) : null;
                    return (
                      <tr key={index}>
                        <td>{agent.agent_type}</td>
                        <td>{agent.total_interactions}</td>
                        <td>{Number.isFinite(avgResp) ? `${Math.round(avgResp)}ms` : 'N/A'}</td>
                        <td>{agent.purchases || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Ticket Stats */}
        {ticketStats && (
          <div className="section">
            <h2>🎫 Support Ticket Statistics</h2>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="label">Total Tickets:</span>
                <span className="value">{ticketStats.total_tickets || 0}</span>
              </div>
              <div className="stat-item">
                <span className="label">Open:</span>
                <span className="value">{ticketStats.open_tickets || 0}</span>
              </div>
              <div className="stat-item">
                <span className="label">Resolved:</span>
                <span className="value">{ticketStats.resolved_tickets || 0}</span>
              </div>
              <div className="stat-item">
                <span className="label">Avg Resolution Time:</span>
                <span className="value">
                  {ticketStats.avg_resolution_time_hours ? (
                    Number.isFinite(Number(ticketStats.avg_resolution_time_hours)) ? `${Number(ticketStats.avg_resolution_time_hours).toFixed(1)}h` : 'N/A'
                  ) : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* AI Recommendations */}
        {aiRecommendationStats && aiRecommendationStats.length > 0 && (
          <div className="section">
            <h2>🎯 AI Recommendation Stats</h2>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Recommendation</th>
                    <th>Count</th>
                    <th>Avg Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {aiRecommendationStats.map((stat, index) => {
                    const avgConfidence = stat.avg_confidence != null ? Number(stat.avg_confidence) : null;
                    return (
                      <tr key={index}>
                        <td>{stat.ai_recommendation}</td>
                        <td>{stat.count}</td>
                        <td>{Number.isFinite(avgConfidence) ? `${avgConfidence.toFixed(1)}%` : 'N/A'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Open Tickets by Severity */}
        {openTickets && openTickets.length > 0 && (
          <div className="section">
            <h2>🚨 Open Tickets </h2>
            <div className="table-container">
              <table className="tickets-table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Ticket #</th>
                    <th>Customer</th>
                    <th>Issue Type</th>
                    <th>AI Recommendation</th>
                    <th>Confidence</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {openTickets.map((ticket) => {
                    const severityLevel = getSeverityLevel(ticket.ai_confidence);
                    const severityLabel = getSeverityLabel(ticket.ai_confidence);
                    const confidence = ticket.ai_confidence != null ? Number(ticket.ai_confidence) : null;
                    const createdDate = new Date(ticket.created_at).toLocaleDateString();

                    return (
                      <tr key={ticket.id} className={`severity-${severityLevel}`}>
                        <td>
                          <span className={`severity-badge severity-${severityLevel}`}>
                            {severityLevel === 'high' && '⚠️ '}
                            {severityLabel}
                          </span>
                        </td>
                        <td className="ticket-number">{ticket.ticket_number}</td>
                        <td>{ticket.customer_name}</td>
                        <td>{ticket.issue_type}</td>
                        <td>{ticket.ai_recommendation || 'N/A'}</td>
                        <td>
                          {Number.isFinite(confidence) ? `${confidence.toFixed(1)}%` : 'N/A'}
                        </td>
                        <td>
                          <span className={`status-badge status-${ticket.status}`}>
                            {ticket.status}
                          </span>
                        </td>
                        <td>{createdDate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* No Data Message */}
        {(!agentStats || agentStats.length === 0) && 
         (!ticketStats || ticketStats.total_tickets === 0) && (
          <div className="no-data">
            <h3>📊 No Analytics Data Yet</h3>
            <p>Start using the AI chatbot and customer service to generate analytics!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsDashboard;