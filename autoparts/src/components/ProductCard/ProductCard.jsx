import React, { useState, useEffect } from "react";
import "./ProductCard.css";

const ProductCard = ({
  product,
  addToCart = () => {},
  updateQuantity = () => {},
  cartItems = [],
}) => {
  const itemInCart = cartItems.find((item) => item.id === product.id);
  const [quantity, setQuantity] = useState(itemInCart ? itemInCart.quantity : 0);

  useEffect(() => {
    const existing = cartItems.find((item) => item.id === product.id);
    setQuantity(existing ? existing.quantity : 0);
  }, [cartItems, product.id]);

  const handleAddToCart = () => {
    if (quantity === 0) {
      setQuantity(1);
      addToCart(product);
    }
  };

  const handleIncrease = () => {
    const newQty = quantity + 1;
    setQuantity(newQty);
    updateQuantity(product.id, newQty);
  };

  const handleDecrease = () => {
    const newQty = quantity - 1;
    if (newQty <= 0) {
      setQuantity(0);
      updateQuantity(product.id, 0);
      return;
    }
    setQuantity(newQty);
    updateQuantity(product.id, newQty);
  };

  return (
    <div className="product-card">
      <img src={product.image_url} alt={product.name} />
      
      <h3>{product.name}</h3>
      <p className="product-description">{product.description}</p>
      <p className="price">${product.price}</p>
      
      {/* toggle between Add to Cart and Quantity box */}
      {quantity > 0 ? (
        <div className="quantity-box">
          <button onClick={handleDecrease}>−</button>
          <span>{quantity}</span>
          <button onClick={handleIncrease}>+</button>
        </div>
      ) : (
        <button className="add-btn" onClick={handleAddToCart}>
          Add to Cart
        </button>
      )}
    </div>
  );
};

export default ProductCard;