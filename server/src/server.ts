import app from './middleware/app'
const port = process.env.PORT || 3001;

const server = app.listen(port, () => {
  console.log(`App listening at https://chpc-web.onrender.com:${port}`)
})

server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 120 * 1000;

