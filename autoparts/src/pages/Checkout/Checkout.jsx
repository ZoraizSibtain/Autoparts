import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Checkout.css';

const Checkout = ({ cartItems, updateQuantity, clearCart }) => {
  const navigate = useNavigate();

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      navigate('/login?redirect=/checkout');
    }
  }, [navigate]);
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    email: '',
    address: '',
    city: '',
    zipCode: '',
    cardNumber: '',
    expiryDate: '',
    cvv: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [paymentErrors, setPaymentErrors] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCustomerInfo(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const calculateTotal = () => {
    return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0).toFixed(2);
  };

  const calculateTotals = () => {
    const subtotal = cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
    const tax = +(subtotal * 0.08).toFixed(2); // 8% tax
    const shipping = subtotal > 75 ? 0 : 9.99;
    const total = +(subtotal + tax + shipping).toFixed(2);
    return { subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), shipping: shipping.toFixed(2), total: total.toFixed(2) };
  };

  const isAddressEntered = () => {
    return customerInfo.address.trim() !== '' && customerInfo.city.trim() !== '' && customerInfo.zipCode.trim() !== '';
  };

  const luhnCheck = (cardNumber) => {
    const cleaned = (cardNumber + '').replace(/\D/g, '');
    let sum = 0;
    let shouldDouble = false;
    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  };

  const validateExpiry = (expiry) => {
    if (!expiry) return 'Expiry date is required';
    const m = expiry.match(/^\s*(0[1-9]|1[0-2])\s*[\/]\s*([0-9]{2})\s*$/);
    if (!m) return 'Expiry must be in MM/YY format';

    const month = parseInt(m[1], 10);
    const year = parseInt(m[2], 10);

    // Build a date for the last day of the expiry month
    const fullYear = 2000 + year;
    const expiryDate = new Date(fullYear, month, 0, 23, 59, 59, 999); // last ms of month
    const now = new Date();
    // compare end of expiry month to now
    if (expiryDate < now) return 'Card has expired';
    return null;
  };

  const detectCardType = (number) => {
    const cleaned = (number || '').replace(/\D/g, '');
    if (/^3[47]/.test(cleaned)) return 'amex';
    if (/^4/.test(cleaned)) return 'visa';
    if (/^5[1-5]/.test(cleaned) || /^2[2-7]/.test(cleaned)) return 'mastercard';
    return 'unknown';
  };

  const validateCVV = (cvv, cardNumber) => {
    if (!cvv) return 'CVV is required';
    if (!/^[0-9]{3,4}$/.test(cvv)) return 'CVV must be 3 or 4 digits';
    const cardType = detectCardType(cardNumber);
    if (cardType === 'amex' && cvv.length !== 4) return 'American Express cards require a 4-digit CVV';
    if (cardType !== 'amex' && cvv.length !== 3) return 'CVV must be 3 digits';
    return null;
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    setIsProcessing(true);

    // Clear previous errors
    setPaymentErrors({});

    // Validate expiry and CVV
    const expiryErr = validateExpiry(customerInfo.expiryDate);
    const cvvErr = validateCVV(customerInfo.cvv, customerInfo.cardNumber);
    const cardErr = luhnCheck(customerInfo.cardNumber) ? null : 'Please enter a valid card number.';

    const errors = {};
    if (expiryErr) errors.expiryDate = expiryErr;
    if (cvvErr) errors.cvv = cvvErr;
    if (cardErr) errors.cardNumber = cardErr;

    if (Object.keys(errors).length > 0) {
      setPaymentErrors(errors);
      setIsProcessing(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login?redirect=/checkout');
        return;
      }

      const response = await fetch('http://localhost:3001/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          cartItems,
          customerInfo,
          totals: calculateTotals()
        }),
      });

      const data = await response.json();

      if (data.success) {
        setOrderNumber(data.orderNumber);
        setOrderComplete(true);
        clearCart();
      } else {
        alert('Failed to place order. Please try again.');
      }
    } catch (error) {
      console.error('Order error:', error);
      alert('Failed to place order. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (orderComplete) {
    return (
      <div className="checkout-container">
        <div className="order-success">
          <div className="success-icon"></div>
          <h2>Order Confirmed!</h2>
          <p className="order-number">Order Number: <strong>{orderNumber}</strong></p>
          <p>Thank you for your purchase! You will receive a confirmation email shortly.</p>
          <button 
            onClick={() => navigate('/')}
            className="continue-shopping-btn"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-container">
      <div className="checkout-header">
        <h2>Checkout</h2>
      </div>
      
      <div className="checkout-content">
        <div className="checkout-items">
          <h3>Order Summary</h3>
          {cartItems.length === 0 ? (
            <p>Your cart is empty</p>
          ) : (
            <div className="checkout-items-list">
              {cartItems.map(item => (
                <div key={item.id} className="checkout-item">
                  <img src={item.image_url} alt={item.name} />
                  <div className="checkout-item-details">
                    <h4>{item.name}</h4>
                    <p>Quantity: {item.quantity}</p>
                    <p className="price">${(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                </div>
              ))}
              <div className="totals-breakdown">
                <div className="subtotal">Subtotal: ${calculateTotals().subtotal}</div>
                <div className="tax">Tax (8%): ${calculateTotals().tax}</div>
                <div className="shipping">Shipping: ${calculateTotals().shipping}</div>
                <div className="grand-total">
                  <strong>Total: ${calculateTotals().total}</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="checkout-form-container">
          <form className="checkout-form" onSubmit={handleSubmitOrder}>
            <div className="form-section">
              <h3>Shipping Information</h3>
              <div className="form-group">
                <input
                  type="text"
                  name="name"
                  placeholder="Full Name"
                  value={customerInfo.name}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <input
                  type="email"
                  name="email"
                  placeholder="Email Address"
                  value={customerInfo.email}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <input
                  type="text"
                  name="address"
                  placeholder="Shipping Address"
                  value={customerInfo.address}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <input
                    type="text"
                    name="city"
                    placeholder="City"
                    value={customerInfo.city}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <input
                    type="text"
                    name="zipCode"
                    placeholder="ZIP Code"
                    value={customerInfo.zipCode}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3>Payment Information</h3>
              <div className="form-group">
                <input
                  type="text"
                  name="cardNumber"
                  placeholder="Card Number"
                  value={customerInfo.cardNumber}
                  onChange={handleInputChange}
                  required
                />
                {paymentErrors.cardNumber && (
                  <div className="field-error">{paymentErrors.cardNumber}</div>
                )}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <input
                    type="text"
                    name="expiryDate"
                    placeholder="MM/YY"
                    value={customerInfo.expiryDate}
                    onChange={handleInputChange}
                    required
                  />
                  {paymentErrors.expiryDate && (
                    <div className="field-error">{paymentErrors.expiryDate}</div>
                  )}
                </div>
                <div className="form-group">
                  <input
                    type="text"
                    name="cvv"
                    placeholder="CVV"
                    value={customerInfo.cvv}
                    onChange={handleInputChange}
                    required
                  />
                  {paymentErrors.cvv && (
                    <div className="field-error">{paymentErrors.cvv}</div>
                  )}
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              className="place-order-btn"
              disabled={cartItems.length === 0 || isProcessing}
            >
              {isProcessing ? 'Processing...' : `Place Order - $${calculateTotals().total}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Checkout;