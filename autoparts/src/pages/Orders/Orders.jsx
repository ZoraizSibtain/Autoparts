import React, { useEffect, useState, useRef } from 'react';
import './Orders.css';

// Helper function to estimate shipping date (2 business days after order)
const getEstimatedShippingDate = (orderDate) => {
  const date = new Date(orderDate);
  let businessDays = 2;
  while (businessDays > 0) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      businessDays--;
    }
  }
  return date.toLocaleDateString();
};

// Helper function to estimate delivery date (5-7 business days after order)
const getEstimatedDeliveryDate = (orderDate) => {
  const date = new Date(orderDate);
  let businessDays = 7;
  while (businessDays > 0) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      businessDays--;
    }
  }
  return date.toLocaleDateString();
};

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState(null);

  // fetch the token each time so we don't rely on a stale captured value
  const isMounted = useRef(true);

  const fetchOrders = async (signal) => {
    if (!isMounted.current) return;
    try {
      setLoading(true);
    } catch (e) {
      // ignore if unmounted
    }
    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;
      const resp = await fetch('http://localhost:3001/api/orders/my', {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        signal
      });

      // Better error handling for non-OK responses
      if (!resp.ok) {
        // If backend returns 404 "Order not found", treat as empty list rather than an error
        if (resp.status === 404) {
          try {
            const maybe = await resp.json();
            if (maybe && maybe.error && /order not found/i.test(maybe.error)) {
              if (isMounted.current) {
                setOrders([]);
                setStatusMsg(null);
              }
              return;
            }
          } catch (e) {
            // fall through to generic error handling
          }
        }

        let text = '';
        try { text = await resp.text(); } catch (e) { /* ignore */ }
        console.error('Orders fetch failed', resp.status, text);
        if (isMounted.current) setStatusMsg(`Failed to load orders (${resp.status})`);
        return;
      }

      let data = null;
      try {
        data = await resp.json();
      } catch (e) {
        console.error('Failed to parse orders JSON', e);
        if (isMounted.current) setStatusMsg('Failed to parse server response');
        return;
      }

      if (isMounted.current) {
        if (data && data.success) {
            // Validate and sanitize order data
            const sanitizedOrders = (data.orders || []).map(order => ({
              ...order,
              total_amount: parseFloat(order.total_amount) || 0,
              items: (order.items || []).map(item => ({
                ...item,
                total: parseFloat(item.total) || 0,
                quantity: parseInt(item.quantity) || 0
              }))
            }));
            setOrders(sanitizedOrders);
            setStatusMsg(null);
        } else {
          // If server responds success:false but no orders, treat as empty list
          if (data && data.error && /order not found/i.test(data.error)) {
            setOrders([]);
            setStatusMsg(null);
          } else {
            setStatusMsg((data && data.error) ? data.error : 'Failed to load orders');
          }
        }
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        // ignore abort
        return;
      }
      console.error('Failed to load orders', err);
      if (isMounted.current) setStatusMsg('Failed to load orders');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  useEffect(() => {
    isMounted.current = true;
    const controller = new AbortController();
    fetchOrders(controller.signal);

    const handleAuthChanged = () => fetchOrders();
    if (typeof window !== 'undefined') window.addEventListener('authChanged', handleAuthChanged);
    return () => {
      isMounted.current = false;
      controller.abort();
      if (typeof window !== 'undefined') window.removeEventListener('authChanged', handleAuthChanged);
    };
  }, []);

  // removed per-Order message box — users can open Support/Tickets to create inquiries

  if (loading) return <div style={{padding:'2rem', textAlign:'center'}}>Loading orders...</div>;

  return (
    <div className="orders-page">
      <h2>My Orders</h2>
      {statusMsg && <div className="field-error">{statusMsg}</div>}
      {orders.length === 0 ? (
        <div className="empty-orders">
          <h3>No Orders Yet</h3>
          <p>When you make a purchase, your order history will appear here.</p>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map(o => (
            <div className="order-card" key={o.id}>
              <div className="order-header">
                <div><strong>Order #{o.order_number || ''}</strong></div>
                <div>
                  <span className={`order-status status-${(o.status || '').toLowerCase()}`}>
                    {o.status ? o.status.charAt(0).toUpperCase() + o.status.slice(1) : 'Unknown'}
                  </span>
                </div>
                <div>Total: ${typeof o.total_amount === 'number' ? o.total_amount.toFixed(2) : o.total_amount || '0.00'}</div>
                <div>Placed: {o.created_at ? new Date(o.created_at).toLocaleString() : 'Unknown'}</div>
              </div>
              
              <div className="order-dates">
                <div className="date-item">
                  <span>Order Placed</span>
                  <strong>{new Date(o.created_at).toLocaleDateString()}</strong>
                </div>
                <div className="date-item">
                  <span>Estimated Shipping</span>
                  <strong>{getEstimatedShippingDate(o.created_at)}</strong>
                </div>
                <div className="date-item">
                  <span>Estimated Delivery</span>
                  <strong>{getEstimatedDeliveryDate(o.created_at)}</strong>
                </div>
              </div>
              
              <div className="order-items">
                {(o.items || []).map(it => (
                  <div className="order-item" key={it.id}>
                    <div className="order-item-details">
                      {it.product_image_url && (
                        <img 
                          src={it.product_image_url} 
                          alt={it.product_name || 'Product'}
                          className="item-image"
                        />
                      )}
                      <div>
                        <div>{it.product_name || 'Unknown Product'}</div>
                        <div className="item-quantity">Quantity: {it.quantity || 0}</div>
                      </div>
                    </div>
                    <div className="item-total">
                      ${typeof it.total === 'number' ? it.total.toFixed(2) : '0.00'}
                    </div>
                  </div>
                ))}
              </div>
              {/* per-order message box removed — use Support page to create tickets */}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Orders;
