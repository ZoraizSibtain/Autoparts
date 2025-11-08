import React, { useState, useEffect } from 'react';
import './CustomerService.css';

const CustomerService = () => {
  const [orders, setOrders] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    orderId: '',
    issueType: 'defect',
    customerName: '',
    customerEmail: '',
    description: '',
    image: null
  });
  const [imagePreview, setImagePreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [reprocessingTicketId, setReprocessingTicketId] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });

  useEffect(() => {
    const syncUserAndFetch = () => {
      const user = typeof window !== 'undefined' ? JSON.parse(window.localStorage.getItem('user') || 'null') : null;
      if (user) {
        setFormData(prev => ({ ...prev, customerName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email, customerEmail: user.email }));
      }
      fetchOrders();
      fetchTickets();
    };

    syncUserAndFetch();
    const handleAuthChange = () => syncUserAndFetch();
    window.addEventListener('authChanged', handleAuthChange);
    return () => window.removeEventListener('authChanged', handleAuthChange);
  }, []);

  const fetchOrders = async () => {
    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;
      const response = await fetch(token ? 'http://localhost:3001/api/orders/my' : 'http://localhost:3001/api/orders', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await response.json();
      if (data.success) {
        setOrders(data.orders);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  };

  const fetchTickets = async () => {
    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;
      const response = await fetch(token ? 'http://localhost:3001/api/support/my' : 'http://localhost:3001/api/support/tickets', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await response.json();
      if (data.success) {
        setTickets(data.tickets);
      }
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({
        ...prev,
        image: file
      }));

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;
      const formDataToSend = new FormData();
      const orderIdNumber = parseInt(formData.orderId, 10);
      
      formDataToSend.append('orderId', orderIdNumber);
      formDataToSend.append('issueType', formData.issueType);
      formDataToSend.append('customerName', formData.customerName);
      formDataToSend.append('customerEmail', formData.customerEmail);
      formDataToSend.append('description', formData.description);
      
      if (formData.image) {
        formDataToSend.append('image', formData.image);
      }

      const response = await fetch('http://localhost:3001/api/support/ticket', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formDataToSend
      });

      const data = await response.json();

      if (data.success) {
        setSubmitResult({
          success: true,
          ticket: data.ticket,
          message: data.message
        });

        // Immediately add the new ticket to local state so it appears without waiting for fetchTickets
        setTickets(prev => [data.ticket, ...prev]);
        // open ticket detail modal for immediate view
        setSelectedTicket(data.ticket);
        
        // Reset form
        setFormData({
          orderId: '',
          issueType: 'defect',
          customerName: '',
          customerEmail: '',
          description: '',
          image: null
        });
        setImagePreview(null);
        
        // Refresh tickets
        fetchTickets();
        
        // Hide form after 5 seconds
        setTimeout(() => {
          setShowForm(false);
        }, 5000);
      } else {
        setSubmitResult({
          success: false,
          message: data.error || 'Failed to submit ticket'
        });
      }
    } catch (error) {
      console.error('Ticket submission error:', error);
      setSubmitResult({
        success: false,
        message: 'Failed to submit ticket. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeSubmitResult = () => setSubmitResult(null);

  const openTicketDetail = (ticket) => {
    setSelectedTicket(ticket);
  };

  const closeTicketDetail = () => setSelectedTicket(null);

  const runAiForTicket = async (ticketId) => {
    try {
      // ensure ticket has an attachment
      const ticket = tickets.find(t => t.id === ticketId) || selectedTicket;
      if (!ticket || !ticket.image_url) {
        showToast('No attachment found for this ticket. Attach an image before running AI.', 'error');
        return;
      }

      setReprocessingTicketId(ticketId);
      const resp = await fetch(`http://localhost:3001/api/support/ticket/${ticketId}/reprocess`, {
        method: 'POST'
      });
      const data = await resp.json();
      if (data.success && data.ticket) {
        // update tickets list and selectedTicket
        setTickets(prev => prev.map(t => t.id === data.ticket.id ? data.ticket : t));
        setSelectedTicket(data.ticket);
        showToast('AI analysis completed', 'success');
      } else {
        console.warn('Failed to reprocess ticket:', data.error || data);
        showToast('AI reprocess failed: ' + (data.error || 'unknown'), 'error');
      }
    } catch (err) {
      console.error('Reprocess error:', err);
      showToast('Failed to reprocess ticket. See console for details.', 'error');
    } finally {
      setReprocessingTicketId(null);
    }
  };

  const showToast = (message, type = 'info', ms = 4000) => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast({ visible: false, message: '', type: 'info' }), ms);
  };

  const getIssueTypeLabel = (type) => {
    switch (type) {
      case 'defect': return '🔧 Product Defect';
      case 'damaged': return '📦 Damaged Shipment';
      case 'fraud': return '💳 Fraudulent Transaction';
      default: return type;
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'REFUND': { class: 'status-refund', icon: '💰' },
      'REPLACE': { class: 'status-replace', icon: '🔄' },
      'ESCALATE': { class: 'status-escalate', icon: '⚠️' },
      'DECLINE': { class: 'status-decline', icon: '❌' },
      'RESOLVED': { class: 'status-resolved', icon: '✅' }
    };

    const config = statusConfig[status] || { class: '', icon: '' };
    return (
      <span className={`status-badge ${config.class}`}>
        {config.icon} {status}
      </span>
    );
  };

  return (
    <div className="customer-service-container">
      <div className="service-header">
        <h2>🎧 Customer Service Portal</h2>
        <p>AI-Powered Support for Your Orders</p>
      </div>

      <div className="service-actions">
        <button 
          className="btn-primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? '❌ Cancel' : '➕ Report an Issue'}
        </button>
        <button 
          className="btn-secondary"
          onClick={fetchTickets}
        >
          🔄 Refresh Tickets
        </button>
      </div>

      {showForm && (
        <div className="support-form-container">
          <h3>Report an Issue</h3>
          <form onSubmit={handleSubmit} className="support-form">
            <div className="form-group">
              <label>Order ID *</label>
              <select
                name="orderId"
                value={formData.orderId}
                onChange={handleInputChange}
                required
              >
                <option value="">Select an order</option>
                {orders.map(order => (
                  <option key={order.id} value={order.id}>
                    Order #{order.order_number} - ${parseFloat(order.total_amount).toFixed(2)} ({new Date(order.created_at).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Issue Type *</label>
              <select
                name="issueType"
                value={formData.issueType}
                onChange={handleInputChange}
                required
              >
                <option value="defect">🔧 Product Defect</option>
                <option value="damaged">📦 Damaged Shipment</option>
                <option value="fraud">💳 Fraudulent Transaction</option>
              </select>
            </div>

            <div className="form-group">
              <label>Your Name *</label>
              <input
                type="text"
                name="customerName"
                value={formData.customerName}
                onChange={handleInputChange}
                placeholder="Enter your full name"
                required
              />
            </div>

            <div className="form-group">
              <label>Your Email *</label>
              <input
                type="email"
                name="customerEmail"
                value={formData.customerEmail}
                onChange={handleInputChange}
                placeholder="Enter your email address"
                required
              />
            </div>

            <div className="form-group">
              <label>Description *</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Please describe the issue in detail..."
                rows="4"
                required
              />
            </div>

            <div className="form-group">
              <label>Upload Image *</label>
              <div className="image-upload-area">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  required
                  id="image-upload"
                />
                <label htmlFor="image-upload" className="upload-label">
                  📷 Choose Image
                </label>
                {imagePreview && (
                  <div className="image-preview">
                    <img src={imagePreview} alt="Preview" />
                  </div>
                )}
              </div>
              <small className="help-text">
                {formData.issueType === 'defect' && 'Upload a photo of the defective product'}
                {formData.issueType === 'damaged' && 'Upload a photo of the damaged shipping box'}
                {formData.issueType === 'fraud' && 'Upload a photo of your credit card statement (OCR)'}
              </small>
            </div>

            <button 
              type="submit" 
              className="btn-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? '⏳ Processing with AI...' : '🤖 Submit for AI Analysis'}
            </button>
          </form>

          {submitResult && (
            <div className={`submit-result ${submitResult.success ? 'success' : 'error'}`}>
              <button className="close-result" onClick={closeSubmitResult}>✖</button>
              <h4>{submitResult.success ? '✅ Ticket Created Successfully!' : '❌ Submission Failed'}</h4>
              <p>{submitResult.message}</p>
              {submitResult.success && submitResult.ticket && (
                <div className="ticket-details">
                  <p><strong>Ticket ID:</strong> {submitResult.ticket.id}</p>
                  <p><strong>AI Decision:</strong> {getStatusBadge(submitResult.ticket.ai_recommendation || submitResult.ticket.status)}</p>
                  {submitResult.ticket.ai_analysis && (
                    <div className="ai-analysis">
                      <h5>🤖– AI Analysis:</h5>
                      <p><strong>Reasoning:</strong> {submitResult.ticket.ai_analysis.reasoning}</p>
                      <p><strong>Description:</strong> {submitResult.ticket.ai_analysis.description}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="tickets-section">
        <h3>Support Tickets</h3>
        {tickets.length === 0 ? (
          <div className="no-tickets">
            <p>No support tickets yet.</p>
          </div>
        ) : (
          <div className="tickets-grid">
            {tickets.map(ticket => (
              <div key={ticket.id} className="ticket-card" onClick={() => openTicketDetail(ticket)} role="button" tabIndex={0} onKeyPress={() => openTicketDetail(ticket)}>
                <div className="ticket-header">
                  <h4>{ticket.id}</h4>
                  {getStatusBadge(ticket.status)}
                </div>
                <div className="ticket-body">
                  <p><strong>Order:</strong> {ticket.order_id}</p>
                  <p><strong>Issue:</strong> {getIssueTypeLabel(ticket.issue_type)}</p>
                  <p><strong>Customer:</strong> {ticket.customer_name}</p>
                  <p><strong>Email:</strong> {ticket.customer_email}</p>
                  <p><strong>Description:</strong> {ticket.description}</p>
                  <p><strong>Created:</strong> {new Date(ticket.created_at).toLocaleString()}</p>
                  
                  {ticket.image_url && (
                    <div className="ticket-image">
                      <img
                        src={ticket.image_url.startsWith('/uploads') ? `http://localhost:3001${ticket.image_url}` : ticket.image_url}
                        alt="Issue"
                      />
                    </div>
                  )}
                  
                  {ticket.ai_analysis && (
                    <div className="ai-analysis-card">
                      <h5>🤖– AI Analysis</h5>
                      <p><strong>Severity:</strong> {ticket.ai_analysis.severity}</p>
                      <p><strong>Description:</strong> {ticket.ai_analysis.description}</p>
                      <p><strong>Reasoning:</strong> {ticket.ai_analysis.reasoning}</p>
                      <p><strong>Recommended Action:</strong> {getStatusBadge(ticket.ai_analysis.recommendedAction)}</p>
                    </div>
                  )}
                  
                  {ticket.resolution && (
                    <div className="resolution">
                      <p><strong>Resolution:</strong> {ticket.resolution}</p>
                      <p><strong>Resolved:</strong> {new Date(ticket.resolved_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ticket detail modal */}
      {selectedTicket && (
        <div className="modal-overlay" onClick={closeTicketDetail}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeTicketDetail}>✖</button>
            <h3>Ticket #{selectedTicket.id}</h3>
            <p><strong>Order:</strong> {selectedTicket.order_id}</p>
            <p><strong>Issue:</strong> {getIssueTypeLabel(selectedTicket.issue_type)}</p>
            <p><strong>Customer:</strong> {selectedTicket.customer_name} &lt;{selectedTicket.customer_email}&gt;</p>
            <p><strong>Description:</strong> {selectedTicket.description}</p>
            <p><strong>Status:</strong> {getStatusBadge(selectedTicket.status)}</p>
            {selectedTicket.image_url && (
              <div className="modal-image">
                <img src={selectedTicket.image_url.startsWith('/uploads') ? `http://localhost:3001${selectedTicket.image_url}` : selectedTicket.image_url} alt="Ticket" />
              </div>
            )}
            {selectedTicket.ai_analysis ? (
              <div className="ai-analysis">
                <h4>AI Analysis</h4>
                <p><strong>Severity:</strong> {selectedTicket.ai_analysis.severity}</p>
                <p><strong>Description:</strong> {selectedTicket.ai_analysis.description}</p>
                <p><strong>Reasoning:</strong> {selectedTicket.ai_analysis.reasoning}</p>
                <p><strong>Order Match:</strong> {selectedTicket.ai_analysis.order_match ? 'Yes' : 'No'}</p>
                {selectedTicket.ai_analysis.order_match === false && selectedTicket.ai_analysis.order_discrepancy_reason && (
                  <p><strong>Discrepancy Reason:</strong> {selectedTicket.ai_analysis.order_discrepancy_reason}</p>
                )}
              </div>
            ) : (
              <div>
                <p><em>No AI analysis available for this ticket yet.</em></p>
                <button
                  className="btn-primary"
                  onClick={() => runAiForTicket(selectedTicket.id)}
                  disabled={reprocessingTicketId === selectedTicket.id || !selectedTicket.image_url}
                  title={!selectedTicket.image_url ? 'No attachment: AI needs an image or file to analyze' : ''}
                >
                  {reprocessingTicketId === selectedTicket.id ? '⏳ Running AI...' : '🤖 Run AI Analysis'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerService;