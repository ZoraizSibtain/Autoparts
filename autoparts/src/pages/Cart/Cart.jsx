import React from "react";
import { useNavigate } from "react-router-dom";
import "./Cart.css";

const Cart = ({ cartItems, updateQuantity }) => {
  const navigate = useNavigate();

  const handleRemove = (id) => {
    updateQuantity(id, 0); 
  };

  // Add error handling for total calculation
  let total = 0;
  try {
    total = cartItems.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
      0
    );
  } catch (error) {
    console.error('Error calculating total:', error);
  }

  if (cartItems.length === 0)
    return (
      <h2 style={{ textAlign: "center", marginTop: "50px" }}>
        Your cart is empty.
      </h2>
    );

  return (
    <div className="cart-container">
      <h2>Your Cart</h2>
      {cartItems.map((item) => {
        try {
          return (
            <div key={item.id} className="cart-item">
              <img
                src={item.image_url || item.image || 'https://via.placeholder.com/150'} 
                alt={item.name || 'Product'}
                className="cart-item-image"
                onError={(e) => {
                  console.error('Image failed to load for item:', item);
                  e.target.src = 'https://via.placeholder.com/150';
                }}
              />
              <div className="cart-item-details">
                <h3>{item.name || 'Unknown Product'}</h3>
                <p className="cart-item-category">{item.category || 'N/A'}</p>
                <p className="cart-item-price">
                  ${item.price ? item.price.toFixed(2) : '0.00'}
                </p>
                <div className="cart-item-actions">
                  <button
                    onClick={() => updateQuantity(item.id, (item.quantity || 1) - 1)}
                  >
                    -
                  </button>
                  <input type="text" value={item.quantity || 0} readOnly />
                  <button
                    onClick={() => updateQuantity(item.id, (item.quantity || 0) + 1)}
                  >
                    +
                  </button>
                  <button
                    className="remove-btn"
                    onClick={() => handleRemove(item.id)}
                  >
                    🗑️ Remove
                  </button>
                </div>
              </div>
            </div>
          );
        } catch (error) {
          console.error('Error rendering cart item:', item, error);
          return (
            <div key={item.id} className="cart-item">
              <p style={{ color: 'red' }}>Error displaying item: {item.name}</p>
            </div>
          );
        }
      })}
      <div className="cart-summary">
        <h3>Total: ${total.toFixed(2)}</h3>
        <button
          className="checkout-btn"
          onClick={() => {
            const user = localStorage.getItem('user');
            if (!user) {
              // Store current cart in localStorage
              localStorage.setItem('pendingCheckout', 'true');
              navigate("/login?redirect=/checkout");
            } else {
              navigate("/checkout");
            }
          }}
        >
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
};

export default Cart;