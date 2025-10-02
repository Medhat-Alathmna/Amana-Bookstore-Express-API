const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const morgan = require('morgan'); // Import morgan

const app = express();
const port = 3000;

// --- Logging Middleware Setup ---
// Create a 'logging' directory if it doesn't exist as per README
const logDirectory = path.join(__dirname, 'logging');
fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);

// Create a write stream (in append mode) to the log.txt file
const accessLogStream = fs.createWriteStream(path.join(logDirectory, 'log.txt'), { flags: 'a' });

// Setup the logger to use the 'combined' format and write to our file
app.use(morgan('combined', { stream: accessLogStream }));

// Middleware to parse JSON bodies
app.use(express.json());

// --- Data Loading ---
const booksPath = path.join(__dirname, 'data', 'books.json');
const reviewsPath = path.join(__dirname, 'data', 'reviews.json');

let books = [];
let reviews = [];

// Helper function to read data from our JSON files
const loadData = () => {
  try {
    const booksData = fs.readFileSync(booksPath, 'utf8');
    const reviewsData = fs.readFileSync(reviewsPath, 'utf8');
    books = JSON.parse(booksData).books;
    reviews = JSON.parse(reviewsData).reviews;
  } catch (err) {
    console.error("Error reading data files:", err);
    process.exit(1); // Exit if we can't load our data
  }
};

// Helper function to write data back to our JSON files
const saveData = () => {
    try {
        fs.writeFileSync(booksPath, JSON.stringify({ books }, null, 2), 'utf8');
        fs.writeFileSync(reviewsPath, JSON.stringify({ reviews }, null, 2), 'utf8');
    } catch (err) {
        console.error("Error writing data files:", err);
    }
};


// Initial data load
loadData();


// --- Authentication Middleware (Bonus Challenge) ---
const basicAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Restricted Area"');
        return res.status(401).send('Authentication required.');
    }

    // The header is in the format "Basic <base64-credentials>"
    // We decode the base64 part to get "username:password"
    const [username, password] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');

    // In a real application, you would check these credentials against a database.
    // For this example, we'll hardcode them.
    const a_user = "medhat"
    const a_pass = "Hero97"

    if (username === a_user && password === a_pass) {
        next(); // Credentials are correct, proceed to the route
    } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Restricted Area"');
        return res.status(401).send('Authentication failed: Invalid credentials.');
    }
};


// --- GET Routes ---

// 1. Get all books in the catalogue
app.get('/api/books', (req, res) => {
  res.json(books);
});

// 2. Get a single book by ID
app.get('/api/books/:id', (req, res) => {
  const book = books.find(b => b.id === req.params.id);
  if (book) {
    res.json(book);
  } else {
    res.status(404).send('Book not found');
  }
});

// 3. Get books published within a date range
app.get('/api/books/published', (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).send('Please provide both startDate and endDate query parameters.');
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).send('Invalid date format. Please use YYYY-MM-DD.');
  }

  const filteredBooks = books.filter(book => {
    const publishedDate = new Date(book.datePublished);
    return publishedDate >= start && publishedDate <= end;
  });

  res.json(filteredBooks);
});

// 4. Get the top 10 rated books
app.get('/api/books/top-rated', (req, res) => {
  const topBooks = books
    .map(book => ({
      ...book,
      ratingScore: book.rating * book.reviewCount
    }))
    .sort((a, b) => b.ratingScore - a.ratingScore)
    .slice(0, 10);

  res.json(topBooks);
});

// 5. Get featured books
app.get('/api/featured', (req, res) => {
  const featuredBooks = books.filter(book => book.featured === true);
  res.json(featuredBooks);
});

// 6. Get all reviews for a specific book
app.get('/api/books/:id/reviews', (req, res) => {
  const bookReviews = reviews.filter(review => review.bookId === req.params.id);
  const bookExists = books.some(book => book.id === req.params.id);

  if (!bookExists) {
      return res.status(404).send('Book not found.');
  }
  
  res.json(bookReviews);
});


// --- POST Routes (Protected by Basic Auth) ---

// 1. Add a new book to the catalogue
app.post('/api/books', basicAuth, (req, res) => {
    const { title, author, description, price, isbn, genre, tags, datePublished, pages, language, publisher } = req.body;

    // Basic validation
    if (!title || !author || !isbn) {
        return res.status(400).json({ message: 'Missing required fields: title, author, and isbn are required.' });
    }

    const newBook = {
        id: crypto.randomUUID(), // Generate a unique ID
        title,
        author,
        description: description || "",
        price: price || 0,
        isbn,
        genre: genre || [],
        tags: tags || [],
        datePublished: datePublished || new Date().toISOString().split('T')[0],
        pages: pages || 0,
        language: language || "English",
        publisher: publisher || "",
        rating: 0,
        reviewCount: 0,
        inStock: true,
        featured: false
    };

    books.push(newBook);
    saveData(); // Save the updated books array to the file
    res.status(201).json(newBook);
});

// 2. Add a new review for a book
app.post('/api/reviews', basicAuth, (req, res) => {
    const { bookId, author, rating, title, comment } = req.body;

    // Basic validation
    if (!bookId || !author || !rating || !comment) {
        return res.status(400).json({ message: 'Missing required fields: bookId, author, rating, and comment are required.' });
    }

    // Check if the book exists
    const bookExists = books.some(book => book.id === bookId);
    if (!bookExists) {
        return res.status(404).json({ message: 'Book not found. Cannot add a review for a non-existent book.' });
    }
    
    const newReview = {
        id: `review-${crypto.randomUUID()}`, // Generate a unique ID
        bookId,
        author,
        rating: parseInt(rating, 10), // Ensure rating is a number
        title: title || "",
        comment,
        timestamp: new Date().toISOString(),
        verified: false // New reviews are not verified by default
    };

    reviews.push(newReview);
    saveData(); // Save the updated reviews array to the file
    res.status(201).json(newReview);
});


app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

