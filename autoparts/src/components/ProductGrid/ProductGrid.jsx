import React from "react";
import ProductCard from "../ProductCard/ProductCard";
import "./ProductGrid.css";

const ProductGrid = ({ products, addToCart, updateQuantity, cartItems }) => {
  return (
    <div className="product-grid">
      <div className="container">
        <div className="grid">
          {products && products.length > 0 ? (
            products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                addToCart={addToCart}
                updateQuantity={updateQuantity}
                cartItems={cartItems}
              />
            ))
          ) : (
            <div className="no-products">
              <div className="no-products-icon">🔍</div>
              <h3>No Products Found</h3>
              <p>Try adjusting your search or filter to find what you're looking for.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductGrid;
