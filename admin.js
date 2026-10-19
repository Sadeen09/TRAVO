const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');

module.exports = function(connectDB, JWT_SECRET) {
    const router = express.Router();

    // Authentication Middleware
    const requireAuth = (req, res, next) => {
        const token = req.cookies.adminToken;
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        try {
            req.admin = jwt.verify(token, JWT_SECRET);
            next();
        } catch (e) {
            res.status(401).json({ error: 'Invalid or expired session' });
        }
    };

    // Admin APIs
    router.post('/api/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            const { db } = await connectDB();
            const user = await db.collection('users').findOne({ username });
            
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
            res.cookie('adminToken', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000 });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Login failed' });
        }
    });

    router.post('/api/logout', (req, res) => {
        res.clearCookie('adminToken');
        res.json({ success: true });
    });

    router.get('/api/data', requireAuth, async (req, res) => {
        try {
            const { db } = await connectDB();
            const tractors = await db.collection('tractors').find({}).sort({ _id: -1 }).toArray();
            const submissions = await db.collection('submissions').find({}).sort({ createdAt: -1 }).toArray();
            res.json({ tractors, submissions });
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch dashboard data' });
        }
    });

    router.post('/api/tractors', requireAuth, async (req, res) => {
        try {
            const { db } = await connectDB();
            const { make, model, year, price, condition, hp, hours, description, image } = req.body;
            const newTractor = {
                make, model, year: parseInt(year), price: parseFloat(price), condition,
                hp: parseInt(hp), hours: parseInt(hours), description, image, createdAt: new Date()
            };
            await db.collection('tractors').insertOne(newTractor);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to add tractor' });
        }
    });

    router.delete('/api/tractors/:id', requireAuth, async (req, res) => {
        try {
            const { db } = await connectDB();
            await db.collection('tractors').deleteOne({ _id: new ObjectId(req.params.id) });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete' });
        }
    });

    router.patch('/api/submissions/:id', requireAuth, async (req, res) => {
        try {
            const { db } = await connectDB();
            await db.collection('submissions').updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: { status: req.body.status } }
            );
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to update status' });
        }
    });

    // Admin UI Rendering
    router.get('/', (req, res) => {
        res.send(generateAdminUI());
    });

    function generateAdminUI() {
        const css = `
            :root {
                --bg: #fefae0; --green: #2d6a4f; --white: #ffffff; --text: #333;
                --shadow: 8px 8px 16px #d1cdb8, -8px -8px 16px #ffffff;
                --inner: inset 4px 4px 8px #d1cdb8, inset -4px -4px 8px #ffffff;
            }
            body { font-family: sans-serif; background: var(--bg); color: var(--text); padding: 2rem; margin: 0; }
            .container { max-width: 1000px; margin: auto; }
            .clay-card { background: var(--bg); border-radius: 20px; padding: 2rem; box-shadow: var(--shadow); margin-bottom: 2rem; }
            .clay-input { width: 100%; box-sizing: border-box; background: var(--bg); border: none; padding: 12px; border-radius: 12px; box-shadow: var(--inner); margin-bottom: 1rem; outline: none; }
            .clay-btn { background: var(--green); color: white; border: none; padding: 10px 20px; border-radius: 12px; cursor: pointer; box-shadow: var(--shadow); transition: 0.2s; }
            .clay-btn:active { box-shadow: inset 4px 4px 8px rgba(0,0,0,0.3); }
            .clay-btn.danger { background: #e63946; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
            .list-item { background: var(--bg); box-shadow: var(--shadow); padding: 1rem; border-radius: 12px; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;}
            .badge { background: #ffba08; padding: 4px 8px; border-radius: 8px; font-size: 0.8rem; }
            .badge.completed { background: var(--green); color: white; }
            #dashboard, #login { display: none; }
        `;

        const js = `
            document.addEventListener('DOMContentLoaded', async () => {
                await checkSession();
            });

            async function checkSession() {
                try {
                    const res = await fetch('/admin/api/data');
                    if (res.ok) {
                        const data = await res.json();
                        document.getElementById('login').style.display = 'none';
                        document.getElementById('dashboard').style.display = 'block';
                        renderDashboard(data);
                    } else {
                        document.getElementById('login').style.display = 'block';
                        document.getElementById('dashboard').style.display = 'none';
                    }
                } catch (e) { console.error(e); }
            }

            window.handleLogin = async function(e) {
                e.preventDefault();
                const fd = new FormData(e.target);
                const payload = Object.fromEntries(fd.entries());
                const res = await fetch('/admin/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) { checkSession(); } 
                else { alert('Invalid credentials'); }
            };

            window.handleLogout = async function() {
                await fetch('/admin/api/logout', { method: 'POST' });
                location.reload();
            };

            function renderDashboard(data) {
                const subList = document.getElementById('submissions-list');
                subList.innerHTML = data.submissions.map(s => {
                    const statusClass = s.status === 'Completed' ? 'completed' : '';
                    let details = '';
                    for(const [k,v] of Object.entries(s.data)) { details += '<b>' + k + ':</b> ' + v + '<br>'; }
                    return '<div class="list-item">' +
                        '<div>' +
                            '<strong>' + s.type.toUpperCase() + '</strong> ' +
                            '<span class="badge ' + statusClass + '">' + s.status + '</span><br>' +
                            '<small>' + new Date(s.createdAt).toLocaleString() + '</small><br><br>' +
                            '<div style="font-size:0.9rem;">' + details + '</div>' +
                        '</div>' +
                        (s.status === 'Pending' ? '<button class="clay-btn" onclick="updateStatus(\\'' + s._id + '\\')">Mark Done</button>' : '') +
                    '</div>';
                }).join('') || '<p>No submissions found.</p>';

                const tracList = document.getElementById('tractors-list');
                tracList.innerHTML = data.tractors.map(t => 
                    '<div class="list-item">' +
                        '<div><strong>' + t.make + ' ' + t.model + '</strong> ($' + t.price + ')</div>' +
                        '<button class="clay-btn danger" onclick="deleteTractor(\\'' + t._id + '\\')">Delete</button>' +
                    '</div>'
                ).join('') || '<p>No tractors listed.</p>';
            }

            window.updateStatus = async function(id) {
                await fetch('/admin/api/submissions/' + id, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'Completed' })
                });
                checkSession();
            };

            window.deleteTractor = async function(id) {
                if(!confirm('Delete listing?')) return;
                await fetch('/admin/api/tractors/' + id, { method: 'DELETE' });
                checkSession();
            };

            window.addTractor = async function(e) {
                e.preventDefault();
                const fd = new FormData(e.target);
                await fetch('/admin/api/tractors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(Object.fromEntries(fd.entries()))
                });
                e.target.reset();
                checkSession();
            };
        `;

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>TractoPro | Admin</title>
                <style>${css}</style>
            </head>
            <body>
                <div class="container">
                    
                    <div id="login" class="clay-card" style="max-width: 400px; margin: 5rem auto;">
                        <h2 style="color: var(--green); text-align: center;">Admin Secure Login</h2>
                        <form onsubmit="handleLogin(event)">
                            <input type="text" name="username" class="clay-input" placeholder="Username" required>
                            <input type="password" name="password" class="clay-input" placeholder="Password" required>
                            <button type="submit" class="clay-btn" style="width: 100%;">Access Dashboard</button>
                        </form>
                    </div>

                    <div id="dashboard">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h1 style="color: var(--green);">TractoPro Admin Panel</h1>
                            <button class="clay-btn" onclick="handleLogout()">Logout</button>
                        </div>
                        
                        <div class="grid">
                            <div class="clay-card">
                                <h2>Customer Submissions & Requests</h2>
                                <div id="submissions-list" style="max-height: 600px; overflow-y: auto; padding: 1rem;"></div>
                            </div>

                            <div>
                                <div class="clay-card">
                                    <h2>Add New Tractor Listing</h2>
                                    <form onsubmit="addTractor(event)" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                        <input type="text" name="make" class="clay-input" placeholder="Make" required>
                                        <input type="text" name="model" class="clay-input" placeholder="Model" required>
                                        <input type="number" name="year" class="clay-input" placeholder="Year" required>
                                        <input type="number" name="price" class="clay-input" placeholder="Price ($)" required>
                                        <input type="number" name="hp" class="clay-input" placeholder="Horsepower" required>
                                        <input type="number" name="hours" class="clay-input" placeholder="Hours Used" required>
                                        <input type="text" name="condition" class="clay-input" placeholder="Condition" style="grid-column: span 2;" required>
                                        <input type="url" name="image" class="clay-input" placeholder="Image URL" style="grid-column: span 2;" required>
                                        <textarea name="description" class="clay-input" placeholder="Description" rows="2" style="grid-column: span 2;" required></textarea>
                                        <button type="submit" class="clay-btn" style="grid-column: span 2;">Add Listing</button>
                                    </form>
                                </div>

                                <div class="clay-card">
                                    <h2>Active Listings</h2>
                                    <div id="tractors-list" style="max-height: 300px; overflow-y: auto; padding: 1rem;"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <script>${js}</script>
            </body>
            </html>
        `;
    }

    return router;
};
