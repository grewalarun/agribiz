
import express from 'express';
import connectDB from './db.js';
import userRoutes from './routes/userRoutes.js';

const app = express();
const port = 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

// Mount auth routes
app.use('/api/auth', userRoutes);

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server due to DB error', err);
  });
