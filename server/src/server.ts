import app from './middleware/app'

const port = 10000

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`)
})
