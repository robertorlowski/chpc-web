import express from 'express'
import cors from 'cors'
import apiRoute from './api.routes'

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api', apiRoute)

export default app
