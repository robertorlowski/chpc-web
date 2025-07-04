import app from './middleware/app'

const port = 10000

app.listen(port, () => {
  console.log(`App listening at https://chpc-web.onrender.com:${port}`)
})
