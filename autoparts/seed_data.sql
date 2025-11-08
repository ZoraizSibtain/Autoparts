-- ================================================
-- AutoSmart Parts - Seed Data
-- Insert initial products from existing catalog
-- ================================================

-- ================================================
-- Insert Products
-- ================================================

-- Engine Oils & Fluids
INSERT INTO products (
    id, name, slug, description, category, price, image_url, sku, stock_quantity
) VALUES
(
    101,
    'Mobil 1 Full Synthetic 5W-30 Engine Oil (5-Qt)',
    'mobil-1-full-synthetic-5w30',
    'Advanced full synthetic motor oil for wear protection & performance.',
    'Engine Oils & Fluids',
    36.99,
    'https://cdn11.bigcommerce.com/s-8brse8hrm/images/stencil/1280x1280/products/35289/110445/2483270-01__62956.1632335140.jpg?c=1',
    'MOB-5W30-5QT',
    50
),
(
    102,
    'Castrol GTX High Mileage 5W-30 (5-Qt)',
    'castrol-gtx-high-mileage-5w30',
    'Formulated for engines over 75K miles. Helps reduce leaks & burn-off.',
    'Engine Oils & Fluids',
    29.55,
    'https://i5.walmartimages.com/seo/Castrol-GTX-High-Mileage-5W-30-Synthetic-Blend-Motor-Oil-5-Quarts_a24d9ebf-33e8-4425-bb33-8ea6acab2505.0f1a633374a8ca73c218722a9fea980c.jpeg',
    'CAS-5W30-5QT',
    45
),
(
    103,
    'Valvoline Advanced Full Synthetic 10W-30 (5-Qt)',
    'valvoline-advanced-full-synthetic-10w30',
    'Premium full synthetic for max protection & efficiency.',
    'Engine Oils & Fluids',
    32.99,
    'https://i5.walmartimages.com/seo/Valvoline-Advanced-Full-Synthetic-10W-30-Motor-Oil-5-QT_d7eefec7-678a-4c5d-8381-b3577a6ad912.538125a4ac3d93d0a6c0e36240d56e0c.jpeg?odnHeight=768&odnWidth=768&odnBg=FFFFFF',
    'VAL-10W30-5QT',
    40
);

-- Brake System
INSERT INTO products (
    id, name, slug, description, category, price, image_url, sku, stock_quantity
) VALUES
(
    201,
    'Bosch QuietCast Premium Brake Pads (Front)',
    'bosch-quietcast-brake-pads-front',
    'Low noise, long life, smooth braking. Great daily-driver pads.',
    'Brake System',
    49.99,
    'https://m.media-amazon.com/images/I/7170H9PrwlL.jpg',
    'BOS-BP-FRONT',
    30
),
(
    202,
    'Power Stop Z23 Carbon Fiber Brake Pads',
    'power-stop-z23-brake-pads',
    'Carbon-fiber ceramic for better stopping & less dust.',
    'Brake System',
    54.99,
    'https://www.paragonperf.com/assets/images/powerstop-brake-pads-c8-corvette-z23.jpg',
    'PWS-Z23-BP',
    25
),
(
    203,
    'ACDelco Professional Brake Rotors (Front, Pair)',
    'acdelco-brake-rotors-front-pair',
    'Precision-machined rotors for smooth & consistent braking.',
    'Brake System',
    79.99,
    'https://ic.truckid.com/acdelco/products/professional-semi-metallic-disc-brake-pads_0.jpg',
    'ACD-BR-FRONT',
    20
);

-- Filters
INSERT INTO products (
    id, name, slug, description, category, price, image_url, sku, stock_quantity
) VALUES
(
    301,
    'FRAM Extra Guard Engine Air Filter',
    'fram-extra-guard-air-filter',
    'Protects engine up to 12,000 miles. Easy drop-in replacement.',
    'Filters',
    19.99,
    'https://m.media-amazon.com/images/I/810S8dIosXL.jpg',
    'FRM-AF-EG',
    60
),
(
    302,
    'K&N HP Cabin Air Filter',
    'kn-hp-cabin-air-filter',
    'Washable, reusable cabin filter for clean interior air.',
    'Filters',
    49.99,
    'https://m.media-amazon.com/images/I/91l2vtz2o8L.jpg',
    'KN-CAF-HP',
    35
),
(
    303,
    'Bosch Premium Oil Filter',
    'bosch-premium-oil-filter',
    'High-efficiency media for better engine protection.',
    'Filters',
    12.99,
    'https://m.media-amazon.com/images/I/61zZpX0P+kL._AC_UF1000,1000_QL80_.jpg',
    'BOS-OF-PREM',
    80
);

-- Spark Plugs
INSERT INTO products (
    id, name, slug, description, category, price, image_url, sku, stock_quantity
) VALUES
(
    401,
    'NGK Iridium IX Spark Plug',
    'ngk-iridium-ix-spark-plug',
    'Durable iridium design for excellent ignition & economy.',
    'Spark Plugs',
    28.99,
    'https://m.media-amazon.com/images/I/813m1w7aM-L.jpg',
    'NGK-SP-IRIX',
    55
),
(
    402,
    'Bosch Platinum (4 Spark Plugs)',
    'bosch-platinum-spark-plugs-4pack',
    'Platinum center electrode for long life, consistent performance.',
    'Spark Plugs',
    24.99,
    'https://m.media-amazon.com/images/I/71ZdxLYdjGL.jpg',
    'BOS-SP-PLAT4',
    40
),
(
    403,
    'Denso Double Platinum Spark Plug',
    'denso-double-platinum-spark-plug',
    'Dual platinum electrodes for stable combustion.',
    'Spark Plugs',
    26.99,
    'https://ic.carid.com/denso/ignition-spark-plugs-wires/double-platinum-spark-plug-box_1.jpg',
    'DNS-SP-DPLAT',
    45
);

-- Wipers & Accessories
INSERT INTO products (
    id, name, slug, description, category, price, image_url, sku, stock_quantity
) VALUES
(
    501,
    'Bosch ICON Beam Wipers',
    'bosch-icon-beam-wipers',
    'Premium beam-style wipers streak-free.',
    'Wipers & Accessories',
    22.99,
    'https://m.media-amazon.com/images/I/71Wm2aTYp5L._UF1000,1000_QL80_.jpg',
    'BOS-WP-ICON',
    50
),
(
    502,
    'Rain-X Latitude Wipers',
    'rain-x-latitude-wipers',
    'Applies water-repellent coating as you wipe.',
    'Wipers & Accessories',
    24.99,
    'https://storage.dsiautomotive.com/webpictures/thumbs/20872502_rain-x-latitude-water-repellent-wiper-blade-17-inch.png',
    'RNX-WP-LAT',
    45
),
(
    503,
    'Michelin Stealth Ultra Wipers',
    'michelin-stealth-ultra-wipers',
    'Hybrid design for durability and quiet wiping.',
    'Wipers & Accessories',
    21.55,
    'https://m.media-amazon.com/images/I/81oANkE8amL.jpg',
    'MCH-WP-STLTH',
    55
);

-- ================================================
-- Set sequence to continue from 503
-- ================================================
SELECT setval('products_id_seq', 503);

-- ================================================
-- Insert initial inventory transactions
-- ================================================
INSERT INTO inventory_transactions (
    product_id, transaction_type, quantity_change, previous_quantity, new_quantity, notes
)
SELECT 
    id, 
    'initial_stock', 
    stock_quantity, 
    0, 
    stock_quantity,
    'Initial inventory setup'
FROM products;

-- ================================================
-- Insert Superuser Account
-- ================================================
INSERT INTO users (
    email,
    password_hash,
    first_name,
    role
) VALUES (
    'zibtain',
    -- Password: admin98!
    '$2a$10$J4EIlXspKT5ODTGB0IMvlOoZI..QvK/oYXWutwRRYd.uuKzpemm6e',
    'Zibtain',
    'admin'
);

-- ================================================
-- Completion Message
-- ================================================
SELECT 'Seed data inserted successfully!' AS message;
SELECT COUNT(*) AS total_products FROM products;
SELECT category, COUNT(*) AS product_count FROM products GROUP BY category ORDER BY category;
