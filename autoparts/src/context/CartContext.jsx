import React, { createContext, useState, useEffect } from "react";

export const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(() => {
    const savedCart = localStorage.getItem('cart');
    return savedCart ? JSON.parse(savedCart) : [];
  });

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  
  const addToCart = (product) => {
    const existingItem = cart.find((item) => item.name === product.name);
    if (existingItem) {
      const updatedCart = cart.map((item) =>
        item.name === product.name
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
      setCart(updatedCart);
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  
  const updateQuantity = (product, newQuantity) => {
    if (newQuantity < 1) return; // no negatives or zero
    const updatedCart = cart.map((item) =>
      item.name === product.name ? { ...item, quantity: newQuantity } : item
    );
    setCart(updatedCart);
  };

 
  const removeFromCart = (product) => {
    setCart(cart.filter((item) => item.name !== product.name));
  };

  return (
    <CartContext.Provider
      value={{ cart, addToCart, removeFromCart, updateQuantity }}
    >
      {children}
    </CartContext.Provider>
  );
};
