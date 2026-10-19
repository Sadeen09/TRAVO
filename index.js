const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient } = require('mongodb');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const adminRouter = require('./admin');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate Limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Database Connection & Initialization
let cachedClient = null;
let cachedDb = null;

async function connectDB() {
    if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb };
    
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tractopro';
    const client = new MongoClient(uri, { maxPoolSize: 10 });
    
    await client.connect();
    const db = client.db('tractopro');
    cachedClient = client;
    cachedDb = db;

    // Seed Demo Data if empty
    const users = db.collection('users');
    if (await users.countDocuments() === 0) {
        const hashedPassword = await bcrypt.hash('admin@123', 10);
        await users.insertOne({ username: 'admin', password: hashedPassword });
    }

    const tractors = db.collection('tractors');
    if (await tractors.countDocuments() === 0) {
        await tractors.insertMany([
            { make: 'AgriKing', model: 'Pro 500', year: 2022, price: 15500, condition: 'Excellent', hours: 1200, hp: 50, image: 'https://images.unsplash.com/photo-1592837345638-316223832d20?auto=format&fit=crop&w=800&q=80', description: 'Reliable, powerful, ready for harvest.' },
            { make: 'DemoTracto', model: 'Xtreme 90', year: 2019, price: 22000, condition: 'Good', hours: 4500, hp: 90, image: 'https://images.unsplash.com/photo-1605353037965-0210f8fa5534?auto=format&fit=crop&w=800&q=80', description: 'Heavy duty field work ready.' },
            { make: 'FieldMaster', model: 'Compact C20', year: 2023, price: 12000, condition: 'Like New', hours: 300, hp: 25, image: 'https://images.unsplash.com/photo-1589714850937-2fb079b7eb9b?auto=format&fit=crop&w=800&q=80', description: 'Perfect for small farms and orchards.' }
        ]);
    }

    return { client, db };
}

// Public API Routes
app.get('/api/tractors', async (req, res) => {
    try {
        const { db } = await connectDB();
        const tractors = await db.collection('tractors').find({}).sort({ _id: -1 }).toArray();
        res.json(tractors);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch tractors' });
    }
});

app.post('/api/submit', async (req, res) => {
    try {
        const { type, payload } = req.body;
        if (!type || !payload) return res.status(400).json({ error: 'Invalid data' });
        
        const { db } = await connectDB();
        await db.collection('submissions').insertOne({
            type,
            data: payload,
            status: 'Pending',
            createdAt: new Date()
        });
        
        res.status(201).json({ success: true, message: 'Your request has been submitted successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Submission failed' });
    }
});

// Admin Mounting
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-development-only-2026';
app.use('/admin', adminRouter(connectDB, JWT_SECRET));

// Public UI Rendering
app.get('/', (req, res) => {
    res.send(generatePublicUI());
});

function generatePublicUI() {
    const css = `
        :root {
            --cream: #fefae0;
            --green: #2d6a4f;
            --green-dark: #1b4332;
            --amber: #ffba08;
            --blue: #ade8f4;
            --white: #ffffff;
            --text: #333333;
            --clay-shadow: 12px 12px 24px #e0dcb6, -12px -12px 24px #ffffff;
            --clay-inner: inset 6px 6px 12px #e0dcb6, inset -6px -6px 12px #ffffff;
        }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: var(--cream); color: var(--text); margin: 0; padding: 0; box-sizing: border-box; }
        nav { background: var(--cream); padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.05); position: sticky; top: 0; z-index: 100; }
        .logo { font-size: 1.8rem; font-weight: 800; color: var(--green); text-decoration: none; display: flex; align-items: center; gap: 8px;}
        .nav-links { display: flex; gap: 1rem; flex-wrap: wrap; }
        .nav-links button { background: none; border: none; font-size: 1rem; font-weight: 600; color: var(--text); cursor: pointer; padding: 8px 12px; border-radius: 12px; transition: 0.3s; }
        .nav-links button:hover, .nav-links button.active { background: var(--green); color: var(--white); box-shadow: var(--clay-shadow); }
        .container { max-width: 1200px; margin: 2rem auto; padding: 0 1rem; }
        .section { display: none; animation: fadeIn 0.4s ease; }
        .section.active { display: block; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        /* Claymorphism Utilities */
        .clay-card { background: var(--cream); border-radius: 24px; padding: 2rem; box-shadow: var(--clay-shadow); margin-bottom: 2rem; }
        .clay-input { width: 100%; background: var(--cream); border: none; padding: 14px; border-radius: 16px; box-shadow: var(--clay-inner); margin-bottom: 1.2rem; font-size: 1rem; color: var(--text); outline: none; transition: 0.3s;}
        .clay-input:focus { box-shadow: inset 8px 8px 16px #d5d1ad, inset -8px -8px 16px #ffffff; }
        .clay-btn { background: var(--green); color: var(--white); border: none; padding: 14px 28px; border-radius: 16px; font-size: 1.1rem; font-weight: 600; cursor: pointer; box-shadow: 6px 6px 12px #c9c5a3, -6px -6px 12px #ffffff; transition: 0.2s; }
        .clay-btn:hover { transform: translateY(-2px); box-shadow: 8px 8px 16px #c9c5a3, -8px -8px 16px #ffffff; }
        .clay-btn:active { transform: translateY(2px); box-shadow: inset 4px 4px 8px rgba(0,0,0,0.2); }
        .clay-btn.amber { background: var(--amber); color: #333; }
        .clay-btn.blue { background: var(--blue); color: #333; }
        
        .hero { text-align: center; padding: 4rem 1rem; }
        .hero h1 { font-size: 3rem; color: var(--green-dark); margin-bottom: 1rem; }
        .hero p { font-size: 1.2rem; margin-bottom: 2rem; color: #555; }
        
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 2rem; }
        .tractor-card { border-radius: 24px; overflow: hidden; background: var(--cream); box-shadow: var(--clay-shadow); transition: 0.3s; display: flex; flex-direction: column; }
        .tractor-card:hover { transform: translateY(-5px); }
        .tractor-img { width: 100%; height: 220px; object-fit: cover; }
        .tractor-details { padding: 1.5rem; flex-grow: 1;}
        .tractor-details h3 { margin: 0 0 0.5rem 0; color: var(--green-dark); }
        .tractor-price { font-size: 1.4rem; font-weight: 700; color: var(--amber); margin-bottom: 1rem; }
        .badge { background: var(--blue); padding: 4px 8px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        @media(max-width: 768px) { .form-grid { grid-template-columns: 1fr; } .hero h1 { font-size: 2.2rem; } }
    `;

    const js = `
        document.addEventListener('DOMContentLoaded', () => {
            const navButtons = document.querySelectorAll('.nav-links button');
            const sections = document.querySelectorAll('.section');
            
            function showSection(id) {
                sections.forEach(sec => sec.classList.remove('active'));
                navButtons.forEach(btn => btn.classList.remove('active'));
                document.getElementById(id).classList.add('active');
                document.querySelector('[data-target="' + id + '"]').classList.add('active');
                if(id === 'browse') fetchTractors();
            }

            navButtons.forEach(btn => {
                btn.addEventListener('click', () => showSection(btn.getAttribute('data-target')));
            });

            async function fetchTractors() {
                const container = document.getElementById('tractor-grid');
                container.innerHTML = '<p>Loading tractors...</p>';
                try {
                    const res = await fetch('/api/tractors');
                    const tractors = await res.json();
                    if(tractors.length === 0) {
                        container.innerHTML = '<p>No tractors available at the moment.</p>';
                        return;
                    }
                    container.innerHTML = tractors.map(t => '<div class="tractor-card">' +
                        '<img src="' + t.image + '" alt="Tractor" class="tractor-img"/>' +
                        '<div class="tractor-details">' +
                            '<h3>' + t.make + ' ' + t.model + '</h3>' +
                            '<div class="tractor-price">$' + t.price.toLocaleString() + '</div>' +
                            '<p><span class="badge">' + t.year + '</span> <span class="badge">' + t.condition + '</span> <span class="badge">' + t.hp + ' HP</span></p>' +
                            '<p style="color:#666; font-size:0.9rem;">' + t.hours + ' Hours - ' + t.description + '</p>' +
                            '<button class="clay-btn" style="width:100%; margin-top:1rem;" onclick="document.querySelector(\\'[data-target=\\'contact\\']\\').click()">Enquire Now</button>' +
                        '</div></div>'
                    ).join('');
                } catch(e) {
                    container.innerHTML = '<p>Failed to load tractors.</p>';
                }
            }

            window.handleSubmission = async function(event, type) {
                event.preventDefault();
                const form = event.target;
                const btn = form.querySelector('button[type="submit"]');
                const originalText = btn.innerText;
                btn.innerText = 'Submitting...';
                btn.disabled = true;

                const formData = new FormData(form);
                const payload = Object.fromEntries(formData.entries());

                try {
                    const res = await fetch('/api/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ type, payload })
                    });
                    const result = await res.json();
                    if(res.ok) {
                        alert(result.message);
                        form.reset();
                    } else {
                        alert(result.error || 'Something went wrong.');
                    }
                } catch(e) {
                    alert('Network error. Please try again.');
                } finally {
                    btn.innerText = originalText;
                    btn.disabled = false;
                }
            }
        });
    `;

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>TractoPro | Agricultural Service Platform</title>
            <style>${css}</style>
        </head>
        <body>
            <nav>
                <a href="/" class="logo">🚜 TractoPro</a>
                <div class="nav-links">
                    <button data-target="home" class="active">Home</button>
                    <button data-target="browse">Browse</button>
                    <button data-target="sell">Sell</button>
                    <button data-target="service">Service</button>
                    <button data-target="parts">Parts</button>
                    <button data-target="financing">Finance</button>
                    <button data-target="breakdown" style="color: red;">Breakdown SOS</button>
                    <button data-target="contact">Contact</button>
                </div>
            </nav>

            <div class="container">
                <!-- Home Section -->
                <div id="home" class="section active">
                    <div class="hero clay-card">
                        <h1>Premium Agricultural Solutions</h1>
                        <p>Buy, sell, finance, and maintain your farming equipment all in one place.</p>
                        <button class="clay-btn" onclick="document.querySelector('[data-target=\\'browse\\']').click()">Browse Tractors</button>
                        <button class="clay-btn blue" onclick="document.querySelector('[data-target=\\'service\\']').click()">Book Service</button>
                    </div>
                </div>

                <!-- Browse Section -->
                <div id="browse" class="section">
                    <h2 style="color: var(--green-dark);">Pre-Owned Tractors</h2>
                    <div id="tractor-grid" class="grid"></div>
                </div>

                <!-- Sell Section -->
                <div id="sell" class="section">
                    <div class="clay-card">
                        <h2 style="color: var(--green-dark);">Sell Your Tractor</h2>
                        <form onsubmit="handleSubmission(event, 'sell')">
                            <div class="form-grid">
                                <input type="text" name="make" class="clay-input" placeholder="Make (e.g., John Deere)" required>
                                <input type="text" name="model" class="clay-input" placeholder="Model" required>
                                <input type="number" name="year" class="clay-input" placeholder="Year" required>
                                <input type="number" name="price" class="clay-input" placeholder="Expected Price ($)" required>
                                <input type="text" name="condition" class="clay-input" placeholder="Condition (Excellent, Good, Fair)" required>
                                <input type="url" name="image" class="clay-input" placeholder="Image URL (Unsplash/Imgur)" required>
                            </div>
                            <textarea name="description" class="clay-input" placeholder="Brief Description & Hours used" rows="4" required></textarea>
                            <input type="text" name="contact" class="clay-input" placeholder="Your Phone / Email" required>
                            <button type="submit" class="clay-btn">Submit Listing Request</button>
                        </form>
                    </div>
                </div>

                <!-- Service Section -->
                <div id="service" class="section">
                    <div class="clay-card">
                        <h2 style="color: var(--green-dark);">Book a Service</h2>
                        <form onsubmit="handleSubmission(event, 'service')">
                            <input type="text" name="name" class="clay-input" placeholder="Full Name" required>
                            <input type="text" name="tractor" class="clay-input" placeholder="Tractor Make & Model" required>
                            <input type="date" name="date" class="clay-input" required>
                            <textarea name="issue" class="clay-input" placeholder="Describe the issue or service required" rows="4" required></textarea>
                            <input type="text" name="contact" class="clay-input" placeholder="Your Phone Number" required>
                            <button type="submit" class="clay-btn blue">Request Booking</button>
                        </form>
                    </div>
                </div>

                <!-- Parts Section -->
                <div id="parts" class="section">
                    <div class="clay-card">
                        <h2 style="color: var(--green-dark);">Spare Parts Enquiry</h2>
                        <form onsubmit="handleSubmission(event, 'parts')">
                            <input type="text" name="partName" class="clay-input" placeholder="Part Name or Number" required>
                            <input type="text" name="tractor" class="clay-input" placeholder="For which Tractor Make/Model?" required>
                            <input type="text" name="contact" class="clay-input" placeholder="Your Phone / Email" required>
                            <button type="submit" class="clay-btn">Enquire Availability</button>
                        </form>
                    </div>
                </div>

                <!-- Finance Section -->
                <div id="financing" class="section">
                    <div class="clay-card">
                        <h2 style="color: var(--green-dark);">Financing Enquiry</h2>
                        <form onsubmit="handleSubmission(event, 'financing')">
                            <input type="text" name="name" class="clay-input" placeholder="Full Name" required>
                            <input type="number" name="amount" class="clay-input" placeholder="Loan Amount Required ($)" required>
                            <input type="text" name="tractor" class="clay-input" placeholder="Tractor you wish to buy" required>
                            <input type="text" name="contact" class="clay-input" placeholder="Your Phone / Email" required>
                            <button type="submit" class="clay-btn amber">Check Eligibility</button>
                        </form>
                    </div>
                </div>

                <!-- Breakdown Section -->
                <div id="breakdown" class="section">
                    <div class="clay-card" style="border: 2px solid red;">
                        <h2 style="color: red;">Emergency Breakdown Assistance</h2>
                        <p>We'll dispatch a mechanic immediately.</p>
                        <form onsubmit="handleSubmission(event, 'breakdown')">
                            <input type="text" name="location" class="clay-input" placeholder="Current Location / GPS Coordinates" required>
                            <input type="text" name="tractor" class="clay-input" placeholder="Tractor Make & Model" required>
                            <textarea name="problem" class="clay-input" placeholder="What happened?" rows="3" required></textarea>
                            <input type="text" name="phone" class="clay-input" placeholder="Emergency Contact Number" required>
                            <button type="submit" class="clay-btn" style="background: red;">Request Immediate Help</button>
                        </form>
                    </div>
                </div>

                <!-- Contact Section -->
                <div id="contact" class="section">
                    <div class="clay-card">
                        <h2 style="color: var(--green-dark);">Contact Us</h2>
                        <form onsubmit="handleSubmission(event, 'contact')">
                            <input type="text" name="name" class="clay-input" placeholder="Your Name" required>
                            <input type="email" name="email" class="clay-input" placeholder="Your Email" required>
                            <textarea name="message" class="clay-input" placeholder="How can we help?" rows="4" required></textarea>
                            <button type="submit" class="clay-btn">Send Message</button>
                        </form>
                    </div>
                </div>

            </div>
            <script>${js}</script>
        </body>
        </html>
    `;
}

if (require.main === module) {
    app.listen(3000, () => console.log('TractoPro running on port 3000'));
}
module.exports = app;
