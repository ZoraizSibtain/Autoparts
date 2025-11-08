import React from "react";
import { Link } from "react-router-dom";
import "./Footer.css";

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-section">
            <h3>🚗 AutoSmart Parts</h3>
            <p>Your trusted partner for OEM & aftermarket car parts, powered by AI assistance.</p>
            <div className="footer-features">
              <span>✓ AI-Powered Recommendations</span>
              <span>✓ Fast Shipping</span>
              <span>✓ Quality Guaranteed</span>
            </div>
          </div>

          <div className="footer-section">
            <h4>Popular Categories</h4>
            <ul>
              <li>Engine Oils & Fluids</li>
              <li>Brake System</li>
              <li>Air & Fuel Filters</li>
              <li>Spark Plugs</li>
              <li>Wipers & Accessories</li>
            </ul>
          </div>

          <div className="footer-section">
            <h4>Customer Service</h4>
            <ul>
              <li><Link to="/customer-service">Support Center</Link></li>
              <li><Link to="/orders">Order Tracking</Link></li>
              <li>Shipping: 2 Business Days</li>
              <li>Delivery: 5-7 Business Days</li>
              <li>Free Shipping on Orders $75+</li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; 2025 AutoSmart Parts. All rights reserved. | Powered by AI Technology</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
