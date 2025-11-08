import React from 'react';
import './CategoryFilter.css';

const CategoryFilter = ({ categories, activeCategory, onCategoryChange }) => {
  return (
    <div className="category-filter">
      <div className="container">
        <h2>Shop by Category</h2>
        <div className="filter-buttons">
          <button
            className={activeCategory === 'All' ? 'active' : ''}
            onClick={() => onCategoryChange('All')}
          >
            All Products
          </button>
          {categories.map((category) => (
            <button
              key={category}
              className={activeCategory === category ? 'active' : ''}
              onClick={() => onCategoryChange(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CategoryFilter;
