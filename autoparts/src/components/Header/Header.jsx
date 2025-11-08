import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Header.css';

const Header = ({ cartItems }) => {
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = typeof window !== 'undefined' && window.localStorage ? 
      JSON.parse(window.localStorage.getItem('user') || 'null') : null;
    setUser(storedUser);

    // Listen for auth changes (supports other tabs via native 'storage' and same-tab via 'authChanged')
    const handleStorageChange = () => {
      const updatedUser = JSON.parse(window.localStorage.getItem('user') || 'null');
      setUser(updatedUser);
      // close menu when auth changes
      setMenuOpen(false);
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('authChanged', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('authChanged', handleStorageChange);
    };
  }, []);

  const handleLogout = () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('token');
      window.localStorage.removeItem('user');
      // dispatch authChanged so same-tab listeners update
      window.dispatchEvent(new Event('authChanged'));
      // navigate to home
      window.location.href = '/';
    }
  };

  // close menu when clicking outside
  useEffect(() => {
    const onDocClick = (e) => {
      if (!menuRef.current) return;
      if (menuOpen && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuOpen]);

  return (
    <header className="header">
      <div className="container">
        <Link to="/" className="logo" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h1>AutoSmart Parts</h1>
          <span className="tagline">Everything your car needs - powered by AI</span>
        </Link>
        <nav className="nav">
          <ul style={{ 
            display: "flex", 
            gap: "1rem", 
            justifyContent: "center",
            listStyle: "none",
            padding: 0,
            margin: 0,
            flexWrap: "wrap"
          }}>
            <li><Link to="/">Home</Link></li>
            <li><Link to="/cart">Cart ({cartItems.length})</Link></li>
            {!user ? (
              <li><Link to="/login">Login</Link></li>
            ) : (
              <li className={`user-menu${menuOpen ? ' open' : ''}`} ref={menuRef}>
                <div
                  className="user-trigger"
                  role="button"
                  tabIndex={0}
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen(open => !open)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMenuOpen(open => !open); } }}
                >
                  <span className="user-label">Hi, {user.first_name || user.email}</span>
                  <span className={`caret${menuOpen ? ' open' : ''}`} aria-hidden="true" />
                </div>
                <ul className="user-dropdown">
                  <li><Link to="/orders" onClick={() => setMenuOpen(false)}>My Orders</Link></li>
                  <li><Link to="/customer-service" onClick={() => setMenuOpen(false)}>🎧 Support</Link></li>
                  <li><a href="#" onClick={(e)=>{e.preventDefault(); handleLogout();}}>Logout</a></li>
                </ul>
              </li>
            )}
            {user?.role === 'admin' && <li><Link to="/analytics">Analytics</Link></li>}
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;
