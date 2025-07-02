import app from './middleware/app'

const port = 4001

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`)
})
