const express = require("express");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const cors = require("cors");
const multer = require("multer");

const app = express();
app.use(express.json());
app.use(cors());

const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "shop"
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "public/uploads"); // ide menti a képeket
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + "-" + file.originalname;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

app.use("/uploads", express.static("public/uploads"));


// KÉPFELTÖLTÉS UTÁN ellenőrizzük az admin jogosultságot
const checkAdminFromHeader = async (req, res, next) => {
    const admin_id = req.headers["x-admin-id"];
    if (!admin_id) {
        return res.status(403).json({ error: "Hiányzó admin_id" });
    }

    const [adminCheck] = await db.query("SELECT * FROM admins WHERE admin_id = ?", [admin_id]);
    if (adminCheck.length === 0) {
        return res.status(403).json({ error: "Nincs jogosultság a művelethez" });
    }

    req.admin_id = admin_id; // később még használható
    next();
};




// USER REGISTRATION
app.post("/api/register",upload.none(), async (req, res) => {
    const { name, email, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO admins (name, email, password) VALUES (?, ?, ?)", [name, email, hashed]);
    res.json({ success: true });
});

// LOGIN
app.post("/api/login", upload.none(),async (req, res) => {
    const { email, password } = req.body;
    const [rows] = await db.query("SELECT * FROM admins WHERE email = ?", [email]);
    if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
    const match = await bcrypt.compare(password, rows[0].password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });
    const { password: _, ...adminData } = rows[0]; // eldobja a jelszót
    res.json({ success: true, admin: adminData });
});

// PRODUCTS CRUD
app.get("/api/products", async (req, res) => {
    const [rows] = await db.query("SELECT * FROM products");
    res.json(rows);
});

// Új termék feltöltése képpel
// feltöltés CSAK admin ellenőrzés után
app.post("/api/products", checkAdminFromHeader, upload.single("image"), async (req, res) => {
    const { name, price, discount } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: "Kép feltöltése kötelező" });
    }

    const image = req.file.filename;

    await db.query(
        "INSERT INTO products (name, image, price, discount) VALUES (?, ?, ?, ?)",
        [name, image, price, discount]
    );

    res.json({ success: true });
});


app.put(
    "/api/products/:id",
    checkAdminFromHeader,         // először admin ellenőrzés
    upload.single("image"),       // csak ha admin oké
    async (req, res) => {
        const { id } = req.params;
        const { name, price, discount } = req.body;
        let image = req.body.image;

        if (req.file) {
            image = req.file.filename;
        }

        await db.query(
            "UPDATE products SET name=?, image=?, price=?, discount=? WHERE product_id=?",
            [name, image, price, discount, id]
        );

        res.json({ success: true });
    }
);

const fs = require("fs");
const path = require("path");

app.delete(
  "/api/products/:id",
  checkAdminFromHeader,
  upload.none(),
  async (req, res) => {
    const { id } = req.params;

    // 1. Lekérdezzük a képet az adatbázisból
    const [rows] = await db.query("SELECT image FROM products WHERE product_id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Termék nem található" });
    }

    const imageName = rows[0].image;

    // 2. Töröljük a terméket
    await db.query("DELETE FROM products WHERE product_id = ?", [id]);

    // 3. Kép törlése a fájlrendszerből
    const imagePath = path.join(__dirname, "public/uploads", imageName);
    fs.unlink(imagePath, (err) => {
      if (err) {
        console.error("Nem sikerült törölni a képet:", err.message);
      }
    });

    res.json({ success: true });
  }
);


// MESSAGES
app.post("/api/messages",upload.none(), async (req, res) => {
    const { name, email, phone, message } = req.body;
    await db.query("INSERT INTO messages (name, email, phone, message) VALUES (?, ?, ?, ?)", [name, email, phone, message]);
    res.json({ success: true });
});

// REVIEWS
app.get("/api/reviews",async (req, res) => {
    const [rows] = await db.query("SELECT * FROM reviews ORDER BY review_id DESC");
    res.json(rows);
});

app.post("/api/reviews",upload.none(), async (req, res) => {
    const { name, stars, review } = req.body;
    await db.query("INSERT INTO reviews (name, stars, review) VALUES (?, ?, ?)", [name, stars, review]);
    res.json({ success: true });
});

// NEWSLETTERS
app.post("/api/newsletters",upload.none(), async (req, res) => {
    const { email } = req.body;
    await db.query("INSERT INTO newsletters (email) VALUES (?)", [email]);
    res.json({ success: true });
});

// ORDERS
app.post("/api/orders",upload.none(), async (req, res) => {
    const { product_id, quantity } = req.body;
    await db.query("INSERT INTO orders (product_id, quantity) VALUES (?, ?)", [product_id, quantity]);
    res.json({ success: true });
});

app.listen(3000, () => console.log("API running on http://localhost:3000"));
