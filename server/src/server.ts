
import 'dotenv/config';
import app from './middleware/app'

const port = process.env.PORT || 3001;

const server = app.listen(port, () => {
  console.log(`Example app listening on port: ${port}`)
})

server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 120 * 1000;

