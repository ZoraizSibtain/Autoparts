import React, { useState, useEffect } from "react";
import { Routes, Route, Link } from "react-router-dom";
import Header from "./components/Header/Header";
import CategoryFilter from "./components/CategoryFilter/CategoryFilter";
import ProductGrid from "./components/ProductGrid/ProductGrid";
import Footer from "./components/Footer/Footer";
import Cart from "./pages/Cart/Cart.jsx";
import CustomerService from "./pages/CustomerService/CustomerService";
import Checkout from "./pages/Checkout/Checkout.jsx";
import Reviews from "./pages/Reviews/Reviews.jsx";
import Chatbot from "./components/Chatbot/Chatbot";
import AnalyticsDashboard from "./components/AnalyticsDashboard/AnalyticsDashboard";
import Login from "./pages/Auth/Login";
import Signup from "./pages/Auth/Signup";
import Orders from "./pages/Orders/Orders";
import "./styles/global.css";
import "./App.css";

const App = () => {
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [cartItems, setCartItems] = useState([]);
  
  // NEW: State for products from database
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);

  // NEW: Fetch products from database
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        
        // Fetch products
        const productsResponse = await fetch('http://localhost:3001/api/products');
        const productsData = await productsResponse.json();
        
        if (productsData.success) {
          // Map database fields and convert price to number
          const mappedProducts = productsData.products.map(product => ({
            ...product,
            image: product.image_url, // Map image_url to image for compatibility
            price: parseFloat(product.price), // Convert price string to number
          }));
          setProducts(mappedProducts);
        }
        
        // Fetch categories
        const categoriesResponse = await fetch('http://localhost:3001/api/categories');
        const categoriesData = await categoriesResponse.json();
        
        if (categoriesData.success) {
          setCategories(categoriesData.categories);
        }
        
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const addToCart = (product) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        return [...prev, { ...product, quantity: 1 }];
      }
    });
  };

  const updateQuantity = (productId, newQty) => {
    setCartItems((prev) => {
      if (newQty <= 0) return prev.filter((item) => item.id !== productId);
      return prev.map((item) =>
        item.id === productId ? { ...item, quantity: newQty } : item
      );
    });
  };

  const clearCart = () => {
    setCartItems([]);
  };

  useEffect(() => {
    const handleAddToCart = (e) => {
      const productId = parseInt(e.detail);
      const product = products.find((p) => p.id === productId);
      if (product) {
        addToCart(product);
        alert(`✅ ${product.name} added to your cart!`);
      }
    };
    window.addEventListener("add-to-cart", handleAddToCart);
    return () => window.removeEventListener("add-to-cart", handleAddToCart);
  }, [products]);

  const filteredProducts = products
    .filter((p) => activeCategory === "All" || p.category === activeCategory)
    .filter((p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

  // Show loading state
  if (loading) {
    return (
      <div className="App">
        <Header cartItems={cartItems} />
        <main>
          <div style={{ 
            textAlign: 'center', 
            padding: '4rem 2rem',
            fontSize: '1.2rem'
          }}>
            <div className="loading-spinner">⏳</div>
            <p>Loading products from database...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="App">
      <Header cartItems={cartItems} />
      <main>
        <Routes>
        <Route
          path="/"
          element={
            <>
              <input
                type="text"
                placeholder="Search car parts (e.g., brake pads, engine oil, wipers)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ margin: "1rem auto", display: "block" }}
                className="search-bar-modern"
              />
              <CategoryFilter
                categories={categories}
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
              />
              <ProductGrid
                products={filteredProducts}
                addToCart={addToCart}
                updateQuantity={updateQuantity}
                cartItems={cartItems}
              />
            </>
          }
        />
        <Route
          path="/cart"
          element={<Cart cartItems={cartItems} updateQuantity={updateQuantity} />}
        />
        <Route
          path="/checkout"
          element={<Checkout cartItems={cartItems} updateQuantity={updateQuantity} clearCart={clearCart} />}
        />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/reviews/:productId" element={<Reviews />} />
        <Route path="/analytics" element={<AnalyticsDashboard />} />
        <Route path="/customer-service" element={<CustomerService />} />
        </Routes>
      </main>
      <Footer />
      <Chatbot />
    </div>
  );
};

export default App;