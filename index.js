import express from 'express';
import connectDB from './db.js';
import userRoutes from './routes/userRoutes.js';
import farmRoutes from './routes/farmRoutes.js';
import fieldRoutes from './routes/fieldRoutes.js';
import cropRoutes from './routes/cropRoutes.js';
import seasonRoutes from './routes/seasonRoutes.js';

const app = express();
const port = 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

// Mount auth routes
app.use('/api/auth', userRoutes);
app.use('/api/farms', farmRoutes);
app.use('/api/fields', fieldRoutes);
app.use('/api/crops', cropRoutes);
app.use('/api/seasons', seasonRoutes);

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server due to DB error', err);
  });
