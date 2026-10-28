import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

//middleware part
app.use(cors());
app.use(express.json());

//health check part
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'NawaFlow' });
});

//start server part
app.listen(PORT, () => {
  console.log(`NawaFlow server running on port ${PORT}`);
});