import express from 'express'
import cors from 'cors'
import apiRoute from './api.routes'
import { verifyApiKey } from './auth'

const app = express()

// app.use(verifyApiKey);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // <- zezwala wszystkim
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type,x-api-key');
  next();
});

app.use(cors())
app.use(express.json())

app.use('/api', apiRoute)

export default app
